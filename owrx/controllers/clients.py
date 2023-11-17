from owrx.controllers.admin import AuthorizationMixin
from owrx.controllers.template import WebpageController
from owrx.breadcrumb import Breadcrumb, BreadcrumbItem, BreadcrumbMixin
from owrx.websocket import WebSocketConnection
import json
import re

import logging

logger = logging.getLogger(__name__)


class ClientController(AuthorizationMixin, WebpageController):
    def indexAction(self):
        self.serve_template("clients.html", **self.template_variables())

    def template_variables(self):
        variables = super().template_variables()
        variables["clients"] = self.renderClients()
        return variables

    @staticmethod
    def renderClients():
        return """
                <table class='table'>
                    <tr>
                        <th>IP Address</th>
                        <th>SDR Profile</th>
                        <th>Local Time</th>
                        <th>Actions</th>
                    </tr>
                    {clients}
                    <tr>
                        <td></td>
                        <td></td>
                        <td colspan="2">
                            ban for
                            <select id="ban-minutes">
                                <option value="15">15 minutes</option>
                                <option value="30">30 minutes</option>
                                <option value="60">1 hour</option>
                                <option value="180">3 hours</option>
                                <option value="360">6 hours</option>
                                <option value="720">12 hours</option>
                                <option value="1440">1 day</option>
                            </select>
                        </td>
                    </tr>
                </table>
        """.format(
            clients="".join(ClientController.renderClient(c) for c in WebSocketConnection.listAll())
        )

    @staticmethod
    def renderClient(c):
        return "<tr><td>{0}</td><td>{1}</td><td>{2} {3}</td><td>{4}</td></tr>".format(
            ClientController.renderIp(c["ip"]),
            "banned" if c["ban"] else c["sdr"] + " " + c["band"] if "sdr" in c else "n/a",
            "until" if c["ban"] else "since",
            c["ts"].strftime('%H:%M:%S'),
            ClientController.renderButtons(c)
        )

    @staticmethod
    def renderIp(ip):
        ip = re.sub("^::ffff:", "", ip)
        return """
            <a href="https://www.geolocation.com/en_us?ip={0}#ipresult" target="_blank">{1}</a>
        """.format(ip, ip)

    @staticmethod
    def renderButtons(c):
        action = "unban" if c["ban"] else "ban"
        return """
            <button type="button" class="btn btn-sm btn-danger client-{0}" value="{1}">{2}</button>
        """.format(action, c["ip"], action)

    def ban(self):
        try:
            data = json.loads(self.get_body().decode("utf-8"))
            mins = int(data["mins"]) if "mins" in data else 0
            if "ip" in data and mins > 0:
                logger.info("Banning {0} for {1} minutes".format(data["ip"], mins))
                WebSocketConnection.banIp(data["ip"], mins)
            self.send_response("{}", content_type="application/json", code=200)
        except:
            self.send_response("{}", content_type="application/json", code=400)

    def unban(self):
        try:
            data = json.loads(self.get_body().decode("utf-8"))
            if "ip" in data:
                logger.info("Unbanning {0}".format(data["ip"]))
                WebSocketConnection.unbanIp(data["ip"])
            self.send_response("{}", content_type="application/json", code=200)
        except:
            self.send_response("{}", content_type="application/json", code=400)
