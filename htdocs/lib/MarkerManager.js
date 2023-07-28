//
// Map Markers Management
//

function MarkerManager() {
    // Currently known features
    this.types = {};

    // Colors used for features
    this.colors = {
        'KiwiSDR'   : '#800000',
        'WebSDR'    : '#000080',
        'OpenWebRX' : '#004000'
    };

    // Symbols used for features
    this.symbols = {
        'KiwiSDR'   : '&tridot;',
        'WebSDR'    : '&tridot;',
        'OpenWebRX' : '&tridot;',
        'Stations'  : '&#9678;',
        'APRS'      : '&#9872;',
        'AIS'       : '&apacir;',
        'HFDL'      : '&#9992;'
    };

    // Feature type shown/hidden status
    this.enabled = {
        'KiwiSDR'   : false,
        'WebSDR'    : false,
        'OpenWebRX' : false,
        'Stations'  : false
    };
}

MarkerManager.prototype.getColor = function(type) {
    // Default color is black
    return type in this.colors? this.colors[type] : '#000000';
};

MarkerManager.prototype.getSymbol = function(type) {
    // Default symbol is a rombus
    return type in this.symbols? this.symbols[type] : '&#9671;';
};

MarkerManager.prototype.isEnabled = function(type) {
    // Features are shown by default
    return type in this.enabled? this.enabled[type] : true;
};

MarkerManager.prototype.toggle = function(map, markers, type, onoff) {
    // Keep track of each feature table being show or hidden
    this.enabled[type] = onoff;

    // Show or hide features on the map
    $.each(markers, function(_, r) {
        if (r.mode === type) r.setMap(onoff ? map : undefined);
    });
};

MarkerManager.prototype.addType = function(type) {
    // Do not add feature twice
    if (type in this.types) return;

    // Determine symbol and its color
    var color   = this.getColor(type);
    var symbol  = this.getSymbol(type);
    var enabled = this.isEnabled(type);

    // Add type to the list of known types
    this.types[type]   = symbol;
    this.enabled[type] = enabled;

    // If there is a list of features...
    var $content = $('.openwebrx-map-legend').find('.features');
    if($content)
    {
        // Add visual list item for the type
        $content.append(
            '<li class="square' + (enabled? '':' disabled') +
            '" data-selector="' + type + '">' +
            '<span class="feature" style="color:' + color + ';">' +
            symbol + '</span>' + type + '</li>'
        );
    }
};

//
// Generic marker functionality
//

function Marker() {}

// Wrap given callsign or other ID into a clickable link. When
// URL not supplied, guess the correct URL by ID type.
Marker.linkify = function(callsign, url = null) {
    // Leave passed URLs as they are
    if (url && (url != ''))
    { /* leave as is */ }
    // 9-character strings may be AIS MMSI numbers
    else if (callsign.match(new RegExp('^[0-9]{9}$')))
        url = vessel_url;
    // 3 characters and a number may be a flight number
    else if (callsign.match(new RegExp('^[A-Z]{3,4}[0-9]{1,4}[A-Z]{0,2}$')))
        url = flight_url;
    // 2 characters and a long number may be a flight number
    else if (callsign.match(new RegExp('^[A-Z]{2}[0-9]{2,4}[A-Z]{0,2}$')))
        url = flight_url;
    // Everything else is a HAM callsign
    else
        url = callsign_url;

    // Must have valid lookup URL
    if ((url == null) || (url == ''))
        return callsign;
    else
        return '<a target="callsign_info" href="' +
            url.replaceAll('{}', callsign.replace(new RegExp('-.*$'), '')) +
            '">' + callsign + '</a>';
}

// Compute distance, in kilometers, between two latlons.
Marker.distanceKm = function(p1, p2) {
    // Earth radius in km
    var R = 6371.0;
    // Convert degrees to radians
    var rlat1 = p1.lat() * (Math.PI/180);
    var rlat2 = p2.lat() * (Math.PI/180);
    // Compute difference in radians
    var difflat = rlat2-rlat1;
    var difflon = (p2.lng()-p1.lng()) * (Math.PI/180);
    // Compute distance
    d = 2 * R * Math.asin(Math.sqrt(
        Math.sin(difflat/2) * Math.sin(difflat/2) +
        Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(difflon/2) * Math.sin(difflon/2)
    ));
    return Math.round(d);
}

// Truncate string to a given number of characters, adding "..."
// to the end.
Marker.truncate = function(str, count) {
    return str.length > count? str.slice(0, count) + '&mldr;' : str;
}

