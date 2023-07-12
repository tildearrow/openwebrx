//
// Features Management
//

function Features() {
    // Currently known features
    this.types = {};

    // Colors used for features
    this.colors = {
        'KiwiSDR'   : '#800000',
        'WebSDR'    : '#000080',
        'OpenWebRX' : '#006000'
    };

    // Symbols used for features
    this.symbols = {
        'KiwiSDR'   : '&triminus;',
        'WebSDR'    : '&tridot;',
        'OpenWebRX' : '&triplus;',
        'APRS'      : '&#9872;',
        'AIS'       : '&apacir;',
        'HFDL'      : '&#9992;'
    };

    // Feature type shown/hidden status
    this.enabled = {
        'KiwiSDR'   : false,
        'WebSDR'    : false,
        'OpenWebRX' : false
    };
}

Features.prototype.getColor = function(type) {
    // Default color is black
    return type in this.colors? this.colors[type] : '#000000';
};

Features.prototype.getSymbol = function(type) {
    // Default symbol is a rombus
    return type in this.symbols? this.symbols[type] : '&#9671;';
};

Features.prototype.isEnabled = function(type) {
    // Features are shown by default
    return type in this.enabled? this.enabled[type] : true;
};

Features.prototype.toggle = function(map, markers, type, onoff) {
    // Keep track of each feature table being show or hidden
    this.enabled[type] = onoff;

    // Show or hide features on the map
    $.each(markers, function(_, r) {
        if (r.mode === type) r.setMap(onoff ? map : undefined);
    });
};

Features.prototype.addType = function(type) {
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
    var $content = $(".openwebrx-map-legend").find('.features');
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
    google.maps.event.addDomListener(div, "click", function(event) {
        event.stopPropagation();
        google.maps.event.trigger(self, "click", event);
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
