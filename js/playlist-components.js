var PlaylistTabs = {
    elems: {
        playlists:'#playlists',
    },
    init: function() {
        var lists = $(PlaylistTabs.elems.playlists).children();

        if (onSharedList) {
            // We don't need to make tabs clickable.
            $.each(lists, function(idx) {
                if (idx != 0) {
                    $(this).remove();
                }
            });
            return;
        }

        $.each(lists, function(idx) {
            $(this).click(function() {
                playlistManager.getCurrentPlaylist().sync();

                var highlight = 'playlist-tab-on';
                lists.removeClass(highlight);
                $(this).addClass(highlight);
                playlistManager.loadLocal(idx);
            });
        });
    },
    currentIdx: function() {
        var playlistIdx;
        $.each($(PlaylistTabs.elems.playlists).children(), function(idx) {
            if ($(this).hasClass('playlist-tab-on')) {
                playlistIdx = idx;
            }
        });
        return playlistIdx;
    }
};

var PlaylistControl = {
    elems: {
        sharePlaylistBtn:".playlist-section .share-playlist-button",
        clearPlaylistBtn:".playlist-section .clear-playlist-button",
        playlistFilterInput:".playlist-section #search-playlist-input"
    },
    init: function() {
        if (!LocalStorage.hasLocalHash()) {
            // `getidsCallback` is executed later.
            $.ajax({
                type: "GET",
                url: API_PLAYLIST_URL,
                data: {'type':'jsonp'},
            });
        }

        if (onSharedList) {
            $(PlaylistControl.elems.sharePlaylistBtn).remove();
        }

        $(this.elems.sharePlaylistBtn).click(function() {
            var localHash = LocalStorage.getLocalHash();
            var playlist = playlistManager.getCurrentPlaylist();
            $.ajax({
                type: "POST",
                url: API_PLAYLIST_URL,
                data: {
                    'key' : localHash,
                    'playlist' : playlist.toJsonStr(true)
                },
                crossDomain: true
            });

            // XXX: Notify key to user.
            NotifyManager.playlistShared(fullHost + '/?playlist=' + localHash);

            // Logging
            if (window.dropbeat &&
                typeof window.dropbeat=="object" && dropbeat.logApiAction) {
                dropbeat.logApiAction("dropbeat", "playlist-manage/share");
            }
        });

        $(this.elems.clearPlaylistBtn).click(function() {
            var playlist = playlistManager.getCurrentPlaylist();
            playlist.clear(true);
            playlist.sync();
            NotifyManager.playlistCleared();

            // Logging
            if (window.dropbeat &&
                typeof window.dropbeat=="object" && dropbeat.logApiAction) {
                dropbeat.logApiAction("dropbeat", "playlist-manage/clear");
            }
        });

        $(this.elems.playlistFilterInput).
            bind("propertychange keyup input paste", function(event) {
            clearTimeout(PlaylistControl.filterTimer);
            var that = $(this);
            PlaylistControl.filterTimer = setTimeout(function () {
                PlaylistControl.filter(that.val().toLowerCase());
            }, 800);
        });
    },
    filterTimer: null,
    filter: function(keyword) {
        var tempPlaylist = new Playlist();
        var current = playlistManager.getCurrentPlaylist();
        if (keyword) {
            for (var i=0; i<current.length(); i++) {
                var m = current.getWithIdx(i);
                if (m.title.toLowerCase().indexOf(keyword) != -1) {
                    // XXX: Avoid public access to `playlist`!
                    tempPlaylist.playlist.push(m);
                }
                tempPlaylist.toTable(true);
            }
        } else {
            playlistManager.getCurrentPlaylist().toTable(true);
        }
    },
    load: function(key) {
        // `playlistCallback` is executed later.
        $.ajax({
            url: API_PLAYLIST_URL,
            data: "key=" + key + "&type=jsonp",
            dataType: 'jsonp'
        });

        // Logging
        if (window.dropbeat &&
            typeof window.dropbeat=="object" && dropbeat.logApiAction) {
            dropbeat.logApiAction("dropbeat", "playlist-manage/load");
        }
    },
    generate: function(key) {
        // Load method for autogen.
        // XXX: Generation should be done with `long polling`
        // so that it cannot block whole playlist while generating.
        // `playlistCallback` is executed later.
        $.ajax({
            url: API_PLAYLIST_AUTOGEN,
            data: "key=" + key + "&type=jsonp",
            dataType: 'jsonp'
        });
    }
};

function getidsCallback(data) {
    if (!data) {
        var localHash = LocalStorage.getLocalHash();
        return;
    }
    var localHash = LocalStorage.getLocalHash(data);
};

function playlistCallback(data) {
    if (data) {
        var playlist = new Playlist();
        for (var i=0; i<data.length; i++) {
            m = new Music(data[i]);
            playlist.add(m);
        }

        playlistManager.add(
            playlistManager.shareKey, playlist);
        playlistManager.updatePlaylistView();
        NotifyManager.playlistLoaded();
    } else {
        // XXX: Warn for invalid key
        alert('Invalid access');
        location.href = fullHost;
    }
};

var UrlAdder = {
    elems:{
        urlAddField:".add-by-url-section .url-input-field-wrapper",
        urlAddInput:".add-by-url-section #add-by-url-input",
        urlAddButton:".add-by-url-section .add-button",
        loadingSpinner:".add-by-url-section .loading-spinner"
    },
    init: function() {
        var that = this;
        $(this.elems.urlAddButton).click(function() {
            url = $(that.elems.urlAddInput).val();
            if (url == null ||
                (url.indexOf('youtube.com') == -1
                    && url.indexOf('youtu.be') == -1
                    && url.indexOf('soundcloud.com') == -1)) {
                NotifyManager.invalidAdderUrl();
            } else {
                UrlAdder.onSubmit(url);
            }
        });
    },
    adding: false,
    onSubmit: function(url) {
        if (!UrlAdder.adding) {
            UrlAdder.hideAll();
            UrlAdder.adding = true;
            $.ajax({
                url: API_RESOLVE_URL,
                data: "url=" + url + "&type=jsonp",
            });
        }

        // Logging
        if (window.dropbeat &&
            typeof window.dropbeat=="object" && dropbeat.logApiAction) {
            dropbeat.logApiAction("dropbeat", "playlist-manage/load-from-url");
        }
    },
    showAll: function() {
        $(this.elems.urlAddField).show();
        $(this.elems.loadingSpinner).hide();
    },
    hideAll: function() {
        $(this.elems.urlAddField).hide();
        $(this.elems.loadingSpinner).show();
    },
    clearInput: function(){
        $(this.elems.urlAddInput).val("");
    }
};

function urlAddCallback(data) {
    // Add to current playlist
    if (data != null) {
        var playlist = playlistManager.getCurrentPlaylist();
        data.title = titleEscape(data.title);
        var success = playlist.add(new Music(data), true);
        if (success) {
            playlistManager.getCurrentPlaylist().sync();
        }
        NotifyManager.playlistChangeNotify(success);

        UrlAdder.adding = false;
    } else {
        // Notify failure
        NotifyManager.invalidAdderUrl();
    }
    UrlAdder.showAll();
    UrlAdder.clearInput();
}