// Convert degrees to compass direction.
Marker.degToCompass = function(deg) {
    dir = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dir[Math.floor((deg/22.5) + 0.5) % 16];
}

Marker.makeListTitle = function(name) {
    return '<div style="border-bottom:2px solid;"><b>' + name + '</b></div>';
}

Marker.makeListItem = function(name, value) {
    return '<div style="border-bottom:1px dotted;white-space:nowrap;">'
        + '<span>' + name + '&nbsp;&nbsp;&nbsp;&nbsp;</span>'
        + '<span style="float:right;">' + value + '</span>'
        + '</div>';
}

//
// Feature Markers
//

function FeatureMarker() {}

FeatureMarker.prototype = new google.maps.OverlayView();

FeatureMarker.prototype.draw = function() {
    var div = this.div;
    if (!div) return;

    div.style.color = this.color? this.color : '#000000';
    div.innerHTML   = this.symbol? this.symbol : '&#9679;';

    var point = this.getProjection().fromLatLngToDivPixel(this.position);
    if (point) {
        div.style.left = point.x - this.symWidth/2 + 'px';
        div.style.top = point.y - this.symHeight/2 + 'px';
    }
};

FeatureMarker.prototype.setOptions = function(options) {
    google.maps.OverlayView.prototype.setOptions.apply(this, arguments);
    this.draw();
};

FeatureMarker.prototype.onAdd = function() {
    var div = this.div = document.createElement('div');

    // Marker size
    this.symWidth  = 16;
    this.symHeight = 16;

    div.style.position   = 'absolute';
    div.style.cursor     = 'pointer';
    div.style.width      = this.symWidth + 'px';
    div.style.height     = this.symHeight + 'px';
    div.style.textAlign  = 'center';
    div.style.fontSize   = this.symHeight + 'px';
    div.style.lineHeight = this.symHeight + 'px';

    var self = this;
    google.maps.event.addDomListener(div, 'click', function(event) {
        event.stopPropagation();
        google.maps.event.trigger(self, 'click', event);
    });

    var panes = this.getPanes();
    panes.overlayImage.appendChild(div);
};

FeatureMarker.prototype.remove = function() {
    if (this.div) {
        this.div.parentNode.removeChild(this.div);
        this.div = null;
    }
};

FeatureMarker.prototype.getAnchorPoint = function() {
    return new google.maps.Point(0, -this.symHeight/2);
};

FeatureMarker.prototype.getInfoHTML = function(name, receiverMarker = null) {
    var nameString    = this.url? Marker.linkify(name, this.url) : name;
    var commentString = this.comment? '<div align="center">' + this.comment + '</div>' : '';
    var detailsString = '';
    var scheduleString = '';
    var distance = '';

    if (this.altitude) {
        detailsString += Marker.makeListItem('Altitude', this.altitude.toFixed(0) + ' m');
    }

    if (this.device) {
        detailsString += Marker.makeListItem('Device', this.device.manufacturer?
            this.device.device + ' by ' + this.device.manufacturer : this.device
        );
    }

    if (this.antenna) {
        detailsString += Marker.makeListItem('Antenna', Marker.truncate(this.antenna, 24));
    }

    if (this.schedule) {
        for (var j=0 ; j<this.schedule.length ; ++j) {
            var freq = this.schedule[j].freq;
            var mode = this.schedule[j].mode;
            var tune = mode === 'cw'?      freq - 800
                     : mode === 'fax'?     freq - 1500
                     : mode === 'rtty450'? freq - 1000
                     : freq;

            var name = ('0000' + this.schedule[j].time1).slice(-4)
                + '&#8209;' + ('0000' + this.schedule[j].time2).slice(-4)
                + '&nbsp;&nbsp;' + this.schedule[j].name;

            freq = '<a target="openwebrx-rx" href="/#freq=' + tune
                + ',mod=' + (mode? mode : 'am') + '">'
                + Math.round(this.schedule[j].freq/1000) + 'kHz</a>';

            scheduleString += Marker.makeListItem(name, freq);
        }
    }

    if (detailsString.length > 0) {
        detailsString = '<p>' + Marker.makeListTitle('Details') + detailsString + '</p>';
    }

    if (scheduleString.length > 0) {
        scheduleString = '<p>' + Marker.makeListTitle('Schedule') + scheduleString + '</p>';
    }

    if (receiverMarker) {
        distance = ' at ' + Marker.distanceKm(receiverMarker.position, this.position) + ' km';
    }

    return '<h3>' + nameString + distance + '</h3>'
        + commentString + detailsString + scheduleString;
}

