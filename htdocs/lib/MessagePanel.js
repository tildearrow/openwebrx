function MessagePanel(el) {
    this.el = el;
    this.render();
    this.initClearButton();
}

MessagePanel.prototype.supportsMessage = function(message) {
    return false;
};

MessagePanel.prototype.render = function() {
};

MessagePanel.prototype.pushMessage = function(message) {
};

// automatic clearing is not enabled by default. call this method from the constructor to enable
MessagePanel.prototype.initClearTimer = function() {
    var me = this;
    if (me.removalInterval) clearInterval(me.removalInterval);
    me.removalInterval = setInterval(function () {
        me.clearMessages(1000);
    }, 15000);
};

MessagePanel.prototype.clearMessages = function(toRemain) {
    var $elements = $(this.el).find('tbody tr');
    // limit to 1000 entries in the list since browsers get laggy at some point
    var toRemove = $elements.length - toRemain;
    if (toRemove <= 0) return;
    $elements.slice(0, toRemove).remove();
};

MessagePanel.prototype.initClearButton = function() {
    var me = this;
    me.clearButton = $(
        '<div class="openwebrx-button">Clear</div>'
    );
    me.clearButton.css({
        position: 'absolute',
        top: '10px',
        right: '10px'
    });
    me.clearButton.on('click', function() {
        me.clearMessages(0);
    });
    $(me.el).append(me.clearButton);
};

function WsjtMessagePanel(el) {
    MessagePanel.call(this, el);
    this.initClearTimer();
    this.qsoModes = ['FT8', 'JT65', 'JT9', 'FT4', 'FST4', 'Q65', 'MSK144'];
    this.beaconModes = ['WSPR', 'FST4W'];
    this.modes = [].concat(this.qsoModes, this.beaconModes);
}

WsjtMessagePanel.prototype = new MessagePanel();

WsjtMessagePanel.prototype.supportsMessage = function(message) {
    return this.modes.indexOf(message['mode']) >= 0;
};

WsjtMessagePanel.prototype.render = function() {
    $(this.el).append($(
        '<table>' +
            '<thead><tr>' +
                '<th>UTC</th>' +
                '<th class="decimal">dB</th>' +
                '<th class="decimal">DT</th>' +
                '<th class="decimal freq">Freq</th>' +
                '<th class="message">Message</th>' +
            '</tr></thead>' +
            '<tbody></tbody>' +
        '</table>'
    ));
};

WsjtMessagePanel.prototype.pushMessage = function(msg) {
    var $b = $(this.el).find('tbody');
    var t = new Date(msg['timestamp']);
    var pad = function (i) {
        return ('' + i).padStart(2, "0");
    };
    var linkedmsg = msg['msg'];
    var matches;

    var html_escape = function(input) {
        return $('<div/>').text(input).html()
    };

    if (this.qsoModes.indexOf(msg['mode']) >= 0) {
        matches = linkedmsg.match(/(.*\s[A-Z0-9]+\s)([A-R]{2}[0-9]{2})$/);
        if (matches && matches[2] !== 'RR73') {
            linkedmsg = html_escape(matches[1]) + '<a href="map?locator=' + matches[2] + '" target="openwebrx-map">' + matches[2] + '</a>';
        } else {
            linkedmsg = html_escape(linkedmsg);
        }
    } else if (this.beaconModes.indexOf(msg['mode']) >= 0) {
        matches = linkedmsg.match(/([A-Z0-9]*\s)([A-R]{2}[0-9]{2})(\s[0-9]+)/);
        if (matches) {
            linkedmsg = html_escape(matches[1]) + '<a href="map?locator=' + matches[2] + '" target="openwebrx-map">' + matches[2] + '</a>' + html_escape(matches[3]);
        } else {
            linkedmsg = html_escape(linkedmsg);
        }
    }
    $b.append($(
        '<tr data-timestamp="' + msg['timestamp'] + '">' +
        '<td>' + pad(t.getUTCHours()) + pad(t.getUTCMinutes()) + pad(t.getUTCSeconds()) + '</td>' +
        '<td class="decimal">' + msg['db'] + '</td>' +
        '<td class="decimal">' + msg['dt'] + '</td>' +
        '<td class="decimal freq">' + msg['freq'] + '</td>' +
        '<td class="message">' + linkedmsg + '</td>' +
        '</tr>'
    ));
    $b.scrollTop($b[0].scrollHeight);
}

