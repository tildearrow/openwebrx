from csdr.chain import Chain
from pycsdr.modules import Convert
from pycsdr.types import Format
from csdr.module.toolbox import RedseaModule
from csdr.module import JsonParser


class Redsea(Chain):
    def __init__(self, sampleRate: int, rbds: bool):
        super().__init__([
            Convert(Format.FLOAT, Format.SHORT),
            RedseaModule(sampleRate, rbds),
            JsonParser("WFM"),
        ])
