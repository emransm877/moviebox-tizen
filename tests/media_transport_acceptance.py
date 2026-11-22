"""Real HTML media resume/seeks plus controlled TV transport and failure policy."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import json, threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler
OUT=ROOT/'verification/media-transport';OUT.mkdir(parents=True,exist_ok=True)
FIXTURE=ROOT.parent/'MovieBoxDesktop/verification/sintel-1080p.mp4'
# CI downloads the same openly licensed Blender fixture when no local copy exists.
if not FIXTURE.exists():
 from urllib.request import urlretrieve
 FIXTURE=OUT/'sintel-1080p.mp4'
 if not FIXTURE.exists():urlretrieve('https://media.w3.org/2010/05/sintel/trailer.mp4',FIXTURE)
class Handler(QuietHandler):
 def do_GET(self):
  if self.path.split('?')[0]!='/fixture.mp4':return super().do_GET()
  size=FIXTURE.stat().st_size;start=0;end=size-1;partial=self.headers.get('Range')
  if partial:
   left,right=partial.removeprefix('bytes=').split('-',1);start=int(left);end=min(end,int(right)) if right else end
  self.send_response(206 if partial else 200);self.send_header('Content-Type','video/mp4');self.send_header('Content-Length',str(end-start+1));self.send_header('Accept-Ranges','bytes')
  if partial:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
  self.end_headers()
  try:
   with FIXTURE.open('rb') as f:
    f.seek(start);remaining=end-start+1
    while remaining:
     data=f.read(min(65536,remaining))
     if not data:break
     self.wfile.write(data);remaining-=len(data)
  except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'app')))
threading.Thread(target=server.serve_forever,daemon=True).start();checks={};errors=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(channel='msedge',headless=True)
  page=browser.new_page(viewport={'width':1920,'height':1080})
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script("window.agentConfigured=false;window.exitCalls=0;window.tizen={websetting:{setUserAgentString:function(agent,ok){setTimeout(function(){agentConfigured=true;ok();},100);}},application:{getCurrentApplication:()=>({exit:()=>exitCalls++})}};")
  stub=STUB+"""
    window.fixtureCalls=0;window.failRefresh=false;
    MovieBoxAPI.prototype.playback=function(subject,se,ep){fixtureCalls++;if(failRefresh)return Promise.reject(Error('offline'));return Promise.resolve([{id:'fixture',url:location.origin+'/fixture.mp4?fresh='+fixtureCalls,resolutions:1080,duration:52,size:14000000}]);};
  """
  page.route('**/js/api.js',lambda r:r.fulfill(content_type='text/javascript',body=stub))
  page.route('**/$WEBAPIS/**',lambda r:r.fulfill(content_type='text/javascript',body=''))
  page.route('https://api.github.com/**',lambda r:r.fulfill(content_type='application/json',body='{}'))
  page.goto(f'http://127.0.0.1:{server.server_port}/')
  page.wait_for_function('!!window.MovieBoxTV')
  page.evaluate("MovieBoxTV.state.history['movie1:0:0']={subject:movie,position:18000,duration:52000,updated:Date.now()};MovieBoxTV.openDetail(movie)")
  page.wait_for_function('!document.getElementById("watch-button").disabled')
  page.locator('#watch-button').click()
  page.wait_for_function('!MovieBoxTV.player.native && MovieBoxTV.player.position>18000 && !MovieBoxTV.player.video.paused')
  assert page.evaluate('agentConfigured')
  assert not page.evaluate("__avcalls.some(x=>x[0]==='open')")
  checks['tv_mp4_uses_html_transport_after_app_agent_setup']=True
  assert page.evaluate('MovieBoxTV.player.video.videoWidth')>0
  checks['actual_video_decodes_and_resumes_saved_position']=True
  # HTML media events are queued; a late event must agree with the current element state.
  race=page.evaluate("""()=>{const p=MovieBoxTV.player;p.pause();p.play();p.video.dispatchEvent(new Event('pause'));return {appPaused:p.paused,videoPaused:p.video.paused};}""")
  assert race=={'appPaused':False,'videoPaused':False},race
  assert page.locator('#play-pause').get_attribute('aria-label')=='Pause'
  checks['stale_html_pause_event_does_not_overwrite_immediate_resume']=True
  race=page.evaluate("""()=>{const p=MovieBoxTV.player;p.pause();p.video.dispatchEvent(new Event('playing'));return {appPaused:p.paused,videoPaused:p.video.paused};}""")
  assert race=={'appPaused':True,'videoPaused':True},race
  assert page.locator('#play-pause').get_attribute('aria-label')=='Play'
  checks['stale_html_playing_event_does_not_overwrite_explicit_pause']=True
  page.evaluate('MovieBoxTV.player.play()')
  page.wait_for_function('!MovieBoxTV.player.paused && !MovieBoxTV.player.video.paused')
  position=page.evaluate('MovieBoxTV.player.video.currentTime')
  page.wait_for_function('(position)=>MovieBoxTV.player.video.currentTime>position+.2',arg=position)
  checks['real_decoded_video_advances_after_stale_event_sequence']=True
  for target in [10000,30000,15000]:
   page.evaluate('(target)=>MovieBoxTV.player.seek(target,true)',target)
   page.wait_for_function('(target)=>!MovieBoxTV.player.seekInFlight && Math.abs(MovieBoxTV.player.position-target)<1800',arg=target)
   before=page.evaluate('MovieBoxTV.player.position')
   page.wait_for_function('(before)=>MovieBoxTV.player.position>before',arg=before,timeout=7000)
  checks['repeated_html_seeks_finish_and_playback_keeps_advancing']=True
  page.evaluate('MovieBoxTV.player.seek(19000,true);MovieBoxTV.player.video.pause()')
  page.wait_for_function('!MovieBoxTV.player.seekInFlight && !MovieBoxTV.player.video.paused && MovieBoxTV.player.position>=19000')
  checks['engine_pause_during_seek_does_not_overwrite_play_intent']=True
  page.evaluate('MovieBoxTV.player.pause();MovieBoxTV.player.seek(22000,true)')
  page.wait_for_function('!MovieBoxTV.player.seekInFlight')
  assert page.evaluate('MovieBoxTV.player.paused && MovieBoxTV.player.video.paused')
  checks['html_seek_preserves_explicit_pause']=True
  page.wait_for_function('document.getElementById("subtitle-select").value==="en"')
  before=page.evaluate('fixtureCalls')
  page.evaluate('MovieBoxTV.player.recoverTransport("test-connection-failure",24000)')
  page.wait_for_function('fixtureCalls>1 && !MovieBoxTV.player.preparing && !MovieBoxTV.player.seekInFlight && MovieBoxTV.player.position>=24000')
  assert page.evaluate('fixtureCalls')>before
  assert page.evaluate('MovieBoxTV.player.video.paused')
  assert page.locator('#subtitle-select').input_value()=='en'
  checks['connection_recovery_refreshes_url_and_keeps_pause_captions_and_position']=True
  page.evaluate('failRefresh=true;MovieBoxTV.player.recoverTransport("test-offline",24000)')
  page.wait_for_function('MovieBoxTV.player.transportFailed')
  page.locator('#transport-retry').focus();page.keyboard.press('ArrowRight')
  assert page.evaluate('document.activeElement.id')=='transport-back'
  assert page.evaluate('exitCalls')==0
  checks['failed_network_keeps_remote_retry_and_back_available_without_app_exit']=True
  journal=page.evaluate('JSON.parse(localStorage.getItem("moviebox-tv-playback-diagnostics"))')
  assert any(x['kind']=='recover-request' for x in journal['events'])
  assert 'User-Agent' not in json.dumps(journal) and 'http://' not in json.dumps(journal)
  checks['failure_journal_persists_without_urls_or_request_headers']=True
  page.evaluate('failRefresh=false')
  page.locator('#transport-retry').click()
  page.wait_for_function('!MovieBoxTV.player.preparing && !MovieBoxTV.player.seekInFlight && !MovieBoxTV.player.transportFailed')
  checks['explicit_retry_recovers_after_network_returns']=True
  page.evaluate('MovieBoxTV.player.notifyEnded()')
  page.wait_for_function('!MovieBoxTV.player.preparing && !MovieBoxTV.player.seekInFlight && !MovieBoxTV.player.transportRecovering')
  assert page.evaluate('MovieBoxTV.player.active && !MovieBoxTV.player.completed')
  checks['premature_end_does_not_mark_finished_or_exit_player']=True
  page.keyboard.press('Escape');page.wait_for_function('!document.getElementById("detail-page").hidden')
  checks['back_returns_to_details_and_preserves_history']=page.evaluate("!!MovieBoxTV.state.history['movie1:0:0']")
  page.locator('[data-nav="settings"]').click();page.locator('#preferred-engine').select_option('native')
  assert page.evaluate('MovieBoxTV.state.settings.playerEngine')=='native'
  checks['native_engine_choice_is_retained_in_settings']=True
  assert not errors,errors;checks['no_runtime_exceptions']=True
  browser.close()
finally:
 server.shutdown();result={'scope':'Real HTML video decoding/seeks in Edge, mocked Samsung agent setup and controlled network failures; separate TV evidence required.','checks':checks,'passed':len(checks)==16 and all(checks.values()) and not errors}
 (OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
