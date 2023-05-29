from pycsdr.types import Format
from csdr.module import PopenModule


class Rtl433Module(PopenModule):
    def __init__(self, sampleRate: int = 48000, jsonOutput: bool = False):
        self.sampleRate = sampleRate
        super().__init__()

    def getCommand(self):
        return [
            "rtl_433", "-r", "cs16:-", "-s", str(self.sampleRate),
            "-F", "json" if jsonOutput else "kv",
# These need 48kHz, 24kHz is not enough for them
#            "-R", "-80",  "-R", "-149", "-R", "-154", "-R", "-160",
#            "-R", "-161", "-R", "-167", "-R", "-178",
            "-R", "64", "-A",
        ]

    def getInputFormat(self) -> Format:
        return Format.COMPLEX_SHORT

    def getOutputFormat(self) -> Format:
        return Format.CHAR

