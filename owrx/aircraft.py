from csdr.module import LineBasedModule
from owrx.toolbox import TextParser, ColorCache
from owrx.map import Map, LatLngLocation
from owrx.aprs import getSymbolData
from owrx.adsb.modes import ModeSParser
from owrx.config import Config
from datetime import datetime, timedelta
import threading
import json
import math
import time
import re

import logging

logger = logging.getLogger(__name__)

#
# Feet per meter
#
METERS_PER_FOOT = 0.3048
KMH_PER_KNOT   = 1.852

#
# Mode-S message formats
#
MODE_S_FORMATS = [
    "Short ACAS", None, None, None,
    "Altitude", "IDENT Reply", None, None,
    None, None, None, "ADSB",
    None, None, None, None,
    "Long ACAS", "Extended ADSB", "Supplementary ADSB", "Exetended Military",
    "Comm-B Altitude", "Comm-B IDENT Reply", "Military", None,
    "Comm-D Message"
]

#
# This class represents current aircraft location compatible with
# the APRS markers. It can be used for displaying aircraft on the
# map.
#
class AircraftLocation(LatLngLocation):
    def __init__(self, data):
        super().__init__(data["lat"], data["lon"])
        # Complete aircraft data
        self.data = data

    def __dict__(self):
        res = super(AircraftLocation, self).__dict__()
        # Add APRS-like aircraft symbol (red or blue, depending on mode)
        mod = '/' if self.data["mode"]=="ADSB" else '\\'
        res["symbol"] = getSymbolData('^', mod)
        # Convert aircraft-specific data into APRS-like data
        for x in ["icao", "aircraft", "flight", "speed", "altitude", "course", "destination", "origin", "vspeed", "msglog"]:
            if x in self.data:
                res[x] = self.data[x]
        # Return APRS-like dictionary object
        return res


