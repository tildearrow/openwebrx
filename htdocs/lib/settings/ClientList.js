$.fn.clientList = function() {
    this.each(function() {
        $(this).on('click', '.client-ban', function(e) {
            $.ajax("/ban/" + this.value).done(function() {
                document.location.reload();
            });
            return false;
        });

        $(this).on('click', '.client-unban', function(e) {
            $.ajax("/unban/" + this.value).done(function() {
                document.location.reload();
            });
            return false;
        });
    });
}
