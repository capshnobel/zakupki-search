(function() {
    var Prefs = require("sdk/simple-prefs").prefs,
        Data = require('sdk/self').data,
        Page = require('sdk/page-worker').Page,
        Notifications = require("sdk/notifications"),
        { figureTextObfuscationStatus,
          generateObfuscatedText } = require('./latcyr'),
        panel = require('sdk/panel').Panel({
            width: Prefs.panelWidth || 900,
            height: Prefs.panelHeight || 600,
            contentURL: Data.url('search-panel.html'),
            contentScriptFile: Data.url('search-panel.js')
        }),
        widget = require('widget').Widget({
            id: "rospil",
            label: "Поиск госзаказов",
            content: "<strong>З</strong>акупки",
            width: 60,
            panel: panel
        }),
        scoutLeader = require('./scout-leader'),
        totalTasks = 0;

    scoutLeader.on("result", function(results) {
        panel.port.emit("result", results);
    });
    scoutLeader.on("progress", function(remainingTasks) {
        panel.port.emit("progress", totalTasks-remainingTasks, totalTasks);
    });
    scoutLeader.on("finished", function(status) {
        totalTasks = 0;
        panel.port.emit("finished", status);
        if(!panel.isShowing) {
            status = status === "Cancelled" ? "отменой"     :
                     status === "Timeout"   ? "тайм-аутом"  :
                     status === "Completed" ? "успешно"     :
                     "ничем";
            Notifications.notify({
                title: "Роспил: поиск закончился " + status
            });
        }
    });

    panel.port.on("search", function(term, options) {
        var terms = [term];

        if(options && options.useLat) {
            terms.push.apply(terms, generateObfuscatedText(term));
        }

        if(options && options.useOnlyLat) {
            terms.shift();
        }

        totalTasks = terms.length;
        panel.port.emit("progress", 0, totalTasks);
        scoutLeader.startSearch(terms, options);
    });
    panel.port.on("cancel", function() {
        scoutLeader.cancelSearch();
    });
})();