//
// APRS Markers (also AIS and HFDL)
//

function NewAprsMarker() {}

NewAprsMarker.prototype = new google.maps.OverlayView();

NewAprsMarker.prototype.getInfoHTML = function(name, receiverMarker = null) {
    var timeString = moment(this.lastseen).fromNow();
    var commentString = '';
    var weatherString = '';
    var detailsString = '';
    var hopsString = '';
    var distance = '';

    if (this.comment) {
        commentString += '<p>' + Marker.makeListTitle('Comment') + '<div>' +
            this.comment + '</div></p>';
    }

    if (this.weather) {
        weatherString += '<p>' + Marker.makeListTitle('Weather');

        if (this.weather.temperature) {
            weatherString += Marker.makeListItem('Temperature', this.weather.temperature.toFixed(1) + ' oC');
        }

        if (this.weather.humidity) {
            weatherString += Marker.makeListItem('Humidity', this.weather.humidity + '%');
        }

        if (this.weather.barometricpressure) {
            weatherString += Marker.makeListItem('Pressure', this.weather.barometricpressure.toFixed(1) + ' mbar');
        }

        if (this.weather.wind) {
            if (this.weather.wind.speed && (this.weather.wind.speed>0)) {
                weatherString += Marker.makeListItem('Wind',
                    degToCompass(this.weather.wind.direction) + ' ' +
                    this.weather.wind.speed.toFixed(1) + ' km/h '
                );
            }

            if (this.weather.wind.gust && (this.weather.wind.gust>0)) {
                weatherString += Marker.makeListItem('Gusts', this.weather.wind.gust.toFixed(1) + ' km/h');
            }
        }

        if (this.weather.rain && (this.weather.rain.day>0)) {
            weatherString += Marker.makeListItem('Rain',
                this.weather.rain.hour.toFixed(0) + ' mm/h, ' +
                this.weather.rain.day.toFixed(0) + ' mm/day'
//                    this.weather.rain.sincemidnight + ' mm since midnight'
            );
        }

        if (this.weather.snowfall) {
            weatherString += Marker.makeListItem('Snow', this.weather.snowfall.toFixed(1) + ' cm');
        }

        weatherString += '</p>';
    }

    if (this.altitude) {
        detailsString += Marker.makeListItem('Altitude', this.altitude.toFixed(0) + ' m');
    }

    if (this.device) {
        detailsString += Marker.makeListItem('Device', this.device.manufacturer?
          this.device.device + ' by ' + this.device.manufacturer : this.device
        );
    }

    if (this.height) {
        detailsString += Marker.makeListItem('Height', this.height.toFixed(0) + ' m');
    }

    if (this.power) {
        detailsString += Marker.makeListItem('Power', this.power + ' W');
    }

    if (this.gain) {
        detailsString += Marker.makeListItem('Gain', this.gain + ' dB');
    }

    if (this.directivity) {
        detailsString += Marker.makeListItem('Direction', this.directivity);
    }

    if (this.aircraft) {
        detailsString += Marker.makeListItem('Aircraft', this.aircraft);
    }

    // Combine course and speed if both present
    if (this.course && this.speed) {
        detailsString += Marker.makeListItem('Course',
            Marker.degToCompass(this.course) + ' ' +
            this.speed.toFixed(1) + ' km/h'
        );
    } else {
        if (this.course) {
            detailsString += Marker.makeListItem('Course', degToCompass(this.course));
        }
        if (this.speed) {
            detailsString += Marker.makeListItem('Speed', this.speed.toFixed(1) + ' km/h');
        }
    }

    if (detailsString.length > 0) {
        detailsString = '<p>' + Marker.makeListTitle('Details') + detailsString + '</p>';
    }

    if (receiverMarker) {
        distance = ' at ' + Marker.distanceKm(receiverMarker.position, this.position) + ' km';
    }

    if (this.hops && this.hops.length > 0) {
        var hops = this.hops.toString().split(',');
        hops.forEach(function(part, index, hops) {
            hops[index] = Marker.linkify(part);
        });

        hopsString = '<p align="right"><i>via ' + hops.join(', ') + '&nbsp;</i></p>';
    }

    return '<h3>' + Marker.linkify(name) + distance + '</h3>'
        + '<div align="center">' + timeString + ' using ' + this.mode
        + ( this.band ? ' on ' + this.band : '' ) + '</div>'
        + commentString + weatherString + detailsString + hopsString;
}