#
# A global object of this class collects information on all
# currently reporting aircraft.
#
class AircraftManager(object):
    sharedInstance = None
    creationLock = threading.Lock()

    # Called on a timer
    @staticmethod
    def _periodicCleanup(arg):
        arg.periodicCleanup()

    # Return a global instance of the aircraft manager.
    @staticmethod
    def getSharedInstance():
        with AircraftManager.creationLock:
            if AircraftManager.sharedInstance is None:
                AircraftManager.sharedInstance = AircraftManager()
        return AircraftManager.sharedInstance

    # Get unique aircraft ID, in flight -> tail -> ICAO ID order.
    @staticmethod
    def getAircraftId(data):
        if "icao" in data:
            return data["icao"]
        elif "aircraft" in data:
            return data["aircraft"]
        elif "flight" in data:
            return data["flight"]
        else:
            return None

    # Compute bearing (in degrees) between two latlons.
    @staticmethod
    def bearing(p1, p2):
        d   = (p2[1] - p1[1]) * math.pi / 180
        pr1 = p1[0] * math.pi / 180
        pr2 = p2[0] * math.pi / 180
        y   = math.sin(d) * math.cos(pr2)
        x   = math.cos(pr1) * math.sin(pr2) - math.sin(pr1) * math.cos(pr2) * math.cos(d)
        return (math.atan2(y, x) * 180 / math.pi + 360) % 360

    def __init__(self):
        self.lock = threading.Lock()
        self.checkTime = 60
        self.maxMsgLog = 20
        self.colors = ColorCache()
        self.aircraft = {}
        self.periodicCleanup()

    # Perform periodic cleanup
    def periodicCleanup(self):
        self.cleanup()
        threading.Timer(self.checkTime, self._periodicCleanup, [self]).start()

    # Get aircraft data by ID.
    def getAircraft(self, id):
        return self.aircraft[id] if id in self.aircraft else {}

    # Add a new aircraft to the database, or update existing aircraft data.
    def update(self, data):
        # Identify aircraft the best we can, it MUST have some ID
        id = self.getAircraftId(data)
        if not id:
            return

        # Now operating on the database...
        with self.lock:
            # Merge database entries in flight -> tail -> ICAO ID order
            if "icao" in data:
                if "flight" in data:
                    self._merge(data["icao"], data["flight"])
                if "aircraft" in data:
                    self._merge(data["icao"], data["aircraft"])
            elif "aircraft" in data and "flight" in data:
                self._merge(data["aircraft"], data["flight"])

            # If no such ID yet...
            if id not in self.aircraft:
                logger.debug("Adding %s" % id)
                # Create a new record
                item = self.aircraft[id] = data.copy()
                # No previous position
                pos0 = None
            else:
                # Use existing record
                item = self.aircraft[id]
                # Previous position
                pos0 = (item["lat"], item["lon"]) if "lat" in item and "lon" in item else None
                # Update existing record
                item.update(data)

            # If both current and previous positions exist, compute course
            pos1 = (data["lat"], data["lon"]) if "lat" in data and "lon" in data else None
            if "course" not in data and pos0 and pos1 and pos1 != pos0:
                item["course"] = round(self.bearing(pos0, pos1))
                #logger.debug("Updated %s course to %d degrees" % (id, item["course"]))

            # Update time-to-live, if missing, assume HFDL longevity
            if "ts" not in data:
                pm = Config.get()
                ts = datetime.now().timestamp()
                item["ts"]  = ts
                item["ttl"] = ts + pm["hfdl_ttl"]

            # Add incoming messages to the log
            if "message" in data:
                if "msglog" not in item:
                    item["msglog"] = [ data["message"] ]
                else:
                    msglog = item["msglog"]
                    msglog.append(data["message"])
                    if len(msglog) > self.maxMsgLog:
                        item["msglog"] = item["msglog"][-self.maxMsgLog:]

            # Update aircraft on the map
            if "lat" in item and "lon" in item and "mode" in item:
                loc = AircraftLocation(item)
                Map.getSharedInstance().updateLocation(id, loc, item["mode"])
                # Can later use this for linking to the map
                data["mapid"] = id

            # Update input data with computed data
            for key in ["icao", "aircraft", "flight", "course"]:
                if key in item:
                    data[key] = item[key]

            # Assign input data a color by its aircraft ID
            data["color"] = self.colors.getColor(id)

    # Remove all database entries older than given time.
    def cleanup(self):
        now = datetime.now().timestamp()
        # Now operating on the database...
        with self.lock:
            too_old = [x for x in self.aircraft.keys() if self.aircraft[x]["ttl"] < now]
            if too_old:
                logger.debug("Following aircraft have become stale: {0}".format(too_old))
                for id in too_old:
                    self._removeFromMap(id)
                    del self.aircraft[id]

    # Internal function to merge aircraft data
    def _merge(self, id1, id2):
        if id1 not in self.aircraft:
            if id2 in self.aircraft:
                logger.debug("Linking %s to %s" % (id1, id2))
                self.aircraft[id1] = self.aircraft[id2]
        elif id2 not in self.aircraft:
            logger.debug("Linking %s to %s" % (id2, id1))
            self.aircraft[id2] = self.aircraft[id1]
        else:
            item1 = self.aircraft[id1]
            item2 = self.aircraft[id2]
            if item1 is not item2:
                # Make sure ID1 is always newer than ID2
                if item1["ts"] < item2["ts"]:
                    item1, item2 = item2, item1
                    id1,   id2   = id2,   id1
                # Update older data with newer data
                logger.debug("Merging %s into %s" % (id2, id1))
                item2.update(item1)
                self.aircraft[id1] = item2
                # Change ID2 color to ID1
                self.colors.rename(id2, id1)
                # Remove ID2 airplane from the map
                self._removeFromMap(id2)

    # Internal function to remove aircraft from the map
    def _removeFromMap(self, id):
        # Ignore errors removing non-existing flights
        try:
            item = self.aircraft[id]
            if "lat" in item and "lon" in item:
                Map.getSharedInstance().removeLocation(id)
        except Exception as exptn:
            logger.debug("Exception removing aircraft %s: %s" % (id, str(exptn)))


