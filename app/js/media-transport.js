/* App-scoped TV media transport and bounded, asynchronous source recovery. */
(function (global) {
  'use strict';
  var P=global.MovieBoxPlayer.prototype,baseOpen=P.open,baseStart=P.start,baseStop=P.stop,baseError=P.error,baseSeek=P.seek,baseKey=P.handleKey,basePlay=P.play,basePause=P.pause,baseReveal=P.reveal,baseEnded=P.notifyEnded;
  var realTV=!!(global.tizen&&tizen.websetting),agentPromise=null,storage='moviebox-tv-playback-diagnostics',journal={events:[],lastSample:null};
  try { var saved=JSON.parse(localStorage.getItem(storage)||'null');if(saved&&Array.isArray(saved.events))journal=saved; } catch (_) {}
  function persist(){try{localStorage.setItem(storage,JSON.stringify(journal));}catch(_) {}}
  function note(kind,data,immediate){journal.events.push({at:Date.now(),kind:kind,data:data||{}});journal.events=journal.events.slice(-48);if(immediate)persist();}
  function snapshot(p){var e=p.lastNativeError;return {engine:p.native?'avplay':'html',active:!!p.active,position:p.position,duration:p.duration,paused:!!p.paused,preparing:!!p.preparing,seeking:!!p.seekInFlight,recovering:!!p.transportRecovering,failed:!!p.transportFailed,error:e?{operation:e.operation,name:e.name,code:e.code,state:e.state,epoch:e.epoch,at:e.at}:null};}
  function agentReady(api){
    if(!realTV)return Promise.resolve(false);
    if(global.MovieBoxMediaAgentReady)return global.MovieBoxMediaAgentReady;
    if(!agentPromise)agentPromise=new Promise(function(resolve){var done=false,timer=setTimeout(function(){finish(false);},3000);function finish(value){if(done)return;done=true;clearTimeout(timer);resolve(value);}try{tizen.websetting.setUserAgentString(api.streamUserAgent,function(){finish(true);},function(){finish(false);});}catch(_){finish(false);}});
    return agentPromise;
  }
  function panel(p,message,failed){
    var el=document.getElementById('transport-recovery');
    if(!el){el=document.createElement('aside');el.id='transport-recovery';el.className='transport-recovery';el.setAttribute('role','status');el.innerHTML='<p></p><div><button id="transport-retry" class="primary">Retry playback</button><button id="transport-back" class="secondary">Back to details</button></div>';p.page.appendChild(el);document.getElementById('transport-retry').onclick=function(){p.transportRecoveryCount=0;p.recoverTransport('manual-retry',p.transportRecoveryPosition);};document.getElementById('transport-back').onclick=function(){if(p.callbacks.onBack)p.callbacks.onBack();};}
    el.hidden=false;el.querySelector('p').textContent=message;document.getElementById('transport-retry').hidden=!failed;
    p.page.classList.remove('controls-hidden');clearTimeout(p.hideTimer);
    if(failed){var nav=global.MovieBoxTV&&MovieBoxTV.navigation;if(nav){nav.scope(p.page);nav.focus(document.getElementById('transport-retry'));}}
  }
  function hidePanel(){var el=document.getElementById('transport-recovery');if(el)el.hidden=true;}
  function failed(p,message){p.transportRecovering=false;p.transportFailed=true;p.preparing=false;p.resetSeek();p.loading(false);clearTimeout(p.transportStartTimer);panel(p,message,true);note('failed',snapshot(p),true);}
  function install(p){
    if(p.transportInstalled)return;p.transportInstalled=true;p.nativeAvailable=p.native;p.transportRequest=0;
    var started=p.callbacks.onStarted;
    p.callbacks.onStarted=function(){p.transportRecovering=false;p.transportFailed=false;p.preparing=false;clearTimeout(p.transportStartTimer);hidePanel();note('started',snapshot(p));if(started)started.apply(this,arguments);};
    p.transportSampleTimer=setInterval(function(){if(!p.active)return;journal.lastSample={at:Date.now(),state:snapshot(p)};persist();},15000);
  }
  P.open=function(){install(this);this.transportRecoveryCount=0;this.transportRecovering=false;this.transportFailed=false;this.transportForceNative=false;return baseOpen.apply(this,arguments);};
  P.start=function(stream,position,paused){
    install(this);var p=this,request=++p.transportRequest;
    p.transportFailed=false;hidePanel();clearTimeout(p.transportStartTimer);
    p.epoch++;p.resetSeek();p.preparing=true;p.paused=!!paused;
    var mode=p.options&&p.options.engine||'auto',mp4=!/\.(m3u8|mpd)(?:[?#]|$)/i.test(stream.url);
    var web=realTV&&mode!=='native'&&!p.transportForceNative&&mp4;
    function launch(useWeb){
      if(request!==p.transportRequest||!p.active)return;
      var native=p.nativeAvailable&&!useWeb;
      // Switching engines cancels only this media session, never the application.
      p.epoch++;
      if(p.native&&!native){try{if(p.av.getState()!=='NONE')p.av.close();}catch(_){}}
      if(!p.native&&native){p.video.pause();p.video.removeAttribute('src');p.video.load();}
      if(useWeb&&realTV&&!p.transportVideoReady){
        var old=p.video,fresh=old.cloneNode(false);
        (p.videoListeners||[]).forEach(function(binding){old.removeEventListener(binding[0],binding[1]);});
        old.pause();old.removeAttribute('src');old.load();old.parentNode.replaceChild(fresh,old);p.video=fresh;
        (p.videoListeners||[]).forEach(function(binding){fresh.addEventListener(binding[0],binding[1]);});
        if(global.MovieBoxInlineControls)fresh.addEventListener('volumechange',MovieBoxInlineControls.syncVolume);
        p.transportVideoReady=true;
      }
      p.native=native;document.body.classList.toggle('native-avplay',native);document.getElementById('player-engine').textContent=native?'SAMSUNG NATIVE PLAYER':realTV?'TV VIDEO PLAYER':'BROWSER PREVIEW';
      note('start',{engine:native?'avplay':'html',position:position||0,quality:stream.resolutions});
      var queued=p.seekTarget;if(queued!==null)position=queued;
      baseStart.call(p,stream,position,p.paused);
      if(realTV)p.transportStartTimer=setTimeout(function(){if(request===p.transportRequest&&p.active&&p.preparing)p.recoverTransport('prepare-timeout',position);},15000);
    }
    if(web){p.preparing=true;p.loading(true,'Opening video...');agentReady(p.api).then(function(ok){launch(ok);});}else launch(!p.nativeAvailable);
  };
  P.recoverTransport=function(reason,target){
    var p=this;if(!p.active)return;
    if(p.transportRecovering)return;
    p.transportRecoveryPosition=Math.max(0,Math.round(Number(target)||Number(p.previewPosition())||0));
    note('recover-request',{reason:reason,state:snapshot(p),target:p.transportRecoveryPosition},true);
    if((p.transportRecoveryCount||0)>=2){failed(p,'Playback could not reconnect. Retry or choose another quality; your place is saved.');return;}
    p.transportRecoveryCount=(p.transportRecoveryCount||0)+1;p.transportRecovering=true;p.transportFailed=false;
    var paused=p.paused,subject=p.subject,season=Number(p.options.season||0),episode=Number(p.options.episode||0),runtime=Number((p.stream||{}).duration)||p.duration/1000,quality=Number((p.stream||{}).resolutions)||1080;
    var request=++p.transportRequest;p.epoch++;p.resetSeek();p.preparing=true;clearTimeout(p.transportStartTimer);p.loading(false);panel(p,'Reconnecting playback at your selected position...',false);
    // Leave native callback stacks before closing/reopening or making any new request.
    setTimeout(function(){
      if(!p.active||request!==p.transportRequest)return;
      try{if(p.native){if(p.av.getState()!=='NONE')p.av.close();}else p.video.pause();}catch(_){}
      Promise.resolve().then(function(){return p.api.playback(subject,season,episode);}).then(function(streams){
        if(!p.active||request!==p.transportRequest)return;
        var compatible=global.MovieBoxAudio.matchingRuntime(streams,runtime),selected=compatible.find(function(s){return Number(s.resolutions)===quality;})||global.MovieBoxChooseQuality(compatible,p.preference);
        if(!selected)throw new Error('No matching playable source');
        p.streams=streams;p.populateQualities();p.transportRecovering=false;
        p.start(selected,p.transportRecoveryPosition,p.paused);
      }).catch(function(){if(p.active&&request===p.transportRequest)failed(p,'Could not reconnect to this video. Retry or return to details; your place is saved.');});
    },0);
  };
  P.error=function(message){
    var error=this.lastNativeError,htmlError=!this.native&&this.video.error;
    note('error',{message:String(message).replace(/https?:\/\/\S+/g,'[URL]'),state:snapshot(this)},true);
    if(this.active&&((error&&Date.now()-error.at<2000&&/CONNECTION_FAILED|SEEK_TIMEOUT/.test(error.name))||htmlError)){
      if(htmlError&&(htmlError.code===3||htmlError.code===4)&&!/NETWORK/i.test(htmlError.message||'')&&this.nativeAvailable&&(this.options.engine||'auto')==='auto')this.transportForceNative=true;
      this.recoverTransport(error?error.name:'video-error',this.seekTarget!==null?this.seekTarget:this.seekInFlight?this.seekInFlight.target:this.seekDiagnostics.target!==null?this.seekDiagnostics.target:this.position);return;
    }
    return baseError.call(this,message);
  };
  P.seek=function(){if(this.transportFailed||this.transportRecovering)return;return baseSeek.apply(this,arguments);};
  P.notifyEnded=function(){var actual=this.native?this.position:Math.max(this.position,Number(this.video.currentTime||0)*1000);if(realTV&&this.active&&this.duration>10000&&actual<this.duration-5000){note('unexpected-end',snapshot(this),true);this.recoverTransport('unexpected-end',actual);return;}return baseEnded.apply(this,arguments);};
  P.reveal=function(){if(this.transportFailed||this.transportRecovering){this.page.classList.remove('controls-hidden');clearTimeout(this.hideTimer);return;}return baseReveal.apply(this,arguments);};
  P.handleKey=function(key,event){
    if(this.active&&(this.transportFailed||this.transportRecovering)){
      this.page.classList.remove('controls-hidden');clearTimeout(this.hideTimer);
      if(key==='Back'||key==='Escape'){if(this.callbacks.onBack)this.callbacks.onBack();return true;}
      if(/^Arrow/.test(key))return false;
      if(key==='MediaPlay'||key==='MediaPlayPause'){if(this.transportFailed){this.transportRecoveryCount=0;this.recoverTransport('manual-retry',this.transportRecoveryPosition);}return true;}
      return false;
    }
    return baseKey.call(this,key,event);
  };
  P.play=function(){if(this.transportRecovering){this.paused=false;return;}if(this.transportFailed){this.transportRecoveryCount=0;this.recoverTransport('manual-retry',this.transportRecoveryPosition);return;}return basePlay.apply(this,arguments);};
  P.pause=function(){if(this.transportRecovering||this.transportFailed){this.paused=true;return;}return basePause.apply(this,arguments);};
  P.stop=function(){this.transportRequest=(this.transportRequest||0)+1;this.transportRecovering=false;this.transportFailed=false;this.htmlPrepared=null;clearTimeout(this.transportStartTimer);hidePanel();return baseStop.apply(this,arguments);};
  global.addEventListener('error',function(event){note('javascript-error',{message:String(event.message||'').replace(/https?:\/\/\S+/g,'[URL]')},true);});
  global.addEventListener('unhandledrejection',function(event){note('unhandled-rejection',{message:String(event.reason&&event.reason.message||'Unhandled promise rejection').replace(/https?:\/\/\S+/g,'[URL]')},true);});
  global.MovieBoxMediaTransport={readDiagnostics:function(){return journal;},agentReady:agentReady};
})(window);
