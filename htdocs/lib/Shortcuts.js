//
// Handle keyboard shortcuts
//

function Shortcuts() {}

Shortcuts.init = function(target) {
    target.addEventListener("keydown", this.handleKey);
};

Shortcuts.moveSlider = function(slider, delta) {
    var $control = $(slider);
    if (!$control.prop('disabled')) {
        $control.val(parseInt($control.val()) + delta).change();
    }
};

Shortcuts.moveSelector = function(selector, steps) {
    var $control = $(selector);
    if (!$control.prop('disabled')) {
        var max = $(selector + ' option').length;
        var n = $control.prop('selectedIndex') + steps;
        n = n < 0? n + max : n >= max? n - max : n;
        $control.prop('selectedIndex', n).change();
    }
};

Shortcuts.handleKey = function(event) {
    // Do not handle shortcuts when focused on a text or numeric input
    var on_input = !!($('input:focus').length && ($('input:focus')[0].type === 'text' || $('input:focus')[0].type === 'number'));
    if (on_input) return;

    switch (event.key) {
        case 'ArrowLeft':
            if (event.ctrlKey) {
                // CTRL+LEFT: Decrease squelch
                this.moveSlider('#openwebrx-panel-receiver .openwebrx-squelch-slider', -5);
            } else if (event.shiftKey) {
                // SHIFT+LEFT: Shift bandpass left
                var demodulators = getDemodulators();
                for (var i = 0; i < demodulators.length; i++) {
                    demodulators[i].moveBandpass(
                        demodulators[i].low_cut - 50,
                        demodulators[i].high_cut - 50
                    );
                }
            } else {
                // LEFT: Tune down
                tuneBySteps(-1);
            }
            break;

        case 'ArrowRight':
            if (event.ctrlKey) {
                // CTRL+RIGHT: Increase squelch
                this.moveSlider('#openwebrx-panel-receiver .openwebrx-squelch-slider', 5);
            } else if (event.shiftKey) {
                // SHIFT+RIGHT: Shift bandpass right
                var demodulators = getDemodulators();
                for (var i = 0; i < demodulators.length; i++) {
                    demodulators[i].moveBandpass(
                        demodulators[i].low_cut + 50,
                        demodulators[i].high_cut + 50
                    );
                }
            } else {
                // RIGHT: Tune up
                tuneBySteps(1);
            }
            break;

        case 'ArrowUp':
            if (event.ctrlKey) {
                // CTRL+UP: Increase volume
                this.moveSlider('#openwebrx-panel-volume', 10);
            } else if (event.shiftKey) {
                // SHIFT+UP: Make bandpass wider
                var demodulators = getDemodulators();
                for (var i = 0; i < demodulators.length; i++) {
                    demodulators[i].moveBandpass(
                        demodulators[i].low_cut - 50,
                        demodulators[i].high_cut + 50
                    );
                }
            } else {
                // UP: Zoom in
                zoomInOneStep();
            }
            break;

        case 'ArrowDown':
            if (event.ctrlKey) {
                // CTRL+DOWN: Decrease volume
                this.moveSlider('#openwebrx-panel-volume', -10);
            } else if (event.shiftKey) {
                // SHIFT+DOWN: Make bandpass narrower
                var demodulators = getDemodulators();
                for (var i = 0; i < demodulators.length; i++) {
                    demodulators[i].moveBandpass(
                        demodulators[i].low_cut + 50,
                        demodulators[i].high_cut - 50
                    );
                }
            } else {
                // DOWN: Zoom out
                zoomOutOneStep();
            }
            break;

        case '1': case '2': case '3': case '4': case '5':
        case '6': case '7': case '8': case '9': case '0':
            // 0-9: Select modulation
            var $modes = $('.openwebrx-demodulator-button');
            var n = parseInt(event.key);
            n = n > 0? n - 1 : 9;
            if (n < $modes.length) $modes[n].click();
            break;

        case '[': case '{':
            // [: Decrease tuning step
            this.moveSelector('#openwebrx-tuning-step-listbox', -1);
            break;

        case ']': case '}':
            // ]: Increase tuning step
            this.moveSelector('#openwebrx-tuning-step-listbox', 1);
            break;

        case 'a':
            // A: Set squelch automatically
            $('.openwebrx-squelch-auto').click();
            break;

        case 's':
            // S: Toggle scanner
            toggleScanner();
            break;

        case 'd':
            // D: Turn off squelch
            var $squelchControl = $('#openwebrx-panel-receiver .openwebrx-squelch-slider');
            if (!$squelchControl.prop('disabled')) {
                $squelchControl.val($squelchControl.attr('min')).change();
            }
            break;

        case 'z':
            // Z: Set waterfall colors automatically
            $('#openwebrx-waterfall-colors-auto').click();
            break;

        case 'x':
            // X: Continuously auto-set waterfall colors
            $('#openwebrx-waterfall-colors-auto').triggerHandler('contextmenu');
            break;

        case 'c':
            // C: Set default waterfall colors
            $('#openwebrx-waterfall-colors-default').click();
            break;

        case 'v':
            // V: Toggle spectrum display
            UI.toggleSpectrum();
            break;

        case 'b':
            // B: Toggle bandplan display
            UI.toggleBandplan();
            break;

        case ' ':
            // SPACE: Mute/unmute sound
            UI.toggleMute();
            break;

        case 'n':
            // N: Toggle noise reduction
            UI.toggleNR();
            break;

        case 'r':
            // R: Toggle recorder
            UI.toggleRecording();
            break;

        case '<':
            // SHIFT+<: Decrease waterfall max level
            this.moveSlider('#openwebrx-waterfall-color-max', -1);
            break;

        case ',':
            // <: Decrease waterfall min level
            this.moveSlider('#openwebrx-waterfall-color-min', -1);
            break;

        case '>':
            // SHIFT+>: Increase waterfall max level
            this.moveSlider('#openwebrx-waterfall-color-max', 1);
            break;

        case '.':
            // >: Increase waterfall min level
            this.moveSlider('#openwebrx-waterfall-color-min', 1);
            break;

       case 'f':
           // F: Open file browser
           $('a.button[target="openwebrx-files"]')[0].click();
           break;

       case 'h':
           // H: Open documentation
           $('a.button[target="openwebrx-help"]')[0].click();
           break;

       case 'm':
           // M: Open map
           $('a.button[target="openwebrx-map"]')[0].click();
           break;

        case '/': case '?':
            // TODO: Help screen goes here!!!
            break;

        default:
            // Key not handled, pass it on
            return;
    }

    // Key handled, prevent default operation
    event.preventDefault();
};
