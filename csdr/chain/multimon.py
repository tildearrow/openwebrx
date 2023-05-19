from csdr.chain.demodulator import ServiceDemodulator, DialFrequencyReceiver
from pycsdr.modules import FmDemod, AudioResampler
from mmon.modules import Flex


class FlexDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self):
        self.sampleRate = 48000
        workers = [
            FmDemod(),
            AudioResampler(self.sampleRate, 22050),
            Flex(),
        ]
        super().__init__(workers)

    def getFixedAudioRate(self) -> int:
        return self.sampleRate

    def supportsSquelch(self) -> bool:
        return False

    def setDialFrequency(self, frequency: int) -> None:
        pass

