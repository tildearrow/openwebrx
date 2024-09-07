//
// Map Calls Management
//

CallManager.strokeOpacity = 0.8;
CallManager.fillOpacity   = 0.35;

function CallManager() {
    // Current calls
    this.calls = [];
}

CallManager.prototype.add = function(call) {
    // Remove excessive calls
    while (this.calls.length > 0 && this.calls.length >= max_calls) {
        var old = this.calls.shift();
        old.setMap();
    }

    // Do not try adding if calls display disabled
    if (max_calls <= 0) return false;

    // Add new call
    this.calls.push(call);
    return true;
};

CallManager.prototype.ageAll = function() {
    var now = new Date().getTime();
    var out = [];
    this.calls.forEach((x) => { if (x.age(now)) out.push(x) });
    this.calls = out;
};

CallManager.prototype.clear = function() {
    // Remove all calls from the map
    this.calls.forEach((x) => { x.setMap(); });
    // Delete all calls
    this.calls = [];
};

CallManager.prototype.setFilter = function(filterBy = null) {
    if (filterBy == null) {
        this.calls.forEach((x) => { x.setOpacity(0.2); });
    } else {
        this.calls.forEach((x) => {
            x.setOpacity(x.band===filterBy || x.mode==filterBy? 0.2 : 0.0);
        });
    }
};

//
// Generic Map Call
//     Derived classes have to implement:
//     setMap(), setEnds(), setColor(), setOpacity()
//

function Call() {}

Call.prototype.create = function(data, map) {
    // Update call information
    this.caller   = data.caller;
    this.callee   = data.callee;
    this.src      = data.src;
    this.dst      = data.dst;
    this.band     = data.band;
    this.mode     = data.mode;
    this.lastseen = data.lastseen;

    // Make a call between two maidenhead squares
    var src = Utils.loc2latlng(this.src.locator);
    var dst = Utils.loc2latlng(this.dst.locator);
    this.setEnds(src[0], src[1], dst[0], dst[1]);

    // Place on the map
    this.setMap(map);
    this.setOpacity(0.2);

    // Age call
    this.age(new Date().getTime());
}

Call.prototype.age = function(now) {
    if (now - this.lastseen > retention_time) {
        this.setMap();
        return false;
    }

    return true;
};