$.fn.wsjtMessagePanel = function(){
    if (!this.data('panel')) {
        this.data('panel', new WsjtMessagePanel(this));
    }
    return this.data('panel');
};

function PacketMessagePanel(el) {
    MessagePanel.call(this, el);
    this.initClearTimer();
}

PacketMessagePanel.prototype = new MessagePanel();

PacketMessagePanel.prototype.supportsMessage = function(message) {
    return (message['mode'] === 'APRS') || (message['mode'] === 'AIS');
};

PacketMessagePanel.prototype.render = function() {
    $(this.el).append($(
        '<table>' +
            '<thead><tr>' +
                '<th>UTC</th>' +
                '<th class="callsign">Callsign</th>' +
                '<th class="coord">Coord</th>' +
                '<th class="message">Comment</th>' +
            '</tr></thead>' +
            '<tbody></tbody>' +
        '</table>'
    ));
};

PacketMessagePanel.prototype.pushMessage = function(msg) {
    var $b = $(this.el).find('tbody');
    var pad = function (i) {
        return ('' + i).padStart(2, "0");
    };

    if (msg.type && msg.type === 'thirdparty' && msg.data) {
        msg = msg.data;
    }
    var source = msg.source;
    if (msg.type) {
        if (msg.type === 'nmea') {
            // Do not show AIS-specific stuff for now
            return;
        }
        if (msg.type === 'item') {
            source = msg.item;
        }
        if (msg.type === 'object') {
            source = msg.object;
        }
    }

    var timestamp = '';
    if (msg.timestamp) {
        var t = new Date(msg.timestamp);
        timestamp = pad(t.getUTCHours()) + pad(t.getUTCMinutes()) + pad(t.getUTCSeconds())
    }

    var link = '';
    var classes = [];
    var styles = {};
    var overlay = '';
    var stylesToString = function (s) {
        return $.map(s, function (value, key) {
            return key + ':' + value + ';'
        }).join('')
    };
    if (msg.symbol) {
        classes.push('aprs-symbol');
        classes.push('aprs-symboltable-' + (msg.symbol.table === '/' ? 'normal' : 'alternate'));
        styles['background-position-x'] = -(msg.symbol.index % 16) * 15 + 'px';
        styles['background-position-y'] = -Math.floor(msg.symbol.index / 16) * 15 + 'px';
        if (msg.symbol.table !== '/' && msg.symbol.table !== '\\') {
            var s = {};
            s['background-position-x'] = -(msg.symbol.tableindex % 16) * 15 + 'px';
            s['background-position-y'] = -Math.floor(msg.symbol.tableindex / 16) * 15 + 'px';
            overlay = '<div class="aprs-symbol aprs-symboltable-overlay" style="' + stylesToString(s) + '"></div>';
        }
    } else if (msg.lat && msg.lon) {
        classes.push('openwebrx-maps-pin');
        overlay = '<svg viewBox="0 0 20 35"><use xlink:href="static/gfx/svg-defs.svg#maps-pin"></use></svg>';
    }
    var attrs = [
        'class="' + classes.join(' ') + '"',
        'style="' + stylesToString(styles) + '"'
    ].join(' ');
    if (msg.lat && msg.lon) {
        link = '<a ' + attrs + ' href="map?callsign=' + encodeURIComponent(source) + '" target="openwebrx-map">' + overlay + '</a>';
    } else {
        link = '<div ' + attrs + '>' + overlay + '</div>'
    }

    $b.append($(
        '<tr>' +
        '<td>' + timestamp + '</td>' +
        '<td class="callsign">' + source + '</td>' +
        '<td class="coord">' + link + '</td>' +
        '<td class="message">' + (msg.comment || msg.message || '') + '</td>' +
        '</tr>'
    ));
    $b.scrollTop($b[0].scrollHeight);
};

