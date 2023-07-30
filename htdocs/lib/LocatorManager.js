//
// Map Locators Management
//

LocatorManager.strokeOpacity = 0.8;
LocatorManager.fillOpacity   = 0.35;
LocatorManager.allRectangles = function() { return true; };

function LocatorManager() {
    // Current rectangles
    this.rectangles = {};

    // Current color allocations
    this.colorKeys = {};

    // The color scale used
    this.colorScale = chroma.scale(['red', 'blue', 'green']).mode('hsl');

    // Current coloring mode
    this.colorMode = 'byband';

    // Current filter
    this.rectangleFilter = LocatorManager.allRectangles;
}

LocatorManager.prototype.filter = function(data) {
    return this.rectangleFilter(data);
}

LocatorManager.prototype.find = function(id) {
    return id in this.rectangles? this.rectangles[id] : null;
};

LocatorManager.prototype.add = function(id, rectangle) {
    this.rectangles[id] = rectangle;
};

LocatorManager.prototype.ageAll = function() {
    var now = new Date().getTime();
    var data = this.rectangles;
    $.each(data, function(id, x) {
        if (!x.age(now - x.lastseen)) delete data[id];
    });
};

LocatorManager.prototype.clear = function() {
    // Remove all rectangles from the map
    $.each(this.rectangles, function(_, x) { x.setMap(); });
    // Delete all rectangles
    this.rectangles = {};
};

LocatorManager.prototype.setFilter = function(map, filterBy = null) {
    if (!filterBy) {
        this.rectangleFilter = LocatorManager.allRectangles;
    } else {
        var key = this.colorMode.slice(2);
        this.rectangleFilter = function(x) {
            return x[key] === filterBy;
        };
    }

    var filter = this.rectangleFilter;
    $.each(this.rectangles, function(_, x) {
        x.setMap(filter(x) ? map : undefined);
    });
};

LocatorManager.prototype.reColor = function() {
    var self = this;
    $.each(this.rectangles, function(_, x) {
        var color = self.getColor(x);
        x.setOptions({ strokeColor: color, fillColor: color });
    });
};

LocatorManager.prototype.updateLegend = function() {
    if (!this.colorKeys) return;
    var filter = this.rectangleFilter;
    var mode = this.colorMode.slice(2);
    var list = $.map(this.colorKeys, function(value, key) {
        // Fake rectangle to test if the filter would match
        var fakeRectangle = Object.fromEntries([[mode, key]]);
        var disabled = filter(fakeRectangle) ? '' : ' disabled';

        return '<li class="square' + disabled + '" data-selector="' + key
            + '"><span class="illustration" style="background-color:'
            + chroma(value).alpha(LocatorManager.fillOpacity) + ';border-color:'
            + chroma(value).alpha(LocatorManager.strokeOpacity) + ';"></span>'
            + key + '</li>';
    });

    $(".openwebrx-map-legend .content").html('<ul>' + list.join('') + '</ul>');
}

LocatorManager.prototype.setColorMode = function(map, newColorMode) {
    this.colorMode = newColorMode;
    this.colorKeys = {};
    this.setFilter(map);
    this.reColor();
    this.updateLegend();
};

LocatorManager.prototype.getType = function(data) {
    switch (this.colorMode) {
        case 'byband':
            return data.band;
        case 'bymode':
            return data.mode;
        default:
            return '';
    }
};

LocatorManager.prototype.getColor = function(data) {
    var type = this.getType(data);
    if (!type) return "#ffffff00";

    // If adding a new key...
    if (!this.colorKeys[type]) {
        var keys = Object.keys(this.colorKeys);

        // Add a new key
        keys.push(type);

        // Sort color keys
        keys.sort(function(a, b) {
            var pa = parseFloat(a);
            var pb = parseFloat(b);
            if (isNaN(pa) || isNaN(pb)) return a.localeCompare(b);
            return pa - pb;
        });

        // Recompute colors
        var colors = this.colorScale.colors(keys.length);
        this.colorKeys = {};
        for(var j=0 ; j<keys.length ; ++j) {
            this.colorKeys[keys[j]] = colors[j];
        }

        this.reColor();
        this.updateLegend();
    }

    // Return color for the key
    return this.colorKeys[type];
}

LocatorManager.prototype.getInfoHTML = function(locator, pos, receiverMarker = null) {
    var inLocator = $.map(this.rectangles, function(x, callsign) {
        return { callsign: callsign, locator: x.locator, lastseen: x.lastseen, mode: x.mode, band: x.band }
    }).filter(this.rectangleFilter).filter(function(d) {
        return d.locator == locator;
    }).sort(function(a, b){
        return b.lastseen - a.lastseen;
    });

    var distance = receiverMarker?
        " at " + Marker.distanceKm(receiverMarker.position, pos) + " km" : "";

    var list = inLocator.map(function(x) {
        var timestring = moment(x.lastseen).fromNow();
        var message = Marker.linkify(x.callsign) + ' (' + timestring + ' using ' + x.mode;
        if (x.band) message += ' on ' + x.band;
        return '<li>' + message + ')</li>';
    }).join("");

    return '<h3>Locator: ' + locator + distance +
        '</h3><div>Active Callsigns:</div><ul>' + list + '</ul>';
};

//
// Generic locator functionality
//

function Locator() {}

Locator.prototype = new Locator();

Locator.prototype.update = function(update) {
    this.lastseen = update.lastseen;
    this.locator  = update.location.locator;
    this.mode     = update.mode;
    this.band     = update.band;

    // Get locator's lat/lon
    const loc = update.location.locator;
    const lat = (loc.charCodeAt(1) - 65 - 9) * 10 + Number(loc[3]) + 0.5;
    const lon = (loc.charCodeAt(0) - 65 - 9) * 20 + Number(loc[2]) * 2 + 1.0;

    // Implementation-dependent function call
    this.setCenter(lat, lon);
};

//
// GoogleMaps-Specific Locators (derived from generic locators)
//

function GLocator() {
    this.rect = new google.maps.Rectangle();
}

GLocator.prototype = new Locator();

GLocator.prototype.setOptions = function(options) {
    this.rect.setOptions(options);
};

GLocator.prototype.setMap = function(map) {
    this.rect.setMap(map);
};

GLocator.prototype.setCenter = function(lat, lon) {
    this.center = new google.maps.LatLng({lat: lat, lng: lon});

    this.setOptions({ bounds : {
        north : lat - 0.5,
        south : lat + 0.5,
        west  : lon - 1.0,
        east  : lon + 1.0
    }});
}

GLocator.prototype.age = function(age) {
    if (age <= retention_time) {
        var scale  = Marker.getOpacityScale(age);
        this.setOptions({
            strokeOpacity : LocatorManager.strokeOpacity * scale,
            fillOpacity   : LocatorManager.fillOpacity * scale
        });
        return true;
    } else {
        this.setMap();
        return false;
    }
};
