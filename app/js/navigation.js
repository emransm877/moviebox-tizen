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
    document.addEventListener('focusin',function(event){if(event.target.closest&&event.target.closest('#player-controls .transport-row'))self.lastPlayerControl=event.target;});
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
    if (!element || !element.isConnected || element.disabled || element.closest('[hidden]')) return;
    var entry = this.layout().find(function (record) { return record.element === element; });
    if (!entry) { this.invalidate(); entry = this.layout().find(function (record) { return record.element === element; }); }
    if (!entry) return;
    if (document.activeElement !== element) { try { element.focus({preventScroll:true}); } catch (_) { element.focus(); } this.metrics.focusChanges++; }
    var main = element.closest('#main-content'), scrollArea = element.closest('.remote-picker-options,.player-episode-list') || main, bounds = scrollArea ? scrollArea.getBoundingClientRect() : {top:0,bottom:global.innerHeight,left:0,right:global.innerWidth};
    if (main) {
      var firstTop = this.entries.filter(function (record) { return main.contains(record.element); }).reduce(function (top,record) { return Math.min(top,record.top); },Infinity);
      if (entry.top <= firstTop + 8 && main.scrollTop > 0) { main.scrollTop = 0; this.invalidate(); return; }
    }
    if (entry.top < bounds.top + 20 || entry.bottom > bounds.bottom - 24 || entry.left < bounds.left || entry.right > bounds.right) {
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
    var longest=Array.prototype.reduce.call(select.options,function(width,option){return Math.max(width,option.textContent.length);},0);
    panel.style.width='max-content';
    var title = document.createElement('h2'); title.textContent = select.getAttribute('aria-label') || (select.labels && select.labels[0] ? select.labels[0].textContent.split('\n')[0].trim() : 'Choose an option'); panel.appendChild(title);
    var choices = document.createElement('div'); choices.className = 'remote-picker-options'; panel.appendChild(choices);
    Array.prototype.forEach.call(select.options,function (option) {
      var button = document.createElement('button'); button.className = 'secondary'; button.textContent = option.textContent; button.disabled = option.disabled; button.dataset.value = option.value; button.classList.toggle('active', option.selected);
      button.onclick = function () { select.value = option.value; self.closePicker(); select.dispatchEvent(new Event('change',{bubbles:true})); };
      choices.appendChild(button);
    });
    var cancel = document.createElement('button'); cancel.className = 'quiet'; cancel.textContent = 'Cancel'; cancel.onclick = function () { self.closePicker(); }; panel.appendChild(cancel); shade.appendChild(panel); document.body.appendChild(shade);
    var context=document.createElement('canvas').getContext('2d'),first=choices.querySelector('button');
    var optionStyle=getComputedStyle(first||cancel);context.font=optionStyle.font||[optionStyle.fontWeight,optionStyle.fontSize,optionStyle.fontFamily].join(' ');
    var optionWidth=Array.prototype.reduce.call(select.options,function(width,option){return Math.max(width,context.measureText(option.textContent).width);},0);
    var titleStyle=getComputedStyle(title);context.font=titleStyle.font||[titleStyle.fontWeight,titleStyle.fontSize,titleStyle.fontFamily].join(' ');var titleWidth=context.measureText(title.textContent).width;
    panel.style.width=Math.ceil(Math.min(innerWidth-40,560,Math.max(200,optionWidth+96,titleWidth+46)))+'px';
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
    var playerRow=active.closest&&active.closest('#player-controls .transport-row');
    if(playerRow){
      var rowItems=entries.filter(function(entry){return playerRow.contains(entry.element);}).map(function(entry){return entry.element;});
      this.lastPlayerControl=active;
      if(horizontal){var index=rowItems.indexOf(active),target=rowItems[Math.max(0,Math.min(rowItems.length-1,index+(positive?1:-1)))];if(target){this.focus(target);this.lastPlayerControl=target;}}
      else if(direction==='ArrowUp'){var seek=document.getElementById('seek-bar');if(entries.some(function(entry){return entry.element===seek;}))this.focus(seek);}
      this.metrics.lastMoveMs=Math.round((performance.now()-started)*100)/100;this.metrics.maxMoveMs=Math.max(this.metrics.maxMoveMs,this.metrics.lastMoveMs);return;
    }
    if(active.id==='seek-bar'&&direction==='ArrowDown'){
      var rowEntries=entries.filter(function(entry){return entry.element.closest('#player-controls .transport-row');});
      var previous=this.lastPlayerControl,target=rowEntries.some(function(entry){return entry.element===previous;})?previous:(rowEntries[0]&&rowEntries[0].element);
      if(target)this.focus(target);
      this.metrics.lastMoveMs=Math.round((performance.now()-started)*100)/100;this.metrics.maxMoveMs=Math.max(this.metrics.maxMoveMs,this.metrics.lastMoveMs);return;
    }
    var main = active.closest && active.closest('#main-content'), sidebar = active.closest && active.closest('.sidebar'), region = !horizontal && (main || sidebar);
    var best = null, score = Infinity;
    entries.forEach(function (entry) {
      if (entry.element === active) return;
      if (region && !region.contains(entry.element)) return;
      var dx = entry.x - cx, dy = entry.y - cy;
      var forward = horizontal ? dx : dy, sideways = Math.abs(horizontal ? dy : dx);
      if ((positive && forward < 8) || (!positive && forward > -8)) return;
      forward = Math.abs(forward);
      var candidate = forward + sideways * 2.5 + (sideways > forward * 1.4 ? 800 : 0);
      if (candidate < score) { score = candidate; best = entry.element; }
    });
    // Horizontal theme navigation needs a vertical bridge to the content below it.
    var header = document.querySelector('.sidebar');
    if (!best && !horizontal && header && header.getBoundingClientRect().width > innerWidth * .8 &&
        ((main && !positive && main.scrollTop <= 1) || (sidebar && positive))) {
      entries.forEach(function (entry) {
        if (entry.element === active || (main ? !header.contains(entry.element) : !entry.element.closest('#main-content'))) return;
        var dy = entry.y - cy;
        if ((positive && dy < 8) || (!positive && dy > -8)) return;
        var candidate = Math.abs(dy) + Math.abs(entry.x - cx) * 2.5;
        if (candidate < score) { score = candidate; best = entry.element; }
      });
    }
    if (best) this.focus(best);
    else if (!horizontal && main) { var edge = positive ? Math.max(0,main.scrollHeight - main.clientHeight) : 0; if (main.scrollTop !== edge) { main.scrollTop = edge; this.invalidate(); } }
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