$.fn.packetMessagePanel = function() {
    if (!this.data('panel')) {
        this.data('panel', new PacketMessagePanel(this));
    }
    return this.data('panel');
};

PocsagMessagePanel = function(el) {
    MessagePanel.call(this, el);
    this.initClearTimer();
}

PocsagMessagePanel.prototype = new MessagePanel();

PocsagMessagePanel.prototype.supportsMessage = function(message) {
    return message['mode'] === 'Pocsag';
};

PocsagMessagePanel.prototype.render = function() {
    $(this.el).append($(
        '<table>' +
            '<thead><tr>' +
                '<th class="address">Address</th>' +
                '<th class="message">Message</th>' +
            '</tr></thead>' +
            '<tbody></tbody>' +
        '</table>'
    ));
};

PocsagMessagePanel.prototype.pushMessage = function(msg) {
    var $b = $(this.el).find('tbody');
    $b.append($(
        '<tr>' +
            '<td class="address">' + msg.address + '</td>' +
            '<td class="message">' + msg.message + '</td>' +
        '</tr>'
    ));
    $b.scrollTop($b[0].scrollHeight);
};

$.fn.pocsagMessagePanel = function() {
    if (!this.data('panel')) {
        this.data('panel', new PocsagMessagePanel(this));
    }
    return this.data('panel');
};

PageMessagePanel = function(el) {
    MessagePanel.call(this, el);
    this.initClearTimer();
}

PageMessagePanel.prototype = new MessagePanel();

PageMessagePanel.prototype.supportsMessage = function(message) {
    return (message['mode'] === 'FLEX') || (message['mode'] === 'POCSAG');
};

PageMessagePanel.prototype.render = function() {
    $(this.el).append($(
        '<table>' +
            '<thead><tr>' +
                '<th class="address">CapCode</th>' +
                '<th class="mode">Mode</th>' +
                '<th class="timestamp">Time</th>' +
            '</tr></thead>' +
            '<tbody></tbody>' +
        '</table>'
    ));
};

PageMessagePanel.prototype.pushMessage = function(msg) {
    var html_escape = function(input) {
        return $('<div/>').text(input).html()
    };

    // Get color from the message, default to white
    var color = msg.hasOwnProperty('color')? msg.color : "#FFF";

    // Append message header (address, time, etc)
    var $b = $(this.el).find('tbody');
    $b.append($(
        '<tr>' +
            '<td class="address">' + msg.address + '</td>' +
            '<td class="mode">' + msg.mode + msg.baud + '</td>' +
            '<td class="timestamp" style="text-align:right;">' + msg.timestamp + '</td>' +
        '</tr>'
    ).css('background-color', color).css('color', '#000'));

    // Append message body (text)
    if (msg.hasOwnProperty('message')) {
        $b.append($(
            '<tr><td class="message" colspan="3">' +
            html_escape(msg.message) +
            '</td></tr>'
        ));
    }

    // Jump list to the last received message
    $b.scrollTop($b[0].scrollHeight);
};

$.fn.pageMessagePanel = function() {
    if (!this.data('panel')) {
        this.data('panel', new PageMessagePanel(this));
    }
    return this.data('panel');
};

HfdlMessagePanel = function(el) {
    MessagePanel.call(this, el);
    this.initClearTimer();
    this.flight_url = null;
    this.modes_url = null;
}

HfdlMessagePanel.prototype = new MessagePanel();

HfdlMessagePanel.prototype.supportsMessage = function(message) {
    return (message['mode'] === 'HFDL') || (message['mode'] === 'VDL2') || (message['mode'] === 'ADSB');
};

HfdlMessagePanel.prototype.setFlightUrl = function(url) {
    this.flight_url = url;
};

HfdlMessagePanel.prototype.setModeSUrl = function(url) {
    this.modes_url = url;
};

