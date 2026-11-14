(function (global) {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function clock(value) { var s = Math.max(0, Math.floor(value / 1000)), h = Math.floor(s / 3600); return (h ? h + ':' : '') + String(Math.floor(s / 60) % 60).padStart(h ? 2 : 1, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function stamp(text) { var bits = text.replace(',', '.').split(':'); if (bits.length === 2) bits.unshift('0'); return Math.round((Number(bits[0]) * 3600 + Number(bits[1]) * 60 + Number(bits[2])) * 1000); }
  function parseSubtitles(text) {
    var result = [], decoder = null;
    text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/).forEach(function (block) {
      var lines = block.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var times = lines[i].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
        if (!times) continue;
        var start = stamp(times[1]), end = stamp(times[2]), content = lines.slice(i + 1).join('\n').replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '');
        if (content.indexOf('&') >= 0) { if (!decoder) decoder = document.createElement('textarea'); decoder.innerHTML = content; content = decoder.value; }
        if (Number.isFinite(start) && end > start && content) result.push({start:start, end:end, text:content});
        break;
      }
    });
    return result.sort(function (a,b) { return a.start - b.start; });
  }
  function SubtitleCache() { this.db = null; }
  SubtitleCache.prototype.open = function () {
    var self = this;
    if (self.db) return Promise.resolve(self.db);
    return new Promise(function (resolve) {
      if (!global.indexedDB) { resolve(null); return; }
      var request = indexedDB.open('moviebox-subtitles', 1);
      request.onupgradeneeded = function () { request.result.createObjectStore('tracks', {keyPath:'key'}); };
      request.onsuccess = function () { self.db = request.result; resolve(self.db); };
      request.onerror = function () { resolve(null); };
    });
  };
  SubtitleCache.prototype.get = function (key) { return this.open().then(function (db) { return new Promise(function (resolve) { if (!db) return resolve(null); var request = db.transaction('tracks').objectStore('tracks').get(key); request.onsuccess = function () { resolve(request.result || null); }; request.onerror = function () { resolve(null); }; }); }); };
  SubtitleCache.prototype.put = function (value) { return this.open().then(function (db) { if (!db) return; try { var store = db.transaction('tracks','readwrite').objectStore('tracks'); store.put(value); var count = store.count(); count.onsuccess = function () { if (count.result > 80) { var cursor = store.openCursor(); cursor.onsuccess = function () { if (cursor.result && cursor.result.key !== value.key) cursor.result.delete(); }; } }; } catch (_) { /* Playback continues if TV storage is full. */ } }); };
  SubtitleCache.prototype.clear = function () { return this.open().then(function (db) { if (db) db.transaction('tracks','readwrite').objectStore('tracks').clear(); }); };
  function chooseQuality(streams, preferred, speed) {
    var sorted = streams.slice().sort(function (a,b) { return b.resolutions - a.resolutions; });
    if (preferred && preferred !== 'auto') return sorted.find(function (s) { return s.resolutions <= Number(preferred); }) || sorted[sorted.length - 1];
    var choices = sorted.filter(function (s) { return s.resolutions <= 1080; }); if (!choices.length) choices = sorted;
    var available = Number(speed) || 6;
    return choices.find(function (s) { var bitrate = s.duration > 0 && s.size > 0 ? s.size * 8 / s.duration / 1000000 : s.resolutions >= 1080 ? 5 : 2; return bitrate * 1.45 < available; }) || choices[choices.length - 1];
  }
  var AUDIO_LANGUAGES = {en:'English',hi:'Hindi',bn:'Bangla',ar:'Arabic',fr:'French',es:'Spanish',esla:'Spanish (Latin America)',pt:'Portuguese',ptbr:'Portuguese (Brazil)',ta:'Tamil',te:'Telugu',kn:'Kannada',ml:'Malayalam',ur:'Urdu',id:'Indonesian',tr:'Turkish',ru:'Russian',zh:'Chinese',ja:'Japanese',ko:'Korean'};
  function languageCode(code) { code = String(code || '').toLowerCase(); return ({eng:'en',hin:'hi',ben:'bn',ara:'ar',fra:'fr',fre:'fr',spa:'es',por:'pt',tam:'ta',tel:'te',kan:'kn',mal:'ml',urd:'ur',ind:'id',tur:'tr',rus:'ru',zho:'zh',chi:'zh',jpn:'ja',kor:'ko'})[code] || code; }
  function languageLabel(item) { var code = languageCode(item.lanCode || item.language); return AUDIO_LANGUAGES[code] || String(item.lanName || item.label || 'Original audio').replace(/ dub$/i,''); }
  function audioVariants(subject) { var seen = {}; return (subject.dubs || []).filter(function (item) { var id = String(item.subjectId || ''); if (Number(item.type || 0) !== 0 || !id || seen[id]) return false; seen[id] = true; return true; }); }
  function runtimeTolerance(duration) { return Math.max(2,Math.min(10,Number(duration || 0) * 0.001)); }
  function matchingRuntime(streams, duration) { if (!(duration > 0)) return streams; var matched = streams.filter(function (stream) { return Math.abs(Number(stream.duration || 0) - duration) <= runtimeTolerance(duration); }); if (!matched.length) { var error = new Error('This audio edition is a different cut. You can restart that edition from the beginning.'); error.code = 'DIFFERENT_RUNTIME'; throw error; } return matched; }
  function audioSubject(subject, variant) { return Object.assign({},subject,{subjectId:String(variant.subjectId),_audio_base_id:String(subject._audio_base_id || subject.subjectId),_audio_code:languageCode(variant.lanCode),_audio_language:languageLabel(variant)}); }
  function Player(api, callbacks) {
    this.api = api; this.callbacks = callbacks || {}; this.native = !!(global.webapis && webapis.avplay); this.av = this.native ? webapis.avplay : null;
    this.video = $('html-player'); this.page = $('player-page'); this.page.tabIndex = -1; this.cache = new SubtitleCache(); this.active = false; this.epoch = 0; this.captionEpoch = 0;
    this.cues = []; this.position = 0; this.duration = 0; this.paused = false; this.bufferEvents = []; this.lastQualityChange = 0; this.pendingResume = 0; this.captionDelay = 0; this.audioEpoch = 0; this.audioTracks = [];
    this.seekTarget = null; this.seekInFlight = null; this.seekTimer = null; this.preparing = false; this.seekSerial = 0; this.lastNativeError = null; this.seekGraceUntil = 0; this.lastBufferEvent = null;
    this.bufferTimer = null; this.bufferWaiting = false; this.scrubbing = false;
    this.seekDiagnostics = {requested:0,issued:0,completed:0,coalesced:0,state:'idle',target:null,lastConfirmed:0,lastState:'NONE',lastError:null,epoch:0};
    document.body.classList.toggle('native-avplay', this.native);
    $('player-engine').textContent = this.native ? 'SAMSUNG NATIVE PLAYER' : 'BROWSER PREVIEW';
    var self = this;
    this.video.addEventListener('timeupdate', function () { if (!self.native) self.tick(self.video.currentTime * 1000); });
    this.video.addEventListener('loadedmetadata', function () { self.duration = self.video.duration * 1000; if (self.pendingResume) { self.video.currentTime = Math.min(self.pendingResume, Math.max(0, self.duration - 1000)) / 1000; self.pendingResume = 0; } });
    this.video.addEventListener('seeked', function () { if (!self.native && self.seekInFlight) self.finishSeek(self.seekInFlight,null); });
    this.video.addEventListener('playing', function () { self.loading(false); self.paused = false; self.updatePlayButton(); if (self.callbacks.onStarted) self.callbacks.onStarted(); });
    this.video.addEventListener('pause', function () { if (!self.native) { self.paused = true; self.updatePlayButton(); } });
    this.video.addEventListener('waiting', function () { if (!self.native && self.active) self.buffering(); });
    this.video.addEventListener('ended', function () { if (!self.native) self.notifyEnded(); });
    this.video.addEventListener('error', function () { if (self.active && !self.native) self.error('The browser cannot decode this source. The TV uses its own native player.'); });
    $('play-pause').onclick = function () { self.toggle(); };
    $('seek-back').onclick = function () { self.skip(-10000); };
    $('seek-forward').onclick = function () { self.skip(10000); };
    $('seek-bar').addEventListener('input', function () { self.scrubbing = true; $('player-clock').textContent = clock(Number(this.value)) + ' / ' + clock(self.duration); });
    $('seek-bar').addEventListener('change', function () { self.scrubbing = false; self.seek(Number(this.value)); });
    $('seek-bar').addEventListener('blur', function () { self.scrubbing = false; });
    $('quality-select').onchange = function () { self.selectQuality(this.value); };
    $('audio-select').onchange = function () { self.selectAudio(this.value); };
    $('restart-audio').onclick = function () { self.restartAudioEdition(); };
    $('subtitle-select').onchange = function () { self.selectCaption(this.value); };
    $('subtitle-delay').onchange = function () { self.captionDelay = Number(this.value); self.renderCaption(); };
    this.page.addEventListener('mousemove', function (event) { if (!self.lastMouse || self.lastMouse[0] !== event.clientX || self.lastMouse[1] !== event.clientY) { self.lastMouse = [event.clientX,event.clientY]; self.reveal(); } });
    this.page.addEventListener('pointerdown', function () { self.reveal(); });
    this.page.addEventListener('dblclick', function (event) { if (event.target === self.video || event.target === $('av-player')) { self.reveal(); if (!self.native && self.page.requestFullscreen && !document.fullscreenElement) self.page.requestFullscreen().catch(function () {}); else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } });
    this.saveTimer = setInterval(function () { if (self.active && self.callbacks.onProgress) self.callbacks.onProgress(self.position,self.duration); }, 1500);
    document.addEventListener('visibilitychange', function () { if (document.hidden && self.active) { self.pause(); if (self.callbacks.onProgress) self.callbacks.onProgress(self.position,self.duration); } });
  }
  Player.prototype.loading = function (show, text) { if (!show) { clearTimeout(this.bufferTimer); this.bufferTimer = null; this.bufferWaiting = false; } $('player-loading').hidden = !show; if (text) $('loading-text').textContent = text; };
  Player.prototype.bufferingIndicator = function (percent) {
    this.bufferText = percent === undefined ? 'Buffering…' : 'Buffering · ' + percent + '%';
    if (this.preparing) return;
    if (this.bufferWaiting) { if (!$('player-loading').hidden) $('loading-text').textContent = this.bufferText; return; }
    this.bufferWaiting = true;
    var self = this, epoch = this.epoch, seeking = this.seekInFlight || this.seekTarget !== null || Date.now() < this.seekGraceUntil;
    this.bufferTimer = setTimeout(function () { self.bufferTimer = null; if (self.active && self.bufferWaiting && self.epoch === epoch) self.loading(true,self.bufferText); },seeking ? 900 : 450);
  };
  Player.prototype.error = function (message) { this.loading(false); this.reveal(); if (this.callbacks.onError) this.callbacks.onError(message); };
  Player.prototype.reveal = function () { if (!this.active) return; this.page.classList.remove('controls-hidden'); clearTimeout(this.hideTimer); var self = this; this.hideTimer = setTimeout(function () { if (document.querySelector('.remote-picker') || document.activeElement.closest('#next-up,#episode-drawer')) return self.reveal(); self.page.classList.add('controls-hidden'); self.page.focus(); }, 3500); };
  Player.prototype.updatePlayButton = function () { $('play-pause').textContent = this.paused ? '▶ Play' : 'Ⅱ Pause'; };
  Player.prototype.open = function (subject, streams, options) {
    options = options || {}; this.pendingAudioRestart = null; $('restart-audio').hidden = true;
    this.subject = subject; this.baseSubject = options.canonicalSubject || subject; this.streams = streams; this.options = options; this.key = options.key || String(subject.subjectId); this.subtitleKey = String(subject.subjectId) + ':' + Number(options.season || 0) + ':' + Number(options.episode || 0); this.preference = options.quality || 'auto'; this.active = true; this.page.hidden = false; this.page.tabIndex = -1; this.cues = []; this.captionEpoch++; this.audioEpoch++; this.audioTracks = [];
    $('subtitle-overlay').textContent = ''; $('now-title').textContent = subject.title + (options.season ? ' · S' + options.season + ' E' + options.episode : '');
    $('episode-browser').hidden = Number((options.canonicalSubject || subject).subjectType) !== 2;
    this.populateQualities(); this.populateAudioTracks();
    var speed = global.navigator.connection && navigator.connection.downlink;
    var stream = options.initialStream || chooseQuality(streams,this.preference,speed);
    if (!stream) { this.error('No playable stream is available.'); return; }
    this.start(stream, Number(options.position) || 0, false);
    this.loadCaptions(stream, options.subtitleEnabled !== false, options.language || 'en');
    this.reveal();
  };
  Player.prototype.start = function (stream, position, paused) {
    var self = this, epoch = ++this.epoch; this.resetSeek(); this.preparing = true; this.seekDiagnostics.epoch = epoch; this.seekDiagnostics.state = 'preparing'; this.stream = stream; this.completed = false; this.endNotified = false; this.position = Math.max(0,Math.round(Number(position) || 0)); this.duration = Math.max(0,Math.round(Number(stream.duration || 0) * 1000)); this.paused = !!paused; this.lastQualityChange = Date.now(); this.loading(true, 'Opening ' + stream.resolutions + 'p…');
    $('quality-select').options[0].text = 'Auto · ' + stream.resolutions + 'p'; this.updatePlayButton();
    function prepared() {
      if (epoch !== self.epoch || !self.active) return;
      self.duration = self.native ? self.av.getDuration() : self.video.duration * 1000;
      self.preparing = false;
      function begin() { if (epoch !== self.epoch) return; self.av.play(); self.populateAudioTracks(true); if (self.paused) self.av.pause(); self.loading(false); self.updateTimeDisplay(); self.updatePlayButton(); if (self.callbacks.onStarted) self.callbacks.onStarted(); }
      if (self.native) {
        self.beginAfterSeek = begin;
        var target = self.seekTarget !== null ? self.seekTarget : Math.max(0,Math.round(Number(position) || 0));
        if (target > 0) self.seek(target,true);
        else { self.beginAfterSeek = null; self.seekDiagnostics.state = 'idle'; begin(); }
      }
    }
    if (this.native) {
      try {
        if (this.av.getState() !== 'NONE') this.av.close();
        this.av.open(stream.url);
        this.bufferConfiguration = {seconds:4,applied:false};
        if (this.av.setBufferingParam) { try { this.av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY','PLAYER_BUFFER_SIZE_IN_SECOND',4); this.av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME','PLAYER_BUFFER_SIZE_IN_SECOND',4); this.bufferConfiguration.applied = true; } catch (bufferError) { this.bufferConfiguration.error = String(bufferError.name || 'NotSupported'); } }
        var agent = (stream.headers || {})['User-Agent'] || this.api.streamUserAgent;
        if (agent) this.av.setStreamingProperty('USER_AGENT', agent);
        this.av.setDisplayRect(0,0,window.innerWidth,window.innerHeight);
        this.av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        this.av.setListener({
          onbufferingstart:function () { if (epoch === self.epoch) self.buffering(); },
          onbufferingprogress:function (percent) { if (epoch === self.epoch) self.bufferingIndicator(percent); },
          onbufferingcomplete:function () { if (epoch === self.epoch) { self.loading(false); if (self.seekTarget !== null) self.flushSeek(); } },
          oncurrentplaytime:function (time) { if (epoch === self.epoch) self.tick(time); },
          onstreamcompleted:function () { if (epoch === self.epoch) self.notifyEnded(); },
          onerror:function (error) { if (epoch === self.epoch) { self.recordNativeError(error,'playback'); self.error('The TV could not play this source (' + self.lastNativeError.name + '). Try another available quality.'); } }
        });
        this.av.prepareAsync(prepared, function (error) { if (epoch === self.epoch) { self.preparing = false; self.recordNativeError(error,'prepare'); self.error('The TV could not prepare this video (' + self.lastNativeError.name + ').'); } });
      } catch (error) { this.preparing = false; this.recordNativeError(error,'open'); this.error('Native playback failed: ' + self.lastNativeError.name); }
    } else {
      this.video.pause(); this.pendingResume = position; this.video.src = stream.url; this.video.load();
      var result = this.video.play(); if (result) result.then(function () { if (paused) self.video.pause(); }).catch(function () { self.loading(false); self.paused = true; self.updatePlayButton(); self.reveal(); });
    }
  };
  Player.prototype.populateQualities = function () { var select = $('quality-select'); select.textContent = ''; select.add(new Option('Auto','auto')); this.streams.forEach(function (stream) { select.add(new Option(stream.resolutions + 'p',String(stream.resolutions))); }); var selected = chooseQuality(this.streams,this.preference,navigator.connection && navigator.connection.downlink); select.value = this.preference === 'auto' ? 'auto' : String(selected && selected.resolutions); };
  Player.prototype.populateAudioTracks = function (applyPreference) {
    var self = this, select = $('audio-select'), currentTrack = null; select.textContent = ''; this.audioTracks = [];
    if (this.native && this.av && ['READY','PLAYING','PAUSED'].indexOf(this.av.getState()) >= 0) {
      try { this.audioTracks = (this.av.getTotalTrackInfo() || []).filter(function (track) { return track.type === 'AUDIO'; }).map(function (track) { var info = {}; try { info = typeof track.extra_info === 'string' ? JSON.parse(track.extra_info || '{}') : track.extra_info || {}; } catch (_) {} var code = languageCode(info.language || info.Language || info.lang || info.LANGUAGE || ''); return {index:Number(track.index),code:code,label:languageLabel({language:code,label:info.track_lang || info.title || 'Audio track ' + (Number(track.index) + 1)})}; }); } catch (_) {}
      try { currentTrack = (this.av.getCurrentStreamInfo() || []).find(function (track) { return track.type === 'AUDIO'; }); } catch (_) {}
    }
    if (!this.native && this.video.audioTracks) { for (var i = 0; i < this.video.audioTracks.length; i++) { var track = this.video.audioTracks[i]; this.audioTracks.push({index:i,code:languageCode(track.language),label:track.label || languageLabel({language:track.language})}); if (track.enabled) currentTrack = {index:i}; } }
    if (this.audioTracks.length) { var embedded = document.createElement('optgroup'); embedded.label = 'Audio in this file'; this.audioTracks.forEach(function (track) { embedded.appendChild(new Option(track.label,'track:' + track.index)); }); select.appendChild(embedded); }
    var variants = audioVariants(this.baseSubject), currentId = String(this.subject.subjectId); if (!variants.some(function (variant) { return String(variant.subjectId) === currentId; })) variants.unshift({subjectId:currentId,type:0,lanCode:this.subject._audio_code || '',lanName:this.subject._audio_language || 'Current edition'});
    var editions = document.createElement('optgroup'); editions.label = 'Audio editions'; variants.forEach(function (variant) { editions.appendChild(new Option(languageLabel(variant),'edition:' + variant.subjectId)); }); select.appendChild(editions);
    select.value = currentTrack ? 'track:' + currentTrack.index : 'edition:' + currentId; this.audioSelection = select.value;
    if (applyPreference && this.options.audioLanguage) { var preferred = this.audioTracks.find(function (track) { return track.code === languageCode(self.options.audioLanguage); }); if (preferred && (!currentTrack || Number(currentTrack.index) !== preferred.index)) this.selectEmbeddedTrack(preferred.index,false); }
  };
  Player.prototype.selectEmbeddedTrack = function (index, remember) { var track = this.audioTracks.find(function (record) { return record.index === Number(index); }); if (!track) return; try { if (this.native) this.av.setSelectTrack('AUDIO',Number(index)); else if (this.video.audioTracks) { for (var i = 0; i < this.video.audioTracks.length; i++) this.video.audioTracks[i].enabled = i === Number(index); } this.audioSelection = 'track:' + index; $('audio-select').value = this.audioSelection; this.options.audioLanguage = track.code; if (remember !== false && this.callbacks.onAudioPreference) this.callbacks.onAudioPreference({kind:'track',subjectId:String(this.subject.subjectId),code:track.code,label:track.label}); } catch (_) { $('audio-select').value = this.audioSelection; this.error('The TV could not select that embedded audio track.'); } };
  Player.prototype.selectAudio = function (value) {
    var self = this; if (value.indexOf('track:') === 0) { this.selectEmbeddedTrack(Number(value.slice(6))); return; }
    var id = value.slice(8), variant = audioVariants(this.baseSubject).find(function (item) { return String(item.subjectId) === id; });
    if (id === String(this.subject.subjectId)) { this.audioSelection = value; return; }
    if (!variant) { $('audio-select').value = this.audioSelection; return; }
    var request = ++this.audioEpoch, playbackEpoch = this.epoch, subject = audioSubject(this.baseSubject,variant); this.pendingAudioRestart = null; $('restart-audio').hidden = true; $('audio-select').disabled = true; $('stream-status').textContent = 'Preparing ' + languageLabel(variant) + ' audio…';
    return this.api.playback(subject,Number(this.options.season || 0),Number(this.options.episode || 0)).then(function (streams) {
      if (!self.active || request !== self.audioEpoch || playbackEpoch !== self.epoch) return;
      try { streams = matchingRuntime(streams,Number(self.stream.duration) || self.duration / 1000); }
      catch (error) { if (error.code === 'DIFFERENT_RUNTIME') { self.pendingAudioRestart = {subject:subject,streams:streams,variant:variant}; $('restart-audio').textContent = 'Restart in ' + languageLabel(variant); $('restart-audio').hidden = false; } throw error; }
      var selected = chooseQuality(streams,self.preference,navigator.connection && navigator.connection.downlink), position = self.previewPosition(), paused = self.paused;
      self.subject = subject; self.streams = streams; self.subtitleKey = String(subject.subjectId) + ':' + Number(self.options.season || 0) + ':' + Number(self.options.episode || 0); self.options.audioLanguage = subject._audio_code;
      var captionLanguage = $('subtitle-select').value, captionsEnabled = captionLanguage !== 'off';
      self.populateQualities(); self.start(selected,position,paused); self.loadCaptions(selected,captionsEnabled,captionLanguage === 'off' ? self.options.language || 'en' : captionLanguage);
      if (self.callbacks.onAudioPreference) self.callbacks.onAudioPreference({kind:'edition',subjectId:id,code:subject._audio_code,label:subject._audio_language});
    }).catch(function (error) { if (request === self.audioEpoch) { $('audio-select').value = self.audioSelection; self.error(error.message || 'This audio edition could not be loaded.'); } }).then(function () { if (request === self.audioEpoch) $('audio-select').disabled = false; });
  };
  Player.prototype.restartAudioEdition = function () {
    var pending = this.pendingAudioRestart; if (!pending || !this.active) return;
    if (this.callbacks.onProgress) this.callbacks.onProgress(this.position,this.duration);
    this.audioEpoch++; this.pendingAudioRestart = null; $('restart-audio').hidden = true;
    this.subject = pending.subject; this.streams = pending.streams; this.options.audioLanguage = pending.subject._audio_code;
    this.subtitleKey = String(pending.subject.subjectId) + ':' + Number(this.options.season || 0) + ':' + Number(this.options.episode || 0);
    var language = $('subtitle-select').value, selected = chooseQuality(this.streams,this.preference,navigator.connection && navigator.connection.downlink);
    this.populateQualities(); this.start(selected,0,this.paused); this.loadCaptions(selected,language !== 'off',language === 'off' ? this.options.language || 'en' : language);
    if (this.callbacks.onAudioPreference) this.callbacks.onAudioPreference({kind:'edition',subjectId:String(pending.subject.subjectId),code:pending.subject._audio_code,label:pending.subject._audio_language});
  };
  Player.prototype.previewPosition = function () { return this.seekTarget !== null ? this.seekTarget : this.seekInFlight ? this.seekInFlight.target : this.position; };
  Player.prototype.updateTimeDisplay = function () { var seek = $('seek-bar'), maximum = Math.max(1000,Math.round(this.duration || 1000)), value = this.previewPosition(), text = clock(value) + ' / ' + clock(this.duration); if (Number(seek.max) !== maximum) seek.max = maximum; if (!this.scrubbing && Number(seek.value) !== value) seek.value = value; if ($('player-clock').textContent !== text) $('player-clock').textContent = text; };
  Player.prototype.tick = function (position) { this.position = Math.max(0,Math.round(Number(position) || 0)); if (!this.native && Number.isFinite(this.video.duration)) this.duration = Math.round(this.video.duration * 1000); this.updateTimeDisplay(); this.renderCaption(); if (this.callbacks.onTick) this.callbacks.onTick(this.position,this.duration); if (this.seekTarget !== null && !this.seekInFlight && this.seekDiagnostics.state === 'waiting-state') this.flushSeek(); };
  Player.prototype.renderCaption = function () { var at = this.position - this.captionDelay, low = 0, high = this.cues.length - 1, found = -1; while (low <= high) { var middle = (low + high) >> 1; if (this.cues[middle].start <= at) { found = middle; low = middle + 1; } else high = middle - 1; } var cue = this.cues[found], text = cue && cue.end > at ? cue.text : '', overlay = $('subtitle-overlay'); if (overlay.textContent !== text) overlay.textContent = text; };
  Player.prototype.toggle = function () { if (!this.active) return; if (this.paused) this.play(); else this.pause(); this.reveal(); };
  Player.prototype.play = function () { try { if (this.native) this.av.play(); else { var p = this.video.play(); if (p) p.catch(this.error.bind(this, 'Press OK on Play to begin.')); } this.paused = false; this.updatePlayButton(); } catch (e) { this.error(e.message); } };
  Player.prototype.pause = function () { try { if (this.native && this.av.getState() === 'PLAYING') this.av.pause(); else if (!this.native) this.video.pause(); this.paused = true; this.updatePlayButton(); } catch (_) {} };
  Player.prototype.recordNativeError = function (error,operation) { var name = error && (error.name || error.code || error.message) || String(error || 'UNKNOWN_ERROR'); var state = 'UNKNOWN'; try { state = this.native ? this.av.getState() : String(this.video.readyState); } catch (_) {} this.lastNativeError = {operation:operation,name:String(name),code:error && error.code !== undefined ? error.code : null,message:error && error.message || '',state:state,epoch:this.epoch,at:Date.now()}; this.seekDiagnostics.lastError = this.lastNativeError; return this.lastNativeError; };
  Player.prototype.resetSeek = function () { clearTimeout(this.seekTimer); this.loading(false); this.scrubbing = false; if (this.seekInFlight) clearTimeout(this.seekInFlight.timeout); this.seekTimer = null; this.seekTarget = null; this.seekInFlight = null; this.beginAfterSeek = null; if (this.seekDiagnostics) { this.seekDiagnostics.state = 'idle'; this.seekDiagnostics.target = null; } };
  Player.prototype.skip = function (milliseconds) { this.seek(this.previewPosition() + milliseconds); };
  Player.prototype.seek = function (position, immediate) {
    if (!this.active) return;
    var maximum = Math.max(0,Math.round(Number(this.duration || Number((this.stream || {}).duration) * 1000) || 0) - 1000);
    position = Math.max(0,Math.min(Math.round(Number(position) || 0),maximum));
    if (this.seekTarget !== null || this.seekInFlight) this.seekDiagnostics.coalesced++;
    this.seekTarget = position; this.seekDiagnostics.requested++; this.seekDiagnostics.target = position; this.seekDiagnostics.state = this.preparing ? 'waiting-prepare' : this.seekInFlight ? 'queued' : 'debouncing';
    this.seekGraceUntil = Date.now() + 8000; this.bufferEvents = [];
    this.reveal(); this.updateTimeDisplay(); $('stream-status').textContent = 'Seeking to ' + clock(position) + '…';
    clearTimeout(this.seekTimer); this.seekTimer = null; var self = this;
    if (immediate) this.flushSeek(); else this.seekTimer = setTimeout(function () { self.seekTimer = null; self.flushSeek(); },150);
  };
  Player.prototype.flushSeek = function () {
    var self = this;
    if (!this.active || this.seekTarget === null || this.seekInFlight || this.preparing) return;
    var state;
    try { state = this.native ? this.av.getState() : this.video.readyState >= 1 ? 'PLAYING' : 'IDLE'; }
    catch (error) { this.recordNativeError(error,'seek-state'); this.seekDiagnostics.state = 'failed'; this.error('The TV could not read playback state (' + this.lastNativeError.name + ').'); return; }
    this.seekDiagnostics.lastState = state;
    if (['READY','PLAYING','PAUSED'].indexOf(state) < 0) { this.seekDiagnostics.state = 'waiting-state'; return; }
    var flight = {id:++this.seekSerial,epoch:this.epoch,target:this.seekTarget,state:state,paused:this.paused,started:Date.now(),timeout:null};
    this.seekTarget = null; this.seekInFlight = flight; this.seekDiagnostics.issued++; this.seekDiagnostics.state = 'in-flight'; this.seekDiagnostics.target = flight.target;
    flight.timeout = setTimeout(function () { if (self.seekInFlight !== flight || flight.epoch !== self.epoch) return; self.seekDiagnostics.state = 'timeout'; self.recordNativeError({name:'SEEK_TIMEOUT',message:'Native seek callback did not arrive within 10 seconds.'},'seek'); self.error('The TV did not confirm seeking (SEEK_TIMEOUT). Try reopening this video.'); },10000);
    try { if (this.native) this.av.seekTo(flight.target,function () { self.finishSeek(flight,null); },function (error) { self.finishSeek(flight,error || {name:'UNKNOWN_SEEK_ERROR'}); }); else this.video.currentTime = flight.target / 1000; }
    catch (error) { this.finishSeek(flight,error); }
  };
  Player.prototype.finishSeek = function (flight,error) {
    if (flight.epoch !== this.epoch || this.seekInFlight !== flight || !this.active) return;
    clearTimeout(flight.timeout); this.seekInFlight = null;
    this.seekDiagnostics.lastDurationMs = Date.now() - flight.started;
    this.seekGraceUntil = Date.now() + 8000; this.bufferEvents = [];
    if (error) { this.recordNativeError(error,'seek'); this.seekDiagnostics.state = 'failed'; this.updateTimeDisplay(); this.error('The TV could not seek (' + this.lastNativeError.name + ').'); }
    else {
      var confirmed = flight.target; try { if (this.native && this.av.getCurrentTime) { var actual = Number(this.av.getCurrentTime()); if (Number.isFinite(actual) && actual >= 0 && (!(this.duration > 0) || actual <= this.duration)) confirmed = Math.round(actual); } } catch (_) {}
      this.tick(confirmed); this.seekDiagnostics.completed++; this.seekDiagnostics.lastConfirmed = confirmed; this.seekDiagnostics.state = 'completed';
      try { if (this.native && this.paused && this.av.getState() === 'PLAYING') this.av.pause(); } catch (pauseError) { this.recordNativeError(pauseError,'pause-after-seek'); }
      if (this.callbacks.onProgress) this.callbacks.onProgress(this.position,this.duration);
    }
    if (this.seekTarget !== null) { if (!this.seekTimer) this.flushSeek(); return; }
    this.seekDiagnostics.target = null;
    if (!error) $('stream-status').textContent = '';
    if (this.beginAfterSeek) { var begin = this.beginAfterSeek; this.beginAfterSeek = null; begin(); }
  };
  Player.prototype.selectQuality = function (value) { var previous = this.preference; this.preference = value; var target = chooseQuality(this.streams,value,navigator.connection && navigator.connection.downlink); if (target && target.url !== this.stream.url) { try { matchingRuntime([target],Number(this.stream.duration) || this.duration / 1000); } catch (_) { this.preference = previous; $('quality-select').value = previous; this.error('That quality contains a different cut. Keep this quality to preserve your place.'); return; } var language = $('subtitle-select').value; this.start(target,this.previewPosition(),this.paused); this.loadCaptions(target,language !== 'off',language === 'off' ? this.options.language || 'en' : language); } };
  Player.prototype.buffering = function () {
    if (!this.active) return;
    this.bufferingIndicator();
    var reason = this.preparing ? 'preparing' : this.seekInFlight || this.seekTarget !== null ? 'seeking' : Date.now() < this.seekGraceUntil ? 'seek-grace' : 'network', nativeState = '';
    try { nativeState = this.native ? this.av.getState() : ''; } catch (_) {}
    this.lastBufferEvent = {at:Date.now(),reason:reason,state:nativeState,quality:this.stream && this.stream.resolutions};
    if (reason !== 'network' || (this.native && nativeState !== 'PLAYING') || this.paused || this.preference !== 'auto' || Date.now() - this.lastQualityChange < 15000) return;
    this.bufferEvents = this.bufferEvents.filter(function (time) { return Date.now() - time < 45000; }); this.bufferEvents.push(Date.now());
    if (this.bufferEvents.length < 2) return;
    var current = this.stream.resolutions, runtime = Number(this.stream.duration) || this.duration / 1000;
    var target = this.streams.filter(function (stream) { return stream.resolutions < current && (!(runtime > 0) || Math.abs(Number(stream.duration || 0) - runtime) <= runtimeTolerance(runtime)); }).sort(function (a,b) { return b.resolutions - a.resolutions; })[0];
    if (target) { this.bufferEvents = []; this.start(target,this.previewPosition(),false); $('stream-status').textContent = 'Auto adjusted for your connection'; }
  };
  Player.prototype.loadCaptions = function (stream, enabled, language) {
    var self = this, epoch = ++this.captionEpoch, cacheKey = this.subtitleKey + ':' + language;
    this.cues = []; $('subtitle-overlay').textContent = ''; $('subtitle-select').textContent = ''; $('subtitle-select').add(new Option('Off','off'));
    function fill(captions) { self.captions = captions; captions.forEach(function (c) { $('subtitle-select').add(new Option(c.lanName || c.lan || 'Subtitle', c.lan || c.id)); }); }
    this.cache.get(cacheKey).then(function (cached) {
      if (epoch !== self.captionEpoch) return;
      if (cached && enabled) { fill(cached.captions || [cached.caption]); self.cues = cached.cues; $('subtitle-select').value = cached.language; self.renderCaption(); return; }
      return self.api.captions(self.subject,stream.id).then(function (result) { if (epoch !== self.captionEpoch) return; fill(result.captions || []); if (enabled) { var preferred = self.captions.find(function (c) { return c.lan === language; }) || self.captions.find(function (c) { return c.lan === 'en'; }) || self.captions.find(function (c) { return !!c.url; }); if (preferred) { $('subtitle-select').value = preferred.lan || preferred.id; return self.selectCaption(preferred.lan || preferred.id); } } });
    }).catch(function () { if (epoch === self.captionEpoch) $('stream-status').textContent = 'Subtitles unavailable for this source'; });
  };
  Player.prototype.selectCaption = function (language) {
    var self = this, epoch = ++this.captionEpoch; this.cues = []; $('subtitle-overlay').textContent = '';
    if (this.callbacks.onCaptionPreference) this.callbacks.onCaptionPreference(language);
    if (language === 'off') return Promise.resolve();
    var key = this.subtitleKey + ':' + language;
    return this.cache.get(key).then(function (cached) { if (epoch !== self.captionEpoch) return; if (cached) return cached; var caption = (self.captions || []).find(function (c) { return String(c.lan || c.id) === String(language); }); if (!caption || !caption.url) { return self.api.captions(self.subject,self.stream.id).then(function (data) { self.captions = data.captions || []; caption = self.captions.find(function (c) { return String(c.lan || c.id) === String(language); }); return download(caption); }); } return download(caption); }).then(function (record) { if (!record || epoch !== self.captionEpoch) return; self.cues = record.cues; self.renderCaption(); $('stream-status').textContent = record.caption.lanName + ' subtitles ready'; }).catch(function () { if (epoch === self.captionEpoch) $('stream-status').textContent = 'Could not load this subtitle language'; });
    function download(caption) { if (!caption || !caption.url) throw new Error('No subtitle URL'); return self.api.text(caption.url,caption.headers).then(function (text) { var cues = parseSubtitles(text); if (!cues.length) throw new Error('No readable subtitle cues'); var descriptor = {lan:caption.lan,lanName:caption.lanName || caption.lan}; var record = {key:key,language:language,caption:descriptor,captions:(self.captions || []).map(function (c) { return {lan:c.lan,lanName:c.lanName,id:c.id}; }),cues:cues,saved:Date.now()}; self.cache.put(record); return record; }); }
  };
  Player.prototype.stop = function () { if (this.active && this.callbacks.onProgress) this.callbacks.onProgress(this.position,this.duration); this.active = false; this.epoch++; this.resetSeek(); this.preparing = false; this.captionEpoch++; clearTimeout(this.hideTimer); this.cues = []; $('subtitle-overlay').textContent = ''; try { if (this.native && this.av.getState() !== 'NONE') this.av.close(); else { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } } catch (_) {} this.page.hidden = true; if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); };
  Player.prototype.notifyEnded = function () { if (!this.active || this.endNotified) return; this.endNotified = true; this.completed = true; if (this.callbacks.onEnd) this.callbacks.onEnd(); };
  Player.prototype.handleKey = function (key,event) { if (!this.active) return false; if (key === 'Back' || key === 'Escape' || (key === 'Backspace' && document.activeElement.tagName !== 'INPUT')) { if (this.callbacks.onBack) this.callbacks.onBack(); return true; } if (key === 'MediaPlayPause' || key === ' ') { this.toggle(); return true; } if (key === 'MediaPlay') { this.play(); return true; } if (key === 'MediaPause') { this.pause(); return true; } if (key === 'MediaStop') { if (this.callbacks.onBack) this.callbacks.onBack(); return true; } if (key === 'MediaRewind' || key === 'MediaFastForward') { this.skip(key === 'MediaRewind' ? -10000 : 10000); return true; } var hidden = this.page.classList.contains('controls-hidden'); if ((key === 'ArrowLeft' || key === 'ArrowRight') && (hidden || document.activeElement === $('seek-bar') || document.activeElement === this.page)) { this.skip(key === 'ArrowLeft' ? -10000 : 10000); $('seek-bar').focus(); return true; } if (key === 'Enter' && document.activeElement === $('seek-bar')) { this.flushSeek(); return true; } if (key === 'Enter' && (hidden || document.activeElement === this.page || document.activeElement === $('play-pause') || document.activeElement === this.video || document.activeElement === $('av-player'))) { if (event && event.repeat) return true; this.toggle(); $('play-pause').focus(); return true; } if (/^Arrow/.test(key) || key === 'Tab' || key === 'Enter') { this.reveal(); if (hidden) { $('play-pause').focus(); return true; } } return false; };
  global.MovieBoxPlayer = Player; global.MovieBoxSubtitles = {parse:parseSubtitles,Cache:SubtitleCache}; global.MovieBoxChooseQuality = chooseQuality;
  global.MovieBoxAudio = {variants:audioVariants,label:languageLabel,subject:audioSubject,matchingRuntime:matchingRuntime,tolerance:runtimeTolerance};
})(window);
