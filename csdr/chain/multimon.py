from csdr.chain.demodulator import ServiceDemodulator, DialFrequencyReceiver
from csdr.module.multimon import MultimonModule
from pycsdr.modules import FmDemod, AudioResampler, Convert
from pycsdr.types import Format
from owrx.multimon import MultimonParser, PageParser, SelCallParser


class MultimonDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self, decoders: list[str], parser):
        self.sampleRate = 24000
        self.parser = parser
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


class PageDemodulator(MultimonDemodulator):
    def __init__(self, filtering: bool = False, service: bool = False):
        super().__init__(
            ["FLEX", "POCSAG512", "POCSAG1200", "POCSAG2400"],
            PageParser(filtering=filtering, service=service)
        )


class EasDemodulator(MultimonDemodulator):
    def __init__(self, service: bool = False):
        super().__init__(["EAS"], MultimonParser(service=service))


class SelCallDemodulator(MultimonDemodulator):
    def __init__(self, service: bool = False):
        super().__init__(
# These aappear to be rarely used and very similar, so they trigger at once
#            "ZVEI1", "ZVEI2", "ZVEI3", "DZVEI", "PZVEI",
            ["DTMF", "EEA", "EIA", "CCIR"],
            SelCallParser(service=service)
        )

