from csdr.module.nrsc5 import NRSC5, Mode, EventType, ComponentType, Access
from csdr.module import ThreadModule
from pycsdr.modules import Writer
from pycsdr.types import Format

import logging
import threading

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class HdRadioModule(ThreadModule):
    def __init__(self, program: int = 0, amMode: bool = False):
        self.metaWriter = None
        self.program = program
        self.radio   = NRSC5(lambda evt_type, evt: self.callback(evt_type, evt))
# Crashes things?
#        self.radio.set_mode(Mode.AM if amMode else Mode.FM)
        super().__init__()

    def getInputFormat(self) -> Format:
        return Format.COMPLEX_SHORT

    def getOutputFormat(self) -> Format:
        return Format.SHORT

    def getFixedAudioRate(self) -> int:
        return 744188 # 744187.5

    # Change program
    def setProgram(self, program: int) -> None:
        self.program = program

    # Set metadata consumer
    def setMetaWriter(self, writer: Writer) -> None:
        self.metaWriter = writer

    # Write metadata
    def _writeMeta(self, data) -> None:
        if data and self.metaWriter:
            self.metaWriter.write(data)

    def run(self):
        # Start NRSC5 decoder
        logger.debug("Starting NRSC5 decoder...")
        self.radio.open_pipe()
        self.radio.start()

        # Main loop
        logger.debug("Running the loop...")
        while self.doRun:
            data = self.reader.read()
            if data is None:
                self.doRun = False
                break
            try:
                self.radio.pipe_samples_cs16(data.tobytes())
            except Exception as exptn:
                logger.debug("Exception: %s" % str(exptn))

        # Stop NRSC5 decoder
        logger.debug("Stopping NRSC5 decoder...")
        self.radio.stop()
        self.radio.close()
        logger.debug("DONE.")

    def callback(self, evt_type, evt):
        if evt_type == EventType.AUDIO:
            if evt.program == self.program:
                #logger.info("Audio data for program %d", evt.program)
                self.writer.write(evt.data)
        elif evt_type == EventType.HDC:
            if evt.program == self.program:
                #logger.info("HDC data for program %d", evt.program)
                pass
        elif evt_type == EventType.LOST_DEVICE:
            logger.info("Lost device")
            self.doRun = False
        elif evt_type == EventType.IQ:
            logger.info("IQ data")
        elif evt_type == EventType.SYNC:
            logger.info("Synchronized")
        elif evt_type == EventType.LOST_SYNC:
            logger.info("Lost synchronization")
        elif evt_type == EventType.MER:
            logger.info("MER: %.1f dB (lower), %.1f dB (upper)", evt.lower, evt.upper)
        elif evt_type == EventType.BER:
            logger.info("BER: %.6f", evt.cber)
        elif evt_type == EventType.ID3:
            if evt.program == self.program:
                # Collect metadata
                meta = {}
                if evt.title:
                    meta["title"] = evt.title
                if evt.artist:
                    meta["artist"] = evt.artist
                if evt.album:
                    meta["album"] = evt.album
                if evt.genre:
                    meta["genre"] = evt.album
                if evt.ufid:
                    logger.info("Unique file identifier: %s %s", evt.ufid.owner, evt.ufid.id)
                if evt.xhdr:
                    logger.info("XHDR: param=%s mime=%s lot=%s", evt.xhdr.param, evt.xhdr.mime, evt.xhdr.lot)
                # Output collected metadata
                self._writeMeta(meta)
        elif evt_type == EventType.SIG:
            for service in evt:
                logger.info("SIG Service: type=%s number=%s name=%s",
                    service.type, service.number, service.name)
                for component in service.components:
                    if component.type == ComponentType.AUDIO:
                        logger.info("  Audio component: id=%s port=%04X type=%s mime=%s",
                            component.id, component.audio.port,
                            component.audio.type, component.audio.mime)
                    elif component.type == ComponentType.DATA:
                        logger.info("  Data component: id=%s port=%04X service_data_type=%s type=%s mime=%s",
                            component.id, component.data.port,
                            component.data.service_data_type,
                            component.data.type, component.data.mime)
        elif evt_type == EventType.STREAM:
            logger.info("Stream data: port=%04X seq=%04X mime=%s size=%s",
                evt.port, evt.seq, evt.mime, len(evt.data))
        elif evt_type == EventType.PACKET:
            logger.info("Packet data: port=%04X seq=%04X mime=%s size=%s",
                evt.port, evt.seq, evt.mime, len(evt.data))
        elif evt_type == EventType.LOT:
            time_str = evt.expiry_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
            logger.info("LOT file: port=%04X lot=%s name=%s size=%s mime=%s expiry=%s",
                         evt.port, evt.lot, evt.name, len(evt.data), evt.mime, time_str)
        elif evt_type == EventType.SIS:
            # Collect metadata
            meta = {}
            if evt.country_code:
                meta["country"] = evt.country_code
                meta["fcc_id"]  = evt.fcc_facility_id
            if evt.name:
                meta["station"] = evt.name
            if evt.slogan:
                meta["slogan"] = evt.slogan
            if evt.message:
                meta["message"] = evt.message
            if evt.alert:
                meta["alert"] = evt.alert
            if evt.latitude:
                meta["lat"] = evt.latitude
                meta["lon"] = evt.longitude
                meta["alt"] = evt.altitude
            for audio_service in evt.audio_services:
                logger.info("Audio program %s: %s, type: %s, sound experience %s",
                    audio_service.program,
                    "public" if audio_service.access == Access.PUBLIC else "restricted",
                    self.radio.program_type_name(audio_service.type),
                    audio_service.sound_exp)
            for data_service in evt.data_services:
                logger.info("Data service: %s, type: %s, MIME type %03x",
                    "public" if data_service.access == Access.PUBLIC else "restricted",
                    self.radio.service_data_type_name(data_service.type),
                    data_service.mime_type)
            # Output collected metadata
            self._writeMeta(meta)
