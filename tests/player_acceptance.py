"""Player input, end flow, episode drawer and pre-paint theme regressions."""
import json,threading
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from ui_acceptance import STUB,QuietHandler,ROOT
OUT=ROOT/'verification/player-v070';OUT.mkdir(parents=True,exist_ok=True)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'app')))
threading.Thread(target=server.serve_forever,daemon=True).start();checks={};errors=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(channel='msedge',headless=True)
  def new_page(theme='eclipse'):
    page=browser.new_page(viewport={'width':1920,'height':1080})
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/js/api.js',lambda r:r.fulfill(content_type='text/javascript',body=STUB))
    page.route('**/$WEBAPIS/**',lambda r:r.fulfill(content_type='text/javascript',body=''))
    page.route('https://api.github.com/**',lambda r:r.fulfill(content_type='application/json',body='{}'))
    page.add_init_script('''if(location.protocol==='http:'){if(!sessionStorage.getItem('seeded')){localStorage.setItem('moviebox-tv-library',JSON.stringify({settings:{theme:THEME},history:{},saved:{}}));sessionStorage.setItem('seeded','1');}window.__firstTheme='';requestAnimationFrame(function(){__firstTheme=document.documentElement.dataset.theme;});}'''.replace('THEME',json.dumps(theme)))
    page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('.poster-card').first.wait_for();page.evaluate('MovieBoxTV.carousel.loaded=true')
    return page
  for theme in ('eclipse','aurora','prism'):
    seeded=new_page(theme);seeded.wait_for_function('!!window.__firstTheme')
    assert seeded.evaluate('__firstTheme')==theme
    assert seeded.evaluate('MovieBoxInitialTheme')==theme
    assert seeded.locator('.brand img').get_attribute('src').endswith('-'+theme+'.svg')
    seeded.close()
  checks['saved_themes_applied_before_first_frame_and_matching_logo']=True
  page=new_page()
  for selector in ('.nav-button.active','.poster-card'):
    element=page.locator(selector).first;element.focus();page.wait_for_timeout(170)
    style=element.evaluate("el=>{var s=getComputedStyle(el);var art=el.querySelector('.poster-art');return {outline:s.outlineStyle,border:s.borderColor,artBorder:art?getComputedStyle(art).borderColor:'rgba(0, 0, 0, 0)'};}")
    assert style['outline']=='none' and style['border']=='rgba(0, 0, 0, 0)' and style['artBorder']=='rgba(0, 0, 0, 0)',style
  checks['home_navigation_and_posters_have_no_focus_rectangles']=True
  def start(subject='series',season=1,episode=1):
    page.evaluate('(name)=>MovieBoxTV.openDetail(window[name])',subject)
    page.wait_for_function('!document.getElementById("watch-button").disabled')
    if subject!='movie':
      page.locator('#season-select').select_option(str(season))
      page.locator(f'#episodes [data-episode="{episode}"]').click()
    else:page.locator('#watch-button').click()
    page.wait_for_function('MovieBoxTV.player.active && nativeState==="PLAYING"')
  def ended():
    page.evaluate('var previousEnd=nativeListener.onstreamcompleted;nativePosition=100000;MovieBoxTV.player.tick(100000);previousEnd();previousEnd();')
  start()
  for width in (1920,1280):
    page.set_viewport_size({'width':width,'height':1080});page.wait_for_timeout(80)
    boxes=page.locator('#player-controls .transport-row button:not([hidden]),#player-controls .transport-row select,#player-clock,#volume-slider').evaluate_all('els=>els.filter(e=>!e.hidden).map(e=>{var r=e.getBoundingClientRect();return {y:r.y+r.height/2,left:r.left,right:r.right};})')
    assert max(b['y'] for b in boxes)-min(b['y'] for b in boxes)<3,boxes
    assert all(b['left']>=0 and b['right']<=width for b in boxes),boxes
  page.locator('#player-controls').screenshot(path=str(OUT/'inline-controls.png'))
  page.set_viewport_size({'width':1920,'height':1080})
  checks['inline_player_controls_fit_one_row_at_1920_and_1280']=True
  page.evaluate("MovieBoxTV.player.page.classList.add('controls-hidden');MovieBoxTV.player.page.focus()")
  page.keyboard.down('ArrowUp');page.wait_for_timeout(260)
  assert page.locator('#episode-drawer').is_visible() and page.evaluate('nativeState')=='PLAYING'
  assert abs(page.locator('#episode-drawer').bounding_box()['x']+page.locator('#episode-drawer').bounding_box()['width']-1920)<2
  page.keyboard.down('ArrowUp');page.keyboard.up('ArrowUp')
  page.keyboard.press('Escape');assert not page.locator('#episode-drawer').is_visible()
  checks['single_up_press_opens_right_drawer_without_pausing']=True
  page.locator('#player-more-button').click();assert page.locator('#subtitle-delay').is_visible()
  assert page.evaluate('nativeState')=='PLAYING'
  page.keyboard.press('Escape');assert not page.locator('#player-more').is_visible()
  checks['more_options_and_back_preserve_playback']=True
  page.evaluate("MovieBoxTV.player.page.classList.add('controls-hidden');MovieBoxTV.player.page.focus()")
  page.keyboard.press('Enter');assert page.evaluate('nativeState')=='PAUSED'
  page.keyboard.press('Enter');assert page.evaluate('nativeState')=='PLAYING'
  page.keyboard.press('Enter');assert page.evaluate('nativeState')=='PAUSED'
  page.keyboard.press('Enter');assert page.evaluate('nativeState')=='PLAYING'
  checks['successive_ok_presses_toggle_without_waiting_for_hidden_controls']=True
  page.locator('#play-pause').focus();page.wait_for_timeout(170)
  focus=page.evaluate("(()=>{var s=getComputedStyle(document.getElementById('play-pause'));return {outline:s.outlineStyle,shadow:s.boxShadow,raised:new DOMMatrixReadOnly(s.transform).m42<0};})()")
  assert focus=={'outline':'none','shadow':'none','raised':True},focus
  page.locator('#seek-bar').focus();page.wait_for_timeout(170)
  assert page.evaluate("getComputedStyle(document.getElementById('seek-bar')).outlineStyle")=='none'
  assert page.evaluate("new DOMMatrixReadOnly(getComputedStyle(document.getElementById('seek-bar')).transform).m22")>1
  checks['player_focus_and_seek_bar_use_lift_without_outline_box']=True
  before=page.evaluate("__avcalls.filter(c=>c[0]==='pause').length")
  page.locator('#episode-browser').click();assert page.locator('#episode-drawer').is_visible()
  assert page.evaluate('nativeState')=='PLAYING'
  page.locator('#player-season-select').focus();page.keyboard.press('Enter')
  page.locator('.remote-picker button[data-value="2"]').focus();page.keyboard.press('Enter')
  assert page.evaluate('MovieBoxTV.player.options.season')==1
  assert page.evaluate("__avcalls.filter(c=>c[0]==='pause').length")==before
  page.keyboard.press('Escape');assert not page.locator('#episode-drawer').is_visible()
  assert page.evaluate('nativeState')=='PLAYING'
  checks['season_browser_and_back_leave_current_video_playing']=True
  page.locator('#episode-browser').click()
  page.locator('#player-season-select').focus();page.keyboard.press('Enter')
  page.locator('.remote-picker button[data-value="2"]').focus();page.keyboard.press('Enter')
  page.locator('#player-episode-list button[data-episode="2"]').focus();page.keyboard.press('Enter')
  page.wait_for_function('MovieBoxTV.player.active && MovieBoxTV.player.options.season===2 && MovieBoxTV.player.options.episode===2 && nativeState==="PLAYING"')
  checks['remote_episode_selection_starts_chosen_season_and_episode']=True
  start();before=page.evaluate("__avcalls.filter(c=>c[0]==='open').length")
  page.evaluate('nativePosition=90000;MovieBoxTV.player.tick(nativePosition)');assert page.locator('#next-up').is_visible()
  assert page.evaluate("__avcalls.filter(c=>c[0]==='open').length")==before
  page.locator('#next-up-hide').click();assert page.evaluate('nativeState')=='PLAYING'
  checks['near_end_next_up_prompt_does_not_skip_or_pause_content']=True
  ended();page.wait_for_function('MovieBoxTV.player.options.episode===2 && nativeState==="PLAYING"')
  assert page.evaluate("__avcalls.filter(c=>c[0]==='open').length")==before+1
  assert page.locator('#autoplay-next,#preferred-autoplay,#next-button').count()==0
  checks['series_default_autoplay_advances_once_without_checkbox']=True
  start(season=1,episode=65);ended()
  page.wait_for_function('MovieBoxTV.player.options.season===2 && MovieBoxTV.player.options.episode===1 && nativeState==="PLAYING"')
  checks['automatic_next_season_uses_available_episode_order']=True
  start(season=2,episode=8);ended()
  page.wait_for_function('!MovieBoxTV.player.active && !document.getElementById("detail-page").hidden')
  checks['final_series_episode_returns_to_its_details']=True
  start('movie');ended();page.wait_for_function('!MovieBoxTV.player.active && !document.getElementById("detail-page").hidden')
  assert page.evaluate("MovieBoxTV.state.history['movie1:0:0'].completed") is True
  page.locator('#watch-button').click();page.wait_for_function('MovieBoxTV.player.active && nativeState==="PLAYING"')
  assert page.evaluate('MovieBoxTV.player.options.position')==0
  checks['movie_end_returns_to_details_and_watch_again_starts_at_zero']=True
  page.evaluate("()=>{window.emptySeries=Object.assign({},series,{subjectId:'empty-series'});var originalPlayback=MovieBoxTV.api.playback.bind(MovieBoxTV.api);MovieBoxTV.api.playback=function(s,se,ep){if(s.subjectId==='empty-series'&&ep===2)return Promise.resolve([]);return originalPlayback(s,se,ep);};}")
  start('emptySeries');ended()
  page.wait_for_function('!MovieBoxTV.player.active && !document.getElementById("detail-page").hidden')
  checks['missing_next_stream_returns_to_details']=True
  page.evaluate("()=>{window.badSeries=Object.assign({},series,{subjectId:'bad-series'});var originalPrepare=webapis.avplay.prepareAsync;webapis.avplay.prepareAsync=function(ok,fail){if(nativeSource.includes('bad-series/1/2')){setTimeout(()=>fail({name:'PLAYER_ERROR_NOT_SUPPORTED_FORMAT'}),10);}else originalPrepare(ok,fail);};}")
  start('badSeries');ended()
  page.wait_for_function('!MovieBoxTV.player.active && !document.getElementById("detail-page").hidden')
  checks['undecodable_next_file_returns_to_details']=True
  assert not errors,errors;checks['no_javascript_exceptions']=True
  page.screenshot(path=str(OUT/'end-details.png'));browser.close()
finally:
 server.shutdown();result={'scope':'Headless Edge, fixture API, mocked AVPlay. Credits timing is not available for every upstream title.','checks':checks,'passed':len(checks)==17 and not errors}
 (OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
