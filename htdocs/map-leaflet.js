// Marker.linkify() uses these URLs
var callsign_url = null;
var vessel_url   = null;
var flight_url   = null;

var mapSources = [
    {
        name: 'OpenStreetMap',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: {
            maxZoom: 19,
            noWrap: true,
            attribution: '© OpenStreetMap'
        },
    },
    {
        name: 'OpenTopoMap',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        options: {
            maxZoom: 17,
            noWrap: true,
            attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
        }
    },
    {
        name: 'Esri WorldTopo',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        config: {
            noWrap: true,
            attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
        }
    },
    {
        name: 'Esri WorldStreet',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
        }
    },
    {
        name: 'Esri WorldImagery',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }
    },
    {
        name: 'Esri NatGeoWorld',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: 'Tiles &copy; Esri &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC',
            maxZoom: 16
        }
    },
    {
        name: 'Esri WorldGray',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
            maxZoom: 16
        }
    },
    {
        name: 'CartoDB Positron',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        options: {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }
    },
    {
        name: 'CartoDB DarkMatter',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        options: {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }
    },
    {
        name: 'CartoDB Voyager',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        options: {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }
    },
    {
        name: 'Stadia Alidade',
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
        config: {
            maxZoom: 20,
            noWrap: true,
            attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
        },
        info: 'In order to use Stadia maps, you must register. Once registered, you can whitelist your domain within your account settings.'
    },
    {
        name: 'Stadia AlidadeDark',
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
        config: {
            maxZoom: 20,
            noWrap: true,
            attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
        },
        info: 'In order to use Stadia maps, you must register. Once registered, you can whitelist your domain within your account settings.'
    },
];

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
    if (map) {
        receiverMarker.setLatLng(receiver_gps.lat, receiver_gps.lon);
        receiverMarker.setMarkerOptions(this.config);
        receiverMarker.setMap(map);
    } else {
        var self = this;

        // load Leaflet CSS first
        fetchStyleSheet('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css').done(function () {
            // now load Leaflet JS
            $.getScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js').done(function () {
                // create map
                map = L.map('openwebrx-map', { zoomControl: false }).setView([receiver_gps.lat, receiver_gps.lon], 5);

                // add zoom control
                new L.Control.Zoom({ position: 'bottomright' }).addTo(map);

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
                    // used to open or collaps the layerControl by default
                    // function isMobile () {
                    //     try { document.createEvent("TouchEvent"); return true; }
                    //     catch (e) { return false; }
                    // }

                    layerControl = L.control.layers({
                    }, null, {
                        collapsed: false, //isMobile(), // we have collapsing already made in the utc clock
                        hideSingleBase: true,
                        position: 'bottomleft'
                    }
                    ).addTo(map);

                    // move legend div to our layerControl
                    layerControl.legend = $('.openwebrx-map-legend')
                        .css({'padding': '0', 'margin': '0'})
                        .insertAfter(layerControl._overlaysList);
                } // layerControl

                // Load and initialize OWRX-specific map item managers
                $.getScript('static/lib/Leaflet.js').done(function() {
                    // Process any accumulated updates
                    self.processUpdates(updateQueue);
                    updateQueue = [];

                    if (!receiverMarker) {
                        receiverMarker = new LMarker();
                        receiverMarker.setMarkerPosition(self.config['receiver_name'], receiver_gps.lat, receiver_gps.lon);
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

                $.each(mapSources, function (idx, ms) {
                    $('#openwebrx-map-source').append(
                        $('<option></option>')
                            .attr('selected', idx == 0 ? true : false)
                            .attr('value', idx)
                            .attr('title', ms.info)
                            .text(ms.name)
                    );
                    ms.layer = L.tileLayer(ms.url, ms.options);
                    if (idx == 0) ms.layer.addTo(map);
                });
                $('#openwebrx-map-source').on('change', function (e) {
                    var id = this.value;
                    var m = mapSources[id];
                    $.each(mapSources, function (idx, ms) {
                        if (map.hasLayer(ms.layer))
                            map.removeLayer(ms.layer);
                    });
                    map.addLayer(m.layer)
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
                    var offset = marker.getAnchorOffset();
                    offset[0] *= -1;
                    offset[1] *= -1;
                    marker.setIcon(L.divIcon({
                        html: marker.div,
                        iconAnchor: [offset[1], offset[0]],
                        className: 'dummy'
                    }));
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
                    // marker.div.style.width = 'auto';
                    // marker.div.style.height = 'auto';
                    // marker.div.style.lineHeight = 'inherit';
                    var offset = marker.getAnchorOffset();
                    offset[0] *= -1;
                    offset[1] *= -1;
                    marker.setIcon(L.divIcon({
                        html: marker.div,
                        iconAnchor: [offset[1], offset[0]],
                        className: 'dummy'
                    }));

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