#
# Base class for aircraft message parsers.
#
class AircraftParser(TextParser):
    def __init__(self, filePrefix: str = None, service: bool = False):
        self.reFlight = re.compile("^([0-9A-Z]{2}|[A-Z]{3})0*([0-9]+[A-Z]*)$")
        self.reDots   = re.compile("^\.*([^\.].*?)\.*$")
        self.reIATA   = re.compile("^..[0-9]+$")
        super().__init__(filePrefix=filePrefix, service=service)

    def parse(self, msg: bytes):
        # Parse incoming message via mode-specific function
        out = self.parseAircraft(msg)
        if out is not None:
            # Remove extra zeros from the flight ID
            if "flight" in out:
                out["flight"] = self.reFlight.sub("\\1\\2", out["flight"])
            # Remove leading and trailing dots from ACARS data
            for key in ["aircraft", "origin", "destination"]:
                if key in out:
                    out[key] = self.reDots.sub("\\1", out[key])
            # Update aircraft database with the new data
            AircraftManager.getSharedInstance().update(out)
        # Done
        return out

    # Mode-specific parse function
    def parseAircraft(self, msg: bytes):
        return None

    # Common function to parse ACARS subframes in HFDL/VDL2/etc
    def parseAcars(self, data, out):
        # Collect data
        out["type"] = "ACARS frame"
        aircraft = data["reg"].strip()
        message  = data["msg_text"].strip()
        flight   = data["flight"].strip() if "flight" in data else ""
        if len(aircraft)>0:
            out["aircraft"] = aircraft
        if len(message)>0:
            out["message"] = [ message ]
        if len(flight)>0:
            out["flight"] = flight
        # Done
        return out


#
# Parser for HFDL messages coming from DumpHFDL in JSON format.
#
class HfdlParser(AircraftParser):
    def __init__(self, service: bool = False):
        super().__init__(filePrefix="HFDL", service=service)

    def parseAircraft(self, msg: bytes):
        # Expect JSON data in text form
        data = json.loads(msg)
        pm   = Config.get()
        ts   = data["hfdl"]["t"]["sec"] + data["hfdl"]["t"]["usec"] / 1000000
        # @@@ Only parse messages that have LDPU frames for now !!!
        if "lpdu" not in data["hfdl"]:
            return {}
        # Collect basic data first
        out = {
            "mode" : "HFDL",
            "time" : datetime.utcfromtimestamp(ts).strftime("%H:%M:%S"),
            "ts"   : ts,
            "ttl"  : ts + pm["hfdl_ttl"]
        }
        # Parse LPDU if present
        if "lpdu" in data["hfdl"]:
            self.parseLpdu(data["hfdl"]["lpdu"], out)
        # Parse SPDU if present
        if "spdu" in data["hfdl"]:
            self.parseSpdu(data["hfdl"]["spdu"], out)
        # Parse MPDU if present
        if "mpdu" in data["hfdl"]:
            self.parseMpdu(data["hfdl"]["mpdu"], out)
        # Done
        return out

    def parseSpdu(self, data, out):
        # Not parsing yet
        out["type"] = "SPDU frame"
        return out

    def parseMpdu(self, data, out):
        # Not parsing yet
        out["type"] = "MPDU frame"
        return out

    def parseLpdu(self, data, out):
        # Collect data
        out["type"] = data["type"]["name"]
        # Add aircraft info, if present, assign color right away
        if "ac_info" in data and "icao" in data["ac_info"]:
            out["icao"] = data["ac_info"]["icao"].strip()
        # Source might be a ground station
        #if data["src"]["type"] == "Ground station":
        #    out["flight"] = "GS-%d" % data["src"]["id"]
        # Parse HFNPDU is present
        if "hfnpdu" in data:
            self.parseHfnpdu(data["hfnpdu"], out)
        # Done
        return out

    def parseHfnpdu(self, data, out):
        # Use flight ID as unique identifier
        flight = data["flight_id"].strip() if "flight_id" in data else ""
        if len(flight)>0:
            out["flight"] = flight
        # If we see ACARS message, parse it and drop out
        if "acars" in data:
            return self.parseAcars(data["acars"], out)
        # If message carries time, parse it
        if "utc_time" in data:
            msgtime = data["utc_time"]
        elif "time" in data:
            msgtime = data["time"]
        else:
            msgtime = None
        # Add reported message time, if present
        if msgtime:
            out["msgtime"] = "%02d:%02d:%02d" % (
                msgtime["hour"], msgtime["min"], msgtime["sec"]
            )
        # Add aircraft location, if present
        if "pos" in data:
            out["lat"] = data["pos"]["lat"]
            out["lon"] = data["pos"]["lon"]
        # Done
        return out