HfdlMessagePanel.prototype.linkify = function(id, url) {
    // Do not linkify empty strings
    if (id.len<=0) return id;

    // Must have valid lookup URL
    if ((url == null) || (url == ''))
        return id;
    else
        return '<a target="callsign_info" href="' +
            url.replaceAll('{}', id) + '">' + id + '</a>';
};

HfdlMessagePanel.prototype.render = function() {
    $(this.el).append($(
        '<table>' +
            '<thead><tr>' +
                '<th class="timestamp">Time</th>' +
                '<th class="flight">Flight</th>' +
                '<th class="aircraft">Aircraft</th>' +
                '<th class="data">Data</th>' +
            '</tr></thead>' +
            '<tbody></tbody>' +
        '</table>'
    ));
};

HfdlMessagePanel.prototype.pushMessage = function(msg) {
    var color  = msg.color?  msg.color : '#00000000';
    var flight = msg.flight? this.linkify(msg.flight, this.flight_url) : '';
    var data   = msg.type?   msg.type : '';

    var aircraft =
      msg.aircraft? this.linkify(msg.aircraft, this.flight_url)
    : msg.icao?     this.linkify(msg.icao, this.modes_url)
    : '';

    var tstamp =
      msg.msgtime? '<b>' + msg.msgtime + '</b>'
    : msg.time?    msg.time
    : '';

    // Add location, altitude, speed, etc
    var data = '';
    if (msg.lat && msg.lon) {
        data += '@' + msg.lat.toFixed(4) + ',' + msg.lon.toFixed(4);
    }
    if (msg.altitude) data += ' &UpArrowBar;' + msg.altitude + 'm';
    if (msg.vspeed>0) data += ' &UpperRightArrow;' + msg.vspeed + 'm/m';
    if (msg.vspeed<0) data += ' &LowerRightArrow;' + (-msg.vspeed) + 'm/m';
    if (msg.speed)    data += ' &rightarrow;' + msg.speed + 'km/h';
    if (msg.airport)  data += ' &rdsh;' + msg.airport;

    // If no data so far, use message type as data
    if (msg.type && !data.length) data = msg.type;

    // Append report
    var $b = $(this.el).find('tbody');
    $b.append($(
        '<tr>' +
            '<td class="timestamp">' + tstamp + '</td>' +
            '<td class="flight">' + flight + '</td>' +
            '<td class="aircraft">' + aircraft + '</td>' +
            '<td class="data" style="text-align:left;">' + data + '</td>' +
        '</tr>'
    ).css('background-color', color).css('color', '#000'));

    // Append messsage if present
    if (msg.message) {
        $b.append($(
            '<tr><td class="message" colspan="4">' + msg.message + '</td></tr>'
        ))
    }

    // Jump list to the last received message
    $b.scrollTop($b[0].scrollHeight);
};

$.fn.hfdlMessagePanel = function() {
    if (!this.data('panel')) {
        this.data('panel', new HfdlMessagePanel(this));
    }
    return this.data('panel');
};


IsmMessagePanel = function(el) {
    MessagePanel.call(this, el);
    this.initClearTimer();
    // These are basic message attributes
    this.basicInfo = ['mode', 'id', 'model', 'time', 'color'];
}

IsmMessagePanel.prototype = new MessagePanel();

IsmMessagePanel.prototype.supportsMessage = function(message) {
    return message['mode'] === 'ISM';
};

IsmMessagePanel.prototype.render = function() {
    $(this.el).append($(
        '<table>' +
            '<thead><tr>' +
                '<th class="address">ID</th>' +
                '<th class="device">Device</th>' +
                '<th class="timestamp">Time</th>' +
            '</tr></thead>' +
            '<tbody></tbody>' +
        '</table>'
    ));
};

IsmMessagePanel.prototype.formatAttr = function(msg, key) {
    return('<td class="attr" colspan="2">' +
        '<div style="border-bottom:1px dotted;">' +
        '<span style="float:left;">' + key + '</span>' +
        '<span style="float:right;">' + msg[key] + '</span>' +
        '</div></td>'
    );
};

