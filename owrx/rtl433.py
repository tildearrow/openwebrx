from owrx.storage import Storage
from csdr.module import ThreadModule
from pycsdr.types import Format
from datetime import datetime
import pickle
import os
import re

import logging

logger = logging.getLogger(__name__)

class Rtl433Parser(ThreadModule):
    def __init__(self, filePrefix: str = "ISM", service: bool = False):
        self.service   = service
        self.frequency = 0
        self.data      = bytearray(b'')
        self.filePfx   = filePrefix
        self.file      = None
        self.maxLines  = 10000
        self.cntLines  = 0
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
            self.cntLines = 0

        except Exception as exptn:
            logger.debug("Exception opening file: %s" % str(exptn))
            self.file = None

    def writeFile(self, data):
        # If no file open, create and open a new file
        if self.file is None:
            self.newFile(Storage().makeFileName(self.filePfx+"-{0}", self.frequency))
        # If file open now...
        if self.file is not None:
            # Write new line into the file
            try:
                self.file.write(data)
            except Exception:
                pass
            # No more than maxLines per file
            self.cntLines = self.cntLines + 1
            if self.cntLines >= self.maxLines:
                self.closeFile()

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

    def parse(self, msg: str):
        # By default, do not parse, just return the string
        return msg

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
                    if isinstance(out, bytes):
                        self.writer.write(out)
                    elif isinstance(out, str):
                        self.writer.write(bytes(out, 'utf-8'))
                    else:
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
                msg = self.data[0:eol].decode(encoding="utf-8", errors="replace")
                logger.debug("%s: %s" % (self.myName(), msg))
                # If running as a service...
                if self.service:
                    # Write message into open log file, including end-of-line
                    self.writeFile(self.data[0:eol+1])
                    # Empty result
                    out = {}
                else:
                    # Let parse() function do its thing
                    out = self.parse(msg)

            except Exception as exptn:
                logger.debug("%s: Exception parsing: %s" % (self.myName(), str(exptn)))

            # Remove parsed message from input, including end-of-line
            del self.data[0:eol+1]

        # Return parsed result or None if no result yet
        return out

