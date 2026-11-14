(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var api = typeof global.MovieBoxAPI === 'function' ? new global.MovieBoxAPI() : global.MovieBoxAPI;
  var state;
  function readLibrary(name) { var text = localStorage.getItem(name); if (!text) return null; var value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value) || (value.saved && (typeof value.saved !== 'object' || Array.isArray(value.saved))) || (value.history && (typeof value.history !== 'object' || Array.isArray(value.history)))) throw new Error('Invalid library'); return value; }
  try { state = readLibrary('moviebox-tv-library'); } catch (_) { state = null; }
  if (!state) { try { state = readLibrary('moviebox-tv-library-backup'); } catch (_) { state = null; } }
  state = state || {};
  state.history = state.history || {}; state.saved = state.saved || {}; state.settings = Object.assign({quality:'auto',language:'en',subtitles:true,autoplay:true},state.settings || {}); state.subtitleTracks = state.subtitleTracks || {}; state.audioPreferences = state.audioPreferences || {};
  state.settings.theme = global.MovieBoxThemes.apply(global.MovieBoxInitialTheme || state.settings.theme);
  var catalogueStore = new global.MovieBoxCatalogueCache(), activeCatalogueKey = '', pendingCatalogueKey = '';
  var historyEditing = false, historySelected = {}, historyUndo = {};
  var catalogDisplayed = 0;
  var current = null, detail = null, season = 0, episode = 0, episodeNumbers = [], lastCatalog = [], homeTitles = [], searchPage = 1, searchWord = '', moreAvailable = false, screen = 'browse', route = 'home', generation = 0, toastTimer, searchTimer, streamCache = {}, playerSelection = null, returnFocus = null;
  var persistenceMetrics = {writes:0,skippedUnchanged:0,lastSerializeMs:0,maxWriteMs:0,bytes:0};
  var persistDirty = false, persistTimer = null, persistDue = 0, lastPersisted = '', historyIndex = {};
  function librarySubject(subject) {
    if (!subject) return subject;
    var result = {};
    ['subjectId','subjectType','title','releaseDate','imdbRatingValue','corner'].forEach(function (name) { if (subject[name] !== undefined) result[name] = subject[name]; });
    if (subject.cover) result.cover = typeof subject.cover === 'string' ? subject.cover : {url:subject.cover.url,width:subject.cover.width,height:subject.cover.height,thumbnail:subject.cover.thumbnail};
    return result;
  }
  Object.keys(state.history).forEach(function (id) { var entry = state.history[id]; entry.subject = librarySubject(entry.subject); if (!entry.subject) return; var subjectId = String(entry.subject.subjectId); if (!historyIndex[subjectId] || historyIndex[subjectId].updated < entry.updated) historyIndex[subjectId] = entry; });
  Object.keys(state.saved).forEach(function (id) { state.saved[id] = librarySubject(state.saved[id]); });
  function flushPersistence() {
    if (!persistDirty) return;
    clearTimeout(persistTimer); persistTimer = null; persistDue = 0;
    var started = performance.now();
    try {
      var serialized = JSON.stringify(state); persistenceMetrics.lastSerializeMs = performance.now() - started;
      if (serialized !== lastPersisted) { localStorage.setItem('moviebox-tv-library',serialized); localStorage.setItem('moviebox-tv-library-backup',serialized); lastPersisted = serialized; persistenceMetrics.writes++; persistenceMetrics.bytes = serialized.length; }
      else persistenceMetrics.skippedUnchanged++;
      persistDirty = false; persistenceMetrics.maxWriteMs = Math.max(persistenceMetrics.maxWriteMs,performance.now() - started);
    } catch (_) { toast('The TV’s local storage is full. Some preferences could not be saved.'); }
  }
  function persist(immediate, historyOnly) {
    persistDirty = true;
    if (immediate === true) { flushPersistence(); return; }
    var delay = historyOnly ? 4000 : 300, due = Date.now() + delay;
    if (persistTimer && persistDue <= due) return;
    clearTimeout(persistTimer); persistDue = due;
    persistTimer = setTimeout(function () { persistTimer = null; if (global.requestIdleCallback) requestIdleCallback(flushPersistence,{timeout:500}); else flushPersistence(); },delay);
  }
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('toast').hidden = true; },6500); }
  function number(value) { return Math.max(0, Number(value) || 0); }
  function key(subject, se, ep) { return String(subject.subjectId) + ':' + number(se) + ':' + number(ep); }
  function currentKey() { return current ? key(current,season,episode) : ''; }
  function image(subject, name, width) { return global.MovieBoxArtwork.url(subject,name || 'cover',width || 360); }
  function time(value) { var seconds = Math.floor((Number(value) || 0) / 1000); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,'0'); }
  function allSubjects(value) { var result = [], seen = {}; function visit(node, depth) { if (!node || depth > 8) return; if (Array.isArray(node)) { node.forEach(function (item) { visit(item,depth + 1); }); return; } if (typeof node !== 'object') return; if (node.subjectId && node.title && !seen[String(node.subjectId)]) { seen[String(node.subjectId)] = true; result.push(node); return; } ['subject','subjects','items','subjectList','operatingList','list','data','tabs'].forEach(function (field) { if (node[field]) visit(node[field],depth + 1); }); } visit(value,0); return result; }
  function setNav(name) { route = name; Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'),function (button) { button.classList.toggle('active',button.dataset.nav === name); }); }
  function showPage(name) { screen = name; ['browse','detail','settings'].forEach(function (page) { $(page + '-page').hidden = page !== name; }); $('app-shell').hidden = name === 'player'; $('player-page').hidden = name !== 'player'; if (name === 'player') navigation.scope($('player-page')); else navigation.scope($('app-shell')); $('main-content').scrollTop = 0; if (releases) renderUpdates(); }
  function empty(message) { if (artworkObserver) artworkObserver.disconnect(); $('catalog').textContent = ''; $('empty-state').hidden = false; $('empty-message').textContent = message; $('catalog-count').textContent = ''; }
  function progressFor(subject) { return historyIndex[String(subject.subjectId)]; }
  function poster(subject) {
    var button = document.createElement('button'); button.className = 'poster-card'; button.dataset.subjectId = String(subject.subjectId); button.setAttribute('aria-label',subject.title);
    var art = document.createElement('div'); art.className = 'poster-art'; var source = image(subject,'cover',300); if (source) { var img = document.createElement('img'); img.dataset.src = source; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = 300; img.height = 450; img.onerror = function () { this.remove(); }; art.appendChild(img); }
    var badge = subject.corner || (number(subject.subjectType) === 2 ? 'SERIES' : 'MOVIE'); var badgeNode = document.createElement('span'); badgeNode.className = 'poster-badge'; badgeNode.textContent = badge; art.appendChild(badgeNode);
    var history = progressFor(subject); if (history && history.duration > 0) { var bar = document.createElement('span'); bar.className = 'poster-progress'; bar.style.width = Math.min(100,history.position / history.duration * 100) + '%'; art.appendChild(bar); }
    var title = document.createElement('div'); title.className = 'poster-title'; title.textContent = subject.title;
    var meta = document.createElement('div'); meta.className = 'poster-meta'; meta.textContent = [String(subject.releaseDate || '').slice(0,4),subject.imdbRatingValue ? 'IMDb ' + subject.imdbRatingValue : ''].filter(Boolean).join(' · ');
    button.appendChild(art); button.appendChild(title); button.appendChild(meta); button.onclick = function () { if (historyEditing && route === 'history') { var id = String(subject.subjectId); if (historySelected[id]) delete historySelected[id]; else historySelected[id] = true; updateHistoryTools(); return; } returnFocus = button; openDetail(subject); }; if (historyEditing && route === 'history') { button.classList.add('is-selecting'); button.classList.toggle('is-selected',!!historySelected[String(subject.subjectId)]); button.setAttribute('aria-pressed',String(!!historySelected[String(subject.subjectId)])); } return button;
  }
  var artworkObserver = global.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { if (entry.isIntersecting) { var img = entry.target; artworkObserver.unobserve(img); if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; } } });
  },{root:$('main-content'),rootMargin:'120px 0px'}) : null;
  function observeArtwork() {
    Array.prototype.forEach.call($('catalog').querySelectorAll('img[data-src]'),function (img) { if (artworkObserver) artworkObserver.observe(img); else { img.src = img.dataset.src; delete img.dataset.src; } });
  }
  function renderCatalogBatch() {
    var end = Math.min(lastCatalog.length,catalogDisplayed + 12), fragment = document.createDocumentFragment();
    for (var i = catalogDisplayed; i < end; i++) fragment.appendChild(poster(lastCatalog[i]));
    $('catalog').appendChild(fragment); catalogDisplayed = end; observeArtwork();
    $('catalog-count').textContent = catalogDisplayed < lastCatalog.length ? catalogDisplayed + ' of ' + lastCatalog.length + ' titles' : lastCatalog.length + ' titles';
    $('more-button').hidden = catalogDisplayed >= lastCatalog.length && !moreAvailable;
    $('more-button').textContent = catalogDisplayed < lastCatalog.length ? 'Show more titles' : 'Find more results';
    if (navigation) navigation.invalidate();
  }
  function renderCatalog(titles, append) {
    $('empty-state').hidden = true;
    if (!append) { if (artworkObserver) artworkObserver.disconnect(); $('catalog').textContent = ''; lastCatalog = []; catalogDisplayed = 0; }
    var seen = {}; lastCatalog.forEach(function (subject) { seen[String(subject.subjectId)] = true; });
    titles.forEach(function (subject) { if (!seen[String(subject.subjectId)]) { seen[String(subject.subjectId)] = true; lastCatalog.push(subject); } });
    renderCatalogBatch();
    if (!lastCatalog.length) empty(route === 'saved' ? 'Add a title to My list and it will be waiting here.' : route === 'history' ? 'Start watching a title. Your place will be saved automatically.' : 'No matching titles. Try another search.');
  }

  var heroArtworkEpoch = 0;
  function renderHero(subject) {
    $('hero').hidden = !subject || route !== 'home'; if (!subject) return;
    $('hero-title').textContent = subject.title;
    $('hero-description').textContent = [String(subject.releaseDate || '').slice(0,4),Number(subject.subjectType) === 2 ? 'TV Show' : 'Movie',subject.genre].filter(Boolean).join(' · ');
    var url = image(subject,'stills',960) || image(subject,'cover',960), epoch = ++heroArtworkEpoch;
    $('hero-art').style.backgroundImage = '';
    if (url) { var art = new Image(); art.onload = function () { if (epoch === heroArtworkEpoch) $('hero-art').style.backgroundImage = 'url("' + url.replace(/["\\\n\r]/g,'') + '")'; }; art.src = url; }
    $('hero-watch').onclick = function () { returnFocus = $('hero-watch'); openDetail(subject,true); };
    $('hero-info').onclick = function () { returnFocus = $('hero-info'); openDetail(subject); };
  }
  var carousel = new global.MovieBoxCarousel({
    interacting:function () { return $('hero').contains(document.activeElement); },
    canRotate:function () { return route === 'home' && screen === 'browse' && !document.hidden && !player.active && !$('hero').hidden && !$('hero').contains(document.activeElement) && !$('hero').matches(':hover') && !matchMedia('(prefers-reduced-motion: reduce)').matches; },
    render:function (subject,index,total,paused) { renderHero(subject); $('hero-counter').textContent = (index+1) + ' / ' + total; $('hero-pause').textContent = paused ? '▶' : 'Ⅱ'; $('hero-pause').setAttribute('aria-label',paused ? 'Resume slideshow' : 'Pause slideshow'); if (navigation) navigation.invalidate(); }
  });
  $('hero-previous').onclick = function () { carousel.move(-1); };
  $('hero-next').onclick = function () { carousel.move(1); };
  $('hero-pause').onclick = function () { carousel.toggle(); };

  var cataloguePage = 1, catalogueNextPage = 2, catalogueBusy = false, catalogueRequest = 0, catalogueSelected = {}, catalogueCache = {};
  function isCatalogue() { return route === 'movies' || route === 'tv'; }
  function configureFilters(kind) {
    var schema = global.MovieBoxCatalogue.schema.channels[kind], remembered = (state.catalogueFilters || {})[kind] || {};
    $('catalogue-filter-fields').textContent = '';
    schema.filters.concat([{key:'minRating',label:'Minimum rating',options:[{value:'',label:'Any rating'},{value:'6',label:'6+'},{value:'7',label:'7+'},{value:'8',label:'8+'},{value:'9',label:'9+'}]}]).forEach(function (field) {
      var label = document.createElement('label'); label.textContent = field.label;
      var select = document.createElement('select'); select.id = 'filter-' + field.key; select.dataset.filter = field.key; select.setAttribute('aria-label',field.label);
      field.options.forEach(function (option) { select.add(new Option(option.value === 'ForYou' ? 'For you' : option.label,option.value)); });
      if (field.options.some(function (option) { return option.value === remembered[field.key]; })) select.value = remembered[field.key];
      label.appendChild(select); $('catalogue-filter-fields').appendChild(label);
    });
    catalogueSelected = readFilters();
  }
  function readFilters() { var filters = {}; Array.prototype.forEach.call($('catalogue-filter-fields').querySelectorAll('select'),function (select) { filters[select.dataset.filter] = select.value; }); return filters; }
  function captureCatalogueView() {
    if (!isCatalogue() || screen !== 'browse' || !activeCatalogueKey || pendingCatalogueKey === activeCatalogueKey) return;
    var cached=catalogueStore.get(activeCatalogueKey);if(!cached)return;
    cached.scroll=$('main-content').scrollTop;cached.displayed=catalogDisplayed;catalogueStore.put(activeCatalogueKey,cached);
  }
  function loadCatalogue(append, retry) {
    if (!isCatalogue() || (catalogueBusy && append)) return;
    var kind=route,epoch=generation,request=++catalogueRequest;
    if(!append){cataloguePage=1;catalogueSelected=readFilters();state.catalogueFilters=state.catalogueFilters||{};state.catalogueFilters[kind]=catalogueSelected;persist();}
    else cataloguePage=catalogueNextPage;
    var page=cataloguePage,selected=Object.assign({},catalogueSelected),key=catalogueStore.key(kind,selected),cached=catalogueStore.get(key),base=append?lastCatalog.slice():[];
    activeCatalogueKey=key;
    if(cached&&!append){
      pendingCatalogueKey='';moreAvailable=!!cached.hasMore;catalogueNextPage=cached.nextPage||2;cataloguePage=cached.page||1;
      renderCatalog(cached.items);var displayed=Math.min(cached.items.length,cached.displayed||12);while(catalogDisplayed<displayed)renderCatalogBatch();
      requestAnimationFrame(function(){if(epoch===generation&&route===kind&&screen==='browse')$('main-content').scrollTop=cached.scroll||0;});
      $('catalogue-status').textContent=lastCatalog.length+' titles loaded';
      if(!retry&&Date.now()-cached.at<catalogueStore.ttl){catalogueBusy=false;$('apply-filters').removeAttribute('aria-busy');$('more-button').disabled=false;return;}
    }
    if(!cached&&!append){moreAvailable=false;$('more-button').hidden=true;empty('Loading matching titles…');}
    catalogueBusy=true;if(!cached||append){$('apply-filters').setAttribute('aria-busy','true');$('catalogue-status').textContent='Loading…';$('more-button').disabled=true;}
    api.catalogue(kind,selected,page).then(function(result){
      var titles=allSubjects(result).filter(function(subject){return number(subject.subjectType)===(kind==='movies'?1:2);});
      var firstCount=cached?cached.firstCount||titles.length:titles.length;
      var unchanged=cached&&!append&&JSON.stringify(cached.items.slice(0,firstCount).map(global.MovieBoxCatalogueCache.compact))===JSON.stringify(titles.map(global.MovieBoxCatalogueCache.compact));
      var entry;
      if(unchanged){entry=cached;entry.at=Date.now();}
      else {var seen={};entry={items:base.concat(titles).filter(function(subject){var id=String(subject.subjectId);if(seen[id])return false;seen[id]=true;return true;}),at:Date.now(),hasMore:result.hasMore===true||result.hasMore===1,nextPage:Math.max(page+1,number(result.nextPage)),page:page,firstCount:append?firstCount:titles.length,scroll:0,displayed:12};}
      catalogueStore.put(key,entry);
      if(epoch!==generation||request!==catalogueRequest||route!==kind)return;
      if(unchanged){$('catalogue-status').textContent=lastCatalog.length+' titles loaded';return;}
      if(cached&&!append&&!retry&&($('main-content').scrollTop>0||document.activeElement.closest('.poster-card'))){pendingCatalogueKey=key;$('catalogue-status').textContent='New titles available · Apply filters to refresh.';return;}
      moreAvailable=entry.hasMore;catalogueNextPage=entry.nextPage;renderCatalog(titles,append);
      if(!titles.length&&!append)empty('No titles match these filters. Try another year, country or genre.');
      $('catalogue-status').textContent=lastCatalog.length+' titles loaded'+(moreAvailable?' · More available':'');
    }).catch(function(){if(epoch===generation&&request===catalogueRequest){$('catalogue-status').textContent=cached?'Could not check for new titles. Your current catalogue is still available.':'Could not load this selection. Please try again.';if(!append&&!cached)empty('Could not load the catalogue. Your saved titles are unchanged.');}}).then(function(){if(request===catalogueRequest){catalogueBusy=false;$('apply-filters').removeAttribute('aria-busy');$('more-button').disabled=false;navigation.invalidate();}});
  }
  function updateHistoryTools() {
    $('history-tools').hidden=route!=='history';$('history-select').hidden=historyEditing;
    ['history-all','history-remove','history-done'].forEach(function(id){$(id).hidden=!historyEditing;});
    var count=Object.keys(historySelected).length;$('history-remove').textContent='Remove selected ('+count+')';$('history-remove').disabled=!count;
    $('history-all').textContent=count&&count===lastCatalog.length?'Clear selection':'Select all';$('history-undo').hidden=!Object.keys(historyUndo).length;
    Array.prototype.forEach.call($('catalog').querySelectorAll('.poster-card'),function(card){var checked=!!historySelected[card.dataset.subjectId];card.classList.toggle('is-selecting',historyEditing);card.classList.toggle('is-selected',historyEditing&&checked);if(historyEditing)card.setAttribute('aria-pressed',String(checked));else card.removeAttribute('aria-pressed');});
    if(navigation)navigation.invalidate();
  }
  function rebuildHistoryIndex(){historyIndex={};Object.keys(state.history).forEach(function(key){var entry=state.history[key],id=String((entry.subject||{}).subjectId);if(!historyIndex[id]||historyIndex[id].updated<entry.updated)historyIndex[id]=entry;});}
  $('history-select').onclick=function(){historyEditing=true;historySelected={};updateHistoryTools();navigation.focus($('history-all'));};
  $('history-done').onclick=function(){historyEditing=false;historySelected={};updateHistoryTools();navigation.focus($('history-select'));};
  $('history-all').onclick=function(){var all=Object.keys(historySelected).length===lastCatalog.length;historySelected={};if(!all)lastCatalog.forEach(function(subject){historySelected[String(subject.subjectId)]=true;});updateHistoryTools();};
  $('history-remove').onclick=function(){var ids=Object.keys(historySelected);if(!ids.length)return;historyUndo={};Object.keys(state.history).forEach(function(key){var entry=state.history[key];if(historySelected[String((entry.subject||{}).subjectId)]){historyUndo[key]=entry;delete state.history[key];}});if(playerSelection&&historySelected[String(playerSelection.subject.subjectId)])playerSelection=null;rebuildHistoryIndex();persist(true);browse('history');updateHistoryTools();navigation.focus($('history-undo'));toast('Removed '+ids.length+' title(s) from Continue watching. Undo is available.');};
  $('history-undo').onclick=function(){Object.keys(historyUndo).forEach(function(key){if(!state.history[key])state.history[key]=historyUndo[key];});historyUndo={};rebuildHistoryIndex();persist(true);browse('history');updateHistoryTools();navigation.focus($('history-select'));};

  function browse(name) {
    captureCatalogueView();historyEditing=false;historySelected={};
    generation++; catalogueRequest++; catalogueBusy = false;
    if (player.active) player.stop(); showPage('browse'); setNav(name); updateHistoryTools();
    $('search-panel').hidden = name !== 'search'; $('catalogue-filters').hidden = !isCatalogue(); $('more-button').hidden = true; $('more-button').disabled = false; moreAvailable = false;
    $('catalog-kicker').textContent = name === 'home' ? 'A WORLD OF STORIES' : 'YOUR MOVIEBOX';
    $('catalog-title').textContent = {home:'Discover',movies:'Movies',tv:'TV Shows',search:'Search',history:'Continue watching',saved:'My list'}[name] || 'Discover';
    $('section-kicker').textContent = name === 'home' ? 'YOUR NEXT GREAT STORY' : 'EVERY STORY, IN YOUR OWN TIME'; renderHero(name === 'home' ? carousel.current() || homeTitles[0] : null);
    if (isCatalogue()) { configureFilters(name); loadCatalogue(false); }
    else if (name === 'home') { if (homeTitles.length) renderCatalog(homeTitles); else loadHome(); }
    else if (name === 'history') renderCatalog(Object.keys(state.history).map(function (key) { return state.history[key]; }).sort(function (a,b) { return b.updated - a.updated; }).map(function (entry) { return entry.subject; }).filter(Boolean));
    else if (name === 'saved') renderCatalog(Object.keys(state.saved).map(function (id) { return state.saved[id]; }));
    else { renderCatalog([]); $('empty-state').hidden = true; $('search-input').focus(); }
  }
  function loadHome() { var epoch = generation; empty('Loading the latest stories…'); $('retry-button').hidden = true; api.home().then(function (result) { if (epoch !== generation) return; homeTitles = allSubjects(result).slice(0,180); if (!carousel.items.length) carousel.set(homeTitles); else carousel.render(); renderCatalog(homeTitles); setTimeout(function () { carousel.load(api); },1500); $('retry-button').hidden = false; if (!homeTitles.length) empty('The catalog is empty right now. Please try again.'); }).catch(function () { if (epoch === generation) { empty('Could not load MovieBox. Check the TV’s internet connection, then try again.'); $('retry-button').hidden = false; } }); }
  function search(append) { var query = $('search-input').value.trim(); if (!query) return; if (!append) { generation++; searchPage = 1; searchWord = query; $('suggestions').textContent = ''; } var epoch = generation, page = searchPage; $('catalog-title').textContent = 'Results for “' + query + '”'; $('more-button').disabled = true; api.search(query,page).then(function (result) { if (epoch !== generation || query !== searchWord) return; var titles = allSubjects(result); moreAvailable = result.hasMore === true || result.hasMore === 1 || titles.length >= 30; renderCatalog(titles,append); $('more-button').disabled = false; if (!append) navigation.focus($('catalog').querySelector('button')); }).catch(function () { if (epoch === generation) { toast('Search could not complete. Please try again.'); $('more-button').disabled = false; } }); }
  function suggest() { var query = $('search-input').value.trim(); if (query.length < 2) { $('suggestions').textContent = ''; return; } api.suggest(query).then(function (items) { if ($('search-input').value.trim() !== query || route !== 'search') return; $('suggestions').textContent = ''; (items || []).slice(0,8).forEach(function (item) { var word = item.word || item.title || item.subject && item.subject.title; if (!word) return; var button = document.createElement('button'); button.className = 'secondary'; button.textContent = word; button.setAttribute('role','option'); button.onclick = function () { $('search-input').value = word; $('suggestions').textContent = ''; if (item.subject && item.subject.subjectId) openDetail(item.subject); else search(false); }; $('suggestions').appendChild(button); }); }).catch(function () {}); }
  function selectionChanged() { if (!current) return; var id = currentKey(), entry = state.history[id]; $('watch-button').textContent = entry && entry.completed ? '▶ Watch again' : entry && entry.position > 0 ? '▶ Resume · ' + time(entry.position) : '▶ Watch now'; Array.prototype.forEach.call($('episodes').querySelectorAll('[data-episode]'),function (button) { button.classList.toggle('active',number(button.dataset.episode) === episode); }); prefetch(); }
  function prepareStreams(subject,se,ep) { var id = key(subject,se,ep), cached = streamCache[id]; if (cached && Date.now() - cached.created < 240000) return cached.promise; var promise = api.playback(subject,se,ep).then(function(streams){if(!Array.isArray(streams)||!streams.length)throw new Error('No playable source is available.');return streams;}); streamCache[id] = {created:Date.now(),promise:promise}; promise.catch(function () { if (streamCache[id] && streamCache[id].promise === promise) delete streamCache[id]; }); Object.keys(streamCache).slice(0,-24).forEach(function (old) { delete streamCache[old]; }); return promise; }
  function prefetch() { var epoch = generation, id = currentKey(), subject = current, se = season, ep = episode; setTimeout(function () { if (screen !== 'detail' || epoch !== generation || id !== currentKey() || !subject || (detail && detail.isSeries && !ep)) return; $('detail-notice').textContent = 'Getting playback ready in the background…'; prepareStreams(subject,se,ep).then(function () { if (screen === 'detail' && id === currentKey()) $('detail-notice').textContent = 'Ready when you are · Quality and subtitles are available in the player.'; }).catch(function () { if (id === currentKey()) $('detail-notice').textContent = 'Press Watch to retry preparing this title.'; }); },180); }
  function populateEpisodes(restoreEpisode) { var record = $('season-select').selectedOptions[0]; record = record ? JSON.parse(record.dataset.season) : {}; season = number(record.se); var explicit = record.episodeNumbers; if (!Array.isArray(explicit)) { explicit = String(record.allEp || '').split(',').map(Number).filter(function (n) { return n > 0; }); if (!explicit.length) { explicit = []; for (var n = 1; n <= Math.min(10000,number(record.maxEp)); n++) explicit.push(n); } } episodeNumbers = explicit.map(Number).filter(function (n) { return n > 0; }).sort(function (a,b) { return a - b; }); episode = episodeNumbers.indexOf(number(restoreEpisode)) >= 0 ? number(restoreEpisode) : episodeNumbers[0] || 0; $('episode-heading').textContent = 'Season ' + season + ' · ' + episodeNumbers.length + ' episodes'; $('episodes').textContent = ''; var drawn = 0; function drawBatch() { var batch = episodeNumbers.slice(drawn,drawn + 120); batch.forEach(function (ep) { var button = document.createElement('button'); button.className = 'episode-button secondary'; button.dataset.episode = ep; button.textContent = 'Episode ' + ep; var old = state.history[key(current,season,ep)]; if (old && old.position > 0) { var status = document.createElement('span'); status.className = 'episode-state'; status.textContent = 'Resume ' + time(old.position); button.appendChild(status); } button.onclick = function () { episode = ep; selectionChanged(); watch(); }; $('episodes').appendChild(button); }); drawn += batch.length; if (drawn < episodeNumbers.length) { var more = document.createElement('button'); more.className = 'secondary'; more.textContent = 'More episodes'; more.onclick = function () { more.remove(); drawBatch(); }; $('episodes').appendChild(more); } } drawBatch(); selectionChanged(); }
  function openDetail(subject,autoplay) { captureCatalogueView(); var epoch = ++generation; current = subject; detail = null; season = episode = 0; showPage('detail'); $('detail-title').textContent = subject.title; $('detail-meta').textContent = ''; $('detail-description').textContent = 'Loading the story…'; $('detail-poster').src = image(subject); $('episode-panel').hidden = true; $('season-row').hidden = true; $('watch-button').disabled = true; $('save-button').disabled = true; $('trailer-button').hidden = true; $('detail-notice').textContent = 'Loading title details…'; navigation.focus($('detail-back')); api.detail(subject).then(function (data) { if (epoch !== generation) return; detail = data; current = data.subject || subject; $('detail-title').textContent = current.title; $('detail-poster').src = image(current); var backdrop = image(current,'stills',960) || image(current,'cover',960); $('detail-backdrop').style.backgroundImage = backdrop ? 'url("' + backdrop.replace(/["\\\n\r]/g,'') + '")' : ''; $('detail-description').textContent = current.description || 'No description is available for this title.'; $('detail-meta').textContent = [String(current.releaseDate || '').slice(0,4),current.genre,current.countryName,current.imdbRatingValue ? 'IMDb ' + current.imdbRatingValue : ''].filter(Boolean).join(' · '); var isSeries = data.isSeries === true || number(current.subjectType) === 2; var seasons = isSeries ? (data.resource || {}).seasons || [] : []; $('season-row').hidden = !seasons.length; $('episode-panel').hidden = !seasons.length; $('season-select').textContent = ''; seasons.forEach(function (record) { if (number(record.se) <= 0) return; var option = new Option('Season ' + record.se,String(record.se)); option.dataset.season = JSON.stringify(record); $('season-select').add(option); }); var previous = progressFor(current), previousKey = previous && previous.key ? previous.key.split(':') : null; if (!previousKey && previous) { var actualKey = Object.keys(state.history).find(function (k) { return state.history[k] === previous; }); if (actualKey) previousKey = actualKey.split(':'); } if (previousKey && seasons.length) $('season-select').value = previousKey[1]; if (seasons.length) populateEpisodes(previousKey && previousKey[2]); else { season = episode = 0; episodeNumbers = []; selectionChanged(); } $('watch-button').disabled = !!data.isForbid || current.hasResource === false || (isSeries && !episodeNumbers.length); $('save-button').disabled = false; $('save-button').textContent = state.saved[String(current.subjectId)] ? '✓ Saved' : '＋ My list'; $('trailer-button').hidden = !(((current.trailer || {}).videoAddress || {}).url); if (isSeries && !episodeNumbers.length) $('detail-notice').textContent = 'Episode information is unavailable for this series. Please try again later.'; navigation.focus($('watch-button').disabled ? $('save-button') : $('watch-button')); if (autoplay && !$('watch-button').disabled && String(current.subjectId) === String(subject.subjectId)) watch(); }).catch(function () { if (epoch === generation) { $('detail-description').textContent = 'Title details could not be loaded. Return to browsing and try again.'; toast('Could not load this title. Check your connection.'); } }); }
  function watch(continuation) {
    continuation = continuation === true; continuationPending = continuation;
    if (!current || !detail || $('watch-button').disabled) return;
    var epoch = generation, subject = current, se = season, ep = episode, id = currentKey(), history = state.history[id] || {};
    var preferred = state.audioPreferences[String(subject.subjectId)] || {}, audioCode = preferred.code || state.settings.audioLanguage || '';
    var variants = global.MovieBoxAudio.variants(subject), edition = variants.find(function (variant) { return String(variant.subjectId) === String(preferred.subjectId || history.audioSubjectId || ''); });
    if (!edition && audioCode && preferred.kind !== 'track' && String(preferred.subjectId || '') !== String(subject.subjectId)) edition = variants.find(function (variant) { return String(variant.lanCode || '').toLowerCase() === audioCode; });
    $('watch-button').disabled = true; $('watch-button').textContent = 'Preparing playback?';
    prepareStreams(subject,se,ep).then(function (baseStreams) {
      if (!baseStreams.length) throw new Error('No playable source is available.');
      var reference = history.duration > 0 ? history.duration / 1000 : 0;
      var compatible = global.MovieBoxAudio.matchingRuntime(baseStreams,reference);
      if (!edition || String(edition.subjectId) === String(subject.subjectId)) return {subject:subject,streams:baseStreams,initialStream:global.MovieBoxChooseQuality(compatible,state.settings.quality)};
      var selectedSubject = global.MovieBoxAudio.subject(subject,edition);
      return prepareStreams(selectedSubject,se,ep).then(function (streams) {
        var duration = reference || Number((global.MovieBoxChooseQuality(compatible,state.settings.quality) || {}).duration);
        var matched = global.MovieBoxAudio.matchingRuntime(streams,duration);
        return {subject:selectedSubject,streams:matched};
      }).catch(function () { toast('The remembered audio edition is unavailable for this runtime. Using the current edition.'); return {subject:subject,streams:baseStreams,initialStream:global.MovieBoxChooseQuality(compatible,state.settings.quality)}; });
    }).then(function (resolved) {
      if (epoch !== generation || id !== currentKey()) return;
      $('watch-button').disabled = false; selectionChanged(); playerSelection = {subject:subject,season:se,episode:ep,key:id};
      var language = state.subtitleTracks[id] || state.settings.language, enabled = language !== 'off' && state.settings.subtitles;
      showPage('player'); player.open(resolved.subject,resolved.streams,{canonicalSubject:subject,key:id,season:se,episode:ep,position:history.completed ? 0 : history.position || 0,initialStream:resolved.initialStream,quality:state.settings.quality,audioLanguage:audioCode,language:language,subtitleEnabled:enabled,hasNext:!!nextSelection(),autoplay:Number(subject.subjectType) === 2});
      episodeTransition = false; nextUpDismissed = ''; nextPrefetchKey = ''; $('next-up').hidden = true; $('play-pause').focus();
    }).catch(function (error) { if (epoch === generation) { $('watch-button').disabled = false; selectionChanged(); if (continuation) finishPlayback('The next episode could not be played. ' + (error.message || '')); else toast(error.message || 'This selection could not be played. Please try again.'); } });
  }

  function saveProgress(position,duration) {
    if (!playerSelection || !(position > 0)) return;
    var previous = state.history[playerSelection.key];
    if (previous && Math.abs(previous.position - position) < 250 && previous.duration === duration && previous.audioSubjectId === String((player.subject || {}).subjectId) && previous.audioCode === String((player.options || {}).audioLanguage || '') && previous.completed === !!player.completed) return;
    var entry = {key:playerSelection.key,subject:librarySubject(playerSelection.subject),position:position,duration:duration || 0,updated:Date.now(),completed:!!player.completed,audioSubjectId:player.subject && String(player.subject.subjectId),audioCode:player.options && player.options.audioLanguage || ''};
    state.history[playerSelection.key] = entry; historyIndex[String(entry.subject.subjectId)] = entry;
    if (!previous && Object.keys(state.history).length > 300) { var keys = Object.keys(state.history).sort(function (a,b) { return state.history[b].updated - state.history[a].updated; }); keys.slice(300).forEach(function (old) { delete state.history[old]; }); }
    persist(false,true);
  }

  var continuationPending = false, episodeTransition = false, episodeDrawerOpen = false, drawerReturnFocus = null, nextUpDismissed = '', nextPrefetchKey = '';
  function nextSelection() { if (!playerSelection || Number(playerSelection.subject.subjectType) !== 2) return null; return global.MovieBoxSeriesPolicy.next((detail && detail.resource || {}).seasons || [],playerSelection.season,playerSelection.episode); }
  function hideEpisodeDrawer() { if (!episodeDrawerOpen) return; if (navigation.picker) navigation.closePicker(); episodeDrawerOpen = false; $('episode-drawer').hidden = true; player.reveal(); navigation.scope($('player-page')); navigation.focus(drawerReturnFocus && drawerReturnFocus.isConnected ? drawerReturnFocus : $('play-pause')); }
  function leavePlayer() { continuationPending = false; if (navigation.picker) navigation.closePicker(); hideEpisodeDrawer(); $('next-up').hidden = true; episodeTransition = false; generation++; player.stop(); playerSelection = null; showPage('detail'); selectionChanged(); navigation.focus($('watch-button')); setTimeout(function () { releases.check(false); },2000); }
  function finishPlayback(message) { leavePlayer(); $('detail-notice').textContent = message || 'Finished · Your place is saved.'; }
  function nextEpisode() {
    if (episodeTransition) return;
    var target = nextSelection();
    if (!target) { finishPlayback('Finished · No more episodes are available.'); return; }
    if (navigation.picker) navigation.closePicker(); hideEpisodeDrawer(); saveProgress(player.position,player.duration); player.stop(); playerSelection = null;
    episodeTransition = true; generation++; $('next-up').hidden = true;
    $('season-select').value = String(target.season); populateEpisodes(target.episode); episode = target.episode; selectionChanged();
    showPage('player'); player.loading(true,'Preparing the next episode…'); watch(true);
  }
  function updateNextUp(position,duration) {
    var target = nextSelection(), threshold = global.MovieBoxSeriesPolicy.promptAt(duration,player.stream);
    var show = target && threshold !== null && position >= threshold && nextUpDismissed !== playerSelection.key && !episodeTransition && !episodeDrawerOpen;
    $('next-up').hidden = !show;
    if (show) { var prefetchKey=key(playerSelection.subject,target.season,target.episode);if(nextPrefetchKey!==prefetchKey){nextPrefetchKey=prefetchKey;prepareStreams(playerSelection.subject,target.season,target.episode).catch(function(){});} var text='Season '+target.season+' · Episode '+target.episode;if($('next-up-title').textContent!==text)$('next-up-title').textContent=text; }
  }
  function openEpisodeDrawer() {
    if (!playerSelection || Number(playerSelection.subject.subjectType)!==2 || !detail) return;
    drawerReturnFocus=document.activeElement;episodeDrawerOpen=true;$('next-up').hidden=true;
    var select=$('player-season-select');select.textContent='';
    ((detail.resource||{}).seasons||[]).filter(function(record){return Number(record.se)>0;}).sort(function(a,b){return a.se-b.se;}).forEach(function(record){var option=new Option('Season '+record.se,String(record.se));option.dataset.season=JSON.stringify(record);select.add(option);});
    select.value=String(playerSelection.season);drawPlayerEpisodes();$('episode-drawer').hidden=false;navigation.scope($('episode-drawer'));navigation.focus(select);
  }
  function drawPlayerEpisodes() {
    var select=$('player-season-select'),option=select.selectedOptions[0],record=option?JSON.parse(option.dataset.season):{},numbers=global.MovieBoxSeriesPolicy.numbers(record),list=$('player-episode-list');list.textContent='';
    var drawn=0;function batch(){numbers.slice(drawn,drawn+48).forEach(function(ep){var button=document.createElement('button');button.className='secondary';button.textContent='Episode '+ep;button.dataset.episode=String(ep);button.classList.toggle('active',playerSelection&&playerSelection.season===Number(record.se)&&playerSelection.episode===ep);button.onclick=function(){if(!playerSelection)return;var se=Number(record.se);hideEpisodeDrawer();saveProgress(player.position,player.duration);player.stop();playerSelection=null;generation++;episodeTransition=true;$('season-select').value=String(se);populateEpisodes(ep);episode=ep;selectionChanged();showPage('player');player.loading(true,'Opening episode…');watch(true);};list.appendChild(button);});drawn+=48;if(drawn<numbers.length){var more=document.createElement('button');more.className='quiet';more.textContent='More episodes';more.onclick=function(){more.remove();batch();navigation.invalidate();};list.appendChild(more);}}batch();navigation.invalidate();
  }
  $('episode-browser').onclick=openEpisodeDrawer;$('episode-drawer-close').onclick=hideEpisodeDrawer;$('player-season-select').onchange=drawPlayerEpisodes;
  $('next-up-play').onclick=nextEpisode;$('next-up-hide').onclick=function(){if(playerSelection)nextUpDismissed=playerSelection.key;$('next-up').hidden=true;navigation.focus($('play-pause'));};
  var player = new global.MovieBoxPlayer(api,{onError:function(message){if(continuationPending)finishPlayback('The next episode could not start. '+message);else toast(message);},onStarted:function(){continuationPending=false;},onProgress:saveProgress,onBack:leavePlayer,onTick:updateNextUp,onEnd:function(){saveProgress(player.position,player.duration);var epoch=player.epoch;setTimeout(function(){if(!player.active||player.epoch!==epoch)return;if(nextSelection())nextEpisode();else finishPlayback('Finished · Your place is saved.');},0);},onAudioPreference:function (selection) { if (!playerSelection) return; state.audioPreferences[String(playerSelection.subject.subjectId)] = selection; if (selection.code) state.settings.audioLanguage = selection.code; saveProgress(player.position,player.duration); persist(); },onCaptionPreference:function (language) { if (!playerSelection) return; state.subtitleTracks[playerSelection.key] = language; persist(); }});
  function showExit() { $('exit-dialog').hidden = false; navigation.scope($('exit-dialog')); navigation.focus($('exit-cancel')); }
  function cancelExit() { $('exit-dialog').hidden = true; navigation.scope($('app-shell')); navigation.focus(document.querySelector('[data-nav="home"]')); }
  var navigation = new global.MovieBoxNavigation(function (key,event,input) { if (key === 'InputDone') { if (input === $('search-input')) search(false); return false; } if (key === 'InputCancel') { navigation.focus(input === $('search-input') ? $('search-go') : $('preferred-quality')); return false; } if (!$('exit-dialog').hidden) { if (key === 'Back' || key === 'Escape') { cancelExit(); return true; } return false; } if (episodeDrawerOpen) { if (key === 'Back' || key === 'Escape') { hideEpisodeDrawer(); return true; } if (/^Media/.test(key)) return player.handleKey(key,event); return false; } if (episodeTransition && (key === 'Back' || key === 'Escape')) { finishPlayback('Playback cancelled.'); return true; } if (player.handleKey(key,event)) return true; if ((key === 'Enter') && document.activeElement === $('search-input')) { search(false); return true; } var back = key === 'Back' || key === 'Escape' || (key === 'Backspace' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)); if (!back) return false; if (screen === 'detail') { generation++; showPage('browse'); navigation.focus(returnFocus && returnFocus.isConnected ? returnFocus : document.querySelector('[data-nav="' + route + '"]')); } else if (screen === 'settings' || route !== 'home') browse('home'); else showExit(); return true; });
  var updateNotBefore = Date.now() + 12000;
  var releases = new global.MovieBoxReleases({isBusy:function () { return player.active || Date.now() < updateNotBefore; },onChange:renderUpdates});
  function renderUpdates() {
    if (!releases) return;
    var release = releases.pending, notice = $('update-notice');
    notice.hidden = !release || (!releases.preferences.enabled && !releases.manualPending) || player.active;
    if (release) {
      if (notice.dataset.tag !== release.tag) { notice.dataset.tag = release.tag; $('update-instructions').hidden = true; }
      $('update-title').textContent = 'MovieBox ' + release.tag.replace(/^v/,'') + ' is available'; $('update-url').textContent = release.url;
    }
    var labels = {'not-checked':'Optional updates are checked in the background.','checking':'Checking GitHub?','no-release':'No public release is available yet.','unavailable':'GitHub is unavailable. Your app keeps working.','deferred':'This release is deferred. Check manually whenever you want.','current':'You have the latest available stable version.','available':'An optional update is available. You choose when to install it.'};
    $('update-settings-status').textContent = 'Installed ' + releases.version + ' ? ' + (releases.preferences.enabled ? labels[releases.status] || '' : 'Automatic checks are off.');
    $('check-updates').setAttribute('aria-busy',releases.status === 'checking' ? 'true' : 'false');
  }
  function returnFromUpdate() { navigation.focus(document.querySelector('[data-nav="' + route + '"]') || $('check-updates')); }
  $('optional-updates').onchange = function () { releases.setEnabled(this.checked); };
  $('check-updates').onclick = function () { releases.check(true); };
  $('update-later').onclick = function () { releases.later(); returnFromUpdate(); };
  $('update-skip').onclick = function () { releases.skip(); returnFromUpdate(); };
  $('update-download').onclick = function () { $('update-instructions').hidden = false; navigation.invalidate(); };
  setTimeout(function () { releases.check(false); },12500);
  setInterval(function () { releases.check(false); },900000);
  Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'),function (button) { button.onclick = function () { if (button.dataset.nav === 'settings') { generation++; showPage('settings'); setNav('settings'); loadSettings(); navigation.focus($('preferred-theme')); } else browse(button.dataset.nav); }; });
  function loadSettings() { $('preferred-theme').value = state.settings.theme; $('preferred-quality').value = state.settings.quality; $('preferred-language').value = state.settings.language; $('preferred-subtitles').checked = state.settings.subtitles; $('optional-updates').checked = releases.preferences.enabled; renderUpdates(); $('settings-platform').textContent = player.native ? 'Samsung AVPlay · Hardware-decoded playback on your TV. History and downloaded subtitles stay on this TV.' : 'Desktop browser preview · Native Samsung decoding must be verified on the TV. History and subtitles stay in this browser profile.'; }
  $('preferred-theme').onchange = function () { state.settings.theme = global.MovieBoxThemes.apply(this.value); persist(true); navigation.invalidate(); };
  $('preferred-quality').onchange = function () { state.settings.quality = this.value; persist(); };
  $('preferred-language').onchange = function () { state.settings.language = this.value.trim().toLowerCase() || 'en'; persist(); };
  $('preferred-subtitles').onchange = function () { state.settings.subtitles = this.checked; persist(); };
  $('clear-subtitle-cache').onclick = function () { player.cache.clear().then(function () { toast('Downloaded subtitles cleared. They will download again when needed.'); }); };
  $('search-input').addEventListener('input',function () { clearTimeout(searchTimer); searchTimer = setTimeout(suggest,280); });
  $('search-go').onclick = function () { search(false); };
  $('more-button').onclick = function () { if (catalogDisplayed < lastCatalog.length) renderCatalogBatch(); else if (isCatalogue()) loadCatalogue(true); else if (route === 'search') { searchPage++; search(true); } };
  $('apply-filters').onclick = function () { if (isCatalogue()) { captureCatalogueView(); generation++; loadCatalogue(false,true); } };
  $('reset-filters').onclick = function () { if (!isCatalogue()) return; state.catalogueFilters = state.catalogueFilters || {}; state.catalogueFilters[route] = {}; configureFilters(route); generation++; loadCatalogue(false); };
  $('retry-button').onclick = function () { if (route === 'home') loadHome(); else if (isCatalogue()) loadCatalogue(false,true); else if (route === 'search') search(false); };
  $('detail-back').onclick = function () { generation++; showPage('browse'); navigation.focus(returnFocus && returnFocus.isConnected ? returnFocus : document.querySelector('[data-nav="' + route + '"]')); };
  $('season-select').onchange = function () { populateEpisodes(); };
  $('watch-button').onclick = watch;
  $('save-button').onclick = function () { if (!current) return; var id = String(current.subjectId); if (state.saved[id]) delete state.saved[id]; else state.saved[id] = librarySubject(current); persist(); $('save-button').textContent = state.saved[id] ? '✓ Saved' : '＋ My list'; };
  $('trailer-button').onclick = function () { var trailer = ((current || {}).trailer || {}).videoAddress || {}; if (!trailer.url) return; playerSelection = null; showPage('player'); player.open({subjectId:'trailer',title:'Trailer · ' + current.title},[{url:trailer.url,resolutions:trailer.height || 480,duration:trailer.duration,size:trailer.size,id:'trailer'}],{subtitleEnabled:false,hasNext:false}); };
  $('player-back').onclick = leavePlayer; $('exit-cancel').onclick = cancelExit;
  $('exit-confirm').onclick = function () { persist(true); try { if (global.tizen && tizen.application) tizen.application.getCurrentApplication().exit(); else { cancelExit(); toast('You can close this preview tab. Your place is saved.'); } } catch (_) { cancelExit(); } };
  global.addEventListener('pagehide',function () { captureCatalogueView();catalogueStore.flush(); if (player.active) saveProgress(player.position,player.duration); flushPersistence(); });
  document.addEventListener('visibilitychange',function () { if (document.hidden) { if (player.active) saveProgress(player.position,player.duration); flushPersistence(); } });
  global.MovieBoxTV = {toast:toast,api:api,player:player,navigation:navigation,state:state,openDetail:openDetail,browse:browse,watch:watch,allSubjects:allSubjects,persistenceMetrics:persistenceMetrics,flushPersistence:flushPersistence,releases:releases,carousel:carousel,catalogueStore:catalogueStore,nextEpisode:nextEpisode,openEpisodeDrawer:openEpisodeDrawer};
  browse('home'); navigation.focus(document.querySelector('[data-nav="home"]'));
})(window);