IsmMessagePanel.prototype.pushMessage = function(msg) {
    // Get basic information, assume white color if missing
    var address = msg.hasOwnProperty('id')? msg.id : "???";
    var device  = msg.hasOwnProperty('model')? msg.model : "";
    var tstamp  = msg.hasOwnProperty('time')? msg.time : "";
    var color   = msg.hasOwnProperty('color')? msg.color : "#FFF";

    // Append message header (address, time, etc)
    var $b = $(this.el).find('tbody');
    $b.append($(
        '<tr>' +
            '<td class="address">' + address + '</td>' +
            '<td class="device">' + device + '</td>' +
            '<td class="timestamp" style="text-align:right;" colspan="2">' + tstamp + '</td>' +
        '</tr>'
    ).css('background-color', color).css('color', '#000'));

    // Append attributes in pairs, skip basic information
    var last = null;
    for (var key in msg) {
        if (this.basicInfo.indexOf(key) < 0) {
            var cell = this.formatAttr(msg, key);
            if (!last) {
                last = cell;
            } else {
                $b.append($('<tr>' + last + cell + '</tr>'));
                last = null;
            }
        }
    }

    // Last row
    if (last) $b.append($('<tr>' + last + '<td class="attr"/></tr>'));

    // Jump list to the last received message
    $b.scrollTop($b[0].scrollHeight);
};

$.fn.ismMessagePanel = function() {
    if (!this.data('panel')) {
        this.data('panel', new IsmMessagePanel(this));
    }
    return this.data('panel');
};

SstvMessagePanel = function(el) {
    MessagePanel.call(this, el);
    this.initClearTimer();
}

SstvMessagePanel.prototype = new MessagePanel();

SstvMessagePanel.prototype.supportsMessage = function(message) {
    return message['mode'] === 'SSTV';
};

SstvMessagePanel.prototype.render = function() {
    $(this.el).append($(
        '<table>' +
            '<thead><tr>' +
                '<th class="message">TV</th>' +
            '</tr></thead>' +
            '<tbody></tbody>' +
        '</table>'
    ));
};

SstvMessagePanel.prototype.pushMessage = function(msg) {
    var $b = $(this.el).find('tbody');
    if(msg.hasOwnProperty('message')) {
        // Append a new debug message text
// See service log for debug output instead
//        $b.append($('<tr><td class="message">' + msg.message + '</td></tr>'));
//        $b.scrollTop($b[0].scrollHeight);
    }
    else if(msg.width>0 && msg.height>0 && !msg.hasOwnProperty('line')) {
        var f = msg.frequency>0? ' at ' + Math.floor(msg.frequency/1000) + 'kHz' : '';
        var h = '<div>' + msg.timestamp + ' ' + msg.width + 'x' + msg.height +
            ' ' + msg.sstvMode + f + '</div>';
        var c = '<div onclick="saveCanvas(\'' + msg.filename + '\');">' +
            '<canvas class="frame" id="' + msg.filename +
            '" width="' + msg.width + '" height="' + msg.height +
            '"></canvas></div>';
        // Append a new canvas
        $b.append($('<tr><td class="message">' + h + c + '</td></tr>'));
        $b.scrollTop($b[0].scrollHeight);
        // Save canvas context and dimensions for future use
        this.ctx    = $(this.el).find('canvas').get(-1).getContext("2d");
        this.width  = msg.width;
        this.height = msg.height;
    }
    else if(msg.width>0 && msg.height>0 && msg.line>=0 && msg.hasOwnProperty('pixels')) {
        // Will copy pixels to img
        var pixels = atob(msg.pixels);
        var img = this.ctx.createImageData(msg.width, 1);
        // Convert BMP BGR pixels into HTML RGBA pixels
        for (var x = 0; x < msg.width; x++) {
            img.data[x*4 + 0] = pixels.charCodeAt(x*3 + 2);
            img.data[x*4 + 1] = pixels.charCodeAt(x*3 + 1);
            img.data[x*4 + 2] = pixels.charCodeAt(x*3 + 0);
            img.data[x*4 + 3] = 0xFF;
        }
        // Render scanline
        this.ctx.putImageData(img, 0, msg.line);
    }
};

