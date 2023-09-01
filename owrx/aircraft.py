from owrx.toolbox import TextParser, ColorCache
from owrx.map import Map, LatLngLocation
from owrx.aprs import getSymbolData
from owrx.adsb.modes import ModeSParser
from datetime import datetime, timedelta
import threading
import json
import math
import time

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
        mod = '/' if self.data["mode"]=="HFDL" else '\\'
        res["symbol"] = getSymbolData('^', mod)
        # Convert aircraft-specific data into APRS-like data
        for x in ["icao", "aircraft", "flight", "speed", "altitude", "course", "airport", "vspeed"]:
            if x in self.data:
                res[x] = self.data[x]
        # Treat last message as comment
        if "message" in self.data:
            res["comment"] = self.data["message"]
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

    # Get unique aircraft ID, using ICAO (ModeS), tail, or flight number.
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
        self.retainTime = 60*60
        self.checkTime = 60
        self.colors = ColorCache()
        self.aircraft = {}
        self.periodicCleanup()

    # Perform periodic cleanup
    def periodicCleanup(self):
        self.cleanup(datetime.utcnow() - timedelta(seconds=self.retainTime))
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
            # If no such ID yet, see if we know this aircraft by other IDs
            if id not in self.aircraft:
                # Replace flight ID with better ID
                if "flight" in data and data["flight"] in self.aircraft:
                    old_id = data["flight"]
                    self.aircraft[id] = self.aircraft[old_id]
                    self.colors.rename(old_id, id)
                    self._removeFromMap(old_id)
                    del self.aircraft[old_id]
                # Replace aircraft ID with better ID
                if "aircraft" in data and data["aircraft"] in self.aircraft:
                    old_id = data["aircraft"]
                    if id in self.aircraft:
                        self.aircraft[id].update(self.aircraft[old_id])
                    else:
                        self.aircraft[id] = self.aircraft[old_id]
                    self.colors.rename(old_id, id)
                    self._removeFromMap(old_id)
                    del self.aircraft[old_id]
            # If still no ID in the database...
            if id not in self.aircraft:
                # Create a new record
                self.aircraft[id] = data.copy()
                item = self.aircraft[id]
            else:
                # Previous data and position
                item = self.aircraft[id]
                pos0 = (item["lat"], item["lon"]) if "lat" in item and "lon" in item else None
                # Current data and position
                item.update(data)
                pos1 = (item["lat"], item["lon"]) if "lat" in item and "lon" in item else None
                # If both positions exist, compute course
                if "course" not in data and pos0 and pos1 and pos1 != pos0:
                    item["course"] = round(self.bearing(pos0, pos1))
            # Update timestamp, if missing
            if "ts" not in data:
                item["ts"] = datetime.utcnow().timestamp()
            # Update aircraft on the map
            if "lat" in item and "lon" in item and "mode" in item:
                loc = AircraftLocation(item)
                Map.getSharedInstance().updateLocation(id, loc, item["mode"])
            # Update input data with computed data
            for key in ["icao", "aircraft", "flight", "course", "ts"]:
                if key in item:
                    data[key] = item[key]
            # Assign a color by ID
            data["color"] = self.colors.getColor(id)

    # Remove all database entries older than given time.
    def cleanup(self, horizon):
        horizon = horizon.timestamp()
        # Now operating on the database...
        with self.lock:
            too_old = [x for x in self.aircraft.keys() if self.aircraft[x]["ts"] <= horizon]
            for id in too_old:
                self._removeFromMap(id)
                del self.aircraft[id]

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
    def __init__(self, filePrefix: str, service: bool = False):
        super().__init__(filePrefix=filePrefix, service=service)

    def parseAcars(self, data, out):
        # Collect data
        out["type"]     = "ACARS frame"
        out["aircraft"] = data["reg"].strip()
        out["message"]  = data["msg_text"].strip()
        # Get flight ID, if present
        flight = data["flight"].strip() if "flight" in data else ""
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

    def parse(self, msg: str):
        # Expect JSON data in text form
        data = json.loads(msg)
        ts   = data["hfdl"]["t"]["sec"] + data["hfdl"]["t"]["usec"] / 1000000
        # @@@ Only parse messages that have LDPU frames for now !!!
        if "lpdu" not in data["hfdl"]:
            return {}
        # Collect basic data first
        out = {
            "mode" : "HFDL",
            "time" : datetime.utcfromtimestamp(ts).strftime("%H:%M:%S"),
            "ts"   : ts
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
        # Update aircraft database with the new data
        AircraftManager.getSharedInstance().update(out)
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

    def parse(self, msg: str):
        # Expect JSON data in text form
        data = json.loads(msg)
        ts   = data["vdl2"]["t"]["sec"] + data["vdl2"]["t"]["usec"] / 1000000
        # Collect basic data first
        out = {
            "mode" : "VDL2",
            "time" : datetime.utcfromtimestamp(ts).strftime("%H:%M:%S"),
            "ts"   : ts
        }
        # Parse AVLC if present
        if "avlc" in data["vdl2"]:
            self.parseAvlc(data["vdl2"]["avlc"], out)
        # Update aircraft database with the new data
        AircraftManager.getSharedInstance().update(out)
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
                    # Convert altitude from feet into meters
                    out["altitude"] = round(p["value"]["alt"] * METERS_PER_FOOT)
                elif p["name"] == "dst_airport":
                    # Parse destination airport
                    out["airport"] = p["value"]
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
        super().__init__(filePrefix="ADSB", service=service)
        self.smode_parser = ModeSParser()

    def parse(self, msg: str):
        # If it is a valid Mode-S message...
        if msg.startswith("*") and msg.endswith(";") and len(msg) in [16, 30]:
            # Parse Mode-S message
            out = self.smode_parser.process(bytes.fromhex(msg[1:-1]))
            logger.debug("@@@ PARSE OUT: {0}".format(out))
            # Only consider position and identification reports for now
            if "identification" in out or "groundspeed" in out or ("lat" in out and "lon" in out):
                # Add fields for compatibility with other aircraft parsers
                now = datetime.utcnow()
                out["ts"]   = now.timestamp()
                out["time"] = now.strftime("%H:%M:%S")
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
                # Update aircraft database with the new data
                AircraftManager.getSharedInstance().update(out)
                return out

        # No data parsed
        return {}
