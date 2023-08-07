// Marker.linkify() uses these URLs
var callsign_url = null;
var vessel_url   = null;
var flight_url   = null;

// reasonable default; will be overriden by server
var retention_time = 2 * 60 * 60 * 1000;

// Our Leaflet Map and layerControl
var map = null;
var layerControl;

// Receiver location marker
var receiverMarker = null;

// Updates are queued here
var updateQueue = [];

// Web socket connection management, message processing
var mapManager = new MapManager();

var query = window.location.search.replace(/^\?/, '').split('&').map(function(v){
    var s = v.split('=');
    var r = {};
    r[s[0]] = s.slice(1).join('=');
    return r;
}).reduce(function(a, b){
    return a.assign(b);
});

var expectedCallsign = query.callsign? decodeURIComponent(query.callsign) : null;
var expectedLocator  = query.locator? query.locator : null;

// https://stackoverflow.com/a/46981806/420585
function fetchStyleSheet(url, media = 'screen') {
    let $dfd = $.Deferred(),
        finish = () => $dfd.resolve(),
        $link = $(document.createElement('link')).attr({
            media,
            type: 'text/css',
            rel: 'stylesheet'
        })
        .on('load', 'error', finish)
        .appendTo('head'),
        $img = $(document.createElement('img'))
            .on('error', finish); // Support browsers that don't fire events on link elements
    $link[0].href = $img[0].src = url;
    return $dfd.promise();
}



// Show information bubble for a locator
function showLocatorInfoWindow(locator, pos) {
    var p = new posObj(pos);

    L.popup(pos, {
        content: mapManager.lman.getInfoHTML(locator, p, receiverMarker)
    }).openOn(map);
};

// Show information bubble for a marker
function showMarkerInfoWindow(name, pos) {
    var marker = mapManager.mman.find(name);
    L.popup(pos, { content: marker.getInfoHTML(name, receiverMarker) }).openOn(map);
};

//
// Leaflet-SPECIFIC MAP MANAGER METHODS
//

MapManager.prototype.setReceiverName = function(name) {
    if (receiverMarker) receiverMarker.setTitle(name);
}

MapManager.prototype.removeReceiver = function() {
    if (receiverMarker) receiverMarker.setMap();
}

MapManager.prototype.initializeMap = function(receiver_gps, api_key) {
    var receiverPos = [ receiver_gps.lat, receiver_gps.lon ];

    if (map) {
        receiverMarker.setLatLng(receiverPos);
        receiverMarker.setMarkerOptions(this.config);
        receiverMarker.setMap(map);
    } else {
        var self = this;

        // load Leaflet CSS first
        fetchStyleSheet('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css').done(function () {
            // now load Leaflet JS
            $.getScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js').done(function () {
                // create map
                map = L.map('openwebrx-map').setView(receiverPos, 5);
                baseLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    noWrap: true,
                    attribution: '© OpenStreetMap'
                }).addTo(map);
                // add night overlay
                $.getScript('https://unpkg.com/@joergdietrich/leaflet.terminator@1.0.0/L.Terminator.js').done(function () {
                    var pane = map.createPane('nite');
                    pane.style.zIndex = 201;
                    pane.style.pointerEvents = 'none !important';
                    pane.style.cursor = 'grab !important';
                    var t = L.terminator({ fillOpacity: 0.2, interactive: false, pane });
                    t.addTo(map);
                    setInterval(function () { t.setTime(); }, 10000); // refresh every 10 secs
                });

                // create layerControl and add more maps
                if (!layerControl) {
                    var OpenTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                        maxZoom: 17,
                        noWrap: true,
                        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
                    });
                    var Stadia_AlidadeSmooth = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', {
                        maxZoom: 20,
                        noWrap: true,
                        attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
                    });
                    var Esri_WorldTopoMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
                        noWrap: true,
                        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
                    });
                    var Stadia_AlidadeSmoothDark = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
                        maxZoom: 20,
                        noWrap: true,
                        attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
                    });

                    // used to open or collaps the layerControl by default
                    function isMobile () {
                        try { document.createEvent("TouchEvent"); return true; }
                        catch (e) { return false; }
                    }

                    layerControl = L.control.layers({
                        'OSM': baseLayer,
                        'StadiaAlidade': Stadia_AlidadeSmooth,
                        'StadiaAlidadeDark': Stadia_AlidadeSmoothDark,
                        'EsriWorldTopo': Esri_WorldTopoMap,
                        'OpenTopoMap': OpenTopoMap,
                    }, null, {
                        collapsed: isMobile(), hideSingleBase: true, position: 'bottomleft'
                    }
                    ).addTo(map);

                    // move legend div to our layerControl
                    $('<div id="openwebrx-map-legend-separator" class="leaflet-control-layers-separator"></div>').insertAfter(layerControl._overlaysList);
                    layerControl.legend = $('.openwebrx-map-legend').insertAfter($('#openwebrx-map-legend-separator'));
                } // layerControl

                // Load and initialize OWRX-specific map item managers
                $.getScript('static/lib/Leaflet.js').done(function() {
                    // Process any accumulated updates
                    self.processUpdates(updateQueue);
                    updateQueue = [];

                    if (!receiverMarker) {
                        receiverMarker = new LMarker();
                        receiverMarker.setMarkerPosition(self.config['receiver_name'], receiverPos[0], receiverPos[1]);
                        receiverMarker.addListener('click', function () {
                            L.popup(receiverMarker.getPos(), {
                                content: '<h3>' + self.config['receiver_name'] + '</h3>' +
                                    '<div>Receiver location</div>'
                            }).openOn(map);
                        });
                        receiverMarker.setMarkerOptions(this.config);
                        receiverMarker.setMap(map);
                    }
                });

                // Create map legend selectors
                self.setupLegendFilters(layerControl.legend);

            }); // leaflet.js
        }); // leaflet.css
    }
};

