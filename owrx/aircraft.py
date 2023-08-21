from owrx.toolbox import TextParser
from owrx.map import Map, LatLngLocation
from owrx.aprs import getSymbolData
from datetime import datetime
import json

import logging

logger = logging.getLogger(__name__)


class AircraftLocation(LatLngLocation):
    def __init__(self, data):
        super().__init__(data["lat"], data["lon"])
        self.data = data

    def __dict__(self):
        res = super(AircraftLocation, self).__dict__()
        mod = '/' if self.data["mode"]=="HFDL" else '\\'
        res["symbol"] = getSymbolData('^', mod)
        if "aircraft" in self.data:
            res["aircraft"] = self.data["aircraft"]
        if "altitude" in self.data:
            res["altitude"] = self.data["altitude"]
        if "message" in self.data:
            res["comment"] = self.data["message"]
        return res


class AircraftParser(TextParser):
    def __init__(self, filePrefix: str, service: bool = False):
        super().__init__(filePrefix=filePrefix, service=service)

    def getAircraftId(self, data):
        # Use flight ID or aircraft ID as unique identifier
        return data["flight"] if "flight" in data else data["aircraft"]

    def updateMap(self, data):
        if "lat" in data and "lon" in data:
            if "flight" in data or "aircraft" in data:
                loc = AircraftLocation(data)
                name = self.getAircraftId(data)
                Map.getSharedInstance().updateLocation(name, loc, data["mode"])

    def parseAcars(self, data, out):
        # Collect data
        subnote = " ({0})".format(out["aircraft"]) if "aircraft" in out else ""
        out["type"]     = "ACARS frame" + subnote
        out["aircraft"] = data["reg"].strip()
        out["message"]  = data["msg_text"].strip()
        # Get flight ID, if present
        flight = data["flight"].strip() if "flight" in data else ""
        if len(flight)>0:
            out["flight"] = flight
        # Done
        return out


class HfdlParser(AircraftParser):
    def __init__(self, service: bool = False):
        super().__init__(filePrefix="HFDL", service=service)

    def parse(self, msg: str):
        # Expect JSON data in text form
        data   = json.loads(msg)
        tstamp = datetime.fromtimestamp(data["hfdl"]["t"]["sec"]).strftime("%I:%M:%S")
        # @@@ Only parse messages that have LDPU frames for now !!!
        if "lpdu" not in data["hfdl"]:
            return {}
        # Collect basic data first
        out = {
            "mode": "HFDL",
            "time": tstamp,
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
        # Assign color based on the flight or aircraft ID
        if "flight" in out or "aircraft" in out:
            out["color"] = self.getColor(self.getAircraftId(out))
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
            out["aircraft"] = data["ac_info"]["icao"].strip()
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
            # Report location on the map
            self.updateMap(out)
        # Done
        return out


class Vdl2Parser(AircraftParser):
    def __init__(self, service: bool = False):
        super().__init__(filePrefix="VDL2", service=service)

    def parse(self, msg: str):
        # Expect JSON data in text form
        data   = json.loads(msg)
        tstamp = datetime.fromtimestamp(data["vdl2"]["t"]["sec"]).strftime("%I:%M:%S")
        # Collect basic data first
        out = {
            "mode": "VDL2",
            "time": tstamp,
        }
        # Parse AVLC if present
        if "avlc" in data["vdl2"]:
            self.parseAvlc(data["vdl2"]["avlc"], out)
        # Done
        #logger.debug("@@@ PARSE OUT: {0}".format(out));
        return out

    def parseAvlc(self, data, out):
        # Find if aircraft is message's source or destination
        if data["src"]["type"] == "Aircraft":
            p = data["src"]
        elif data["dst"]["type"] == "Aircraft":
            p = data["dst"]
        else:
            return out
        # Always add color by Mode-S code, since it is always present
        out["aircraft"] = p["addr"]
        out["color"]    = self.getColor(p["addr"])
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
                    out["altitude"] = round(p["value"]["alt"] / 3.28084)
                elif p["name"] == "dst_airport":
                    # Parse destination airport
                    out["airport"] = p["value"]
                elif p["name"] == "modulation_support":
                    # Parse supported modulations
                    out["modes"] = p["value"]
            # Report location on the map
            self.updateMap(out)
        # Done
        return out

