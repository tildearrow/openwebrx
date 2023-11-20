from owrx.config import Config
from owrx.color import ColorCache
from datetime import datetime, timedelta
import threading
import re

import logging

logger = logging.getLogger(__name__)


class TooManyClientsException(Exception):
    pass


class BannedClientException(Exception):
    pass


class ClientRegistry(object):
    sharedInstance = None
    creationLock = threading.Lock()

    @staticmethod
    def getSharedInstance():
        with ClientRegistry.creationLock:
            if ClientRegistry.sharedInstance is None:
                ClientRegistry.sharedInstance = ClientRegistry()
        return ClientRegistry.sharedInstance

    def __init__(self):
        self.clients = []
        self.bans = {}
        self.chat = {}
        self.chatCount = 1
        self.chatColors = ColorCache()
        Config.get().wireProperty("max_clients", self._checkClientCount)
        super().__init__()

    def broadcast(self):
        n = self.clientCount()
        for c in self.clients:
            c.write_clients(n)

    def addClient(self, client):
        pm = Config.get()
        if self.isIpBanned(client.conn.getIp()):
            raise BannedClientException()
        elif len(self.clients) >= pm["max_clients"]:
            raise TooManyClientsException()
        self.clients.append(client)
        self.broadcast()

    def clientCount(self):
        return len(self.clients)

    def removeClient(self, client):
        try:
            if client in self.chat:
                del self.chat[client]
            self.clients.remove(client)
        except ValueError:
            pass
        self.broadcast()

    def _checkClientCount(self, new_count):
        for client in self.clients[new_count:]:
            logger.debug("closing one connection...")
            client.close()

    # Broadcast chat message to all connected clients.
    def broadcastChatMessage(self, client, text: str, name: str = None):
        # Names can only include alphanumerics
        if name is not None:
            name = re.sub("\W+", "", name)
        # If we have seen this client chatting before...
        if client in self.chat:
            # Rename existing client as needed, keep color
            curname = self.chat[client]["name"]
            color   = self.chat[client]["color"]
            if not name or name == curname:
                name = curname
            else:
                self.chatColors.rename(curname, name)
                self.chat[client]["name"] = name
        else:
            # Create name and color for a new client
            name  = "User%d" % self.chatCount if not name else name
            color = self.chatColors.getColor(name)
            self.chat[client] = { "name": name, "color": color }
            self.chatCount = self.chatCount + 1

        # Broadcast message to all clients
        for c in self.clients:
            c.write_chat_message(name, text, color)

    # List all active and banned clients.
    def listAll(self):
        result = []
        for c in self.clients:
            result.append({
                "ts"   : c.conn.getStartTime(),
                "ip"   : c.conn.getIp(),
                "sdr"  : c.sdr.getName(),
                "band" : c.sdr.getProfileName(),
                "ban"  : False
            })
        self.expireBans()
        for ip in self.bans:
            result.append({
                "ts"  : self.bans[ip],
                "ip"  : ip,
                "ban" : True
            })
        return result

    # Ban a client, by IP, for given number of minutes.
    def banIp(self, ip: str, minutes: int):
        self.expireBans()
        self.bans[ip] = datetime.now() + timedelta(minutes=minutes)
        banned = []
        for c in self.clients:
            if ip == c.conn.getIp():
                banned.append(c)
        for c in banned:
            try:
                c.close()
            except:
                logger.exception("exception while banning %s" % ip)

    # Unban a client, by IP.
    def unbanIp(self, ip: str):
        if ip in self.bans:
            del self.bans[ip]

    # Check if given IP is banned at the moment.
    def isIpBanned(self, ip: str):
        return ip in self.bans and datetime.now() < self.bans[ip]

    # Delete all expired bans.
    def expireBans(self):
        now = datetime.now()
        old = [ip for ip in self.bans if now >= self.bans[ip]]
        for ip in old:
            del self.bans[ip]
