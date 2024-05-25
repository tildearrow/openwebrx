from csdr.chain.demodulator import FixedIfSampleRateChain, BaseDemodulatorChain, FixedAudioRateChain, DialFrequencyReceiver, HdAudio
from csdr.module.hdradio import HdRadioModule
from pycsdr.modules import Convert, Agc, Downmix, Writer, Buffer
from pycsdr.types import Format
from typing import Optional

import logging

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class HdRadio(BaseDemodulatorChain, FixedIfSampleRateChain, FixedAudioRateChain, HdAudio, DialFrequencyReceiver):
    def __init__(self, program: int = 0):
        self.hdradio = HdRadioModule(program = program)
        workers = [
            Agc(Format.COMPLEX_FLOAT),
            Convert(Format.COMPLEX_FLOAT, Format.COMPLEX_SHORT),
            self.hdradio,
            Downmix(Format.SHORT),
        ]
        super().__init__(workers)

    def getFixedIfSampleRate(self) -> int:
        return self.hdradio.getFixedAudioRate()

    def getFixedAudioRate(self) -> int:
        return 44100

    def supportsSquelch(self) -> bool:
        return False

    # Set metadata consumer
    def setMetaWriter(self, writer: Writer) -> None:
        self.hdradio.setMetaWriter(writer)

    # Change program
    def setProgram(self, program: int) -> None:
        self.hdradio.setProgram(program)

    def setDialFrequency(self, frequency: int) -> None:
        # Clear station metadata when changing frequency
        pass

    #def _connect(self, w1, w2, buffer: Optional[Buffer] = None) -> None:
    #    # Buffering 2 seconds of input stream
    #    if isinstance(w2, HdRadioModule):
    #        size   = self.getFixedIfSampleRate() * 2 * 2 * 2
    #        buffer = Buffer(w1.getOutputFormat(), size=size)
    #        logger.info("%d bytes => HdRadioModule", size)
    #    # Buffering 10 seconds of output audio
    #    if isinstance(w1, HdRadioModule):
    #        size   = self.getFixedAudioRate() * 2 * 2
    #        buffer = Buffer(w1.getOutputFormat(), size=size)
    #        logger.info("HdRadioModule => %d bytes", size)
    #    super()._connect(w1, w2, buffer)
