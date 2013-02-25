(function() {
    var search = document.getElementById('search'),
        find = document.getElementById('find'),
        cancel = document.querySelector('#status button'),
        tbody = document.querySelector('#results tbody'),
        footer = document.querySelector('article footer'),
        resCounter = document.querySelector('caption sup'),
        status = document.getElementById('status'),
        progress = document.querySelector('#status progress'),
        useMorphology = document.getElementById('useMorphology'),
        useLat = document.getElementById('useLat'),
        useOnlyLat = document.getElementById('useOnlyLat'),
        searchOptions = (self.options && self.options.searchOptions) || {},
        inProgress = false;

    self.port.on("result", function(results) {
        console.info('[search-panel.results] got', results.length, 'results');
        if(!Array.isArray(results)) return;

        results.forEach(function(res) {
            addResult(res);
        });

        resCounter.innerHTML = "&nbsp;<span>" + tbody.rows.length + "</span>";
    });

    self.port.on("finished", function(state) {
        console.info('[search-panel.finished] state', state);
        inProgress = false;

        status.style.display = 'none';
        search.disabled = false;

        enableFooterInputs(tbody.rows.length > 0);
    });

    self.port.on("progress", function(remainingTasks, totalTasks) {
        progress.max = totalTasks;
        progress.value = remainingTasks;
    });

    if(search) {
        search.addEventListener('keyup', function(ev) {
            var term = search.value.trim();
            if(!inProgress && ev.keyCode === 13 && term) {

                console.info('[search-panel.keyup] searching for', term,
                             'using options',
                             Object.keys(searchOptions).join());

                inProgress = true;
                search.disabled = true;

                deleteResults();

                status.style.display = 'block';
                enableStages(true);
                enableFooterInputs(false);
                self.port.emit("search", term, searchOptions);
            }
        });
    }

    if(footer) {
        footer.addEventListener("change", function(e) {
            var input = e.target,
                checkbox = input.type === 'checkbox',
                attr = checkbox ? 'data-filterstage' : 'data-filtertext',
                value = input.value.trim();
            filterResults(value, attr, function(found, orgVal) {
                return checkbox ? (found ? !input.checked : orgVal) : !found;
            });
        });
    }

    if(cancel) {
        cancel.addEventListener('click', function() {
            self.port.emit('cancel');
        });
    }

    useMorphology.addEventListener('change', function(e) {
        var input = e.target;
        if(input.checked) {
            searchOptions.useMorphology = 'on';
        } else {
            delete searchOptions.useMorphology;
        }
    });

    useLat.addEventListener('change', function(e) {
        var input = e.target;
        if(input.checked) {
            searchOptions.useLat = true;
            useOnlyLat.disabled = false;
        } else {
            useOnlyLat.checked = false;
            useOnlyLat.disabled = true;
            useMorphology.disabled = false;
            delete searchOptions.useLat;
        }
    });

    useOnlyLat.addEventListener('change', function(e) {
        var input = e.target;
        if(input.checked) {
            searchOptions.useOnlyLat = true;
            useMorphology.checked = false;
            useMorphology.disabled = true;
        } else {
            useMorphology.disabled = false;
            delete searchOptions.useOnlyLat;
        }
    });

    function deleteResults() {
        while(tbody.rows.length > 0) {
            tbody.deleteRow(-1);
        }

        resCounter.innerHTML = "";
    }

    function addCell(tr, data, cssClass) {
        var td = tr.insertCell(-1),
            contentElement;

        if(typeof(data) === 'string') {
            contentElement = document.createTextNode(data);

        } else {// assume data is a DOM node object
            contentElement = data;
        }

        td.appendChild(contentElement);

        if(cssClass) {
            td.className = cssClass;
        }
    }

    function createAnchor(link) {
        var a = document.createElement('a'),
            text = document.createTextNode(link.title);

        a.target = '_blank';
        a.appendChild(text);
        if(link.url)
            a.href = link.url;

        return a;
    }

    function addResult(res) {
        var tr = tbody.insertRow(-1),
            notif;

        tr.setAttribute("data-filtertext", "false");
        tr.setAttribute("data-filterstage", "false");

        addCell(tr, res.stage || "");
        addCell(tr, '' + (res.initPrice||"нет"), "flush-right");
        addCell(tr, res.order.title);
        addCell(tr, createAnchor(res.order.detail));
        addCell(tr, createAnchor(res.order.org));
        addCell(tr, res.pubDate);
        addCell(tr, createAnchor(res.lastEvent));

        if(res.notifications && res.notifications.length > 0) {
            notif = document.createDocumentFragment();
            res.notifications.forEach(function(n, i, c) {
                notif.appendChild(createAnchor(n));
                if(i < c.length - 1) {
                    notif.appendChild(document.createElement('br'));
                }
            });

            addCell(tr, notif);
        } else {
            addCell(tr, '');
        }
    }

    function enableStages(enable) {
        var inputs = footer.querySelectorAll('input[type="checkbox"]'),
            i = 0;
        for(; i < inputs.length; ++i) {
            inputs.item(i).checked = enable;
        }
    }

    function enableFooterInputs(enable) {
        var inputs = footer.querySelectorAll('input'),
            i = 0;
        for(; i < inputs.length; ++i) {
            inputs.item(i).disabled = !enable;
        }
    }

    function filterResults(text, attr, func) {
        var i,
            row,
            found;
        for(i = 0; i < tbody.rows.length; ++i) {
            row = tbody.rows.item(i);
            found = row.textContent.indexOf(text) !== -1;
            row.setAttribute(attr, '' + func(found, row.getAttribute(attr)));
        }
    }
})();