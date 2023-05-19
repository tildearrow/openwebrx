from csdr.chain.demodulator import ServiceDemodulator, DialFrequencyReceiver
from pycsdr.modules import FmDemod, AudioResampler
from mmon.modules import Flex
from owrx.multimon import MultimonParser

class FlexDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self, service: bool = False):
        self.sampleRate = 24000
        self.parser = MultimonParser(service=service)
        workers = [
            FmDemod(),
            AudioResampler(self.sampleRate, 22050),
            Flex(),
            self.parser,
        ]
        super().__init__(workers)

    def getFixedAudioRate(self) -> int:
        return self.sampleRate

    def supportsSquelch(self) -> bool:
        return False

    def setDialFrequency(self, frequency: int) -> None:
        self.parser.setDialFrequency(frequency)
