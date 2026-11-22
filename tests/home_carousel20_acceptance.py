"""Bounded 20-theme home, real library bindings and remote Settings; offline fixtures."""
from functools import partial
from http.server import ThreadingHTTPServer
import json,threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT,STUB,QuietHandler
OUT=ROOT/'verification/home20';OUT.mkdir(parents=True,exist_ok=True)
EXTRA='''window.pool=Array.from({length:100},(_,i)=>({...movie,subjectId:'title-'+i,title:i===4?'A very long international title বাংলা العربية 日本語 repeated for safe layout bounds and exact own artwork':'Title '+i,subjectType:i%2?2:1,releaseDate:'2026-11-22'}));MovieBoxAPI.prototype.home=async()=>({subjects:pool});'''
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'app')));threading.Thread(target=server.serve_forever,daemon=True).start();checks={}
try:
 with sync_playwright()as pw:
  browser=pw.chromium.launch(channel='msedge',headless=True)
  for width,height in [(1920,1080),(1280,720)]:
   page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('**/*',lambda r:r.abort());page.route(f'http://127.0.0.1:{server.server_port}/**',lambda r:r.continue_());page.route('**/js/api.js',lambda r:r.fulfill(content_type='text/javascript',body=STUB+EXTRA));page.route('**/$WEBAPIS/**',lambda r:r.fulfill(body=''))
   page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('MovieBoxTV.carousel.items.length===100');page.evaluate('MovieBoxTV.carousel.loaded=true;MovieBoxTV.carousel.pause(true)')
   assert page.locator('#hero-watch,#hero-info,#hero-save,#hero-previous,#hero-next,#hero-pause,#hero-counter').count()==0
   for theme in page.evaluate('MovieBoxThemeSpec.themes.map(t=>t.id)'):
    page.locator('[data-nav=settings]').click();page.locator(f'[data-theme-choice={theme}]').click()
    assert page.locator(f'[data-theme-choice={theme}]').get_attribute('aria-pressed')=='true'
    assert page.locator('.theme-tile[aria-pressed=true]').count()==1
    assert page.locator('#preferred-theme').input_value()==theme
    page.locator('[data-nav=home]').click();page.evaluate('MovieBoxTV.carousel.index=4;MovieBoxTV.carousel.render()');page.wait_for_timeout(20)
    assert page.locator('.hero-poster').count()==page.evaluate('MovieBoxThemes.record(document.documentElement.dataset.theme).geometry.visibleCards')
    assert page.locator('.hero-poster[data-active=true]').get_attribute('data-subject-id')=='title-4'
    assert page.locator('.hero-poster img').first.evaluate('n=>getComputedStyle(n).objectFit')=='cover'
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    checks[f'{width}_{theme}_real_tile_checked_persistence_bounded_own_art']=True
   page.locator('.hero-poster[data-active=true]').focus();page.keyboard.press('ArrowRight');assert page.locator('.hero-poster[data-active=true]').get_attribute('data-subject-id')=='title-5',page.evaluate('({index:MovieBoxTV.carousel.index,id:MovieBoxTV.carousel.current().subjectId,focus:document.activeElement.outerHTML})')
   assert page.evaluate('document.activeElement.dataset.subjectId')=='title-5'
   page.keyboard.press('ArrowUp');assert page.evaluate('document.activeElement.id')=='' and page.evaluate('document.activeElement.dataset.nav')=='home'
   page.locator('.hero-poster[data-active=true]').click();page.wait_for_function('!document.getElementById("watch-button").disabled');assert not page.evaluate('MovieBoxTV.player.active');assert page.locator('#detail-title').inner_text()=='Title 5';page.locator('#detail-back').click()
   checks[f'{width}_remote_poster_moves_up_and_opens_own_detail_without_play']=True
   page.evaluate('''()=>{let a=MovieBoxTV; a.state.history={older:{subject:pool[1],position:1000,duration:100000,updated:1,se:1,ep:1},'title-1:2:3':{subject:pool[1],position:64000,duration:100000,updated:5,se:2,ep:3},done:{subject:pool[2],position:99000,duration:100000,updated:9,completed:true},zero:{subject:pool[3],position:0,duration:100000,updated:9},movie:{subject:pool[4],position:25000,duration:100000,updated:4}};a.renderHomeHistory();}''')
   assert page.locator('.home-history-card').count()==2
   assert page.locator('.home-history-card').first.get_attribute('data-history-key')=='title-1:2:3'
   assert 'S2 E3' in page.locator('.home-history-card').first.inner_text()
   page.evaluate('window.restoreHistory=MovieBoxTV.state.history;MovieBoxTV.state.history={};MovieBoxTV.renderHomeHistory();MovieBoxTV.state.history=restoreHistory;MovieBoxTV.renderHomeHistory()');assert page.locator('.home-history-card').count()==2
   before=page.evaluate('JSON.stringify(MovieBoxTV.state.history)');page.locator('#home-history-all').click();assert page.locator('#catalog-title').inner_text()=='Continue watching';assert page.evaluate('JSON.stringify(MovieBoxTV.state.history)')==before
   checks[f'{width}_history_dedup_progress_completed_viewall_no_mutation']=True
   page.locator('[data-nav=settings]').click();assert page.evaluate('document.activeElement.dataset.themeChoice')=='grand-stage'
   page.locator('#preferred-language').focus();page.keyboard.press('ArrowDown');assert page.evaluate('document.activeElement.id')=='preferred-subtitles';page.keyboard.press('ArrowDown');assert page.evaluate('document.activeElement.id')=='clear-subtitle-cache';page.keyboard.press('ArrowUp');assert page.evaluate('document.activeElement.id')=='preferred-subtitles';page.keyboard.press('ArrowUp');assert page.evaluate('document.activeElement.id')=='preferred-language'
   page.locator('#check-updates').focus();assert page.locator('#check-updates').evaluate('n=>{let r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}')
   assert page.locator('#preferred-language').bounding_box()['width']<=160
   checks[f'{width}_settings_initial_focus_subtitle_remote_order_update_scroll']=True
   page.locator('[data-nav=home]').click();page.locator('[data-nav=home]').focus();page.evaluate('MovieBoxTV.carousel.idleUntil=0;MovieBoxTV.carousel.pause(false)');before=page.evaluate('MovieBoxTV.carousel.index');page.wait_for_timeout(2250);assert page.evaluate('MovieBoxTV.carousel.index')!=before
   for theme in page.evaluate('MovieBoxThemeSpec.themes.map(t=>t.id)'):
    page.evaluate('t=>{MovieBoxThemes.apply(t);MovieBoxTV.carousel.move(1)}',theme);page.wait_for_timeout(90)
    poses=page.locator('.hero-poster').evaluate_all('ns=>ns.map(n=>({a:n.getAnimations().length,m:getComputedStyle(n).transform}))');assert any(p['a'] and p['m'].startswith('matrix3d')for p in poses),theme
   page.emulate_media(reduced_motion='reduce');page.evaluate('MovieBoxTV.carousel.idleUntil=0;MovieBoxTV.carousel.pause(false);MovieBoxTV.carousel.move(1)');assert page.locator('.hero-poster').evaluate_all('ns=>ns.every(n=>n.getAnimations().length===0)');before=page.evaluate('MovieBoxTV.carousel.index');page.wait_for_timeout(2200);assert page.evaluate('MovieBoxTV.carousel.index')==before
   checks[f'{width}_autoplay_actual_3d_all20_and_reduced_motion']=True
   assert not errors,errors;page.close()
  browser.close()
 result={'passed':True,'scope':'Offline Edge fixture API/AVPlay, not physical TV cadence evidence','checks':checks};(OUT/'result.json').write_text(json.dumps(result,indent=2),'utf-8');print(json.dumps(result,indent=2))
finally:server.shutdown()
