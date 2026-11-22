"""Folded Dock bounds, sparse episode identity and real selection paths; offline."""
from functools import partial
from http.server import ThreadingHTTPServer
import json, re, threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler
OUT=ROOT/'verification'/'episode-dock09';OUT.mkdir(parents=True,exist_ok=True)
EXTRA='''MovieBoxAPI.prototype.detail=s=>Promise.resolve({subject:s,isSeries:true,resource:{seasons:[{se:1,maxEp:65},{se:2,episodeNumbers:[4,7]},{se:3,maxEp:3}]}});'''
class Server(ThreadingHTTPServer):
    request_queue_size=64
    daemon_threads=True
def run():
    server=Server(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'app')));threading.Thread(target=server.serve_forever,daemon=True).start();checks={}
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(channel='msedge',headless=True)
            for width,height in [(1920,1080),(1280,720)]:
                page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce');errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.route('**/*',lambda r:r.abort());page.route(f'http://127.0.0.1:{server.server_port}/**',lambda r:r.continue_());page.route('**/js/api.js',lambda r:r.fulfill(content_type='text/javascript',body=STUB+EXTRA));page.route('**/$WEBAPIS/**',lambda r:r.fulfill(body=''))
                page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('!!window.MovieBoxTV');page.evaluate('MovieBoxTV.carousel.loaded=true;MovieBoxTV.openDetail(series)');page.wait_for_function('!document.getElementById("watch-button").disabled');page.locator('#watch-button').click();page.wait_for_function('nativeState==="PLAYING"')
                def bounds():
                    data=page.evaluate('''()=>{const d=document.getElementById('episode-drawer'),r=d.getBoundingClientRect(),h=document.querySelector('.player-header').getBoundingClientRect(),c=document.getElementById('player-controls').getBoundingClientRect(),s=getComputedStyle(d);return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,headerBottom:h.bottom,controlsTop:c.top,background:s.backgroundImage,blur:s.backdropFilter};}''')
                    assert 360<=data['w']<=400,data
                    assert abs(data['y']-data['headerBottom']-16)<2,data
                    assert abs(data['bottom']-data['controlsTop']+16)<2,data
                    assert data['x']>=16 and data['x']+data['w']<=width-16,data
                    assert '.82' in data['background'] and '.86' in data['background'],data
                    assert data['blur']=='none',data
                    return data
                page.locator('#episode-browser').click();first=bounds();assert page.evaluate('nativeState')=='PLAYING';assert page.locator('#player-episode-list').evaluate('e=>e.scrollHeight>e.clientHeight')
                header=page.locator('#episode-drawer header').bounding_box();page.locator('#player-episode-list [data-episode]').last.focus();page.locator('#player-episode-list [data-episode]').last.scroll_into_view_if_needed();assert page.locator('#player-episode-list').evaluate('e=>e.scrollTop>0');assert abs(header['y']-page.locator('#episode-drawer header').bounding_box()['y'])<1
                assert page.locator('.episode-dock-footer').bounding_box()['y']>=first['y']+first['h']-70
                checks[f'{width}_tall_safe_gap_fixed_header_footer_inner_long_scroll']=True
                page.keyboard.press('Escape');page.evaluate('MovieBoxTV.player.page.classList.add("controls-hidden");MovieBoxTV.player.page.focus()');page.keyboard.press('ArrowUp');page.locator('#episode-drawer').wait_for();bounds();page.wait_for_timeout(220);bounds();checks[f'{width}_hidden_controls_and_settled_bar_bounds']=True
                page.locator('#player-season-select').select_option('2');assert page.locator('#player-season-select').bounding_box()['width']<190
                rows=page.locator('#player-episode-list [data-episode]');assert rows.count()==2
                actual=rows.evaluate_all('ns=>ns.map(n=>({episode:n.dataset.episode,number:getComputedStyle(n,"::before").content,label:n.querySelector(".episode-row-label").textContent}))')
                assert [x['episode'] for x in actual]==['4','7'],actual
                assert [int(re.sub(r'\D','',x['number'])) for x in actual]==[4,7],actual
                assert [x['label'] for x in actual]==['Episode 4','Episode 7'],actual
                assert page.locator('.episode-row-progress').count()==0
                bounds();page.screenshot(path=str(OUT/f'{width}-sparse-4-7.png'));checks[f'{width}_sparse_numbers_labels_no_invented_progress_and_fitted_season']=True
                page.locator('#player-episode-list [data-episode="4"]').click();page.wait_for_function('MovieBoxTV.player.options.season===2&&MovieBoxTV.player.options.episode===4&&!MovieBoxTV.player.preparing');page.evaluate('MovieBoxTV.nextEpisode()');page.wait_for_function('MovieBoxTV.player.options.season===2&&MovieBoxTV.player.options.episode===7&&!MovieBoxTV.player.preparing');page.evaluate('MovieBoxTV.nextEpisode()');page.wait_for_function('MovieBoxTV.player.options.season===3&&MovieBoxTV.player.options.episode===1&&!MovieBoxTV.player.preparing');checks[f'{width}_sparse_actual4_next7_then_next_season1']=True
                page.locator('#episode-browser').click();bounds();assert page.locator('#player-episode-list [data-episode]').count()==3
                for theme in ('obsidian','aurora','helix-steps','grand-stage'):
                    page.evaluate('t=>MovieBoxThemes.apply(t)',theme);bounds();assert page.locator('.episode-row-label').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=20
                    page.screenshot(path=str(OUT/f'{width}-{theme}-short-real-rows.png'))
                page.keyboard.press('Escape');assert not page.locator('#episode-drawer').is_visible();assert page.evaluate('nativeState')=='PLAYING';assert not errors,errors;checks[f'{width}_short_rows_tall_dock_theme_contrast_close_without_pause']=True
                page.close()
            browser.close()
        result={'passed':True,'checks':checks,'scope':'Offline real app UI with explicit API/AVPlay fixtures; no TV history writes.'};(OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
    finally:server.shutdown()
if __name__=='__main__':run()
