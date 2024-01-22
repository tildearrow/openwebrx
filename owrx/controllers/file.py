from owrx.controllers.admin import Authentication, AuthorizationMixin
from owrx.controllers.template import WebpageController
from owrx.controllers.assets import AssetsController
from owrx.storage import Storage

import json
import re
import os
import logging

logger = logging.getLogger(__name__)


class FileController(AssetsController):
    def getFilePath(self, file):
        return Storage.getFilePath(file)


class FileDeleteController(AuthorizationMixin, WebpageController):
    def delete(self):
        try:
            data = json.loads(self.get_body().decode("utf-8"))
            file = data["name"].strip() if "name" in data else ""
            if len(file) > 0 and re.match(Storage.getNamePattern(), file):
                file = Storage.getFilePath(file)
                logger.info("Deleting '{0}'.".format(file))
                os.remove(file)
            self.send_response("{}", content_type="application/json", code=200)
        except Exception as e:
            logger.debug("delete(): " + str(e))
            self.send_response("{}", content_type="application/json", code=400)


class FilesController(WebpageController):
    def template_variables(self):
        # We need to know if the user is authorized to delete files
        user  = Authentication().getUser(self.request)
        admin = user is not None and user.is_enabled() and not user.must_change_password
        isimg = re.compile(r'.*\.(png|bmp|gif|jpg)$')
        issnd = re.compile(r'.*\.(mp3|wav)$')
        files = Storage.getSharedInstance().getStoredFiles()
        rows  = ""

        for i in range(len(files)):
            # Start a row
            if i % 3 == 0:
                rows += '<tr>\n'
            # Show images as they are, show document icon for the rest
            if isimg.match(files[i]):
                shot = "/files/" + files[i]
            elif issnd.match(files[i]):
                shot = "static/gfx/audio-file.png"
            else:
                shot = "static/gfx/text-file.png"
            # Admin user gets to delete files
            if admin:
                buttons = ('<button type="button" ' +
                    'class="btn btn-sm btn-danger file-delete" ' +
                    'value="' + files[i] + '">delete</button>')
            else:
                buttons = ""
            # Print out individual tiles
            rows += ('<td class="file-tile">' +
                ('<a href="/files/%s" download="%s">' % (files[i], files[i])) +
                ('<img src="%s" download="%s">' % (shot, files[i])) +
                ('<p class="file-title">%s</p>' % files[i]) +
                ('</a>%s</td>\n' % buttons))
            # Finish a row
            if i % 3 == 2:
                rows += '</tr>\n'

        # Finish final row
        if len(files) > 0 and len(files) % 3 != 0:
            rows += '</tr>\n'

        variables = super().template_variables()
        variables["rows"] = rows
        return variables

    def indexAction(self):
        self.serve_template("files.html", **self.template_variables())

