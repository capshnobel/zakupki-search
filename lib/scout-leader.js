/**
 * Scout leader distributes work among scouts, updates upstream via events
 * as the search progresses.
 *
 * Events:
 *  result({Object[]} results)
 *  progress({Number} remainingTasks)
 *  finished({String} [status])
 *
 *
 * Example:
 *  var scoutLeader = require('./scout-leader');
 *  scoutLeader.on("result", function(results) {...});
 *  scoutLeader.on("progress", function(remainingTasks) {...});
 *  scoutLeader.on("finished", function(status) {...});
 *
 *  scoutLeader.startSearch(['золото', 'брильянты', 'корона Российской Империи'])
 */
(function() {
    var config = require('sdk/simple-prefs'),
        prefs = config.prefs,
        scoutLeader = require('sdk/event/target').EventTarget(),
        { emit, on, once, off } = require("sdk/event/core"),
        timers = require("sdk/timers"),
        scout = require('./scout'),
        scouts = {},
        idleScouts = {},
        busyScouts = {},
        workQueue = [],
        searchOptions,
        scoutTimeoutSecs = prefs.scoutTimeoutSecs || 60,
        reapTimedoutScoutsIntervalId;
    /**
     * Initiates the search with a given array of strings to search and a search
     * options object.
     *
     * @param {String[]} searchStrings
     * @param {Object} [searchOpts]
     * @param {String} searchOpts.tabName one of: "AP", "CW", "CO", "FO", "AS"
     * where:
     *  AP - "Подача заявок"
     *  CW - "Работа комиссии"
     *  FO - "Размещение завершено"
     *  CO - "Размещение отменено"
     *  AS - "Все этапы"
     * @param {Boolean} searchOpts.lotView true means "Отобразить в разрезе лотов"
     * @param {Boolean} searchOpts.useMorphology true means "С учетом всех форм слов"
     */
    function startSearch(searchStrings, searchOpts) {
        if(!Array.isArray(searchStrings)) {
            console.error('[scoutLeader.startSearch] wrong searchStrings',
                          searchStrings);

            emit(exports, "finished", "Bad search arguments",
                 true/*indicates error*/);

            return;
        }

        Array.prototype.push.apply(workQueue, searchStrings);
        // If there are idling scouts send them off to work
        Object.keys(idleScouts).some(function(id) {
            var term = workQueue.pop(),
                s = idleScouts[id];

            if(!term) { // Stop iterating as we run out of search terms
                return true;
            }
            // Remove from idling container
            delete idleScouts[id];
            // Add to busy container
            busyScouts[id] = {
                scout: s,
                updated: Date.now()
            };
            // Make it work
            s.search(term, searchOpts);

            return false;
        });

        // Launch the reaper
        if(!reapTimedoutScoutsIntervalId) {
            reapTimedoutScoutsIntervalId =
                timers.setInterval(reapTimedoutScouts, 1000);
        }
    }

    /**
     * Cancels a search in progress. Has no effect if no search is currently in
     * progress.
     */
    function cancelSearch() {
        Object.keys(busyScouts).forEach(function(id) {
            var s = scouts[id];
            if(s) {
                // This should effectively cause the scout to emit an 'idle' event
                // which we handle in this object
                s.cancelSearch();
            } else {
                console.info('[scoutLeader.cancelSearch] scout', id,
                             'does not exist?');
            }
        });

        timers.clearInterval(reapTimedoutScoutsIntervalId);
        reapTimedoutScoutsIntervalId = undefined;

        emit(exports, "finished", "Cancelled");
    }

    /**
     * Among the busy scouts finds those, which have not interacted for a timeout
     * period and cancel them.
     */
    function reapTimedoutScouts() {
        Object.keys(busyScouts).forEach(function(id) {
            var sCard = busyScouts[id];
            if(sCard) {
                if(Date.now() - sCard.updated > scoutTimeoutSecs * 1000) {
                    if(sCard.attemptedToCancel) {
                        console.error('[scoutLeader.reaper] Scout', id,
                                      'disobeyed cancelSearch, forcing out');

                        sCard.scout.init(true); // Force page worker recycle
                        delete busyScouts[id];
                        idleScouts[id] = sCard.scout;

                        // If all busy scouts force-reaped, issue a
                        // "finished" event
                        if(Object.keys(busyScouts).length === 0) {
                            console.warn('[scoutLeader.reaper] All scouts',
                                         'timed out');
                            emit(exports, "finished", "Timeout");

                            // Stop the reaper
                            timers.clearInterval(reapTimedoutScoutsIntervalId);
                            reapTimedoutScoutsIntervalId = undefined;
                        }
                    } else {
                        sCard.scout.cancelSearch();
                        sCard.attemptedToCancel = true;
                        console.warn('[scoutLeader.reaper] Asked timed out',
                                     'scout', id, 'to cancelSearch politely');
                    }

                    progressUpdate();
                }
            }
        });
    }

    /**
     * Sends a progress update event upstream. The event contains one numeric
     * attribute - a remaining number of outstanding tasks.
     */
    function progressUpdate() {
        emit(exports, "progress",
             workQueue.length + Object.keys(busyScouts).length);
    }

    scoutLeader.on("result", function(event) {
        var id = event.scoutId,
            results = event.data,
            success = event.success,
            sCard = busyScouts[id];

        if(!success) {
            console.warn('[scoutLeader.result] Scout', id,
                         'reported unsuccessful result', results);
            progressUpdate();
            return;
        }

        if(Array.isArray(results) && results.length > 0) {
            // Update scout's score card, if it's there still. It could be out of
            // the busy container if finished already and went to idle.
            if(sCard) {
                sCard.updated = Date.now();
            }

            // Send the results up
            emit(exports, "result", results);
        } else {
            console.warn('[scoutLeader.result] Scout', id,
                         'returned incorrect or empty results:',
                         results);
        }

        progressUpdate();
    });
    scoutLeader.on("error", function(event) {
        console.error('[scoutLeader.onError]', event);
    });
    scoutLeader.on("idle", function(event) {
        var id = event.scoutId,
            s = scouts[id],
            sCard = busyScouts[id];

        if(workQueue.length === 0) {
            delete busyScouts[id];
            idleScouts[id] = s;
        }

        if(Object.keys(busyScouts).length === 0) {
            emit(exports, "finished", "Completed");

            timers.clearInterval(reapTimedoutScoutsIntervalId);
            reapTimedoutScoutsIntervalId = undefined;

            progressUpdate();

            return;
        }

        if(workQueue.length === 0) {
            progressUpdate();

            return;
        }

        // It should be among the busy ones, but if it is not, add it in
        if(!busyScouts.hasOwnProperty(id)) {
            console.warn('[scoutLeader.idle] Scout', id,
                         'was not found among busy scouts');
            sCard = busyScouts[id] = {
                scout: s
            };
        }

        sCard.updated = Date.now();
        s.search(workQueue.pop(), searchOptions);

        progressUpdate();
    });

    (function() {
        var i = 0,
            scoutCount = prefs.scoutCount || 5,
            s;
        for(; i < scoutCount; ++i) {
            s = scout.newScout(scoutLeader);
            idleScouts[s.id] = scouts[s.id] = s;
        }
    })();

    config.on("scoutCount", function(newScoutCount) {
        var scoutIds = Object.keys(scouts),
            diff = newScoutCount - scoutIds.length,
            i,
            s;

        if(newScoutCount <= 0) return /* Ignore bullshit */;

        console.info('[scoutLeader.onScoutCount] changing number of scouts from',
                     scoutIds.length, 'to', newScoutCount);

        if(diff > 0) {
            for(; i < scoutCount; ++i) {
                s = scout.newScout(scoutLeader);
                idleScouts[s.id] = scouts[s.id] = s;
            }
        } else if(diff < 0) {
            scoutIds = scoutIds.slice(-diff);
            scoutIds.forEach(function(id) {
                s = scouts[id];
                delete scouts[id];
                delete idleScouts[id];
                if(busyScouts.hasOwnProperty(id)) {
                    busyScouts[id].destroyOnceIdle = true;
                }
            });
        }
    });

    exports.on = on.bind(null, exports);
    exports.once = once.bind(null, exports);
    exports.removeListener = function(type, listener) {
        off(exports, type, listener);
    };

    exports.startSearch = startSearch;
    exports.cancelSearch = cancelSearch;
})();
