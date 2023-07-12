from owrx.config.core import CoreConfig
from owrx.map import Map, LatLngLocation
from owrx.aprs import getSymbolData
from json import JSONEncoder

import urllib
import threading
import logging
import json
import re
import os
import time

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class ReceiverJSONEncoder(JSONEncoder):
    def default(self, obj):
        return obj.toJSON()


class ReceiverLocation(LatLngLocation):
    def __init__(self, lat: float, lon: float, attrs):
        self.attrs = attrs
        super().__init__(lat, lon)

    def getId(self):
        return re.sub(r"^.*://(.*?)(/.*)?$", r"\1", self.attrs["url"])

    def getMode(self):
        return re.sub(r"^([A-Za-z]+).*$", r"\1", self.attrs["device"])

    def __dict__(self):
        return self.attrs

    def toJSON(self):
        return self.attrs


class ReceiverDatabase(object):
    sharedInstance = None
    creationLock = threading.Lock()

    @staticmethod
    def getSharedInstance():
        with ReceiverDatabase.creationLock:
            if ReceiverDatabase.sharedInstance is None:
                ReceiverDatabase.sharedInstance = ReceiverDatabase()
        return ReceiverDatabase.sharedInstance

    @staticmethod
    def _getReceiversFile():
        coreConfig = CoreConfig()
        return "{data_directory}/receivers.json".format(data_directory=coreConfig.get_temporary_directory())

    def __init__(self):
        self.receivers = {}
        self.thread = None

    def toJSON(self):
        return self.receivers

    def refresh(self):
        if self.thread is None:
            self.thread = threading.Thread(target=self._refreshThread)
            self.thread.start()

    def _refreshThread(self):
        logger.debug("Starting receiver database refresh...")

        # This file contains cached database
        file = self._getReceiversFile()
        ts   = os.path.getmtime(file) if os.path.isfile(file) else 0

        # Try loading cached database from file first, unless stale
        if time.time() - ts < 60*60*24:
            logger.debug("Loading database from '{0}'...".format(file))
            self.receivers = self.loadFromFile(file)
        else:
            self.receivers = {}

        # Scrape websites for receivers, if the list if empty
        if not self.receivers:
            logger.debug("Scraping KiwiSDR web site...")
            self.receivers.update(self.scrapeKiwiSDR())
            logger.debug("Scraping WebSDR web site...")
            self.receivers.update(self.scrapeWebSDR())
            logger.debug("Scraping OpenWebRX web site...")
            self.receivers.update(self.scrapeOWRX())
            # Save parsed data into a file
            logger.debug("Saving {0} receivers to '{1}'...".format(len(self.receivers), file))
            try:
                with open(file, "w") as f:
                    json.dump(self, f, cls=ReceiverJSONEncoder, indent=2)
                    f.close()
            except Exception as e:
                logger.debug("Exception: {0}".format(e))

        # Update map with receivers
        logger.debug("Updating map...")
        self.updateMap()

        # Done
        logger.debug("Done refreshing receiver database.")
        self.thread = None

    def getColor(self, type: str):
        if type.startswith("KiwiSDR"):
            return "#800000"
        elif type.startswith("WebSDR"):
            return "#000080"
        else:
            return "#006000"

    def loadFromFile(self, fileName: str = None):
        # Get filename
        if fileName is None:
            fileName = self._getReceiversFile()

        # Load receivers list from JSON file
        try:
            with open(fileName, "r") as f:
                content = f.read()
                f.close()
            if content:
                db = json.loads(content)
        except Exception as e:
            logger.debug("loadFromFile() exception: {0}".format(e))
            return

        # Process receivers list
        result = {}
        for key in db.keys():
            attrs = db[key]
            result[key] = ReceiverLocation(attrs["lat"], attrs["lon"], attrs)

        # Done
        return result

    def updateMap(self):
        for r in self.receivers.values():
            Map.getSharedInstance().updateLocation(r.getId(), r, r.getMode())

    def scrapeOWRX(self, url: str = "https://www.receiverbook.de/map"):
        patternJson = re.compile(r"^\s*var\s+receivers\s+=\s+(\[.*\]);\s*$")
        result = {}
        try:
            data = None
            for line in urllib.request.urlopen(url).readlines():
                # Convert read bytes to a string
                line = line.decode('utf-8')
                # When we encounter a URL...
                m = patternJson.match(line)
                if m:
                    data = json.loads(m.group(1))
                    break
            if data is not None:
                for entry in data:
                    lat = entry["location"]["coordinates"][1]
                    lon = entry["location"]["coordinates"][0]
                    for r in entry["receivers"]:
                        if "version" in r:
                            dev = r["type"] + " " + r["version"]
                        else:
                            dev = r["type"]
                        rl = ReceiverLocation(lat, lon, {
                            "type"    : "feature",
                            "lat"     : lat,
                            "lon"     : lon,
                            "comment" : r["label"],
                            "url"     : r["url"],
                            "device"  : dev
                        })
                        result[rl.getId()] = rl
                        # Offset colocated receivers by ~500m
                        lon = lon + 0.0005

        except Exception as e:
            logger.debug("scrapeOWRX() exception: {0}".format(e))

        # Done
        return result

    def scrapeWebSDR(self, url: str = "http://websdr.ewi.utwente.nl/~~websdrlistk?v=1&fmt=2&chseq=0"):
        result = {}
        try:
            data = urllib.request.urlopen(url).read().decode('utf-8')
            data = json.loads(re.sub("^\s*//.*", "", data, flags=re.MULTILINE))

            for entry in data:
                if "lat" in entry and "lon" in entry and "url" in entry:
                    # Save accumulated attributes, use hostname as key
                    lat = entry["lat"]
                    lon = entry["lon"]
                    rl  = ReceiverLocation(lat, lon, {
                        "type"    : "feature",
                        "lat"     : lat,
                        "lon"     : lon,
                        "comment" : entry["desc"],
                        "url"     : entry["url"],
                        #"users"   : int(entry["users"]),
                        "device"  : "WebSDR"
                    })
                    result[rl.getId()] = rl

        except Exception as e:
            logger.debug("scrapeWebSDR() exception: {0}".format(e))

        # Done
        return result

    def scrapeKiwiSDR(self, url: str = "http://kiwisdr.com/public/"):
        result = {}
        try:
            patternAttr = re.compile(r".*<!--\s+(\S+)=(.*)\s+-->.*")
            patternUrl  = re.compile(r".*<a\s+href=['\"](\S+?)['\"].*>.*</a>.*")
            patternGps  = re.compile(r"\(\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)")
            entry = {}

            for line in urllib.request.urlopen(url).readlines():
                # Convert read bytes to a string
                line = line.decode('utf-8')
                # When we encounter a URL...
                m = patternUrl.match(line)
                if m is not None:
                    # Add URL attribute
                    entry["url"] = m.group(1)
                    # Must have "gps" attribut with latitude / longitude
                    if "gps" in entry and "url" in entry:
                        m = patternGps.match(entry["gps"])
                        if m is not None:
                            # Save accumulated attributes, use hostname as key
                            lat = float(m.group(1))
                            lon = float(m.group(2))
                            rl = ReceiverLocation(lat, lon, {
                                "type"    : "feature",
                                "lat"     : lat,
                                "lon"     : lon,
                                "comment" : entry["name"],
                                "url"     : entry["url"],
                                #"users"   : int(entry["users"]),
                                #"maxusers": int(entry["users_max"]),
                                "loc"     : entry["loc"],
                                "altitude": int(entry["asl"]),
                                "antenna" : entry["antenna"],
                                "device"  : re.sub("_v", " ", entry["sw_version"])
                            })
                            result[rl.getId()] = rl
                    # Clear current entry
                    entry = {}
                else:
                    # Save all parsed attributes in the current entry
                    m = patternAttr.match(line)
                    if m is not None:
                        # Save attribute in the current entry
                        entry[m.group(1).lower()] = m.group(2)

        except Exception as e:
            logger.debug("scrapeKiwiSDR() exception: {0}".format(e))

        # Done
        return result
