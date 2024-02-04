$.fn.profiles = function() {
    this.each(function() {
        $(this).on('click', '.move-down', function(e) {
            $.ajax(document.URL.replace(/\/profile\//, '/moveprofiledown/')).done(function() {
                document.location.reload();
            });
            return false;
        });

        $(this).on('click', '.move-up', function(e) {
            $.ajax(document.URL.replace(/\/profile\//, '/moveprofileup/')).done(function() {
                document.location.reload();
            });
            return false;
        });
    });
}
