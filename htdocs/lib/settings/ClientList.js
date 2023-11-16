$.fn.clientList = function() {
    this.each(function() {
        $(this).on('click', '.client-ban', function(e) {
            $.ajax(document.location.href + "/ban/" + this.value).done(function() {
                document.location.reload();
            });
            return false;
        });

        $(this).on('click', '.client-unban', function(e) {
            $.ajax(document.location.href + "/unban/" + this.value).done(function() {
                document.location.reload();
            });
            return false;
        });
    });
}