#
# Parser for VDL2 messages coming from DumpVDL2 in JSON format.
#
class Vdl2Parser(AircraftParser):
    def __init__(self, service: bool = False):
        super().__init__(filePrefix="VDL2", service=service)

    def parseAircraft(self, msg: bytes):
        # Expect JSON data in text form
        data = json.loads(msg)
        pm   = Config.get()
        ts   = data["vdl2"]["t"]["sec"] + data["vdl2"]["t"]["usec"] / 1000000
        # Collect basic data first
        out = {
            "mode" : "VDL2",
            "time" : datetime.utcfromtimestamp(ts).strftime("%H:%M:%S"),
            "ts"   : ts,
            "ttl"  : ts + pm["vdl2_ttl"]
        }
        # Parse AVLC if present
        if "avlc" in data["vdl2"]:
            self.parseAvlc(data["vdl2"]["avlc"], out)
        # Done
        return out

    def parseAvlc(self, data, out):
        # Find if aircraft is message's source or destination
        if data["src"]["type"] == "Aircraft":
            p = data["src"]
        elif data["dst"]["type"] == "Aircraft":
            p = data["dst"]
        else:
            return out
        # Address is the ICAO ID
        out["icao"] = p["addr"]
        # Clarify message type as much as possible
        if "status" in p:
            out["type"] = p["status"]
        if "cmd" in data:
            if "type" in out:
                out["type"] += ", " + data["cmd"]
            else:
                out["type"] = data["cmd"]
        # Parse ACARS if present
        if "acars" in data:
            self.parseAcars(data["acars"], out)
        # Parse XID if present
        if "xid" in data:
            self.parseXid(data["xid"], out)
        # Done
        return out

    def parseXid(self, data, out):
        # Collect data
        out["type"] = "XID " + data["type_descr"]
        if "vdl_params" in data:
            # Parse VDL parameters array
            for p in data["vdl_params"]:
                if p["name"] == "ac_location":
                    # Parse location
                    out["lat"] = p["value"]["loc"]["lat"]
                    out["lon"] = p["value"]["loc"]["lon"]
                    # Ignore dummy altitude value
                    alt = p["value"]["alt"]
                    if alt < 255000:
                        # Convert altitude from feet into meters
                        out["altitude"] = round(alt * METERS_PER_FOOT)
                elif p["name"] == "dst_airport":
                    # Parse destination airport
                    out["destination"] = p["value"]
                elif p["name"] == "modulation_support":
                    # Parse supported modulations
                    out["modes"] = p["value"]
        # Done
        return out


