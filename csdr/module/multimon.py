from pycsdr.types import Format
from csdr.module import PopenModule


class MultimonModule(PopenModule):
    def __init__(self, decoders: list[str]):
        self.decoders = decoders
        super().__init__()

    def getCommand(self):
        cmd = ["multimon-ng", "-", "-v0", "-c"]
        for x in self.decoders:
            cmd += ["-a", x]
        return cmd

    def getInputFormat(self) -> Format:
        return Format.SHORT

    def getOutputFormat(self) -> Format:
        return Format.CHAR

