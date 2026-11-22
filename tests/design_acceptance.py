"""TV layout and accessible sidebar regression; fixture artwork/API, not hardware evidence."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
import threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler

OUT = ROOT / 'verification' / 'design'
OUT.mkdir(parents=True, exist_ok=True)
LABELS = ['Discover', 'Movies', 'TV Shows', 'Search', 'History', 'My list', 'Settings']


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks = {}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge', headless=True)
            for width, height in [(1920, 1080), (1280, 720)]:
                context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
                context.route('**/*', lambda route: route.abort())
                context.route(f'http://127.0.0.1:{server.server_port}/**', lambda route: route.continue_())
                context.route('**/js/api.js', lambda route: route.fulfill(content_type='text/javascript', body=STUB))
                context.route('**/$WEBAPIS/**', lambda route: route.fulfill(content_type='text/javascript', body=''))
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.locator('.poster-card').first.wait_for()
                for theme in ['obsidian', 'orbital', 'prism', 'aurora', 'eclipse']:
                    page.evaluate('(theme)=>{MovieBoxTV.state.settings.theme=theme;MovieBoxThemes.apply(theme);}', theme)
                    for label in LABELS:
                        assert page.locator('.sidebar').get_by_role('button', name=label, exact=True).count() == 1
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    assert page.locator('.sidebar').evaluate('element=>element.scrollWidth<=element.clientWidth')
                    page.locator('[data-nav=home]').focus()
                    page.keyboard.press('ArrowDown')
                    assert page.evaluate("document.activeElement!==document.querySelector('[data-nav=home]')")
                    assert page.locator('[data-nav=home]').evaluate("element=>{const rect=element.getBoundingClientRect();return !!document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('.sidebar');}")
                    page.screenshot(path=str(OUT / f'{width}-{theme}-home.png'))
                    checks[f'{width}_{theme}_sidebar_names_and_layout'] = True
                page.locator('[data-nav=settings]').click()
                assert ' \u00b7 ' in page.locator('#update-settings-status').inner_text()
                checking = page.evaluate("document.getElementById('check-updates').click();document.getElementById('update-settings-status').textContent")
                assert checking.endswith('Checking GitHub\u2026')
                page.screenshot(path=str(OUT / f'{width}-settings.png'))
                page.locator('[data-nav=saved]').click()
                page.screenshot(path=str(OUT / f'{width}-empty-list.png'))
                page.locator('[data-nav=home]').click()
                page.locator('.poster-card').nth(1).click()
                page.wait_for_function('!document.getElementById("watch-button").disabled')
                assert page.locator('#save-button').inner_text() == '\uff0b My list'
                page.locator('#save-button').click()
                assert page.locator('#save-button').inner_text() == '\u2713 Saved'
                page.locator('[data-nav=saved]').click()
                assert page.locator('#catalog-count').inner_text() == '1 title'
                page.locator('.poster-card').first.click()
                page.wait_for_function('!document.getElementById("watch-button").disabled')
                page.locator('#save-button').click()
                checks[f'{width}_saved_and_update_labels_are_clean_unicode'] = True
                page.screenshot(path=str(OUT / f'{width}-series-detail.png'))
                preparing = page.evaluate('document.getElementById("watch-button").click();document.getElementById("watch-button").textContent')
                assert preparing == 'Preparing playback\u2026'
                page.wait_for_function('MovieBoxTV.player.active && !MovieBoxTV.player.preparing')
                assert page.locator('#now-title').inner_text() == 'The Test Series \u00b7 S1 E1'
                assert page.locator('#quality-select option').first.inner_text() == 'Auto \u00b7 1080p'
                page.evaluate('MovieBoxTV.player.bufferingIndicator()')
                page.locator('#player-loading').wait_for(state='visible')
                assert page.locator('#loading-text').inner_text() == 'Buffering\u2026'
                page.evaluate('MovieBoxTV.player.bufferingIndicator(37)')
                assert page.locator('#loading-text').inner_text() == 'Buffering \u00b7 37%'
                page.screenshot(path=str(OUT / f'{width}-buffering.png'))
                page.evaluate('MovieBoxTV.player.loading(false)')
                checks[f'{width}_player_title_quality_and_buffer_text_are_clean_unicode'] = True
                page.locator('#player-more-button').click()
                page.screenshot(path=str(OUT / f'{width}-player-more.png'))
                page.locator('#player-more-close').click()
                page.locator('#episode-browser').click()
                page.screenshot(path=str(OUT / f'{width}-episode-drawer.png'))
                for selector in ['#episode-drawer', '#episode-drawer-close', '#player-season-select']:
                    rect = page.locator(selector).bounding_box()
                    assert rect and rect['x'] >= 0 and rect['x'] + rect['width'] <= width
                checks[f'{width}_episode_drawer_inside_viewport'] = True
                for theme in ('obsidian','orbital','prism','aurora','eclipse'):
                    page.evaluate('t=>MovieBoxThemes.apply(t)',theme)
                    drawer=page.locator('#episode-drawer').bounding_box()
                    assert drawer['x']>=20 and drawer['y']>=20
                    assert drawer['x']+drawer['width']<=width-20 and drawer['y']+drawer['height']<=height-20
                    assert page.locator('#player-episode-list').evaluate('e=>e.scrollHeight>e.clientHeight')
                    assert page.locator('#episode-drawer header').evaluate('e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+10,r.y+10).closest("#episode-drawer")!==null}')
                    page.screenshot(path=str(OUT/f'{width}-{theme}-long-episode-drawer.png'))
                page.locator('#player-season-select').select_option('2')
                page.evaluate('()=>{const s=document.getElementById("player-season-select");s.selectedOptions[0].dataset.season=JSON.stringify({se:2,maxEp:6});s.onchange();}')
                assert page.locator('#player-episode-list button').count()==6
                short=page.locator('#episode-drawer').bounding_box()
                bars=page.evaluate('({header:document.querySelector(".player-header").getBoundingClientRect().bottom,controls:document.getElementById("player-controls").getBoundingClientRect().top})')
                assert abs(short['y']-(bars['header']+16))<2,(width,short,bars)
                assert abs(short['y']+short['height']-(bars['controls']-16))<2,(width,short,bars)
                assert 320<=short['width']<=420,(width,short)
                assert page.locator('#player-episode-list button').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=20
                assert page.locator('#player-episode-list').evaluate('e=>e.clientHeight>0&&e.scrollHeight>=e.clientHeight')
                page.screenshot(path=str(OUT/f'{width}-compact-six-episode-drawer.png'))
                checks[f'{width}_drawer_measured_tall_gap_long_internal_scroll_safe_header_all_themes']=True
                page.mouse.click(20,height/2)
                assert not page.locator('#episode-drawer').is_visible()
                assert page.evaluate('nativeState')=='PLAYING'
                checks[f'{width}_drawer_outside_pointer_dismiss_keeps_playing']=True
                page.locator('#episode-browser').click()
                page.locator('#episode-drawer-close').click()
                page.locator('#player-back').click()
                page.evaluate("movie.trailer={videoAddress:{url:'https://fixture.invalid/trailer.mp4',height:480,duration:100}};MovieBoxTV.openDetail(movie)")
                page.locator('#trailer-button').click()
                assert page.locator('#now-title').inner_text() == 'Trailer \u00b7 The Test Movie'
                checks[f'{width}_trailer_title_is_clean_unicode'] = True
                assert not errors, errors
                context.close()
            browser.close()
        result = {'passed': True, 'scope': 'Headless Edge fixture UI at 1920x1080/1280x720; no physical overscan or screen-reader certification.', 'checks': checks}
        (OUT / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(result, indent=2))
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
