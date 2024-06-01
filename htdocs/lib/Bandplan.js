function Bandplan(el) {
    this.el      = el;
    this.bands   = [];
    this.ctx     = null;
    this.enabled = false;

    // Make sure canvas fills the container
    el.style.width  = '100%';
    el.style.height = '100%';

    // Redraw bandplan once it fully shows up
    var me = this;
    el.parentElement.addEventListener("transitionend", function(ev) {
        me.draw();
    });

    // Colors used for band types
    this.colors = {
        'hamradio' : '#006000',
        'broadcast': '#000080',
        'public'   : '#400040',
        'service'  : '#800000'
    };
};

Bandplan.prototype.getColor = function(type) {
    // Default color is black
    return type in this.colors? this.colors[type] : '#000000';
};

Bandplan.prototype.update = function(bands) {
    this.bands = bands;
    this.draw();
};

Bandplan.prototype.draw = function() {
    // Must be enabled to draw
    if (!this.enabled) return;

    var width  = this.el.offsetWidth;
    var height = this.el.offsetHeight;

    // If new dimensions are available...
    if ((height>0) && (width>0)) {
        // If canvas got resized or no context yet...
        if (!this.ctx || width!=this.el.width || height!=this.el.height) {
            this.el.width  = width;
            this.el.height = height;

            this.ctx = this.el.getContext('2d');
            this.ctx.lineWidth = height - 2;
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.textAlign = 'center';
            this.ctx.font = 'bold 11px sans-serif';
            this.ctx.textBaseline = 'middle';
        }
    }

    // Use whatever dimensions we have at the moment
    width  = this.el.width;
    height = this.el.height;

    // Must have context and dimensions here
    if (!this.ctx || !height || !width) return;

    // Clear canvas to transparency
    this.ctx.clearRect(0, 0, width, height);

    // Do not draw anything if there is nothing to draw
    var range = get_visible_freq_range();
    if (!range || !this.bands.length) return;

    // Center of the ribbon
    height = (height - 2) / 2;

    //console.log("Drawing range of " + range.start + " - " + range.end);

    this.bands.forEach((x) => {
        if (x.low_bound < range.end && x.high_bound > range.start) {
            var start = Math.max(scale_px_from_freq(x.low_bound, range), 0);
            var end = Math.min(scale_px_from_freq(x.high_bound, range), width);
            var tag = x.tags.length > 0? x.tags[0] : '';

            //console.log("Drawing " + x.name + "(" + tag + ", " + x.low_bound
            //    + ", " + x.high_bound + ") => " + start + " - " + end);

            this.ctx.strokeStyle = this.getColor(tag);

            this.ctx.beginPath();
            this.ctx.moveTo(start, height);
            this.ctx.lineTo(end, height);
            this.ctx.stroke();

            var w = this.ctx.measureText(x.name).width;
            if (w <= (end - start) * 3 / 4) {
                this.ctx.fillText(x.name, (start + end) / 2, height);
            }
        }
    });
};

Bandplan.prototype.toggle = function(on) {
    // If no argument given, toggle bandplan
    if (typeof(on) === 'undefined') on = !this.enabled;

    if (on != this.enabled) {
        this.enabled = on;
        if (on) {
            this.el.parentElement.classList.add('expanded');
            // Try drawing right away, since we may know dimensions
            this.draw();
        } else {
            this.el.parentElement.classList.remove('expanded');
        }
    }
};
