from owrx.storage import Storage
from csdr.module import ThreadModule
from pycsdr.types import Format
from datetime import datetime
import pickle
import os

import logging

logger = logging.getLogger(__name__)

class MultimonParser(ThreadModule):
    def __init__(self, service: bool = False):
        self.service   = service
        self.frequency = 0
        self.data      = bytearray(b'')
        self.file      = None
        super().__init__()

    def __del__(self):
        # Close currently open file, if any
        self.closeFile()

    def closeFile(self):
        if self.file is not None:
            try:
                logger.debug("Closing log file '%s'." % self.fileName)
                self.file.close()
                self.file = None
                # Delete excessive files from storage
                logger.debug("Performing storage cleanup...")
                Storage().cleanStoredFiles()

            except Exception as exptn:
                logger.debug("Exception closing file: %s" % str(exptn))
                self.file = None

    def newFile(self, fileName):
        self.closeFile()
        try:
            self.fileName = Storage().getFilePath(fileName + ".txt")
            logger.debug("Opening log file '%s'..." % self.fileName)
            self.file = open(self.fileName, "wb")

        except Exception as exptn:
            logger.debug("Exception opening file: %s" % str(exptn))
            self.file = None

    def writeFile(self, data):
        if self.file is not None:
            try:
                self.file.write(data)
            except Exception:
                pass

    def getInputFormat(self) -> Format:
        return Format.CHAR

    def getOutputFormat(self) -> Format:
        return Format.CHAR

    def setDialFrequency(self, frequency: int) -> None:
        self.frequency = frequency

    def myName(self):
        return "%s%s" % (
            "Service" if self.service else "Client",
            " at %dkHz" % (self.frequency // 1000) if self.frequency>0 else ""
        )

    def run(self):
        logger.debug("%s starting..." % self.myName())
        # Run while there is input data
        while self.doRun:
            # Read input data
            inp = self.reader.read()
            # Terminate if no input data
            if inp is None:
                logger.debug("%s exiting..." % self.myName())
                self.doRun = False
                break
            # Add read data to the buffer
            self.data = self.data + inp.tobytes()
            # Process buffer contents
            out = self.process()
            # Keep processing while there is input to parse
            while out is not None:
                if len(out)>0:
                    self.writer.write(pickle.dumps(out))
                out = self.process()

    def process(self):
        # No result yet
        out = None

        # Search for end-of-line
        eol = self.data.find(b'\n')

        # If found end-of-line...
        if eol>=0:
            try:
                msg = self.data[0:eol].decode()
                logger.debug("%s: %s" % (self.myName(), msg))
                # If running as a service...
                if self.service:
                    # Write message into open log file, including end-of-line
                    self.writeFile(self.data[0:eol+1])
                    # Empty result
                    out = {}
                else:
                    # Split message into pipe-separated fields
                    msg = msg.split('|')
                    # Parse FLEX messages
                    if len(msg)>=5 and msg[0]=='FLEX':
                        out = {
                            "mode":      msg[0],
                            "timestamp": msg[1],
                            "state":     msg[2],
                            "frame":     msg[3],
                            "capcode":   msg[4]
                        }
                        if len(msg)>=7:
                            out.update({ "message": msg[6] })
                    else:
                        # Failed to parse this message
                        out = {}

            except Exception as exptn:
                logger.debug("%s: Exception parsing: %s" % (self.myName(), str(exptn)))

            # Remove parsed message from input, including end-of-line
            del self.data[0:eol+1]

        # Return parsed result or None if no result yet
        return out
