/**
 * Scouts attached page for results. Emits the following event:
 *  result({Object[]} results, {Number} page, {Number pages}, {String} tabName)
 */
(function() {
    var qsa = document.querySelectorAll.bind(document),
        pageRx = /index=(\d+)/,
        tabRx = /paginateTab\((\d+)\)/,
        stageRx = /changeTab\('(\w+)'/,
        stages = {"AS": "Все этапы",
                  "AP": "Подача заявок",
                  "CW": "Работа комиссии",
                  "FO": "Размещение завершено",
                  "CO": "Размещение отменено"},
        resultRows = qsa('div#searchResultContainer tr.searchResultTableRow'),
        pagesInfo = qsa('a[onclick^="paginateTab"]'),
        page = getCurrentPage(resultRows.length > 0),
        totalPages = getTotalPages(pagesInfo),
        tabName = findResultsStage(),
        results = extractResults(resultRows);

    /**
     * Figures out, from the underlying result document, which stage results
     * are in(corresponds to a tab on the results page).
     *
     * @returns {String} current stage or undefined if couldn't figure out
     * current stage.
     */
    function findResultsStage() {
        var res = qsa('div#searchResultContainer td.navigationLineElement > a'),
            tabNames = Object.keys(stages),
            i = 0,
            match,
            si = -1;

        if(!(res && res.length > 0))
            return undefined;

        for(; i < res.length; ++i) {
            match = stageRx.exec(res.item(i).onclick);
            if(!(match && match.length === 2)) {
                continue;
            }

            si = tabNames.indexOf(match[1]);
            if(si !== -1) {
                tabNames.splice(si, 1);
            }
        }

        if(tabNames.length !== 1) {
            console.warn('[scout-content.findResultsStage] expected only one',
                         'stage left, but got', tabNames.join());
            return undefined;
        }

        return tabNames[0];
    }


    function printResults(results) {
        if(Array.isArray(results)) {
            results.forEach(function(res) {
                var record = [],
                    notifications = res.notifications;

                record.push('|', 'stage', res.stage);

                if(Array.isArray(notifications)) {
                    record.push('|');
                    notifications.forEach(function(n, i) {
                        record.push('notifications['+i+'].title', n.title, ',');
                        record.push('notifications['+i+'].url', n.url);
                    });
                }

                record.push('|', 'order.title', res.order.title, ',');
                record.push('order.detail.title', res.order.detail.title, ',');
                record.push('order.detail.url', res.order.detail.url, ',');
                record.push('order.org.title', res.order.org.title, ',');
                record.push('order.org.url', res.order.org.url);

                record.push('|', 'pubDate', res.pubDate);
                record.push('|', 'initPrice', res.initPrice);

                record.push('|', 'lastEvent.title', res.lastEvent.title, ',');
                record.push('lastEvent.url', res.lastEvent.url);

                console.info.apply(console, record);
            });
        }
    }

    /**
     * @returns an array of result objects. Each result object is of the
     * following layout:
     *
     *  {String}  stage
     *  {Link[]} notifications corresponds to the first results column
     *     {String} [Link.url]      Notification URL. Certain notifications
     *                              will not have them.
     *     {String} Link.title      Readable notification name
     *  {OrderInfo} order           Order information object
     *    {String}  order.title     I.e. "Открытый аукцион", "Запрос котировок"
     *                              "№ 0373100063712000021"
     *    {Link}    order.detail    Order description and URL
     *    {Link}    order.org       Organization
     *    {String}
     *  {String}    pubDate         I.e. "Опубликовано"
     *  {Number}    initPrice       I.e. "Начальная цена"
     *  {Link}      lastEvent       I.e. "Последнее событие при размещении заказа"
     *
     * @param {NodeList} resultRows NodeList of HTMLTableRowElement objects
     */
    function extractResults(resultRows) {
        var results = [],
            rowsCount = resultRows.length,
            r = 0,
            row;

        // console.info('[scout-content.extractResults] found',
        //              rowsCount, 'results');

        for(; r < rowsCount; ++r) {
            row = resultRows.item(r);
            results.push({
                stage: stages[tabName],
                notifications: createNotifications(row.cells.item(0)),
                order: createOrderInfo(row.cells.item(1)),
                pubDate: createPublishedDate(row.cells.item(2)),
                initPrice: createInitialPrice(row.cells.item(3)),
                lastEvent: createLastEvent(row.cells.item(4))
            });
        }

        // Print results for debugging
        // printResults(results);

        return results;
    }

    /**
     * The cell contains a table, each row representing one notification link or
     * an info-label
     *
     * @param {HTMLTableCellElement} nCell
     * @param {}
     */
    function createNotifications(nCell) {
        var notiAElems = nCell.querySelectorAll('td > a.iceCmdLnk'),
            notiSpanElems = nCell.querySelectorAll('td > span > span'),
            i = 0,
            elem,
            result = [];

        for(; i < notiAElems.length; ++i) {
            elem = notiAElems.item(i);
            result.push({
                url: elem.href,
                title: elem.text
            });
        }

        for(i = 0; i < notiSpanElems.length; ++i) {
            elem = notiSpanElems.item(i);
            result.push({
                title: elem.textContent
            });
        }

        return result;
    }

    /**
     * The cell typically contains a three-row table: order heading,
     * description, and organization information.
     */
    function createOrderInfo(oiCell) {
        var rows = oiCell.firstChild.rows,
            ordInfo = rows.item(0),
            descInfo = rows.item(1),
            orgInfo = rows.item(2),
            order = {},
            a;

        // Order heading
        if(ordInfo) {
            order.title = ordInfo.textContent.replace(/\xA0/g, ' ');
        }

        // Order description
        if(descInfo) {
            a = descInfo.querySelector('a');
            if(a) {
                order.detail = {url: a.href, title: a.text};
            }
        }

        // Organization info
        if(orgInfo) {
            a = orgInfo.querySelector('a');
            if(a) {
                order.org = {url: a.href, title: a.text};
            }
        }

        return order;
    }

    /**
     * @return date as string
     */
    function createPublishedDate(pdCell) {
        return pdCell.textContent;
    }

    /**
     * @returns numerical value, representing the price or NaN if no
     * price were specified.
     */
    function createInitialPrice(ipCell) {
        var price = ipCell.textContent.replace(/\s/g, '').replace(',', '.');
        return Number(price);
    }

    /**
     * @returns {Link} link object or null if could not parse the event out.
     */
    function createLastEvent(leCell) {
        var a = leCell.querySelector('a');

        return a ? {url: a.href, title: a.text} : null;
    }

    /**
     * @returns current page or 0 if couldn't figure out
     */
    function getCurrentPage(hasResults) {
        var page = hasResults ? 1 : 0,
            indexInfo;
        if(window.location.search) {
            indexInfo = pageRx.exec(window.location.search);
            if(indexInfo && indexInfo.length === 2) {
                page = Number(indexInfo[1]) || 0;
            }
        }

        return page;
    }

    /**
     * @returns last page number of the result set or 0 if could not figure
     * the last page out.
     */
    function getTotalPages(pagesInfo) {
        var lastPage = 0,
            i = 0,
            a,
            onclick,
            tabInfo,
            page;
        for(; i < pagesInfo.length; ++i) {
            a = pagesInfo.item(i);
            onclick = a.getAttribute('onclick');
            if(onclick) {
                tabInfo = tabRx.exec(onclick);
                if(tabInfo && tabInfo.length === 2) {
                    page = Number(tabInfo[1]) || 0;
                    if(page > lastPage) {
                        lastPage = page;
                    }
                }
            }
        }

        return lastPage;
    }

    if(window.location.href !== "about:blank") {
        console.info('[scout-content] hit page', window.location.href);
        self.port.emit("result", results, page, totalPages, tabName);
    }
})();