#
# Parser for ADSB messages coming from Dump1090 in hexadecimal format.
#
class AdsbParser(AircraftParser):
    def __init__(self, service: bool = False):
        super().__init__(filePrefix=None, service=service)
        self.smode_parser = ModeSParser()

    def parseAircraft(self, msg: bytes):
        # If it is a valid Mode-S message...
        if msg.startswith(b"*") and msg.endswith(b";") and len(msg) in [16, 30]:
            # Parse Mode-S message
            msg = msg[1:-1].decode('utf-8', 'replace')
            out = self.smode_parser.process(bytes.fromhex(msg))
            #logger.debug("@@@ PARSE OUT: {0}".format(out))
            # Only consider position and identification reports for now
            if "identification" in out or "groundspeed" in out or ("lat" in out and "lon" in out):
                # Add fields for compatibility with other aircraft parsers
                pm = Config.get()
                ts = datetime.now().timestamp()
                out["ts"]   = ts
                out["ttl"]  = ts + pm["adsb_ttl"]
                out["time"] = datetime.utcnow().strftime("%H:%M:%S")
                out["icao"] = out["icao"].upper()
                # Determine message format and type
                format = out["format"]
                if format >= len(MODE_S_FORMATS) or not MODE_S_FORMATS[format]:
                    out["type"] = "Mode-S Format {0} frame".format(format)
                elif format == 17:
                    out["type"] = "ADSB Type {0} frame".format(out["adsb_type"])
                else:
                    out["type"] = "Mode-S {0} frame".format(MODE_S_FORMATS[format])
                # Flight ID, if present
                if "identification" in out:
                    out["flight"] = out["identification"].strip()
                # Altitude, if present
                if "altitude" in out:
                   out["altitude"] = round(out["altitude"] * METERS_PER_FOOT)
                # Vertical speed, if present
                if "verticalspeed" in out:
                    out["vspeed"] = round(out["verticalspeed"] * METERS_PER_FOOT)
                # Speed, if present
                if "groundspeed" in out:
                    out["speed"] = round(out["groundspeed"] * KMH_PER_KNOT)
                #elif "TAS" in out:
                #    out["speed"] = round(out["TAS"] * KMH_PER_KNOT)
                #elif "IAS" in out:
                #    out["speed"] = round(out["IAS"] * KMH_PER_KNOT)
                # Course, if present (prefer actual aircraft orientation)
                if "heading" in out:
                    out["course"] = round(out["heading"])
                elif "groundtrack" in out:
                    out["course"] = round(out["groundtrack"])
                # Done
                return out

        # No data parsed
        return None

    def parseDump1090Json(self, file: str, updateDatabase: bool = False):
        # Load JSON from supplied file
        try:
            with open(file, "r") as f:
                data = json.load(f)
        except:
            return None

        # Make sure we have the aircraft data
        if "aircraft" not in data or "now" not in data:
            return None
        elif not updateDatabase:
          # Return original JSON "aircraft" contents
          return data["aircraft"]

        # Going to add timestamps and TTLs
        pm   = Config.get()
        ts   = data["now"]
        ttl  = ts + pm["adsb_ttl"]
        data = data["aircraft"]

        # Iterate over aircraft
        for entry in data:
            out = {
                "mode" : "ADSB",
                "icao" : entry["hex"].upper(),
                "ts"   : ts,
                "ttl"  : ttl,
                "msgs" : entry["messages"],
                "seen" : entry["seen"],
                "rssi" : entry["rssi"],
            }

            if "lat" in entry and "lon" in entry:
                out["lat"] = entry["lat"]
                out["lon"] = entry["lon"]

            if "flight" in entry:
                out["flight"] = entry["flight"].strip()

            if "squawk" in entry:
                out["type"] = "Squawk " + entry["squawk"]
            elif "category" in entry:
                out["type"] = "Category " + entry["category"]

            if "alt_geom" in entry:
                out["altitude"] = round(entry["alt_geom"] * METERS_PER_FOOT)
            elif "alt_baro" in entry:
                out["altitude"] = round(entry["alt_baro"] * METERS_PER_FOOT)
            elif "nav_altitude_mcp" in entry:
                out["altitude"] = round(entry["nav_altitude_mcp"] * METERS_PER_FOOT)

            if "nav_heading" in entry:
                out["course"] = round(entry["nav_heading"])
            elif "track" in entry:
                out["course"] = round(entry["track"])

            # Update aircraft database with the new data
            AircraftManager.getSharedInstance().update(out)

        # Return original JSON "aircraft" contents
        return data


#
# Parser for ACARS messages coming from AcarsDec in JSON format.
#
class AcarsParser(AircraftParser):
    def __init__(self, service: bool = False):
        super().__init__(filePrefix="ACARS", service=service)
        self.attrMap = {
            "tail"   : "aircraft",
            "flight" : "flight",
            "text"   : "message",
            "dsta"   : "destination",
            "depa"   : "origin",
            "eta"    : "eta",
        }

    def parseAircraft(self, msg: bytes):
        # Expect JSON data in text form
        data = json.loads(msg)
        pm   = Config.get()
        ts   = data["timestamp"]
        #logger.debug("@@@ ACARS: {0}".format(data))
        # Collect basic data first
        out = {
            "mode" : "ACARS",
            "type" : "ACARS frame",
            "time" : datetime.utcfromtimestamp(ts).strftime("%H:%M:%S"),
            "ts"   : ts,
            "ttl"  : ts + pm["acars_ttl"]
        }
        # Fetch other data
        for key in self.attrMap:
            if key in data:
                value = data[key].strip()
                if len(value)>0:
                    out[self.attrMap[key]] = value
        # Done
        return out
