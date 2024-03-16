from csdr.chain.demodulator import FixedIfSampleRateChain, BaseDemodulatorChain, FixedAudioRateChain, DialFrequencyReceiver
from csdr.module.hdradio import HdRadioModule
from pycsdr.modules import Convert, Agc, Downmix, Writer
from pycsdr.types import Format


class HdRadio(BaseDemodulatorChain, FixedIfSampleRateChain, FixedAudioRateChain, DialFrequencyReceiver):
    def __init__(self, program: int = 0):
        self.hdradio = HdRadioModule(program = program)
        workers = [
            Agc(Format.COMPLEX_FLOAT),
            Convert(Format.COMPLEX_FLOAT, Format.COMPLEX_SHORT),
            self.hdradio,
            Downmix(Format.SHORT),
        ]
        super().__init__(workers)

    def getFixedIfSampleRate(self):
        return self.hdradio.getFixedAudioRate()

    def getFixedAudioRate(self):
        return 44100

    # Set metadata consumer
    def setMetaWriter(self, writer: Writer) -> None:
        self.hdradio.setMetaWriter(writer)

    # Change program
    def setProgram(self, program: int) -> None:
        self.hdradio.setProgram(program)

    def setDialFrequency(self, frequency: int) -> None:
        # Clear station metadata when changing frequency
        pass
