//
// User Interface functions
//

function UI() {}

// We start with these values
UI.theme = 'default';
UI.frame = false;
UI.opacity = 100;
UI.volume = -1;
UI.volumeMuted = -1;
UI.nrThreshold = 0;
UI.nrEnabled = false;

//
// Local Storage Access
//

// Return true of setting exist in storage.
UI.has = function(key) {
    return localStorage && (localStorage.getItem(key)!=null);
};

// Save named UI setting to local storage.
UI.save = function(key, value) {
    if (localStorage) localStorage.setItem(key, value);
};

// Load named UI setting from local storage.
UI.loadStr = function(key) {
    return localStorage? localStorage.getItem(key) : null;
};

UI.loadInt = function(key) {
    var x = localStorage? localStorage.getItem(key) : null;
    return x!=null? parseInt(x) : 0;
}

UI.loadBool = function(key) {
    var x = localStorage? localStorage.getItem(key) : null;
    return x==='true';
}

// Load UI settings from local storage.
UI.loadSettings = function() {
    if (this.has('ui_theme'))     this.setTheme(this.loadStr('ui_theme'));
    if (this.has('ui_frame'))     this.setFrame(this.loadBool('ui_frame'));
    if (this.has('ui_opacity'))   this.setOpacity(this.loadInt('ui_opacity'));
    if (this.has('volume'))       this.setVolume(this.loadInt('volume'));
    if (this.has('nr_threshold')) this.setNR(this.loadInt('nr_threshold'));

    // Reapply mute
    if (this.has('volumeMuted')) {
        var x = this.loadInt('volumeMuted');
        if ((x >= 0) != (this.volumeMuted >= 0)) this.toggleMute();
        this.volumeMuted = x;
    }

    // Reapply NR
    if (this.has('nr_enabled')) {
        var x = this.loadBool('nr_enabled');
        if (x != this.nrEnabled) this.toggleNR();
    }
};

//
// Volume Controls
//

// Set audio volume in 0..150 range.
UI.setVolume = function(x) {
    if (this.volume != x) {
        this.volume = x;
        this.save('volume', x);
        $("#openwebrx-panel-volume").val(x)
        if (audioEngine) audioEngine.setVolume(x / 100);
    }
};

// Toggle audio muting.
UI.toggleMute = function() {
    var $muteButton = $('.openwebrx-mute-button');
    var $volumePanel = $('#openwebrx-panel-volume');

    if ($volumePanel.prop('disabled')) {
        $muteButton.removeClass('muted');
        $volumePanel.prop('disabled', false);
        this.setVolume(this.volumeMuted);
        this.volumeMuted = -1;
    } else {
        $muteButton.addClass('muted');
        $volumePanel.prop('disabled', true);
        this.volumeMuted = this.volume;
        this.setVolume(0);
    }

    // Save muted volume, or lack thereof
    this.save('volumeMuted', this.volumeMuted);
};

//
// Noise Reduction Controls
//

// Set noise reduction threshold in decibels.
UI.setNR = function(x) {
    if (this.nrThreshold != x) {
        this.nrThreshold = x;
        this.save('nr_threshold', x);
        $('#openwebrx-panel-nr').attr('title', 'Noise level (' + x + ' dB)').val(x);
        this.updateNR();
    }
};

// Toggle noise reduction function.
UI.toggleNR = function() {
    var $nrPanel = $('#openwebrx-panel-nr');
    this.nrEnabled = !!$nrPanel.prop('disabled');
    this.save('nr_enabled', this.nrEnabled);
    $nrPanel.prop('disabled', !this.nrEnabled);
    this.updateNR();
}

// Send changed noise reduction parameters to the server.
UI.updateNR = function() {
    ws.send(JSON.stringify({
        "type": "connectionproperties",
        "params": {
            "nr_enabled": this.nrEnabled,
            "nr_threshold": this.nrThreshold
        }
    }));
}

//
// Look & Feel Controls
//

// Toggle frame around receiver and other panels.
UI.toggleFrame = function() {
    this.setFrame(!this.frame);
};

// Show or hide frame around receiver and other panels.
UI.setFrame = function(x) {
    if (this.frame != x) {
        this.frame = x;
        this.save('ui_frame', x);
        $('#openwebrx-panel-receiver').css('border', x? '2px solid':'');
        $('#openwebrx-dialog-bookmark').css('border', x? '2px solid':'');
    }
};

// Set user interface opacity in 10..100% range.
UI.setOpacity = function(x) {
    x = x<10? 10 : x>100? 100 : x;
    if (this.opacity != x) {
        this.opacity = x;
        this.save('ui_opacity', x);
        $('.openwebrx-panel').css('opacity', x/100);
        $('#openwebrx-opacity-slider')
            .attr('title', 'Opacity (' + Math.round(x) + '%)')
            .val(x);
    }
};

// Set user interface theme.
UI.setTheme = function(theme) {
    // Do not set twice
    if (this.theme === theme) return;

    // Save current theme name
    this.theme = theme;
    this.save('ui_theme', theme);

    // Set selector
    var lb = $('#openwebrx-themes-listbox');
    lb.val(theme);

    // Remove existing theme
    var opts = lb[0].options;
    for(j=0 ; j<opts.length ; j++) {
        $('body').removeClass('theme-' + opts[j].value);
    }
    $('body').removeClass('has-theme');

    // Apply new theme
    if (theme && (theme != '') && (theme != 'default')) {
        $('body').addClass('theme-' + theme);
        $('body').addClass('has-theme');
    }
};
