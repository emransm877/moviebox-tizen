"""Cache and history management with fixture API and mocked AVPlay."""
import json,threading
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from ui_acceptance import STUB,QuietHandler,ROOT
OUT=ROOT/'verification/cache-history-v060';OUT.mkdir(parents=True,exist_ok=True)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'app')))
threading.Thread(target=server.serve_forever,daemon=True).start();checks={};errors=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(channel='msedge',headless=True);page=browser.new_page(viewport={'width':1920,'height':1080})
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.route('**/js/api.js',lambda r:r.fulfill(content_type='text/javascript',body=STUB))
  page.route('**/$WEBAPIS/**',lambda r:r.fulfill(content_type='text/javascript',body=''))
  page.route('https://api.github.com/**',lambda r:r.fulfill(content_type='application/json',body='{}'))
  page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('.poster-card').first.wait_for()
  page.evaluate('MovieBoxTV.carousel.loaded=true')
  page.locator('[data-nav=movies]').click();page.wait_for_function("document.querySelectorAll('.poster-card').length===12")
  page.locator('#more-button').click();page.wait_for_function("document.querySelectorAll('.poster-card').length===24")
  page.evaluate("document.getElementById('main-content').scrollTop=300")
  page.locator('[data-nav=tv]').click();page.wait_for_function("document.querySelector('.poster-card').dataset.subjectId.startsWith('tv-')")
  before=page.evaluate('__catalogueCalls.length')
  page.locator('[data-nav=movies]').click()
  assert page.locator('.poster-card').count()==24
  assert page.evaluate('__catalogueCalls.length')==before
  page.wait_for_timeout(50);assert page.evaluate("document.getElementById('main-content').scrollTop")>0
  checks['cached_section_restores_loaded_pages_and_scroll_without_request']=True
  page.evaluate("MovieBoxTV.catalogueStore.flush()")
  page.reload();page.locator('.poster-card').first.wait_for();page.evaluate('MovieBoxTV.carousel.loaded=true')
  page.locator('[data-nav=movies]').click();assert page.locator('.poster-card').count()==24
  assert page.evaluate('(window.__catalogueCalls||[]).length')==0
  checks['catalogue_cache_survives_reload']=True
  page.evaluate("var cache=MovieBoxTV.catalogueStore;Object.keys(cache.entries).forEach(k=>cache.entries[k].at=Date.now()-300001)")
  page.locator('[data-nav=tv]').click();page.locator('[data-nav=movies]').click()
  assert page.locator('.poster-card').count()==24
  page.wait_for_function("document.getElementById('apply-filters').getAttribute('aria-busy')!=='true'")
  checks['stale_catalogue_stays_visible_while_refreshing']=True
  # Explicitly seed disposable fixture data; never touch a production library.
  page.evaluate("MovieBoxTV.state.saved={movie1:movie};MovieBoxTV.state.history={'movie1:0:0':{subject:movie,position:1000,duration:100000,updated:3},'series1:1:1':{subject:series,position:2000,duration:100000,updated:2},'series1:1:2':{subject:series,position:3000,duration:100000,updated:1}};MovieBoxTV.browse('history')")
  assert page.locator('.poster-card').count()==2
  page.locator('#history-select').focus();page.keyboard.press('Enter')
  card=page.locator('.poster-card[data-subject-id=movie1]');card.focus();page.keyboard.press('Enter')
  assert card.get_attribute('aria-pressed')=='true'
  page.locator('#history-remove').focus();page.keyboard.press('Enter')
  assert page.evaluate("Object.keys(MovieBoxTV.state.history).length")==2
  assert page.evaluate("!!MovieBoxTV.state.saved.movie1")
  checks['remote_single_remove_keeps_other_episodes_and_my_list']=True
  page.locator('#history-undo').click();assert page.evaluate('Object.keys(MovieBoxTV.state.history).length')==3
  page.locator('#history-select').click();page.locator('#history-all').click()
  assert page.locator('.poster-card.is-selected').count()==2
  page.locator('#history-remove').click();assert page.evaluate('Object.keys(MovieBoxTV.state.history).length')==0
  assert page.evaluate("Object.keys(JSON.parse(localStorage.getItem('moviebox-tv-library')).history).length")==0
  checks['select_all_bulk_removal_persists_without_deleting_saved_titles']=True
  page.locator('#history-undo').click();assert page.evaluate('Object.keys(MovieBoxTV.state.history).length')==3
  page.locator('#history-select').click();page.locator('#history-all').click();page.locator('#history-all').click()
  assert page.locator('.poster-card.is-selected').count()==0
  page.locator('#history-done').click();page.reload();page.locator('.poster-card').first.wait_for()
  assert page.evaluate('Object.keys(MovieBoxTV.state.history).length')==3
  checks['undo_clear_selection_and_history_survive_reload']=True
  assert not errors,errors;checks['no_javascript_exceptions']=True
  browser.close()
finally:
 server.shutdown();result={'scope':'Headless Edge, fixture service, mocked AVPlay.','checks':checks,'passed':len(checks)==7 and not errors}
 (OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
