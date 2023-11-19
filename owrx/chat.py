from owrx.client import ClientRegistry
from owrx.config import Config
import threading
#import requests
import time

import logging

logger = logging.getLogger(__name__)


class Chat(object):
    sharedInstance = None
    creationLock = threading.Lock()

    @staticmethod
    def getSharedInstance():
        with Chat.creationLock:
            if Chat.sharedInstance is None:
                Chat.sharedInstance = Chat()
        return Chat.sharedInstance

    def __init__(self, hostUrl: str = None, maxMessages: int = 200):
        self.hostUrl = hostUrl
        self.maxMessages = maxMessages
        self.messages = []
        self.lock = threading.Lock()
        super().__init__()

    def getMessages(self):
        with self.lock:
            return self.messages.copy()

    def sendMessage(self, user: str, message: str):
        msg = {
            "ts"   : time.time(),
            "user" : user,
            "text" : message
        }
        self.broadcast(msg)
        with self.lock:
            if len(self.messages) >= self.maxMessages:
                del self.messages[0 : len(self.messages) - self.maxMessages]
            self.messages.append(msg)

    def broadcast(self, msg):
        # Send to remote host
#        if self.hostUrl is not None:
#            r = requests.post(self.hostUrl, msg)
        # Send to all the clients
        ClientRegistry.getSharedInstance().broadcastChatMessage(msg)
