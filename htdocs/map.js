// Marker.linkify() uses these URLs
var callsign_url = null;
var vessel_url   = null;
var flight_url   = null;

// reasonable default; will be overriden by server
var retention_time = 2 * 60 * 60 * 1000;

// Function to toggle legend box on/off
function toggleElement(el_name) {
    var el = document.getElementById(el_name);
    if (el) el.style.display = el.style.display === 'none'? 'block' : 'none';
}

$(function(){
    var query = window.location.search.replace(/^\?/, '').split('&').map(function(v){
        var s = v.split('=');
        var r = {};
        r[s[0]] = s.slice(1).join('=');
        return r;
    }).reduce(function(a, b){
        return a.assign(b);
    });

    var expectedCallsign;
    if (query.callsign) expectedCallsign = decodeURIComponent(query.callsign);
    var expectedLocator;
    if (query.locator) expectedLocator = query.locator;

    var protocol = window.location.protocol.match(/https/) ? 'wss' : 'ws';

    var href = window.location.href;
    var index = href.lastIndexOf('/');
    if (index > 0) {
        href = href.substr(0, index + 1);
    }
    href = href.split("://")[1];
    href = protocol + "://" + href;
    if (!href.endsWith('/')) {
        href += '/';
    }
    var ws_url = href + "ws/";

    var map;
    var receiverMarker;
    var updateQueue = [];

    // marker and locator managers
    var markmanager = null;
    var locmanager = null;

    // clock
    var clock = new Clock($("#openwebrx-clock-utc"));

    $(function() {
        $('#openwebrx-map-colormode').on('change', function() {
            locmanager.setColorMode(map, $(this).val());
        });
    });

    var processUpdates = function(updates) {
        if (!markmanager || !locmanager) {
            updateQueue = updateQueue.concat(updates);
            return;
        }
        updates.forEach(function(update) {
            switch (update.location.type) {
                case 'latlon':
                    var pos = new google.maps.LatLng(update.location.lat, update.location.lon);
                    var marker = markmanager.find(update.callsign);
                    var markerClass = google.maps.Marker;
                    var aprsOptions = {}
                    if (update.location.symbol) {
                        markerClass = GAprsMarker;
                        aprsOptions.symbol = update.location.symbol;
                        aprsOptions.course = update.location.course;
                        aprsOptions.speed = update.location.speed;
                    }

                    // If new item, create a new marker for it
                    if (!marker) {
                        marker = new markerClass();
                        markmanager.addType(update.mode);
                        markmanager.add(update.callsign, marker);
                        marker.addListener('click', function(){
                            showMarkerInfoWindow(update.callsign, pos);
                        });
                    }

                    // Apply marker options
                    marker.setOptions($.extend({
                        position: pos,
                        map: markmanager.isEnabled(update.mode)? map : undefined,
                        title: update.callsign
                    }, aprsOptions));

                    // Update marker attributes and age
                    marker.age(new Date().getTime() - update.lastseen);
                    marker.update(update);

                    if (expectedCallsign && expectedCallsign == update.callsign) {
                        map.panTo(pos);
                        showMarkerInfoWindow(update.callsign, pos);
                        expectedCallsign = false;
                    }

                    if (infowindow && infowindow.callsign && infowindow.callsign == update.callsign) {
                        showMarkerInfoWindow(infowindow.callsign, pos);
                    }
                break;

                case 'feature':
                    var pos = new google.maps.LatLng(update.location.lat, update.location.lon);
                    var marker = markmanager.find(update.callsign);
                    var options = {}

                    // If no symbol or color supplied, use defaults by type
                    if (update.location.symbol) {
                        options.symbol = update.location.symbol;
                    } else {
                        options.symbol = markmanager.getSymbol(update.mode);
                    }
                    if (update.location.color) {
                        options.color = update.location.color;
                    } else {
                        options.color = markmanager.getColor(update.mode);
                    }

                    // If new item, create a new marker for it
                    if (!marker) {
                        marker = new GFeatureMarker();
                        markmanager.addType(update.mode);
                        markmanager.add(update.callsign, marker);
                        marker.addListener('click', function(){
                            showMarkerInfoWindow(update.callsign, pos);
                        });
                    }

                    // Apply marker options
                    marker.setOptions($.extend({
                        position: pos,
                        map: markmanager.isEnabled(update.mode)? map : undefined,
                        title: update.callsign
                    }, options));

                    // Update marker attributes and age
                    marker.age(new Date().getTime() - update.lastseen);
                    marker.update(update);

                    if (expectedCallsign && expectedCallsign == update.callsign) {
                        map.panTo(pos);
                        showMarkerInfoWindow(update.callsign, pos);
                        expectedCallsign = false;
                    }

                    if (infowindow && infowindow.callsign && infowindow.callsign == update.callsign) {
                        showMarkerInfoWindow(infowindow.callsign, pos);
                    }
                break;

                case 'locator':
                    var rectangle = locmanager.find(update.callsign);

                    // If new item, create a new locator for it
                    if (!rectangle) {
                        rectangle = new GLocator();
                        locmanager.add(update.callsign, rectangle);
                        rectangle.addListener('click', function() {
                            showLocatorInfoWindow(this.locator, this.center);
                        });
                    }

                    // Update locator attributes, center, and age
                    rectangle.age(new Date().getTime() - update.lastseen);
                    rectangle.update(update);

                    // Apply locator options
                    var color = locmanager.getColor(rectangle);
                    rectangle.setOptions({
                        map : locmanager.filter(rectangle)? map : undefined,
                        strokeColor  : color,
                        strokeWeight : 2,
                        fillColor    : color
                    });

                    if (expectedLocator && expectedLocator == update.location.locator) {
                        map.panTo(rectangle.center);
                        showLocatorInfoWindow(expectedLocator, rectangle.center);
                        expectedLocator = false;
                    }

                    if (infowindow && infowindow.locator && infowindow.locator == update.location.locator) {
                        showLocatorInfoWindow(infowindow.locator, rectangle.center);
                    }
                break;
            }
        });
    };

    var clearMap = function(){
        var reset = function(callsign, item) { item.setMap(); };
        receiverMarker.setMap();
        markmanager.clear();
        locmanager.clear();
    };

    var reconnect_timeout = false;

    var config = {}

    var connect = function(){
        var ws = new WebSocket(ws_url);
        ws.onopen = function(){
            ws.send("SERVER DE CLIENT client=map.js type=map");
            reconnect_timeout = false
        };

        ws.onmessage = function(e){
            if (typeof e.data != 'string') {
                console.error("unsupported binary data on websocket; ignoring");
                return
            }
            if (e.data.substr(0, 16) == "CLIENT DE SERVER") {
                return
            }
            try {
                var json = JSON.parse(e.data);
                switch (json.type) {
                    case "config":
                        Object.assign(config, json.value);
                        if ('receiver_gps' in config) {
                            var receiverPos = {
                                lat: config.receiver_gps.lat,
                                lng: config.receiver_gps.lon
                            };
                            if (!map) $.getScript("https://maps.googleapis.com/maps/api/js?key=" + config.google_maps_api_key).done(function(){
                                map = new google.maps.Map($('.openwebrx-map')[0], {
                                    center: receiverPos,
                                    zoom: 5,
                                });

                                $.getScript("static/lib/nite-overlay.js").done(function(){
                                    nite.init(map);
                                    setInterval(function() { nite.refresh() }, 10000); // every 10s
                                });

                                $.getScript('static/lib/MarkerManager.js').done(function(){
                                    markmanager = new MarkerManager();
                                    if (locmanager) {
                                        processUpdates(updateQueue);
                                        updateQueue = [];
                                    }
                                });

                                $.getScript('static/lib/LocatorManager.js').done(function(){
                                    locmanager = new LocatorManager();
                                    if (markmanager) {
                                        processUpdates(updateQueue);
                                        updateQueue = [];
                                    }
                                });

                                var $legend = $(".openwebrx-map-legend");
                                setupLegendFilters($legend);
                                map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push($legend[0]);

                                if (!receiverMarker) {
                                    receiverMarker = new google.maps.Marker();
                                    receiverMarker.addListener('click', function() {
                                        showReceiverInfoWindow(receiverMarker);
                                    });
                                }
                                receiverMarker.setOptions({
                                    map: map,
                                    position: receiverPos,
                                    title: config['receiver_name'],
                                    config: config
                                });

                            }); else {
                                receiverMarker.setOptions({
                                    map: map,
                                    position: receiverPos,
                                    config: config
                                });
                            }
                        }
                        if ('receiver_name' in config && receiverMarker) {
                            receiverMarker.setOptions({
                                title: config['receiver_name']
                            });
                        }
                        if ('map_position_retention_time' in config) {
                            retention_time = config.map_position_retention_time * 1000;
                        }
                        if ('callsign_url' in config) {
                            callsign_url = config['callsign_url'];
                        }
                        if ('vessel_url' in config) {
                            vessel_url = config['vessel_url'];
                        }
                        if ('flight_url' in config) {
                            flight_url = config['flight_url'];
                        }
                    break;
                    case "update":
                        processUpdates(json.value);
                    break;
                    case 'receiver_details':
                        $('.webrx-top-container').header().setDetails(json['value']);
                    break;
                    default:
                        console.warn('received message of unknown type: ' + json['type']);
                }
            } catch (e) {
                // don't lose exception
                console.error(e);
            }
        };
        ws.onclose = function(){
            clearMap();
            if (reconnect_timeout) {
                // max value: roundabout 8 and a half minutes
                reconnect_timeout = Math.min(reconnect_timeout * 2, 512000);
            } else {
                // initial value: 1s
                reconnect_timeout = 1000;
            }
            setTimeout(connect, reconnect_timeout);
        };

        window.onbeforeunload = function() { //http://stackoverflow.com/questions/4812686/closing-websocket-correctly-html5-javascript
            ws.onclose = function () {};
            ws.close();
        };

        /*
        ws.onerror = function(){
            console.info("websocket error");
        };
        */
    };

    connect();

    var getInfoWindow = function() {
        if (!infowindow) {
            infowindow = new google.maps.InfoWindow();
            google.maps.event.addListener(infowindow, 'closeclick', function() {
                delete infowindow.locator;
                delete infowindow.callsign;
            });
        }
        delete infowindow.locator;
        delete infowindow.callsign;
        return infowindow;
    }

    var infowindow;
    var showLocatorInfoWindow = function(locator, pos) {
        var infowindow = getInfoWindow();
        infowindow.locator = locator;
        infowindow.setContent(locmanager.getInfoHTML(locator, pos, receiverMarker));
        infowindow.setPosition(pos);
        infowindow.open(map);
    };

    var showMarkerInfoWindow = function(name, pos) {
        var infowindow = getInfoWindow();
        var marker = markmanager.find(name);

        infowindow.callsign = name;
        infowindow.setContent(marker.getInfoHTML(name, receiverMarker));
        infowindow.open(map, marker);
    }

    var showReceiverInfoWindow = function(marker) {
        var infowindow = getInfoWindow()
        infowindow.setContent(
            '<h3>' + marker.config['receiver_name'] + '</h3>' +
            '<div>Receiver location</div>'
        );
        infowindow.open(map, marker);
    }

    // Fade out / remove positions after time
    setInterval(function(){
        if (locmanager)  locmanager.ageAll();
        if (markmanager) markmanager.ageAll();
    }, 1000);

    var setupLegendFilters = function($legend) {
        $content = $legend.find('.content');
        $content.on('click', 'li', function() {
            var $el = $(this);
            $lis = $content.find('li');
            if ($lis.hasClass('disabled') && !$el.hasClass('disabled')) {
                $lis.removeClass('disabled');
                locmanager.setFilter(map);
            } else {
                $el.removeClass('disabled');
                $lis.filter(function() {
                    return this != $el[0]
                }).addClass('disabled');
                locmanager.setFilter(map, $el.data('selector'));
            }
        });

        $content1 = $legend.find('.features');
        $content1.on('click', 'li', function() {
            var $el = $(this);
            var onoff = $el.hasClass('disabled');
            if (onoff) {
                $el.removeClass('disabled');
            } else {
                $el.addClass('disabled');
            }
            markmanager.toggle(map, $el.data('selector'), onoff);
        });
    }

});
