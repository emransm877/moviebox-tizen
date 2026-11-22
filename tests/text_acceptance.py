"""Real-browser Unicode/opaque-data preservation from parsed API responses to UI and caches."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
import threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler

OUT = ROOT / 'verification' / 'text'
OUT.mkdir(parents=True, exist_ok=True)
TEXT = 'Caf\u00e9 \u2014 \u00c2ngela, S\u00e3o, Fran\u00e7ois; \u00c2 / \u00c3; \u09ac\u09be\u0982\u09b2\u09be \u0939\u093f\u0928\u094d\u0926\u0940 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u4e2d\u6587 \U0001f3ac'
OPAQUE = 'id-' + chr(0xc3) + chr(0xa9)
URL = 'https://encoding.invalid/' + chr(0xc2) + chr(0xb7) + '?signed=' + OPAQUE
SRT = '1\n00:00:00,000 --> 00:01:40,000\n' + TEXT


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks = {}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge', headless=True)
            context = browser.new_context(viewport={'width': 1920, 'height': 1080}, reduced_motion='reduce')
            context.route('**/*', lambda route: route.abort())
            context.route(f'http://127.0.0.1:{server.server_port}/**', lambda route: route.continue_())
            context.route('**/js/api.js', lambda route: route.fulfill(content_type='text/javascript', body=STUB))
            context.route('**/$WEBAPIS/**', lambda route: route.fulfill(content_type='text/javascript', body=''))
            payload = {'subject': {'subjectId': OPAQUE, 'subjectType': 1, 'title': TEXT, 'description': TEXT,
                                  'genre': TEXT, 'countryName': TEXT, 'hasResource': True},
                       'id': OPAQUE, 'url': URL, 'headers': {'Authorization': OPAQUE}, 'token': OPAQUE}
            body = json.dumps({'data': payload}, ensure_ascii=False)
            context.route('https://encoding.invalid/data', lambda route: route.fulfill(
                content_type='application/json; charset=utf-8', headers={'Access-Control-Allow-Origin': '*'}, body=body))
            context.route('https://encoding.invalid/subtitle.srt', lambda route: route.fulfill(
                content_type='text/plain; charset=utf-8', headers={'Access-Control-Allow-Origin': '*'}, body=SRT))
            context.route('**/dev-api', lambda route: route.fulfill(content_type='application/json; charset=utf-8', body=body))
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/')
            page.locator('.poster-card').first.wait_for()
            # Reuse the real transport/parser after bootstrap; fixture app API remains network-isolated.
            page.add_script_tag(content=(ROOT / 'app/js/api.js').read_text(encoding='utf-8'))
            received = page.evaluate("""async()=>{
              window.encodingAPI=new MovieBoxAPI();encodingAPI.preview=false;
              window.encodingData=await encodingAPI.request('https://encoding.invalid/data',null,{},false);
              const preview=await encodingAPI.proxy('home');
              return {xhr:encodingData,preview:preview};
            }""")
            assert received == {'xhr': payload, 'preview': payload}
            checks['real_browser_xhr_and_preview_json_preserve_unicode_and_opaque_fields'] = True
            page.evaluate("""()=>{
              const app=MovieBoxTV,subject=encodingData.subject;
              app.api.detail=async()=>({subject,isSeries:false,resource:{seasons:[]}});
              app.api.captions=async()=>({captions:[{id:encodingData.id,lan:'bn',lanName:subject.title,url:'https://encoding.invalid/subtitle.srt'}]});
              app.api.text=url=>encodingAPI.text(url);
              app.openDetail(subject);
            }""")
            page.wait_for_function('!document.getElementById("watch-button").disabled')
            assert page.locator('#detail-title').inner_text() == TEXT
            assert page.locator('#detail-description').inner_text() == TEXT
            assert TEXT in page.locator('#detail-meta').inner_text()
            page.locator('#save-button').click()
            checks['details_metadata_and_saved_library_preserve_mixed_scripts'] = True
            page.locator('#watch-button').click()
            page.wait_for_function('MovieBoxTV.player.active && !MovieBoxTV.player.preparing')
            page.wait_for_function('document.getElementById("subtitle-overlay").textContent===encodingData.subject.title')
            assert page.locator('#now-title').inner_text() == TEXT
            assert page.locator('#subtitle-select option').nth(1).inner_text() == TEXT
            assert page.evaluate('MovieBoxAudio.label({lanName:encodingData.subject.title})') == TEXT
            assert page.evaluate('()=>encodingAPI.text("https://encoding.invalid/subtitle.srt")') == SRT
            checks['player_audio_subtitle_labels_and_raw_srt_preserve_unicode'] = True
            key = OPAQUE + ':0:0:bn'
            page.wait_for_function("async key=>!!(await MovieBoxTV.player.cache.get(key))", arg=key)
            cached = page.evaluate('key=>MovieBoxTV.player.cache.get(key)', key)
            assert cached['caption']['lanName'] == TEXT and cached['cues'][0]['text'] == TEXT
            assert cached['key'] == key
            checks['indexeddb_subtitle_descriptor_cues_and_opaque_key_round_trip'] = True
            page.screenshot(path=str(OUT / 'mixed-script-player.png'))
            page.locator('#player-back').click()
            page.wait_for_function('id=>!!JSON.parse(localStorage.getItem("moviebox-tv-library")||"{}").saved?.[id]', arg=OPAQUE)
            page.reload()
            page.locator('.poster-card').first.wait_for()
            assert page.evaluate('id=>MovieBoxTV.state.saved[id].title', OPAQUE) == TEXT
            page.locator('[data-nav=saved]').click()
            assert page.locator('.poster-title').first.inner_text() == TEXT
            checks['cold_page_reload_and_my_list_keep_exact_unicode_title_and_identifier'] = True
            assert not errors, errors
            browser.close()
        result = {'passed': True, 'checks': checks, 'scope': 'Edge with real JSON/text parsers, mocked service responses and AVPlay; no external service requests.'}
        (OUT / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(result, indent=2))
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
