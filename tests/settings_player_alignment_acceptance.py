"""Confirmed Settings focus trap and player edge alignment; mocked API/AVPlay."""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import threading
import traceback

from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler


def run(output):
    output.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT/'app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = {}
    errors = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge', headless=True)
            for width, height in [(1920, 1080), (1280, 720)]:
                for theme in ['obsidian', 'orbital', 'prism', 'aurora', 'eclipse']:
                    context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
                    context.route('**/*', lambda route: route.abort())
                    context.route(f'http://127.0.0.1:{server.server_port}/**', lambda route: route.continue_())
                    context.route('**/js/api.js', lambda route: route.fulfill(content_type='text/javascript', body=STUB))
                    context.route('**/$WEBAPIS/**', lambda route: route.fulfill(content_type='text/javascript', body=''))
                    context.add_init_script('localStorage.setItem("moviebox-tv-library",JSON.stringify({settings:{theme:'+json.dumps(theme)+'},history:{},saved:{}}));')
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                    page.locator('.poster-card').first.wait_for()
                    page.locator('[data-nav=settings]').click()
                    field = page.locator('#preferred-language')
                    field.fill('bn')
                    field.focus()
                    try:
                        field.evaluate('element=>element.setSelectionRange(2,2)')
                        page.keyboard.press('ArrowLeft')
                        assert page.evaluate('document.activeElement.id') == 'preferred-language'
                        assert field.evaluate('element=>element.selectionStart') == 1
                        page.keyboard.press('Home')
                        assert field.evaluate('element=>element.selectionStart') == 0
                        page.keyboard.press('End')
                        assert field.evaluate('element=>element.selectionStart') == 2
                        page.keyboard.type('hi')
                        assert field.input_value() == 'bnhi'
                        field.fill('bn')
                        assert field.evaluate("element=>{const event=new KeyboardEvent('keydown',{key:'ArrowDown',keyCode:229,isComposing:true,bubbles:true,cancelable:true});element.dispatchEvent(event);return !event.defaultPrevented;}")
                        assert page.evaluate('document.activeElement.id') == 'preferred-language'
                        page.keyboard.press('Shift+ArrowDown')
                        assert page.evaluate('document.activeElement.id') == 'preferred-language'
                        page.keyboard.press('ArrowDown')
                        assert page.evaluate('document.activeElement.id') == 'preferred-subtitles', page.evaluate('document.activeElement.id')
                        page.keyboard.press('ArrowDown')
                        assert page.evaluate('document.activeElement.id') == 'clear-subtitle-cache'
                        page.keyboard.press('ArrowUp')
                        assert page.evaluate('document.activeElement.id') == 'preferred-subtitles'
                        page.keyboard.press('ArrowUp')
                        assert page.evaluate('document.activeElement.id') == 'preferred-language'
                        page.keyboard.press('ArrowUp')
                        assert page.evaluate('document.activeElement.id') == 'preferred-theme'
                        assert field.input_value() == 'bn'
                        assert page.evaluate('MovieBoxTV.state.settings.language') == 'bn'
                        results[f'{width}_{theme}_settings'] = {'passed': True}
                    except AssertionError as error:
                        results[f'{width}_{theme}_settings'] = {'passed': False, 'error': traceback.format_exc()}
                    page.screenshot(path=str(output/f'{width}-{theme}-settings.png'))
                    page.evaluate('MovieBoxTV.openDetail(window.movie)')
                    page.wait_for_function('!document.getElementById("watch-button").disabled')
                    page.locator('#watch-button').click()
                    page.wait_for_function('MovieBoxTV.player.active && nativeState==="PLAYING"')
                    page.evaluate('MovieBoxTV.player.reveal()')
                    bounds = page.evaluate('''()=>{
                      const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
                      return {header:box('.player-header'),controls:box('.player-controls')};
                    }''')
                    try:
                        assert abs(bounds['header']['left']-bounds['controls']['left']) < .6, bounds
                        assert abs(bounds['header']['right']-bounds['controls']['right']) < .6, bounds
                        assert bounds['controls']['left'] >= 16 and bounds['controls']['right'] <= width-16, bounds
                        assert page.locator('#player-controls .transport-row button:visible,#player-controls .transport-row select:visible,#player-clock').evaluate_all('elements=>elements.every(element=>{const box=element.getBoundingClientRect(),bar=document.getElementById("player-controls").getBoundingClientRect();return box.left>=bar.left && box.right<=bar.right;})')
                        results[f'{width}_{theme}_alignment'] = {'passed': True, **bounds}
                    except AssertionError as error:
                        results[f'{width}_{theme}_alignment'] = {'passed': False, 'error': traceback.format_exc(), **bounds}
                    page.screenshot(path=str(output/f'{width}-{theme}-player.png'))
                    context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    result = {'checks': results, 'page_errors': errors, 'passed': not errors and all(check['passed'] for check in results.values()),
              'scope': 'Rendered app CSS and actual browser key events, fixture metadata and mocked AVPlay; no TV hardware certification.'}
    (output/'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'verification/settings-player-layout')
    raise SystemExit(run(parser.parse_args().output))
