$.fn.profiles = function() {
    this.each(function() {
        $(this).on('click', '.move-down', function(e) {
            $.ajax(document.URL.replace(/(\/sdr\/[^\/]+)\/profile\/([^\/]+)$/, '$1/moveprofiledown/$2')).done(function() {
                document.location.reload();
            });
            return false;
        });

        $(this).on('click', '.move-up', function(e) {
            $.ajax(document.URL.replace(/(\/sdr\/[^\/]+)\/profile\/([^\/]+)$/, '$1/moveprofileup/$2')).done(function() {
                document.location.reload();
            });
            return false;
        });
    });
}
