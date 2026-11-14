/* Optional release notices only. This module never downloads or installs executable code. */
(function (global) {
  'use strict';
  var REPOSITORY = 'emransm877/moviebox-tizen', VERSION = '0.7.1', DAY = 86400000;
  var STORAGE = 'moviebox-tv-update-preferences';
  function newer(candidate, current) {
    var a = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(candidate)), b = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(current));
    if (!a || !b) return false;
    for (var i = 1; i <= 3; i++) { if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]); }
    return false;
  }
  function safeRelease(data) {
    if (!data || data.draft || data.prerelease || !newer(data.tag_name,VERSION)) return null;
    var prefix = 'https://github.com/' + REPOSITORY + '/releases/tag/';
    if (typeof data.html_url !== 'string' || data.html_url.indexOf(prefix) !== 0) return null;
    return {tag:String(data.tag_name),name:String(data.name || data.tag_name).slice(0,120),url:data.html_url};
  }
  function Releases(options) {
    options = options || {}; this.onChange = options.onChange || function () {}; this.isBusy = options.isBusy || function () { return false; }; this.manualPending = false;
    this.version = VERSION; this.repository = REPOSITORY; this.pending = null; this.inFlight = null; this.status = 'not-checked';
    try { this.preferences = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch (_) { this.preferences = {}; }
    this.preferences.enabled = this.preferences.enabled !== false;
  }
  Releases.prototype.save = function () { try { localStorage.setItem(STORAGE,JSON.stringify(this.preferences)); } catch (_) { /* Update notices are optional; full storage must not block the app. */ } };
  Releases.prototype.setEnabled = function (enabled) { this.preferences.enabled = !!enabled; if (!enabled) { this.pending = null; this.manualPending = false; } this.save(); this.onChange(); };
  Releases.prototype.later = function () { this.preferences.snoozeUntil = Date.now() + DAY; this.save(); this.pending = null; this.onChange(); };
  Releases.prototype.skip = function () { if (this.pending) this.preferences.skipped = this.pending.tag; this.save(); this.pending = null; this.onChange(); };
  Releases.prototype.check = function (manual) {
    var self = this;
    if (!manual && (!this.preferences.enabled || this.isBusy() || Date.now() - Number(this.preferences.checkedAt || 0) < DAY)) return Promise.resolve(null);
    if (this.inFlight) return this.inFlight;
    this.status = 'checking'; this.onChange();
    this.inFlight = new Promise(function (resolve) {
      var xhr = new XMLHttpRequest(); xhr.open('GET','https://api.github.com/repos/' + REPOSITORY + '/releases/latest',true); xhr.timeout = 8000;
      xhr.setRequestHeader('Accept','application/vnd.github+json');
      function finish(status, release) { self.status = status; self.preferences.checkedAt = Date.now(); self.save(); self.inFlight = null; self.pending = release || null; self.manualPending = !!manual && !!release; self.onChange(); resolve(release || null); }
      xhr.onload = function () {
        if (xhr.status === 404) return finish('no-release');
        if (xhr.status !== 200) return finish('unavailable');
        try {
          var release = safeRelease(JSON.parse(xhr.responseText));
          if (release && !manual && (release.tag === self.preferences.skipped || Date.now() < Number(self.preferences.snoozeUntil || 0))) return finish('deferred');
          finish(release ? 'available' : 'current',release);
        } catch (_) { finish('unavailable'); }
      };
      xhr.onerror = xhr.ontimeout = function () { finish('unavailable'); };
      try { xhr.send(); } catch (_) { finish('unavailable'); }
    });
    return this.inFlight;
  };
  global.MovieBoxReleases = Releases; global.MovieBoxReleaseVersion = {newer:newer,safeRelease:safeRelease,current:VERSION};
})(window);
