from owrx.toolbox import TextParser
from owrx.color import ColorCache
from owrx.config import Config
import json

import logging

logger = logging.getLogger(__name__)


class DscParser(TextParser):
    def __init__(self, service: bool = False):
        # Colors will be assigned via this cache
        self.colors = ColorCache()
        # No frequency yet
        self.frequency = 0
        # Construct parent object
        super().__init__(filePrefix="DSC", service=service)

    def setDialFrequency(self, frequency: int) -> None:
        self.frequency = frequency

    def parse(self, msg: bytes):
        # Do not parse in service mode
        #if self.service:
        #    return None
        # Expect JSON data in text form
        out = json.loads(msg)
        # Filter out errors
        pm = Config.get()
        if "data" in out and not pm["dsc_show_errors"]:
            return {}
        # Add frequency
        if self.frequency != 0:
            out["frequency"] = self.frequency
        # When in interactive mode, add mode name and color to identify sender
        if not self.service:
            out["mode"] = "DSC"
            if "src" in out:
                out["color"] = self.colors.getColor(out["src"])
        # Log received messages for debugging
        logger.debug("{0}".format(out))
        # Done
        return out
