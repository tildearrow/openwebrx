function Scanner(bookmarkBar, msec) {
    this.bbar      = bookmarkBar;
    this.bookmarks = null;
    this.msec      = msec;
    this.current   = null;
    this.threshold = -80;
    this.data      = [];
}

Scanner.prototype.tuneBookmark = function(b) {
    // Must have frequency, skip digital voice modes
    if (!b || !b.frequency || !b.modulation || b.modulation=='dmr') {
        return false;
    }

    //console.log("TUNE: " + b.name + " at " + b.frequency + ": " + b.modulation);

    // Make this bookmark current
    this.current = b;

    // Tune to the bookmark frequency
    var panel = $('#openwebrx-panel-receiver').demodulatorPanel();
    panel.getDemodulator().set_offset_frequency(b.frequency - center_freq);
    panel.setMode(b.modulation, b.underlying);

    // Done
    return true;
}

Scanner.prototype.getLevel = function(b) {
    // Must have bookmark and frequency
    if(!b || !b.frequency || !this.data.length) return -1000;

    // Compute relevant FFT slot index
    var x = this.data.length * ((b.frequency - center_freq) / bandwidth + 0.5);
    return this.data[x | 0];
}

Scanner.prototype.update = function(data) {
    // Do not update if no timer
    if (!this.timer) return;

    var i = this.data.length < data.length? this.data.length : data.length;

    // Truncate stored data length, add and fill missing data
    if (this.data.length > i) {
        this.data.length = i;
    } else if(this.data.length < data.length) {
        this.data.length = data.length;
        for(var j=i; j<data.length; ++j) this.data[j] = data[j];
    }

    // Average level over time
    for(var j=0; j<i; ++j) this.data[j] += (data[j] - this.data[j]) / 10.0;
}

Scanner.prototype.scan = function() {
    // Do not scan if no timer or no data
    if (!this.bookmarks || !this.bookmarks.length) return;
    if (!this.timer || !this.data.length) return;

    // Get current squelch threshold from the slider
    var $slider = $('#openwebrx-panel-receiver .openwebrx-squelch-slider');
    this.threshold = $slider.val();

    // If there is currently selected bookmark...
    if (this.current) {
        var level = this.getLevel(this.current);
        if (level>this.threshold) return; else this.current = null;
    }

    // For every shown bookmark...
    for(var j=0 ; j<this.bookmarks.length ; ++j) {
        // Get bookmark's current level
        var b = this.bookmarks[j];
        var level = this.getLevel(b);

        //console.log("SCAN: " + b.name + " at " + b.frequency + ": " + level);

        // If level exceeds threshold, tune to the bookmark
        if (level>this.threshold && this.tuneBookmark(b)) return;
    }
};

Scanner.prototype.stop = function() {
    // If timer running...
    if (this.timer) {
        // Stop redraw timer
        clearInterval(this.timer);
        this.timer = 0;
        // Remove current bookmarks and data
        this.bookmarks = null;
        this.current = null;
        this.data.length = 0;
    }

    // Done
    return this.timer == null;
}

Scanner.prototype.start = function() {
    // If timer is not running...
    if (!this.timer) {
        // Get all bookmarks from the bookmark bar
        this.bookmarks = this.bbar.getAllBookmarks();

        // If there are bookmarks to scan...
        if (this.bookmarks && this.bookmarks.length>0) {
            // Start redraw timer
            var me = this;
            this.timer = setInterval(function() { me.scan(); }, this.msec);
        }
    }

    // Done
    return this.timer != null;
}

Scanner.prototype.toggle = function() {
    // Toggle based on the current timer state
    return this.timer? this.stop() : this.start();
};
