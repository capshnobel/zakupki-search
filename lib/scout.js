// Scout is responsible for completely processing one search request within a
// specified timeout. The timeout timer kicks in only when the scout is waiting for
// a remote server's response. The scout works in conjunction with the content
// script, which will communicate back results and how many more pages are there
// to process. It also will report errors.
(function() {
    var PageWorker = require('sdk/page-worker').Page,
        Data = require('sdk/self').data,
        emit = require('sdk/event/core').emit,
        querystring = require('sdk/querystring'),
        hash = require('./hash.min'),
        // Makes sure we're getting correct search parameters, each property
        // corresponds to an accepted parameter name whereas value contains
        // a function, which returns true or false depending on whether passed
        // parameter's value is correct or not
        queryParams = {
            index: function(i) {
                return Number(i);
            },
            useMorphology: function(um) {
                return "on" === um;
            },
            tabName: function(tn) {
                return /AS|AP|CW|FO|CO/.test(tn);
            },
            sortField: function(sf) {
                return /lastEventDate|contractPrice|publishDate/.test(sf);
            },
            lotView: function(lv) {
                return typeof lv !== 'undefined';
            },
            descending: function(d) {
                return typeof d !== 'undefined';
            }
        },
        baseURL = "http://zakupki.gov.ru/pgz/public/action/search/quick",
        // Will be used in events to identify scouts emitting them
        scoutInstanceId = 0,
        /**
         * Scout prototype object
         */
        Scout = {
            /**
             * Initializes newly created scout instance or resets existing one if
             * so requested(via "force" argument).
             */
            init: function(force) {
                var worker,
                    that = this;
                if(this.worker && !force) {
                    // already initialized
                    return this;
                } else if(this.worker && force) {
                    worker.destroy();
                }

                worker = PageWorker({
                    contentURL: "about:blank",
                    contentScriptFile: Data.url('scout-contentscript.js')
                });
                worker.on("error", function(error) {
                    console.error('[scout.error]', error);
                    worker.contentURL = 'about:blank';
                    that.emit("result", error && error.message, false);
                    this.emit("idle");
                });
                worker.port.on("result", Scout.onResult.bind(this));
                Object.defineProperties(this, {
                    worker: {
                        get: function() {
                            return worker;
                        }
                    }
                });

                console.info('[scout.init] scout', this.id, 'initialized');

                return this;
            },
            /**
             * Initiates a search for the given text. Cancels any previous 
             * ongoing search. As the search progresses, will be emitting 
             * results and status events.
             *
             * @param {String} searchText
             * @param {Object} [options]
             * @param {Boolean} [options.useMorphology=false]
             * @param {String} [options.sortField="lastEventDate"]
             * @param {String} [options.tabName="AP"]
             * @param {Boolean} [options.lotView=false]
             * @param {Boolean} [options.descending=true]
             */
            search: function(searchText, options) {
                if(!searchText) {
                    this.emit("result", "Search text is not provided", false);
                    this.emit("idle");
                    return;
                }

                console.info('[scout.search]', this.id, 'initiating search for',
                             searchText, 'using options', options);

                this.cancelSearch(true/* don't mark this worker idle */);

                this.searchText = searchText;
                this.options = options || {};
                this.worker.contentURL = buildSearchQuery(searchText, options);
            },
            /**
             * Cancels the on-going search. Does nothing if there is no such 
             * search currently on-going.
             * @param {Boolean} [shouldNotGoIdle=false]
             */
            cancelSearch: function(shouldNotGoIdle) {
                if(this.worker.contentURL !== 'about:blank') {
                    console.info('[scout.cancelSearch]', this.id,
                             'requested to cancel search',
                             this.worker.contentURL);
                    this.worker.contentURL = "about:blank";
                    this.emit("result", "Search cancelled", false/* failed */);
                    console.info('[scout.cancelSearch]', this.id,
                                 'cancelled search');
                    if(!shouldNotGoIdle) {
                        this.emit("idle");
                        console.info('[scout.cancelSearch]', this.id,
                                     'gone idle');
                    }
                }
            },

            /**
             * Sends an event to a target, specified during construction
             * @param {String} message
             * @param {Any} [data]
             * @param {Boolean} [success = true]
             */
            emit: function(message, data, success) {
                if(!message) return;

                if(typeof success === "undefined") {
                    success = true;
                }

                emit(this.eventTarget, message, {
                    scoutId: this.id,
                    success: success,
                    data: data
                });
            },
            /**
             * Callback, invoked by the scout content script when it finishes
             * processing a page. The results argument will contain an empty
             * array if no results were found, page argument will indicate
             * current page, whereas pages - total number of pages.
             *
             * @param {Object[]} results
             * @param {Number} [page]
             * @param {Number} [pages]
             * @param {String} [tabName] one of AS|AP|CW|FO|CO
             */
            onResult: function(results, page, pages, tabName) {
                if(!Array.isArray(results)) {
                    console.error('[scout.onResult]', this.id,
                                  ' received bogus results', arguments);
                    this.cancelSearch();
                    return;
                }

                // Report results
                console.info('[scout.onResult]', this.id, results.length,
                             'resuls from the content script. Page', page,
                             '/', pages, 'tab name', tabName);
                this.emit("result", results);

                // See if need to continue with the search
                if(page < pages) {
                    this.searchPage(page + 1, tabName);
                } else {
                    console.info('[scout.onResult]', this.id,
                                 'finished processing', pages,
                                 'page(s), going to idle');
                    // I am done, go back to idle again
                    this.worker.contentURL = "about:blank";
                    delete this.options;
                    delete this.searchText;
                    this.emit("idle");
                }
            },

            /**
             * Advances multipaged search to a given page.
             * @param {Number} page
             * @param {String} [tabName] one of AS|AP|CW|FO|CO
             */
            searchPage: function(page, tabName) {
                var pageURL;
                this.options.index = page;
                this.options.continuation = true;

                if(tabName) {
                    this.options.tabName = tabName;
                }

                // put some defaults in otherwise the server'll reject
                if(!this.options.hasOwnProperty("lotView")) {
                    this.options.lotView = false;
                }
                if(!this.options.hasOwnProperty("sortField")) {
                    this.options.sortField = "lastEventDate";
                }
                if(!this.options.hasOwnProperty("descending")) {
                    this.options.descending = true;
                }

                pageURL = buildSearchQuery(this.searchText, this.options);

                console.info('[scout.searchPage]', this.id, pageURL);

                this.worker.contentURL = pageURL;
            }
        };

    function md5hex(text) {
        return hash.hex(hash.md5(text));
    }

    /**
     * Create and return the search URL using parameters given.
     * @param {String} searchText
     * @param {Object} [options]
     * @param {Boolean} [options.continuation] set this to true if this is going
     * to be a continuation request, for example when navigating along pages of
     * the result. This will also generate ext= checksum parameter
     * @param {Boolean} [options.useMorphology] "on" enables it
     * @param {String} [options.sortField="lastEventDate"]
     * @param {String} [options.tabName="AP"]
     * @param {Boolean} [options.lotView=false]
     * @param {Boolean} [options.descending=true]
     * @param {Number} [options.index] which page of the results to query for
     * @returns {String} URL-escaped string
     * @private
     */
    function buildSearchQuery(searchText, options) {
        var queryArgs = {currentSearchString: searchText},
            query,
            wantChecksum = options && options.continuation,
            action = wantChecksum ? '/result?' : '/run?',
            url = baseURL + action,
            checksum;
        if(typeof options === 'object') {
            Object.keys(queryParams).forEach(function(param) {
                var givenParamVal = options[param];
                if(queryParams[param](givenParamVal)) {
                    queryArgs[param] = givenParamVal;
                }
            });
        }

        query = querystring.stringify(queryArgs);
        if(wantChecksum) {
            query += '&ext=' + md5hex(url + query + '&ext=');
        }

        return url + query;
    }

    /**
     * Creates an instance of the Scout with a given event target.
     * Will emit search related events against given target.
     *
     * @param {EventTarget} Event target object
     * @type Scout
     * @exception Error throws when eventTarget argument is omitted.
     */
    function newScout(eventTarget, timeoutSecs) {
        var instanceId = scoutInstanceId++;

        if(!eventTarget)
            throw "[newScout] eventTarget argument is required";

        return Object.create(Scout, {
            /** @fieldOf Scout# */
            id: {
                get: function() { return instanceId; }
            },
            /** @fieldOf Scout# */
            eventTarget: {
                get: function() { return eventTarget; }
            },
            /** @fieldOf Scout# */
            isIdle: {
                get: function() {
                    return this.worker && !this.worker.contentURL;
                }
            }
        }).init();
    }

    exports.newScout = newScout;
})();
