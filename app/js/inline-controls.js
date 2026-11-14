(function(global){
  'use strict';
  var app=global.MovieBoxTV,player=app.player,nav=app.navigation;
  function $(id){return document.getElementById(id);}
  var more=$('player-more'),volumePopup=$('volume-popover'),returnFocus=null,fitIndex=0,shortcutDown=false;
  $('mute-button').setAttribute('aria-haspopup','dialog');$('mute-button').setAttribute('aria-controls','volume-popover');$('mute-button').setAttribute('aria-expanded','false');
  function closeVolume(){if(volumePopup.hidden)return;volumePopup.hidden=true;$('mute-button').setAttribute('aria-expanded','false');nav.scope($('player-page'));player.reveal();nav.focus($('mute-button'));}
  function openVolume(){closeMore();syncVolume();volumePopup.hidden=false;$('mute-button').setAttribute('aria-expanded','true');nav.scope(volumePopup);player.reveal();nav.focus($('volume-slider'));}
  function closeMore(){if(more.hidden)return;more.hidden=true;nav.scope($('player-page'));player.reveal();nav.focus(returnFocus&&returnFocus.isConnected?returnFocus:$('player-more-button'));}
  function openMore(){closeVolume();returnFocus=$('player-more-button');more.hidden=false;nav.scope(more);nav.focus($('player-more-close'));player.reveal();}
  $('player-more-button').onclick=function(){if(more.hidden)openMore();else closeMore();};$('player-more-close').onclick=closeMore;
  var originalHandler=nav.handler;
  nav.handler=function(key,event,input){
    if(!volumePopup.hidden){if(key==='Back'||key==='Escape'||(key==='Enter'&&document.activeElement===$('volume-slider'))){closeVolume();return true;}if(/^Media/.test(key))return player.handleKey(key,event);return false;}
    if(!more.hidden){if(key==='Back'||key==='Escape'){closeMore();return true;}if(/^Media/.test(key))return player.handleKey(key,event);return false;}
    if(key==='ArrowUp'&&event&&event.repeat&&shortcutDown)return true;
    if(key==='ArrowUp'&&player.active&&player.page.classList.contains('controls-hidden')&&$('episode-drawer').hidden&&Number((player.options.canonicalSubject||player.subject||{}).subjectType)===2&&document.activeElement.tagName!=='SELECT'){
      if(!event||!event.repeat){shortcutDown=true;app.openEpisodeDrawer();}return true;
    }
    return originalHandler(key,event,input);
  };
  document.addEventListener('keyup',function(event){if(event.key==='ArrowUp'||event.keyCode===38)shortcutDown=false;});
  var stop=player.stop;player.stop=function(){closeMore();closeVolume();return stop.apply(this,arguments);};
  $('mute-button').onclick=openVolume;$('volume-close').onclick=closeVolume;
  document.addEventListener('pointerdown',function(event){if(!volumePopup.hidden&&!volumePopup.contains(event.target)&&!$('mute-button').contains(event.target))closeVolume();},true);
  var fitModes=['PLAYER_DISPLAY_MODE_LETTER_BOX','PLAYER_DISPLAY_MODE_FULL_SCREEN','PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'];
  $('video-fit').onclick=function(){
    if(player.deferUntilSeek('display',function(){$('video-fit').onclick();}))return;
    var next=(fitIndex+1)%3;
    try{
      if(player.native)player.av.setDisplayMethod(fitModes[next]);else player.video.style.objectFit=['contain','cover','fill'][next];
      fitIndex=next;player.displayMode=fitModes[next];player.lastDisplayError=null;
      var name=(player.native?['Fit','Stretch','Auto aspect']:['Fit','Crop','Stretch'])[next],glyph=(player.native?['fit','stretch','fit']:['fit','crop','stretch'])[next];
      $('video-fit').title='Video size: '+name;$('video-fit').setAttribute('aria-label',$('video-fit').title);$('video-fit').dataset.mode=name;$('video-fit').querySelector('img').src='assets/player-icons/video-scale-'+glyph+'.svg';app.toast('Video size: '+name);
    }
    catch(error){player.lastDisplayError={name:error.name||'Error',mode:fitModes[next]};app.toast('Cannot change video size right now. Your previous mode is kept.');}
  };
  function tvAudio(){return global.tizen&&tizen.tvaudiocontrol;}
  function syncVolume(){
    var api=tvAudio(),volume,muted;
    try{if(player.native&&api){volume=api.getVolume();muted=api.isMute();}else if(!player.native){volume=Math.round(player.video.volume*100);muted=player.video.muted;}else{$('mute-button').disabled=true;$('volume-slider').disabled=true;return;}
      $('mute-button').disabled=false;$('volume-slider').disabled=false;$('volume-slider').value=volume;
      var label=muted?'Unmute':'Mute',image='assets/player-icons/volume-'+(muted||volume===0?'mute':'high')+'.svg';$('mute-button').title='Volume: '+volume+'%'+(muted?' · Muted':'');$('mute-button').setAttribute('aria-label','Volume');$('mute-button').querySelector('img').src=image;
      $('volume-mute').title=label;$('volume-mute').setAttribute('aria-label',label);$('volume-mute').querySelector('img').src=image;$('volume-level').textContent=volume+'%';
    }catch(_){$('mute-button').disabled=true;$('volume-slider').disabled=true;}
  }
  $('volume-mute').onclick=function(){try{var api=tvAudio();if(player.native&&api)api.setMute(!api.isMute());else player.video.muted=!player.video.muted;syncVolume();}catch(_){};};
  $('volume-slider').oninput=function(){try{var value=Math.max(0,Math.min(100,Number(this.value))),api=tvAudio();if(player.native&&api)api.setVolume(value);else player.video.volume=value/100;syncVolume();}catch(_){};};
  var started=player.callbacks.onStarted;player.callbacks.onStarted=function(){if(started)started.apply(this,arguments);syncVolume();};
  try{if(tvAudio())tvAudio().setVolumeChangeListener(syncVolume);}catch(_){}
  player.video.addEventListener('volumechange',syncVolume);
  global.MovieBoxInlineControls={openMore:openMore,closeMore:closeMore,openVolume:openVolume,closeVolume:closeVolume,syncVolume:syncVolume};
})(window);
