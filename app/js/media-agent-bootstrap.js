/* Configure this app before its media element or media backend is initialized. */
(function(global){
  'use strict';
  global.MovieBoxOriginalMediaAgent=navigator.userAgent;
  global.MovieBoxMediaUserAgent='com.community.oneroom/50020104 (Linux; U; Android 17; en_US; TizenTV; Build/LOCAL; Cronet/135.0.7012.3) MovieBoxTV/0.1';
  global.MovieBoxMediaAgentReady=new Promise(function(resolve){
    if(!global.tizen||!tizen.websetting){resolve(false);return;}
    var done=false,timer=setTimeout(function(){finish(false);},3000);
    function finish(value){if(done)return;done=true;clearTimeout(timer);resolve(value);}
    try{tizen.websetting.setUserAgentString(global.MovieBoxMediaUserAgent,function(){finish(true);},function(){finish(false);});}catch(_){finish(false);}
  });
})(window);
