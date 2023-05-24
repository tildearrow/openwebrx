from owrx.storage import Storage
from csdr.module import ThreadModule
from pycsdr.types import Format
from datetime import datetime
import pickle
import os
import re

import logging

logger = logging.getLogger(__name__)

class MultimonParser(ThreadModule):
    def __init__(self, service: bool = False):
        # FLEX|NNNN-NN-NN NN:NN:NN|<baud>/<value>/C/C|NN.NNN|NNNNNNNNN|<type>|<message>"
        # FLEX|NNNN-NN-NN NN:NN:NN|<baud>/<value>/C/C|NN.NNN|NNNNNNNNN NNNNNNNNN|<type>|<message>"
        self.reFlex1 = re.compile(r"FLEX\|(\d\d\d\d-\d\d-\d\d\s+\d\d:\d\d:\d\d)\|(\d+/\d+/\S/\S)\|(\d\d\.\d\d\d)\|(\d+(?:\s+\d+)?)\|(\S+)\|(.*)")
        # FLEX: NNNN-NN-NN NN:NN:NN <baud>/<value>/C NN.NNN [NNNNNNNNN] <type> <message>
        self.reFlex2 = re.compile(r"FLEX:\s+(\d\d\d\d-\d\d-\d\d\s+\d\d:\d\d:\d\d)\s+(\d+/\d+/\S)\s+(\d\d\.\d\d\d)\s+\[(\d+)\]\s+(\S+)\s+(.*)")
        # FLEX message status
        self.reFlex3 = re.compile(r"\d+/\d+/(\S)/\S")
        # <mode>: C
        self.reSelCall = re.compile(r"(ZVEI1|ZVEI2|ZVEI3|DZVEI|PZVEI|DTMF|EEA|EIA|CCIR):\s+([0-9A-F]+)")

        self.service   = service
        self.frequency = 0
        self.data      = bytearray(b'')
        self.file      = None
        self.selMode   = ""
        self.flexBuf   = {}
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
                    # Parse FLEX and SELCALL messages
                    rf = self.reFlex1.match(msg)
                    rf = self.reFlex2.match(msg) if not rf else rf
                    rs = self.reSelCall.findall(msg) if not rf else []

                    #
                    # FLEX
                    #
                    if rf is not None:
                        tstamp  = rf.group(1)
                        state   = rf.group(2)
                        frame   = rf.group(3)
                        capcode = rf.group(4)
                        msgtype = rf.group(5)
                        msg     = rf.group(6)
                        rm      = self.reFlex3.match(state)
                        frag    = "" if not rm else rm.group(1)
                        # Assemble fragmented messages in flexBuf
                        if frag == "F" or frag == "C":
                            # Do not let flexBuf grow too much
                            if len(self.flexBuf)>1024:
                                self.flexBuf = {}
                            # Accumulate messages in flexBuf, index by capcode
                            if capcode in self.flexBuf:
                                self.flexBuf[capcode] += msg
                            else:
                                self.flexBuf[capcode] = msg
                            # Only output message once it completes
                            if frag == "F":
                                msg = ""
                            elif frag == "C":
                                msg = self.flexBuf[capcode]
                                del self.flexBuf[capcode]
                        # Do not report fragments of messages
                        if frag == "F":
                            out = {}
                        else:
                            out = {
                                "mode":      "FLEX",
                                "timestamp": tstamp,
                                "state":     state,
                                "frame":     frame,
                                "capcode":   capcode,
                                "type":      msgtype
                            }
                            # Output message adding hash for numeric messages
                            if len(msg)>0:
                                if msgtype != "ALN":
                                    msg = "# " + msg
                                out.update({ "message": msg })

                    #
                    # SELCALL
                    #
                    elif len(rs)>0:
                        # Just output characters as they are, add SELCALL
                        # standard name when changing standard
                        out = ""
                        for x in rs:
                            if x[0] == self.selMode:
                                out += x[1]
                            else:
                                self.selMode = x[0]
                                out += " [%s] %s" % (x[0], x[1])

                    #
                    # Everything else
                    #
                    else:
                        # Failed to parse this message
                        out = {}

            except Exception as exptn:
                logger.debug("%s: Exception parsing: %s" % (self.myName(), str(exptn)))

            # Remove parsed message from input, including end-of-line
            del self.data[0:eol+1]

        # Return parsed result or None if no result yet
        return out
