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
