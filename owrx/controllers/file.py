from owrx.controllers.template import WebpageController
from owrx.controllers.assets import AssetsController
from owrx.storage import Storage

import re

class FileController(AssetsController):
    def getFilePath(self, file):
        return Storage().getFilePath(file)


class FilesController(WebpageController):
    def template_variables(self):
        isimg = re.compile(r'.*\.(png|bmp|gif|jpg)$')
        issnd = re.compile(r'.*\.(mp3|wav)$')
        files = Storage().getStoredFiles()
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
            # Print out individual tiles
            rows += ('<td class="file-tile">' +
                ('<a href="/files/%s" download="%s">' % (files[i], files[i])) +
                ('<img src="%s" download="%s">' % (shot, files[i])) +
                ('<p class="file-title">%s</p>' % files[i]) +
                '</a></td>\n')
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

