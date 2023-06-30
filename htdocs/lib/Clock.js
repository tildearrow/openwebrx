function Clock(el) {
    const now = new Date();
    const me = this;

    // Run timer for the first time on the next minute change
    setTimeout(function() { me.update(); }, 1000 * (60 - now.getUTCSeconds()));

    this.el    = el;
    this.timer = null;

    // Draw for the first time
    this.draw();
}

Clock.prototype.update = function() {
    // Schedule timer in one minute intervals
    if (!this.timer) {
        const me = this;
        this.timer = setInterval(function() { me.update(); }, 60000);
    }

    // Display UTC clock
    this.draw();
}

Clock.prototype.draw = function() {
    // Display UTC clock
    if (this.el) {
        const now = new Date();
        const hours = ("00" + now.getUTCHours()).slice(-2);
        const minutes = ("00" + now.getUTCMinutes()).slice(-2);
        this.el.html(`${hours}:${minutes} UTC`);
    }
}
