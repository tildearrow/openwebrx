from csdr.chain.demodulator import ServiceDemodulator, DialFrequencyReceiver
from csdr.module.multimon import MultimonModule
from pycsdr.modules import FmDemod, AudioResampler, Convert
from pycsdr.types import Format
from owrx.multimon import MultimonParser


class MultimonDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self, decoders: list[str], service: bool = False):
        self.sampleRate = 24000
        self.parser = MultimonParser(service=service)
        workers = [
            FmDemod(),
            AudioResampler(self.sampleRate, 22050),
            Convert(Format.FLOAT, Format.SHORT),
            MultimonModule(decoders),
            self.parser,
        ]
        super().__init__(workers)

    def getFixedAudioRate(self) -> int:
        return self.sampleRate

    def supportsSquelch(self) -> bool:
        return False

    def setDialFrequency(self, frequency: int) -> None:
        self.parser.setDialFrequency(frequency)
