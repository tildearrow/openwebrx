from owrx.config import Config
from owrx.controllers.admin import AuthorizationMixin
from owrx.controllers.template import WebpageController
from owrx.breadcrumb import Breadcrumb, BreadcrumbItem, BreadcrumbMixin
from owrx.websocket import WebSocketConnection
from abc import ABCMeta, abstractmethod
from urllib.parse import parse_qs
import re

import logging

logger = logging.getLogger(__name__)


class SettingsController(AuthorizationMixin, WebpageController):
    def indexAction(self):
        self.serve_template("settings.html", **self.template_variables())

    def template_variables(self):
        variables = super().template_variables()
        variables["clients"] = self.renderClients()
        return variables

    def renderClients(self):
        return """
                <table class='table'>
                    <tr>
                        <th>IP Address</th>
                        <th>SDR Profile</th>
                        <th>Local Time</th>
                        <th>Actions</th>
                    </tr>
                    {clients}
                </table>
        """.format(
            clients="".join(self.renderClient(c) for c in WebSocketConnection.listAll())
        )

    def renderClient(self, c):
        return "<tr><td>{0}</td><td>{1}</td><td>{2} {3}</td><td>{4}</td></tr>".format(
            self.renderIp(c["ip"]),
            "banned" if c["ban"] else c["sdr"] + " " + c["band"] if "sdr" in c else "n/a",
            "until" if c["ban"] else "since",
            c["ts"].strftime('%H:%M:%S'),
            self.renderButtons(c)
        )

    def renderIp(self, ip):
        ip = re.sub("^::ffff:", "", ip)
        return """
            <a href="https://www.geolocation.com/en_us?ip={0}#ipresult" target="_blank">{1}</a>
        """.format(ip, ip)

    def renderButtons(self, c):
        action = "unban" if c["ban"] else "ban"
        return """
            <button type="button" class="btn btn-sm btn-danger client-{0}" value="{1}">{2}</button>
        """.format(action, c["ip"], action)

    def ban(self):
        ip = self.request.matches.group(1)
        logger.info("Banning {0} for {1} minutes".format(ip, 15))
        WebSocketConnection.banIp(ip, 15)
        self.send_response("{}", content_type="application/json", code=200)

    def unban(self):
        ip = self.request.matches.group(1)
        logger.info("Unbanning {0}".format(ip))
        WebSocketConnection.unbanIp(ip)
        self.send_response("{}", content_type="application/json", code=200)


class SettingsFormController(AuthorizationMixin, BreadcrumbMixin, WebpageController, metaclass=ABCMeta):
    def __init__(self, handler, request, options):
        super().__init__(handler, request, options)
        self.errors = {}
        self.globalError = None

    @abstractmethod
    def getSections(self):
        pass

    @abstractmethod
    def getTitle(self):
        pass

    def getData(self):
        return Config.get()

    def getErrors(self):
        return self.errors

    def render_sections(self):
        sections = "".join(section.render(self.getData(), self.getErrors()) for section in self.getSections())
        buttons = self.render_buttons()
        return """
            <form class="settings-body" method="POST">
                {sections}
                <div class="buttons container">
                    {buttons}
                </div>
            </form>
        """.format(
            sections=sections,
            buttons=buttons,
        )

    def render_buttons(self):
        return """
            <button type="submit" class="btn btn-primary">Apply and save</button>
        """

    def indexAction(self):
        self.serve_template("settings/general.html", **self.template_variables())

    def template_variables(self):
        variables = super().template_variables()
        variables["content"] = self.render_sections()
        variables["title"] = self.getTitle()
        variables["modal"] = self.buildModal()
        variables["error"] = self.renderGlobalError()
        return variables

    def parseFormData(self):
        data = parse_qs(self.get_body().decode("utf-8"), keep_blank_values=True)
        result = {}
        errors = []
        for section in self.getSections():
            section_data, section_errors = section.parse(data)
            result.update(section_data)
            errors += section_errors
        return result, errors

    def getSuccessfulRedirect(self):
        return self.get_document_root() + self.request.path[1:]

    def _mergeErrors(self, errors):
        result = {}
        for e in errors:
            if e.getKey() not in result:
                result[e.getKey()] = []
            result[e.getKey()].append(e.getMessage())
        return result

    def processFormData(self):
        data = None
        errors = None
        try:
            data, errors = self.parseFormData()
        except Exception as e:
            logger.exception("Error while parsing form data")
            self.globalError = str(e)
            return self.indexAction()

        if errors:
            self.errors = self._mergeErrors(errors)
            return self.indexAction()
        try:
            self.processData(data)
            self.store()
            self.send_redirect(self.getSuccessfulRedirect())
        except Exception as e:
            logger.exception("Error while processing form data")
            self.globalError = str(e)
            return self.indexAction()

    def processData(self, data):
        config = self.getData()
        for k, v in data.items():
            if v is None:
                if k in config:
                    del config[k]
            else:
                config[k] = v

    def store(self):
        Config.get().store()

    def buildModal(self):
        return ""

    def renderGlobalError(self):
        if self.globalError is None:
            return ""

        return """
            <div class="card text-white bg-danger">
                <div class="card-header">Error</div>
                <div class="card-body">
                    <div>Your settings could not be saved due to an error:</div>
                    <div>{error}</div>
                </div>
            </div>
        """.format(
            error=self.globalError
        )


class SettingsBreadcrumb(Breadcrumb):
    def __init__(self):
        super().__init__([])
        self.append(BreadcrumbItem("Settings", "settings"))