$.fn.sstvMessagePanel = function() {
    if (!this.data('panel')) {
        this.data('panel', new SstvMessagePanel(this));
    }
    return this.data('panel');
};

FaxMessagePanel = function(el) {
    MessagePanel.call(this, el);
    this.initClearTimer();
}

FaxMessagePanel.prototype = new MessagePanel();

FaxMessagePanel.prototype.supportsMessage = function(message) {
    return message['mode'] === 'Fax';
};

FaxMessagePanel.prototype.render = function() {
    $(this.el).append($(
        '<table>' +
            '<thead><tr>' +
                '<th class="message">Fax</th>' +
            '</tr></thead>' +
            '<tbody></tbody>' +
        '</table>'
    ));
};

FaxMessagePanel.prototype.pushMessage = function(msg) {
    var $b = $(this.el).find('tbody');
    if(msg.hasOwnProperty('message')) {
        // Append a new debug message text
// See service log for debug output instead
//        $b.append($('<tr><td class="message">' + msg.message + '</td></tr>'));
//        $b.scrollTop($b[0].scrollHeight);
    }
    else if(msg.width>0 && msg.height>0 && !msg.hasOwnProperty('line')) {
        var f = msg.frequency>0? ' at ' + Math.floor(msg.frequency/1000) + 'kHz' : '';
        var h = '<div>' + msg.timestamp + ' ' + msg.width + 'x' + msg.height +
            ' ' + msg.faxMode + f + '</div>';
        var c = '<div onclick="saveCanvas(\'' + msg.filename + '\');">' +
            '<canvas class="frame" id="' + msg.filename +
            '" width="' + msg.width + '" height="' + msg.height +
            '"></canvas></div>';
        // Append a new canvas
        $b.append($('<tr><td class="message">' + h + c + '</td></tr>'));
        $b.scrollTop($b[0].scrollHeight);
        // Save canvas context and dimensions for future use
        this.ctx    = $(this.el).find('canvas').get(-1).getContext("2d");
        this.width  = msg.width;
        this.height = msg.height;
    }
    else if(msg.width>0 && msg.height>0 && msg.line>=0 && msg.hasOwnProperty('pixels')) {
        // Will copy pixels to img
        var img = this.ctx.createImageData(msg.width, 1);
        var pixels;

        // Unpack RLE-compressed line of pixels
        if(!msg.rle) {
            pixels = atob(msg.pixels);
        } else {
            var rle = atob(msg.pixels);
            pixels = '';
            for(var x=0 ; x<rle.length ; ) {
                var c = rle.charCodeAt(x);
                if(c<128) {
                    pixels += rle.slice(x+1, x+c+2);
                    x += c + 2;
                } else {
                    pixels += rle.slice(x+1, x+2).repeat(c-128+2)
                    x += 2;
                }
            }
        }

        // Convert BMP BGR pixels into HTML RGBA pixels
        if(msg.depth==8) {
            for(var x=0, y=0; x<msg.width; x++) {
                var c = pixels.charCodeAt(x);
                img.data[y++] = c;
                img.data[y++] = c;
                img.data[y++] = c;
                img.data[y++] = 0xFF;
            }
        } else {
            for (var x = 0; x < msg.width; x++) {
                img.data[x*4 + 0] = pixels.charCodeAt(x*3 + 2);
                img.data[x*4 + 1] = pixels.charCodeAt(x*3 + 1);
                img.data[x*4 + 2] = pixels.charCodeAt(x*3 + 0);
                img.data[x*4 + 3] = 0xFF;
            }
        }

        // Render scanline
        this.ctx.putImageData(img, 0, msg.line);
    }
};

$.fn.faxMessagePanel = function() {
    if (!this.data('panel')) {
        this.data('panel', new FaxMessagePanel(this));
    }
    return this.data('panel');
};
