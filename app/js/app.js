(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var api = typeof global.MovieBoxAPI === 'function' ? new global.MovieBoxAPI() : global.MovieBoxAPI;
  var state;
  function readLibrary(name) { var text = localStorage.getItem(name); if (!text) return null; var value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value) || (value.saved && (typeof value.saved !== 'object' || Array.isArray(value.saved))) || (value.history && (typeof value.history !== 'object' || Array.isArray(value.history)))) throw new Error('Invalid library'); return value; }
  try { state = readLibrary('moviebox-tv-library'); } catch (_) { state = null; }
  if (!state) { try { state = readLibrary('moviebox-tv-library-backup'); } catch (_) { state = null; } }
  state = state || {};
  state.history = state.history || {}; state.saved = state.saved || {}; state.settings = Object.assign({quality:'auto',language:'en',subtitles:true,autoplay:false},state.settings || {}); state.subtitleTracks = state.subtitleTracks || {}; state.audioPreferences = state.audioPreferences || {};
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
    button.appendChild(art); button.appendChild(title); button.appendChild(meta); button.onclick = function () { returnFocus = button; openDetail(subject); }; return button;
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

  function renderHero(subject) { $('hero').hidden = !subject; if (!subject) return; $('hero-title').textContent = subject.title; $('hero-description').textContent = subject.description || 'A little escape. An unforgettable story. Discover something worth watching.'; var url = image(subject,'stills',960) || image(subject,'cover',960); $('hero-art').style.backgroundImage = url ? 'url("' + url.replace(/["\\\n\r]/g,'') + '")' : ''; $('hero-watch').onclick = function () { returnFocus = $('hero-watch'); openDetail(subject); }; }
  function browse(name) { generation++; if (player.active) player.stop(); showPage('browse'); setNav(name); $('search-panel').hidden = name !== 'search'; $('more-button').hidden = true; moreAvailable = false; $('catalog-kicker').textContent = name === 'home' ? 'A WORLD OF STORIES' : 'YOUR MOVIEBOX'; $('catalog-title').textContent = {home:'Discover',search:'Search',history:'Continue watching',saved:'My list'}[name] || 'Discover'; $('section-kicker').textContent = name === 'home' ? 'YOUR NEXT GREAT STORY' : 'EVERY STORY, IN YOUR OWN TIME'; renderHero(name === 'home' ? homeTitles[0] : null); if (name === 'home') { if (homeTitles.length) renderCatalog(homeTitles); else loadHome(); } else if (name === 'history') renderCatalog(Object.keys(state.history).map(function (k) { return state.history[k]; }).sort(function (a,b) { return b.updated - a.updated; }).map(function (entry) { return entry.subject; }).filter(Boolean)); else if (name === 'saved') renderCatalog(Object.keys(state.saved).map(function (id) { return state.saved[id]; })); else { renderCatalog([]); $('empty-state').hidden = true; $('search-input').focus(); } }
  function loadHome() { var epoch = generation; empty('Loading the latest stories…'); $('retry-button').hidden = true; api.home().then(function (result) { if (epoch !== generation) return; homeTitles = allSubjects(result).slice(0,180); renderHero(homeTitles[0]); renderCatalog(homeTitles); $('retry-button').hidden = false; if (!homeTitles.length) empty('The catalog is empty right now. Please try again.'); }).catch(function () { if (epoch === generation) { empty('Could not load MovieBox. Check the TV’s internet connection, then try again.'); $('retry-button').hidden = false; } }); }
  function search(append) { var query = $('search-input').value.trim(); if (!query) return; if (!append) { generation++; searchPage = 1; searchWord = query; $('suggestions').textContent = ''; } var epoch = generation, page = searchPage; $('catalog-title').textContent = 'Results for “' + query + '”'; $('more-button').disabled = true; api.search(query,page).then(function (result) { if (epoch !== generation || query !== searchWord) return; var titles = allSubjects(result); moreAvailable = result.hasMore === true || result.hasMore === 1 || titles.length >= 30; renderCatalog(titles,append); $('more-button').disabled = false; if (!append) navigation.focus($('catalog').querySelector('button')); }).catch(function () { if (epoch === generation) { toast('Search could not complete. Please try again.'); $('more-button').disabled = false; } }); }
  function suggest() { var query = $('search-input').value.trim(); if (query.length < 2) { $('suggestions').textContent = ''; return; } api.suggest(query).then(function (items) { if ($('search-input').value.trim() !== query || route !== 'search') return; $('suggestions').textContent = ''; (items || []).slice(0,8).forEach(function (item) { var word = item.word || item.title || item.subject && item.subject.title; if (!word) return; var button = document.createElement('button'); button.className = 'secondary'; button.textContent = word; button.setAttribute('role','option'); button.onclick = function () { $('search-input').value = word; $('suggestions').textContent = ''; if (item.subject && item.subject.subjectId) openDetail(item.subject); else search(false); }; $('suggestions').appendChild(button); }); }).catch(function () {}); }
  function selectionChanged() { if (!current) return; var id = currentKey(), entry = state.history[id]; $('watch-button').textContent = entry && entry.position > 0 ? '▶ Resume · ' + time(entry.position) : '▶ Watch now'; Array.prototype.forEach.call($('episodes').querySelectorAll('[data-episode]'),function (button) { button.classList.toggle('active',number(button.dataset.episode) === episode); }); prefetch(); }
  function prepareStreams(subject,se,ep) { var id = key(subject,se,ep), cached = streamCache[id]; if (cached && Date.now() - cached.created < 240000) return cached.promise; var promise = api.playback(subject,se,ep); streamCache[id] = {created:Date.now(),promise:promise}; promise.catch(function () { if (streamCache[id] && streamCache[id].promise === promise) delete streamCache[id]; }); Object.keys(streamCache).slice(0,-24).forEach(function (old) { delete streamCache[old]; }); return promise; }
  function prefetch() { var epoch = generation, id = currentKey(), subject = current, se = season, ep = episode; setTimeout(function () { if (screen !== 'detail' || epoch !== generation || id !== currentKey() || !subject || (detail && detail.isSeries && !ep)) return; $('detail-notice').textContent = 'Getting playback ready in the background…'; prepareStreams(subject,se,ep).then(function () { if (screen === 'detail' && id === currentKey()) $('detail-notice').textContent = 'Ready when you are · Quality and subtitles are available in the player.'; }).catch(function () { if (id === currentKey()) $('detail-notice').textContent = 'Press Watch to retry preparing this title.'; }); },180); }
  function populateEpisodes(restoreEpisode) { var record = $('season-select').selectedOptions[0]; record = record ? JSON.parse(record.dataset.season) : {}; season = number(record.se); var explicit = record.episodeNumbers; if (!Array.isArray(explicit)) { explicit = String(record.allEp || '').split(',').map(Number).filter(function (n) { return n > 0; }); if (!explicit.length) { explicit = []; for (var n = 1; n <= Math.min(10000,number(record.maxEp)); n++) explicit.push(n); } } episodeNumbers = explicit.map(Number).filter(function (n) { return n > 0; }).sort(function (a,b) { return a - b; }); episode = episodeNumbers.indexOf(number(restoreEpisode)) >= 0 ? number(restoreEpisode) : episodeNumbers[0] || 0; $('episode-heading').textContent = 'Season ' + season + ' · ' + episodeNumbers.length + ' episodes'; $('episodes').textContent = ''; var drawn = 0; function drawBatch() { var batch = episodeNumbers.slice(drawn,drawn + 120); batch.forEach(function (ep) { var button = document.createElement('button'); button.className = 'episode-button secondary'; button.dataset.episode = ep; button.textContent = 'Episode ' + ep; var old = state.history[key(current,season,ep)]; if (old && old.position > 0) { var status = document.createElement('span'); status.className = 'episode-state'; status.textContent = 'Resume ' + time(old.position); button.appendChild(status); } button.onclick = function () { episode = ep; selectionChanged(); watch(); }; $('episodes').appendChild(button); }); drawn += batch.length; if (drawn < episodeNumbers.length) { var more = document.createElement('button'); more.className = 'secondary'; more.textContent = 'More episodes'; more.onclick = function () { more.remove(); drawBatch(); }; $('episodes').appendChild(more); } } drawBatch(); selectionChanged(); }
  function openDetail(subject) { var epoch = ++generation; current = subject; detail = null; season = episode = 0; showPage('detail'); $('detail-title').textContent = subject.title; $('detail-meta').textContent = ''; $('detail-description').textContent = 'Loading the story…'; $('detail-poster').src = image(subject); $('episode-panel').hidden = true; $('season-row').hidden = true; $('watch-button').disabled = true; $('save-button').disabled = true; $('trailer-button').hidden = true; $('detail-notice').textContent = 'Loading title details…'; navigation.focus($('detail-back')); api.detail(subject).then(function (data) { if (epoch !== generation) return; detail = data; current = data.subject || subject; $('detail-title').textContent = current.title; $('detail-poster').src = image(current); var backdrop = image(current,'stills',960) || image(current,'cover',960); $('detail-backdrop').style.backgroundImage = backdrop ? 'url("' + backdrop.replace(/["\\\n\r]/g,'') + '")' : ''; $('detail-description').textContent = current.description || 'No description is available for this title.'; $('detail-meta').textContent = [String(current.releaseDate || '').slice(0,4),current.genre,current.countryName,current.imdbRatingValue ? 'IMDb ' + current.imdbRatingValue : ''].filter(Boolean).join(' · '); var isSeries = data.isSeries === true || number(current.subjectType) === 2; var seasons = isSeries ? (data.resource || {}).seasons || [] : []; $('season-row').hidden = !seasons.length; $('episode-panel').hidden = !seasons.length; $('season-select').textContent = ''; seasons.forEach(function (record) { if (number(record.se) <= 0) return; var option = new Option('Season ' + record.se,String(record.se)); option.dataset.season = JSON.stringify(record); $('season-select').add(option); }); var previous = progressFor(current), previousKey = previous && previous.key ? previous.key.split(':') : null; if (!previousKey && previous) { var actualKey = Object.keys(state.history).find(function (k) { return state.history[k] === previous; }); if (actualKey) previousKey = actualKey.split(':'); } if (previousKey && seasons.length) $('season-select').value = previousKey[1]; if (seasons.length) populateEpisodes(previousKey && previousKey[2]); else { season = episode = 0; episodeNumbers = []; selectionChanged(); } $('watch-button').disabled = !!data.isForbid || current.hasResource === false || (isSeries && !episodeNumbers.length); $('save-button').disabled = false; $('save-button').textContent = state.saved[String(current.subjectId)] ? '✓ Saved' : '＋ My list'; $('trailer-button').hidden = !(((current.trailer || {}).videoAddress || {}).url); if (isSeries && !episodeNumbers.length) $('detail-notice').textContent = 'Episode information is unavailable for this series. Please try again later.'; navigation.focus($('watch-button').disabled ? $('save-button') : $('watch-button')); }).catch(function () { if (epoch === generation) { $('detail-description').textContent = 'Title details could not be loaded. Return to browsing and try again.'; toast('Could not load this title. Check your connection.'); } }); }
  function watch() {
    if (!current || !detail || $('watch-button').disabled) return;
    var epoch = generation, subject = current, se = season, ep = episode, id = currentKey(), history = state.history[id] || {};
    var preferred = state.audioPreferences[String(subject.subjectId)] || {}, audioCode = preferred.code || state.settings.audioLanguage || '';
    var variants = global.MovieBoxAudio.variants(subject), edition = variants.find(function (variant) { return String(variant.subjectId) === String(preferred.subjectId || history.audioSubjectId || ''); });
    if (!edition && audioCode && preferred.kind !== 'track' && String(preferred.subjectId || '') !== String(subject.subjectId)) edition = variants.find(function (variant) { return String(variant.lanCode || '').toLowerCase() === audioCode; });
    $('watch-button').disabled = true; $('watch-button').textContent = 'Preparing playback?';
    prepareStreams(subject,se,ep).then(function (baseStreams) {
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
      showPage('player'); player.open(resolved.subject,resolved.streams,{canonicalSubject:subject,key:id,season:se,episode:ep,position:history.position || 0,initialStream:resolved.initialStream,quality:state.settings.quality,audioLanguage:audioCode,language:language,subtitleEnabled:enabled,hasNext:episodeNumbers.indexOf(ep) >= 0 && episodeNumbers.indexOf(ep) < episodeNumbers.length - 1,autoplay:state.settings.autoplay});
      $('play-pause').focus();
    }).catch(function (error) { if (epoch === generation) { $('watch-button').disabled = false; selectionChanged(); toast(error.message || 'This selection could not be played. Please try again.'); } });
  }

  function saveProgress(position,duration) {
    if (!playerSelection || !(position > 0)) return;
    var previous = state.history[playerSelection.key];
    if (previous && Math.abs(previous.position - position) < 250 && previous.duration === duration && previous.audioSubjectId === String((player.subject || {}).subjectId) && previous.audioCode === String((player.options || {}).audioLanguage || '')) return;
    var entry = {key:playerSelection.key,subject:librarySubject(playerSelection.subject),position:position,duration:duration || 0,updated:Date.now(),audioSubjectId:player.subject && String(player.subject.subjectId),audioCode:player.options && player.options.audioLanguage || ''};
    state.history[playerSelection.key] = entry; historyIndex[String(entry.subject.subjectId)] = entry;
    if (!previous && Object.keys(state.history).length > 300) { var keys = Object.keys(state.history).sort(function (a,b) { return state.history[b].updated - state.history[a].updated; }); keys.slice(300).forEach(function (old) { delete state.history[old]; }); }
    persist(false,true);
  }

  function leavePlayer() { player.stop(); playerSelection = null; showPage('detail'); selectionChanged(); navigation.focus($('watch-button')); setTimeout(function () { releases.check(false); },2000); }
  function nextEpisode() { if (!playerSelection) return; var index = episodeNumbers.indexOf(playerSelection.episode); if (index < 0 || index >= episodeNumbers.length - 1) { toast('You’ve reached the last available episode.'); return; } saveProgress(player.position,player.duration); player.stop(); playerSelection = null; episode = episodeNumbers[index + 1]; showPage('detail'); selectionChanged(); watch(); }
  var player = new global.MovieBoxPlayer(api,{onError:toast,onProgress:saveProgress,onBack:leavePlayer,onEnd:function () { if ($('autoplay-next').checked && !$('next-button').hidden) nextEpisode(); else { player.pause(); player.reveal(); toast('Finished · Your place is saved.'); } },onAudioPreference:function (selection) { if (!playerSelection) return; state.audioPreferences[String(playerSelection.subject.subjectId)] = selection; if (selection.code) state.settings.audioLanguage = selection.code; saveProgress(player.position,player.duration); persist(); },onCaptionPreference:function (language) { if (!playerSelection) return; state.subtitleTracks[playerSelection.key] = language; persist(); }});
  function showExit() { $('exit-dialog').hidden = false; navigation.scope($('exit-dialog')); navigation.focus($('exit-cancel')); }
  function cancelExit() { $('exit-dialog').hidden = true; navigation.scope($('app-shell')); navigation.focus(document.querySelector('[data-nav="home"]')); }
  var navigation = new global.MovieBoxNavigation(function (key,event,input) { if (key === 'InputDone') { if (input === $('search-input')) search(false); return false; } if (key === 'InputCancel') { navigation.focus(input === $('search-input') ? $('search-go') : $('preferred-quality')); return false; } if (!$('exit-dialog').hidden) { if (key === 'Back' || key === 'Escape') { cancelExit(); return true; } return false; } if (player.handleKey(key,event)) return true; if ((key === 'Enter') && document.activeElement === $('search-input')) { search(false); return true; } var back = key === 'Back' || key === 'Escape' || (key === 'Backspace' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)); if (!back) return false; if (screen === 'detail') { generation++; showPage('browse'); navigation.focus(returnFocus && returnFocus.isConnected ? returnFocus : document.querySelector('[data-nav="' + route + '"]')); } else if (screen === 'settings' || route !== 'home') browse('home'); else showExit(); return true; });
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
  Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'),function (button) { button.onclick = function () { if (button.dataset.nav === 'settings') { generation++; showPage('settings'); setNav('settings'); loadSettings(); navigation.focus($('preferred-quality')); } else browse(button.dataset.nav); }; });
  function loadSettings() { $('preferred-quality').value = state.settings.quality; $('preferred-language').value = state.settings.language; $('preferred-subtitles').checked = state.settings.subtitles; $('preferred-autoplay').checked = state.settings.autoplay; $('optional-updates').checked = releases.preferences.enabled; renderUpdates(); $('settings-platform').textContent = player.native ? 'Samsung AVPlay · Hardware-decoded playback on your TV. History and downloaded subtitles stay on this TV.' : 'Desktop browser preview · Native Samsung decoding must be verified on the TV. History and subtitles stay in this browser profile.'; }
  $('preferred-quality').onchange = function () { state.settings.quality = this.value; persist(); };
  $('preferred-language').onchange = function () { state.settings.language = this.value.trim().toLowerCase() || 'en'; persist(); };
  $('preferred-subtitles').onchange = function () { state.settings.subtitles = this.checked; persist(); };
  $('preferred-autoplay').onchange = function () { state.settings.autoplay = this.checked; persist(); };
  $('autoplay-next').onchange = function () { state.settings.autoplay = this.checked; persist(); };
  $('clear-subtitle-cache').onclick = function () { player.cache.clear().then(function () { toast('Downloaded subtitles cleared. They will download again when needed.'); }); };
  $('search-input').addEventListener('input',function () { clearTimeout(searchTimer); searchTimer = setTimeout(suggest,280); });
  $('search-go').onclick = function () { search(false); };
  $('more-button').onclick = function () { if (catalogDisplayed < lastCatalog.length) renderCatalogBatch(); else if (route === 'search') { searchPage++; search(true); } };
  $('retry-button').onclick = function () { if (route === 'home') loadHome(); else if (route === 'search') search(false); };
  $('detail-back').onclick = function () { generation++; showPage('browse'); navigation.focus(returnFocus && returnFocus.isConnected ? returnFocus : document.querySelector('[data-nav="' + route + '"]')); };
  $('season-select').onchange = function () { populateEpisodes(); };
  $('watch-button').onclick = watch;
  $('save-button').onclick = function () { if (!current) return; var id = String(current.subjectId); if (state.saved[id]) delete state.saved[id]; else state.saved[id] = librarySubject(current); persist(); $('save-button').textContent = state.saved[id] ? '✓ Saved' : '＋ My list'; };
  $('trailer-button').onclick = function () { var trailer = ((current || {}).trailer || {}).videoAddress || {}; if (!trailer.url) return; playerSelection = null; showPage('player'); player.open({subjectId:'trailer',title:'Trailer · ' + current.title},[{url:trailer.url,resolutions:trailer.height || 480,duration:trailer.duration,size:trailer.size,id:'trailer'}],{subtitleEnabled:false,hasNext:false}); };
  $('player-back').onclick = leavePlayer; $('next-button').onclick = nextEpisode; $('exit-cancel').onclick = cancelExit;
  $('exit-confirm').onclick = function () { persist(true); try { if (global.tizen && tizen.application) tizen.application.getCurrentApplication().exit(); else { cancelExit(); toast('You can close this preview tab. Your place is saved.'); } } catch (_) { cancelExit(); } };
  global.addEventListener('pagehide',function () { if (player.active) saveProgress(player.position,player.duration); flushPersistence(); });
  document.addEventListener('visibilitychange',function () { if (document.hidden) { if (player.active) saveProgress(player.position,player.duration); flushPersistence(); } });
  global.MovieBoxTV = {api:api,player:player,navigation:navigation,state:state,openDetail:openDetail,browse:browse,watch:watch,allSubjects:allSubjects,persistenceMetrics:persistenceMetrics,flushPersistence:flushPersistence,releases:releases};
  browse('home'); navigation.focus(document.querySelector('[data-nav="home"]'));
})(window);
