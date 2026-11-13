(function (global) {
  'use strict';
  function visible(element) {
    return !element.disabled && element.getAttribute('tabindex') !== '-1' &&
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  }
  function Navigation(handler) {
    this.handler = handler;
    this.root = document;
    this.picker = null;
    this.dirty = true; this.entries = []; this.cachedItems = [];
    this.metrics = {layoutBuilds:0,layoutReads:0,cacheHits:0,keyMoves:0,lastMoveMs:0,maxMoveMs:0,focusChanges:0,lastHandlerMs:0,maxHandlerMs:0,lastInputDelayMs:0,maxInputDelayMs:0};
    var self = this;
    this.observer = new MutationObserver(function (changes) { if (changes.some(function (change) { var node = change.target.nodeType === 1 ? change.target : change.target.parentElement; return !node || !node.closest('#subtitle-overlay,#player-clock,#stream-status,#toast'); })) self.invalidate(); });
    global.addEventListener('resize',function () { self.invalidate(); });
    document.addEventListener('scroll',function () { self.invalidate(); },true);
    this.scope(document);
    this.keydown = function (event) {
      var started = performance.now(), stamp = Number(event.timeStamp);
      if (stamp > 1000000000000 && performance.timeOrigin) stamp -= performance.timeOrigin;
      var delay = started - stamp;
      if (delay >= 0 && delay < 60000) { self.metrics.lastInputDelayMs = Math.round(delay * 100) / 100; self.metrics.maxInputDelayMs = Math.max(self.metrics.maxInputDelayMs,self.metrics.lastInputDelayMs); }
      try { self.onKey(event); }
      finally { self.metrics.lastHandlerMs = Math.round((performance.now() - started) * 100) / 100; self.metrics.maxHandlerMs = Math.max(self.metrics.maxHandlerMs,self.metrics.lastHandlerMs); }
    };
    document.addEventListener('keydown', this.keydown);
    try {
      if (global.tizen && tizen.tvinputdevice) {
        ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward', 'ColorF0Red'].forEach(function (key) {
          try { tizen.tvinputdevice.registerKey(key); } catch (_) { /* Some remotes omit optional keys. */ }
        });
      }
    } catch (_) { /* Browser preview has no Tizen input service. */ }
  }
  Navigation.prototype.invalidate = function () { this.dirty = true; };
  Navigation.prototype.scope = function (root) { this.root = root || document; if (this.observer) { this.observer.disconnect(); this.observer.observe(this.root === document ? document.documentElement : this.root,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','disabled','style','tabindex']}); } this.invalidate(); };
  Navigation.prototype.layout = function () {
    if (!this.dirty) { this.metrics.cacheHits++; return this.entries; }
    var self = this; this.dirty = false; this.metrics.layoutBuilds++; this.entries = [];
    Array.prototype.forEach.call(this.root.querySelectorAll('button,input,select,a[href],[tabindex="0"]'),function (element) {
      if (element.disabled || element.getAttribute('tabindex') === '-1' || element.closest('[hidden]')) return;
      var rect = element.getBoundingClientRect(); self.metrics.layoutReads++;
      if (rect.width <= 0 || rect.height <= 0 || getComputedStyle(element).visibility === 'hidden') return;
      self.entries.push({element:element,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,x:rect.left + rect.width / 2,y:rect.top + rect.height / 2});
    });
    this.cachedItems = this.entries.map(function (entry) { return entry.element; }); return this.entries;
  };
  Navigation.prototype.items = function () {
    this.layout(); return this.cachedItems;
  };
  Navigation.prototype.focus = function (element) {
    if (!element || document.activeElement === element || !element.isConnected || element.disabled || element.closest('[hidden]')) return;
    var entry = this.layout().find(function (record) { return record.element === element; });
    if (!entry) { this.invalidate(); entry = this.layout().find(function (record) { return record.element === element; }); }
    if (!entry) return;
    try { element.focus({preventScroll:true}); } catch (_) { element.focus(); }
    this.metrics.focusChanges++;
    if (entry.top < 20 || entry.bottom > global.innerHeight - 24 || entry.left < 0 || entry.right > global.innerWidth) {
      try { element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'}); } catch (_) { element.scrollIntoView(false); }
      this.invalidate();
    }
  };
  Navigation.prototype.first = function () { this.focus(this.items()[0]); };
  Navigation.prototype.openPicker = function (select) {
    var self = this, previousRoot = this.root;
    if (this.picker) this.closePicker();
    var shade = document.createElement('div'); shade.className = 'modal-shade remote-picker'; shade.setAttribute('role','dialog'); shade.setAttribute('aria-modal','true');
    var panel = document.createElement('div'); panel.className = 'modal';
    var title = document.createElement('h2'); title.textContent = select.getAttribute('aria-label') || (select.labels && select.labels[0] ? select.labels[0].textContent.split('\n')[0].trim() : 'Choose an option'); panel.appendChild(title);
    var choices = document.createElement('div'); choices.className = 'remote-picker-options'; panel.appendChild(choices);
    Array.prototype.forEach.call(select.options,function (option) {
      var button = document.createElement('button'); button.className = 'secondary'; button.textContent = option.textContent; button.disabled = option.disabled; button.dataset.value = option.value; button.classList.toggle('active', option.selected);
      button.onclick = function () { select.value = option.value; self.closePicker(); select.dispatchEvent(new Event('change',{bubbles:true})); };
      choices.appendChild(button);
    });
    var cancel = document.createElement('button'); cancel.className = 'quiet'; cancel.textContent = 'Cancel'; cancel.onclick = function () { self.closePicker(); }; panel.appendChild(cancel); shade.appendChild(panel); document.body.appendChild(shade);
    this.picker = {element:shade,select:select,root:previousRoot}; this.scope(shade); this.focus(choices.querySelector('button.active:not(:disabled)') || choices.querySelector('button:not(:disabled)') || cancel);
  };
  Navigation.prototype.closePicker = function () {
    if (!this.picker) return;
    var previous = this.picker; this.picker = null; previous.element.remove(); this.scope(previous.root); this.focus(previous.select);
  };
  Navigation.prototype.move = function (direction) {
    var started = performance.now(), active = document.activeElement, entries = this.layout(), current = entries.find(function (entry) { return entry.element === active; }); this.metrics.keyMoves++;
    if (!current) { this.focus(entries[0] && entries[0].element); return; }
    var cx = current.x, cy = current.y;
    var horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight', positive = direction === 'ArrowRight' || direction === 'ArrowDown';
    var best = null, score = Infinity;
    entries.forEach(function (entry) {
      if (entry.element === active) return;
      var dx = entry.x - cx, dy = entry.y - cy;
      var forward = horizontal ? dx : dy, sideways = Math.abs(horizontal ? dy : dx);
      if ((positive && forward < 8) || (!positive && forward > -8)) return;
      forward = Math.abs(forward);
      var candidate = forward + sideways * 2.5 + (sideways > forward * 1.4 ? 800 : 0);
      if (candidate < score) { score = candidate; best = entry.element; }
    });
    if (best) this.focus(best);
    this.metrics.lastMoveMs = Math.round((performance.now() - started) * 100) / 100;
    this.metrics.maxMoveMs = Math.max(this.metrics.maxMoveMs,this.metrics.lastMoveMs);
  };
  Navigation.prototype.onKey = function (event) {
    var key = ({37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',13:'Enter',10009:'Back',10252:'MediaPlayPause',415:'MediaPlay',19:'MediaPause',413:'MediaStop',412:'MediaRewind',417:'MediaFastForward',65376:'InputDone',65385:'InputCancel'})[event.keyCode] || event.key;
    var active = document.activeElement;
    var textInput = active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit)$/i.test(active.type)));
    // Samsung's own IME owns text/composition keys. Never suppress its text editing.
    if (textInput && (event.isComposing || event.keyCode === 229)) return;
    if (textInput && (key === 'InputDone' || key === 'InputCancel' || key === 'Back' || key === 'Escape')) {
      var inputKey = key === 'InputDone' ? 'InputDone' : 'InputCancel';
      active.blur(); if (this.handler) this.handler(inputKey,event,active); return;
    }
    if (textInput && key === 'Enter' && global.tizen && tizen.tvinputdevice) { active.focus(); active.click(); return; }
    if (this.picker) {
      if (key === 'Back' || key === 'Escape') { this.closePicker(); event.preventDefault(); return; }
      if (/^Arrow/.test(key)) { this.move(key); event.preventDefault(); return; }
      if (key === 'Enter' && active && active.tagName === 'BUTTON') { active.click(); event.preventDefault(); return; }
      return;
    }
    if (this.handler && this.handler(key, event)) { event.preventDefault(); return; }
    active = document.activeElement;
    if (key === 'Enter' && active && active.tagName === 'SELECT') { this.openPicker(active); event.preventDefault(); return; }
    if (active && active.tagName === 'INPUT' && /^(checkbox|radio)$/.test(active.type) && key === 'Enter') { active.click(); event.preventDefault(); return; }
    var editing = textInput || (active && active.tagName === 'INPUT' && active.type === 'range');
    if (/^Arrow/.test(key) && !editing) { this.move(key); event.preventDefault(); }
    if (active && active.tagName === 'INPUT' && active.type === 'range' && (key === 'ArrowUp' || key === 'ArrowDown')) { this.move(key); event.preventDefault(); }
    if (key === 'Enter' && active && !editing && active.tagName !== 'BUTTON') { active.click(); event.preventDefault(); }
  };
  global.MovieBoxNavigation = Navigation;
})(window);