MapManager.prototype.processUpdates = function(updates) {
    var self = this;

    if (typeof(LMarker) === 'undefined') {
        updateQueue = updateQueue.concat(updates);
        return;
    }

    updates.forEach(function(update) {
        switch (update.location.type) {
            case 'latlon':
                var marker = self.mman.find(update.callsign);
                var markerClass = LMarker;
                var aprsOptions = {}

                if (update.location.symbol) {
                    markerClass = LAprsMarker;
                    aprsOptions.symbol = update.location.symbol;
                    aprsOptions.course = update.location.course;
                    aprsOptions.speed = update.location.speed;
                }

                // If new item, create a new marker for it
                if (!marker) {
                    marker = new markerClass();
                    self.mman.addType(update.mode);
                    self.mman.add(update.callsign, marker);
                    marker.addListener('click', function() {
                        showMarkerInfoWindow(update.callsign, marker.getPos());
                    });
                    marker.div = marker.create();
                    marker.setIcon(L.divIcon({ html: marker.div, className: 'dummy' }));
                }

                // Update marker attributes and age
                marker.update(update);
                // Assign marker to map
                marker.setMap(self.mman.isEnabled(update.mode)? map : undefined);

                // Apply marker options
                marker.setMarkerOptions(aprsOptions);

                if (expectedCallsign && expectedCallsign == update.callsign) {
                    map.setView(marker.getPos());
                    showMarkerInfoWindow(update.callsign, marker.getPos());
                    expectedCallsign = false;
                }
            break;

            case 'feature':
                var marker = self.mman.find(update.callsign);
                var options = {};

                // If no symbol or color supplied, use defaults by type
                if (update.location.symbol) {
                    options.symbol = update.location.symbol;
                } else {
                    options.symbol = self.mman.getSymbol(update.mode);
                }
                if (update.location.color) {
                    options.color = update.location.color;
                } else {
                    options.color = self.mman.getColor(update.mode);
                }

                // If new item, create a new marker for it
                if (!marker) {
                    marker = new LFeatureMarker();
                    marker.div = marker.create();
                    marker.setIcon(L.divIcon({ html: marker.div, className: 'dummy' }));

                    self.mman.addType(update.mode);
                    self.mman.add(update.callsign, marker);
                    marker.addListener('click', function() {
                        showMarkerInfoWindow(update.callsign, marker.getPos());
                    });
                }

                // Update marker attributes and age
                marker.update(update);

                // Assign marker to map
                marker.setMap(self.mman.isEnabled(update.mode)? map : undefined);

                // Apply marker options
                marker.setMarkerOptions(options);

                if (expectedCallsign && expectedCallsign == update.callsign) {
                    map.setView(marker.getPos());
                    showMarkerInfoWindow(update.callsign, marker.getPos());
                    expectedCallsign = false;
                }
            break;

            case 'locator':
                var rectangle = self.lman.find(update.callsign);

                // If new item, create a new locator for it
                if (!rectangle) {
                    rectangle = new LLocator();
                    self.lman.add(update.callsign, rectangle);
                    rectangle.addListener('click', function() {
                        showLocatorInfoWindow(rectangle.locator, rectangle.center);
                    });
                }

                // Update locator attributes, center, age
                rectangle.update(update);

                // Assign locator to map and set its color
                rectangle.setMap(self.lman.filter(rectangle)? map : undefined);
                rectangle.setColor(self.lman.getColor(rectangle));

                if (expectedLocator && expectedLocator == update.location.locator) {
                    map.setView(rectangle.center);
                    showLocatorInfoWindow(expectedLocator, rectangle.center);
                    expectedLocator = false;
                }
            break;
        }
    });
};
