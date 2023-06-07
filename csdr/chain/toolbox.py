from csdr.chain.demodulator import ServiceDemodulator, DialFrequencyReceiver
from csdr.module.toolbox import Rtl433Module, MultimonModule, DumpHfdlModule
from pycsdr.modules import FmDemod, AudioResampler, Convert, Agc, Squelch
from pycsdr.types import Format
from owrx.toolbox import TextParser, PageParser, SelCallParser, IsmParser, HfdlParser


class IsmDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self, service: bool = False):
        self.sampleRate = 48000
        self.parser = IsmParser(service=service)
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


class MultimonDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self, decoders: list[str], parser, withSquelch: bool = False):
        self.sampleRate = 24000
        self.squelch = None
        self.parser = parser
        workers = [
            FmDemod(),
            AudioResampler(self.sampleRate, 22050),
            Convert(Format.FLOAT, Format.SHORT),
            MultimonModule(decoders),
            self.parser,
        ]
        # If using squelch, insert Squelch() at the start
        if withSquelch:
            # s-meter readings are available every 1024 samples
            # the reporting interval is measured in those 1024-sample blocks
            self.readingsPerSec = 4
            self.squelch = Squelch(5, int(self.sampleRate / (self.readingsPerSec * 1024)))
            workers.insert(0, self.squelch)

        # Connect all the workers
        super().__init__(workers)

    def getFixedAudioRate(self) -> int:
        return self.sampleRate

    def supportsSquelch(self) -> bool:
        return self.squelch != None

    def setDialFrequency(self, frequency: int) -> None:
        self.parser.setDialFrequency(frequency)

    def _convertToLinear(self, db: float) -> float:
        return float(math.pow(10, db / 10))

    def setSquelchLevel(self, level: float) -> None:
        if self.squelch:
            self.squelch.setSquelchLevel(self._convertToLinear(level))


class PageDemodulator(MultimonDemodulator):
    def __init__(self, service: bool = False):
        super().__init__(
            ["FLEX", "POCSAG512", "POCSAG1200", "POCSAG2400"],
            PageParser(service=service)
        )


class EasDemodulator(MultimonDemodulator):
    def __init__(self, service: bool = False):
        super().__init__(["EAS"], TextParser(service=service))


class SelCallDemodulator(MultimonDemodulator):
    def __init__(self, service: bool = False):
        super().__init__(
            ["DTMF", "EEA", "EIA", "CCIR"],
            SelCallParser(service=service),
            withSquelch = True
        )


class ZveiDemodulator(MultimonDemodulator):
    def __init__(self, service: bool = False):
        super().__init__(
            ["ZVEI1", "ZVEI2", "ZVEI3", "DZVEI", "PZVEI"],
            SelCallParser(service=service),
            withSquelch = True
        )


class HfdlDemodulator(ServiceDemodulator, DialFrequencyReceiver):
    def __init__(self, service: bool = False):
        self.sampleRate = 12000
        self.parser = HfdlParser(service=service)
        workers = [
            Agc(Format.COMPLEX_FLOAT),
            DumpHfdlModule(self.sampleRate, jsonOutput = not service),
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


