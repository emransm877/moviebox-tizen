(function(global){
  'use strict';
  var app=global.MovieBoxTV,player=app.player,nav=app.navigation;
  function $(id){return document.getElementById(id);}
  var more=$('player-more'),returnFocus=null,fitIndex=0,shortcutDown=false;
  function closeMore(){if(more.hidden)return;more.hidden=true;nav.scope($('player-page'));player.reveal();nav.focus(returnFocus&&returnFocus.isConnected?returnFocus:$('player-more-button'));}
  function openMore(){returnFocus=document.activeElement;more.hidden=false;nav.scope(more);nav.focus($('player-more-close'));player.reveal();}
  $('player-more-button').onclick=function(){if(more.hidden)openMore();else closeMore();};$('player-more-close').onclick=closeMore;
  var originalHandler=nav.handler;
  nav.handler=function(key,event,input){
    if(!more.hidden){if(key==='Back'||key==='Escape'){closeMore();return true;}if(/^Media/.test(key))return player.handleKey(key,event);return false;}
    if(key==='ArrowUp'&&event&&event.repeat&&shortcutDown)return true;
    if(key==='ArrowUp'&&player.active&&player.page.classList.contains('controls-hidden')&&$('episode-drawer').hidden&&Number((player.options.canonicalSubject||player.subject||{}).subjectType)===2&&document.activeElement.tagName!=='SELECT'){
      if(!event||!event.repeat){shortcutDown=true;app.openEpisodeDrawer();}return true;
    }
    return originalHandler(key,event,input);
  };
  document.addEventListener('keyup',function(event){if(event.key==='ArrowUp'||event.keyCode===38)shortcutDown=false;});
  var stop=player.stop;player.stop=function(){closeMore();return stop.apply(this,arguments);};
  var fitModes=['PLAYER_DISPLAY_MODE_LETTER_BOX','PLAYER_DISPLAY_MODE_CROPPED_FULL','PLAYER_DISPLAY_MODE_FULL_SCREEN'],fitNames=['Fit','Crop','Stretch'],fitIcons=['fit','crop','stretch'];
  $('video-fit').onclick=function(){
    var next=(fitIndex+1)%3;
    try{if(player.native)player.av.setDisplayMethod(fitModes[next]);else player.video.style.objectFit=['contain','cover','fill'][next];fitIndex=next;player.displayMode=fitModes[next];$('video-fit').title='Video size: '+fitNames[next];$('video-fit').setAttribute('aria-label',$('video-fit').title);$('video-fit').querySelector('img').src='assets/player-icons/video-scale-'+fitIcons[next]+'.svg';}
    catch(_){app.toast?app.toast('This video sizing mode is unavailable.'):null;}
  };
  function tvAudio(){return global.tizen&&tizen.tvaudiocontrol;}
  function syncVolume(){
    var api=tvAudio(),volume,muted;
    try{if(player.native&&api){volume=api.getVolume();muted=api.isMute();}else if(!player.native){volume=Math.round(player.video.volume*100);muted=player.video.muted;}else{$('mute-button').disabled=true;$('volume-slider').disabled=true;return;}
      $('mute-button').disabled=false;$('volume-slider').disabled=false;$('volume-slider').value=volume;
      var label=muted?'Unmute':'Mute';$('mute-button').title=label;$('mute-button').setAttribute('aria-label',label);$('mute-button').querySelector('img').src='assets/player-icons/volume-'+(muted||volume===0?'mute':'high')+'.svg';
    }catch(_){$('mute-button').disabled=true;$('volume-slider').disabled=true;}
  }
  $('mute-button').onclick=function(){try{var api=tvAudio();if(player.native&&api)api.setMute(!api.isMute());else player.video.muted=!player.video.muted;syncVolume();}catch(_){};};
  $('volume-slider').oninput=function(){try{var value=Math.max(0,Math.min(100,Number(this.value))),api=tvAudio();if(player.native&&api)api.setVolume(value);else player.video.volume=value/100;syncVolume();}catch(_){};};
  var started=player.callbacks.onStarted;player.callbacks.onStarted=function(){if(started)started.apply(this,arguments);syncVolume();};
  try{if(tvAudio())tvAudio().setVolumeChangeListener(syncVolume);}catch(_){}
  player.video.addEventListener('volumechange',syncVolume);
  global.MovieBoxInlineControls={openMore:openMore,closeMore:closeMore,syncVolume:syncVolume};
})(window);
