"""Exercise native seek callback failures, busy commands and bounded recovery."""
import json, threading
from functools import partial
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer
from ui_acceptance import STUB, QuietHandler, ROOT

OUT = ROOT / 'verification/seek-lifecycle'
OUT.mkdir(parents=True, exist_ok=True)
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT/'app')))
threading.Thread(target=server.serve_forever, daemon=True).start()
checks = {}
try:
 with sync_playwright() as pw:
  browser = pw.chromium.launch(channel='msedge', headless=True)
  page = browser.new_page(viewport={'width':1920,'height':1080})
  errors = []
  page.on('pageerror', lambda e: errors.append(str(e)))
  page.route('**/js/api.js', lambda r:r.fulfill(content_type='text/javascript',body=STUB))
  page.route('**/$WEBAPIS/**', lambda r:r.fulfill(content_type='text/javascript',body=''))
  page.route('https://api.github.com/**', lambda r:r.fulfill(content_type='application/json',body='{}'))
  page.goto(f'http://127.0.0.1:{server.server_port}/')
  page.wait_for_function('!!window.MovieBoxTV')
  page.evaluate('MovieBoxTV.openDetail(movie)')
  page.wait_for_function('!document.getElementById("watch-button").disabled')
  page.locator('#watch-button').click()
  page.wait_for_function('nativeState==="PLAYING"')
  # Deliberately withhold callbacks and fail any native access before release.
  page.evaluate('''()=>{window.realSeek=webapis.avplay.seekTo;window.realGetState=webapis.avplay.getState;window.busy=false;window.violations=[];
    webapis.avplay.seekTo=function(target,ok,fail){busy=true;window.flight={target,ok,fail};};
    webapis.avplay.getState=function(){if(busy){violations.push('getState');throw Error('native busy');}return nativeState;};
    var play=webapis.avplay.play,pause=webapis.avplay.pause;
    webapis.avplay.play=function(){if(busy){violations.push('play');throw Error('native busy');}return play();};
    webapis.avplay.pause=function(){if(busy){violations.push('pause');throw Error('native busy');}return pause();};
    window.finish=function(error){var f=flight;busy=false;if(error)f.fail(error);else{nativePosition=f.target;f.ok();}};
    MovieBoxTV.player.seek(20000,true);nativeListener.onbufferingstart();MovieBoxTV.player.pause();
  }''')
  assert page.evaluate('violations') == []
  assert page.evaluate('MovieBoxTV.player.paused')
  assert page.evaluate('nativeState') == 'PLAYING'
  page.evaluate('finish()')
  assert page.evaluate('nativeState') == 'PAUSED'
  checks['buffer_and_pause_wait_for_native_seek_callback'] = True
  page.evaluate('MovieBoxTV.player.seek(30000,true);MovieBoxTV.player.play();finish()')
  assert page.evaluate('nativeState') == 'PLAYING' and page.evaluate('violations') == []
  checks['resume_during_seek_applied_after_callback'] = True
  page.evaluate("MovieBoxTV.player.seek(40000,true);finish({name:'InvalidValuesError',code:26,message:'PLAYER_ERROR_SEEK_FAILED'})")
  assert page.evaluate('MovieBoxTV.player.seekInFlight') is None
  page.evaluate('MovieBoxTV.player.seek(41000,true);finish()')
  assert page.evaluate('MovieBoxTV.player.position') == 41000
  checks['real_tv_error_26_does_not_lock_later_seeks'] = True
  page.evaluate("MovieBoxTV.player.seek(42000,true);MovieBoxTV.player.selectAudio('track:1');MovieBoxTV.player.selectQuality('1080');document.getElementById('video-fit').click()")
  assert page.evaluate('Object.keys(MovieBoxTV.player.pendingSeekActions).sort()') == ['audio','display','quality']
  assert page.evaluate('nativeAudioIndex') == 0
  page.evaluate('finish()')
  assert page.evaluate('nativeAudioIndex') == 1
  assert page.locator('#video-fit').get_attribute('data-mode') == 'Stretch'
  assert page.evaluate('Object.keys(MovieBoxTV.player.pendingSeekActions)') == []
  checks['audio_quality_and_size_wait_for_seek_completion'] = True
  # Virtualize only the ten-second deadline; do not wait ten seconds per failure.
  page.evaluate('''()=>{MovieBoxTV.player.pause();window.realSetTimeout=window.setTimeout;window.setTimeout=function(fn,ms){if(ms===10000){window.seekDeadline=fn;return realSetTimeout(function(){},60000);}return realSetTimeout(fn,ms);};MovieBoxTV.player.seek(50000,true);MovieBoxTV.player.seek(60000);window.oldFlight=flight;window.busy=false;webapis.avplay.seekTo=realSeek;seekDeadline();}''')
  page.wait_for_function('nativeState==="PAUSED" && !MovieBoxTV.player.seekInFlight')
  assert page.evaluate('MovieBoxTV.player.position') >= 60000
  assert page.evaluate('MovieBoxTV.player.transportRecoveryCount') == 1
  assert page.evaluate('MovieBoxTV.player.paused && nativeAudioIndex===1')
  assert page.evaluate('document.getElementById("subtitle-select").value') == 'en'
  checks['missing_callback_refreshes_source_at_latest_target_with_subtitle_preference'] = True
  epoch = page.evaluate('MovieBoxTV.player.epoch')
  page.evaluate('oldFlight.ok()')
  assert page.evaluate('MovieBoxTV.player.epoch') == epoch
  checks['late_callback_from_cancelled_session_is_ignored'] = True
  page.evaluate('''()=>{webapis.avplay.seekTo=function(){};MovieBoxTV.player.seek(70000,true);webapis.avplay.seekTo=realSeek;seekDeadline();}''')
  page.wait_for_function('nativeState==="PAUSED" && !MovieBoxTV.player.seekInFlight && MovieBoxTV.player.transportRecoveryCount===2')
  page.evaluate('''()=>{webapis.avplay.seekTo=function(){};MovieBoxTV.player.seek(71000,true);seekDeadline();}''')
  page.wait_for_function('MovieBoxTV.player.transportFailed && document.getElementById("transport-retry").offsetWidth>0')
  assert page.evaluate('MovieBoxTV.player.active')
  page.locator('#transport-retry').focus();page.keyboard.press('ArrowRight')
  assert page.evaluate('document.activeElement.id') == 'transport-back'
  assert page.evaluate('MovieBoxTV.state.history["movie1:0:0"].position') >= 60000
  checks['bounded_recovery_keeps_retry_back_and_remote_navigation_available'] = True
  assert not errors, errors
  checks['no_runtime_exceptions'] = True
  browser.close()
finally:
 server.shutdown()
 result={'scope':'Mocked native callback control in Edge; not proof of original full-interface freeze cause.','checks':checks,'passed':len(checks)==8}
 (OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 print(json.dumps(result,indent=2))
