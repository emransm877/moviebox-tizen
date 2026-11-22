"""Capability regressions across reported TV versions; Edge fixtures, not firmware certification."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler

OUTPUT = ROOT / 'verification' / 'platform-capabilities'
OUTPUT.mkdir(parents=True, exist_ok=True)


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks = {}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge', headless=True)
            for version, chromium in [('9.0', '120'), ('10.0', '130')]:
                context = browser.new_context(viewport={'width': 1920, 'height': 1080},
                                              user_agent=f'Mozilla/5.0 (SMART-TV; Linux; Tizen {version}) Chrome/{chromium}.0.0.0 TV Safari/537.36')
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                # A denied optional capability must not prevent navigation/native playback.
                page.add_init_script("""
                  window.__registered=[];
                  window.tizen={
                    tvinputdevice:{registerKey:function(key){__registered.push(key);if(key==='MediaStop')throw Error('NotSupportedError');}},
                    websetting:{setUserAgentString:function(agent,ok,fail){fail({name:'NotSupportedError'});}}
                  };
                  Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true});
                """)
                context.route('**/*', lambda route: route.abort())
                context.route(f'http://127.0.0.1:{server.server_port}/**', lambda route: route.continue_())
                context.route('**/js/api.js', lambda route: route.fulfill(content_type='text/javascript', body=STUB))
                context.route('**/$WEBAPIS/**', lambda route: route.fulfill(content_type='text/javascript', body=''))
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.locator('.poster-card').first.wait_for()
                page.locator('[data-nav=home]').focus()
                page.keyboard.press('ArrowDown')
                assert page.evaluate('document.activeElement.dataset.nav') == 'movies'
                assert page.evaluate("__registered.includes('MediaFastForward')")
                checks[f'{version}_optional_key_failure_keeps_basic_navigation_and_later_registration'] = True
                page.locator('.poster-card').first.click()
                page.locator('#save-button').click()
                page.locator('#watch-button').click()
                page.wait_for_function('MovieBoxTV.player.active && !MovieBoxTV.player.preparing && MovieBoxTV.player.position>0')
                assert page.evaluate('MovieBoxTV.player.native')
                checks[f'{version}_user_agent_setting_failure_falls_back_to_available_avplay'] = True
                page.wait_for_function("document.getElementById('subtitle-overlay').textContent.includes('cached subtitle')")
                checks[f'{version}_missing_indexeddb_keeps_subtitle_fetch_and_display'] = True
                page.evaluate("""() => {
                  MovieBoxTV.player.tick(22000);
                  Object.defineProperty(document,'hidden',{value:true,configurable:true});
                  document.dispatchEvent(new Event('visibilitychange'));
                }""")
                assert page.evaluate("MovieBoxTV.player.paused && nativeState==='PAUSED'")
                assert page.evaluate("JSON.parse(localStorage.getItem('moviebox-tv-library')).history['movie1:0:0'].position") == 22000
                checks[f'{version}_background_pauses_and_flushes_progress'] = True
                page.keyboard.press('Escape')
                assert page.locator('#player-page').is_hidden()
                page.reload()
                page.locator('.poster-card').first.wait_for()
                assert page.evaluate("!!MovieBoxTV.state.saved.movie1 && MovieBoxTV.state.history['movie1:0:0'].position===22000")
                assert not errors, errors
                checks[f'{version}_same_origin_library_survives_relaunch_without_version_migration'] = True
                context.close()
            browser.close()
        result = {'passed': True, 'scope': 'Edge with synthetic Tizen 9/10 UA and mocked APIs; not actual M120/M130 or TV firmware.', 'checks': checks}
        (OUTPUT / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(result, indent=2))
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
