"""Exercise native seek callback failures, busy commands and bounded recovery."""
import json, mimetypes, traceback
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright
from ui_acceptance import STUB, ROOT

OUT = ROOT / 'verification/seek-lifecycle'
OUT.mkdir(parents=True, exist_ok=True)
# Route the real checked-out static files directly. No TCP listener/backlog can
# drop a boot script, and every unexpected network dependency fails visibly.
ORIGIN = 'http://127.0.0.1:8765'
APP = (ROOT/'app').resolve()
checks, requests, failed_requests, console_errors = {}, [], [], []
failure = None

def fixture(route):
 request=route.request; parsed=urlsplit(request.url)
 if request.url.startswith(ORIGIN+'/'):
  relative=unquote(parsed.path).lstrip('/') or 'index.html'
  if relative=='js/api.js':
   body=STUB.encode('utf-8'); content_type='text/javascript'
  elif relative.startswith('$WEBAPIS/'):
   body=b''; content_type='text/javascript'
  else:
   asset=(APP/relative).resolve()
   if not asset.is_relative_to(APP) or not asset.is_file():
    requests.append({'url':request.url,'status':404,'resource':request.resource_type})
    route.fulfill(status=404,body='Missing fixture asset'); return
   body=asset.read_bytes()
   content_type={'.js':'text/javascript','.css':'text/css','.html':'text/html'}.get(asset.suffix,mimetypes.guess_type(str(asset))[0] or 'application/octet-stream')
  requests.append({'url':request.url,'status':200,'bytes':len(body),'resource':request.resource_type})
  route.fulfill(status=200,content_type=content_type,body=body)
 elif parsed.hostname=='api.github.com':
  requests.append({'url':request.url,'status':200,'resource':request.resource_type})
  route.fulfill(content_type='application/json',body='{}')
 else:
  requests.append({'url':request.url,'status':'blocked-unexpected','resource':request.resource_type})
  route.abort()

def capture_failure(page, errors):
 evidence={'failure':failure,'pageErrors':errors,'consoleErrors':console_errors,'requests':requests,'failedRequests':failed_requests}
 try:
  evidence['document']=page.locator('html').evaluate("e=>({readyState:document.readyState,appReady:!!window.MovieBoxTV,scripts:[...document.scripts].map(s=>s.src),body:document.body.innerText.slice(0,12000)})",timeout=3000)
  (OUT/'failure.html').write_text(page.content(),encoding='utf-8')
 except Exception as error:evidence['domCaptureError']=str(error)
 try:page.screenshot(path=str(OUT/'failure.png'),timeout=5000)
 except Exception as error:evidence['screenshotError']=str(error)
 (OUT/'failure.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
try:
 with sync_playwright() as pw:
  browser = pw.chromium.launch(channel='msedge', headless=True)
  page = browser.new_page(viewport={'width':1920,'height':1080})
  errors = []
  page.on('pageerror', lambda e: errors.append(str(e)))
  page.on('requestfailed', lambda request:failed_requests.append({'url':request.url,'failure':request.failure}))
  page.on('console',lambda message:console_errors.append(message.text) if message.type=='error' else None)
  page.route('**/*',fixture)
  try:
   page.goto(ORIGIN+'/')
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
   assert not failed_requests, failed_requests
   assert all(request['status']==200 for request in requests), requests
   checks['no_runtime_exceptions'] = True
  except Exception:
   failure=traceback.format_exc();capture_failure(page,errors);raise
  finally:
   browser.close()
finally:
 result={'scope':'Mocked native callback control in Edge; not proof of original full-interface freeze cause.','checks':checks,'passed':len(checks)==8 and failure is None,'failure':failure,'fixtureRequests':requests}
 (OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 print(json.dumps(result,indent=2))
