from csdr.chain.demodulator import ServiceDemodulator, DialFrequencyReceiver
from csdr.module.rtl433 import Rtl433Module
from pycsdr.modules import Convert, Agc
from pycsdr.types import Format
from owrx.rtl433 import Rtl433Parser


class Rtl433Demodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self, service: bool = False):
        self.sampleRate = 48000
        self.parser = Rtl433Parser(service=service)
        workers = [
            Agc(Format.COMPLEX_FLOAT),
            Convert(Format.COMPLEX_FLOAT, Format.COMPLEX_SHORT),
            Rtl433Module(self.sampleRate, jsonOutput = not service),
            self.parser,
        ]
        # Connect all the workers
        super().__init__(workers)

    def getFixedAudioRate(self) -> int:
        return self.sampleRate

    def supportsSquelch(self) -> bool:
        return False

    def setDialFrequency(self, frequency: int) -> None:
        self.parser.setDialFrequency(frequency)

