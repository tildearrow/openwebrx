function Bandplan(el) {
    this.el    = el;
    this.bands = [];
    this.ctx   = null;

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
        'hamradio' : 'rgba(0, 255, 0, 0.5)',
        'broadcast': 'rgba(0, 0, 255, 0.5)',
        'public'   : 'rgba(191, 64, 0, 0.5)',
        'service'  : 'rgba(255, 0, 0, 0.5)'
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
    var width  = this.el.offsetWidth;
    var height = this.el.offsetHeight;

    // Do not draw if not shown
    if (!height) return;

    // If canvas got resized, or no context yet...
    if (!this.ctx || width!=this.el.width || height!=this.el.height) {
        this.el.width  = width;
        this.el.height = height;

        this.ctx = this.el.getContext('2d');
        this.ctx.lineWidth = height;
        this.ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
        this.ctx.textAlign = 'center';
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.textBaseline = 'middle';
    }

    // Clear canvas to transparency
    this.ctx.clearRect(0, 0, width, height);

    // Do not draw anything if there is nothing to draw
    var range = get_visible_freq_range();
    if (!range || !this.bands.length) return;

    // Center of the ribbon
    height /= 2;

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
    // If no argument given, toggle spectrum
    if (typeof(on) === 'undefined') on = !this.el.offsetHeight;

    // Toggle based on the current redraw timer state
    if (this.el.offsetHeight && !on) {
        this.el.parentElement.classList.remove('expanded');
    } else if (!this.el.offsetHeight && on) {
        this.el.parentElement.classList.add('expanded');
    }
};
