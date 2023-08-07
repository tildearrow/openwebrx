//
// GoogleMaps-Specific Marker
//

function GMarker() {}
GMarker.prototype = new google.maps.OverlayView();

GMarker.prototype.setMarkerOptions = function(options) {
    this.setOptions(options);
    this.draw();
};

GMarker.prototype.onAdd = function() {
    // Create HTML elements representing the mark
    var div = this.create();

    var self = this;
    google.maps.event.addDomListener(div, "click", function(event) {
        event.stopPropagation();
        google.maps.event.trigger(self, "click", event);
    });

    var panes = this.getPanes();
    panes.overlayImage.appendChild(div);
};

GMarker.prototype.getAnchorPoint = function() {
    var offset = this.getAnchorOffset();
    return new google.maps.Point(offset[0], offset[1]);
};

GMarker.prototype.setMarkerOpacity = function(opacity) {
    this.setOptions({ opacity: opacity });
};

GMarker.prototype.setMarkerPosition = function(title, lat, lon) {
    this.setOptions({
        title    : title,
        position : new google.maps.LatLng(lat, lon)
    });
};

// GoogleMaps-Specific FeatureMarker
function GFeatureMarker() { $.extend(this, new FeatureMarker()); }
GFeatureMarker.prototype = new GMarker();

GFeatureMarker.prototype.draw = function() {
    FeatureMarker.draw();

    // Map and add location
    var div = this.div;
    if (div) {
        var point = this.getProjection().fromLatLngToDivPixel(this.position);
        if (point) {
            div.style.left = point.x - this.symWidth / 2 + 'px';
            div.style.top = point.y - this.symHeight / 2 + 'px';
        }
    }
};

// GoogleMaps-Specific AprsMarker
function GAprsMarker() { $.extend(this, new AprsMarker()); }
GAprsMarker.prototype = new GMarker();

GApreMarker.prototype.draw = function() {
    AprsMarker.draw();

    var div = this.div;
    if (div) {
        var point = this.getProjection().fromLatLngToDivPixel(this.position);
        if (point) {
            div.style.left = point.x - 12 + 'px';
            div.style.top = point.y - 12 + 'px';
        }
    }
};

//
// GoogleMaps-Specific Locator
//

function GLocator() {
    this.rect = new google.maps.Rectangle();
    this.rect.setOptions({
        strokeWeight : 2,
        strokeColor  : "#FFFFFF",
        fillColor    : "#FFFFFF"
    });
}

GLocator.prototype = new Locator();

GLocator.prototype.setMap = function(map) {
    this.rect.setMap(map);
};

GLocator.prototype.setCenter = function(lat, lon) {
    this.center = new google.maps.LatLng({lat: lat, lng: lon});

    this.rect.setOptions({ bounds : {
        north : lat - 0.5,
        south : lat + 0.5,
        west  : lon - 1.0,
        east  : lon + 1.0
    }});
}

GLocator.prototype.setColor = function(color) {
    this.rect.setOptions({ strokeColor: color, fillColor: color });
};

GLocator.prototype.setOpacity = function(opacity) {
    this.rect.setOptions({
        strokeOpacity : LocatorManager.strokeOpacity * opacity,
        fillOpacity   : LocatorManager.fillOpacity * opacity
    });
};
