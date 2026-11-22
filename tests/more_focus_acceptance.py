"""Remote pagination focus across every shared catalogue, with controlled delayed responses."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
import threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler

OUT = ROOT / 'verification' / 'more-focus'
OUT.mkdir(parents=True, exist_ok=True)
EXTRA = r'''
window.__networkMode=false;window.__holdMore=false;window.__resolveMore=null;window.__rejectMore=null;
window.makeMoreSubjects=function(kind,page,count){return Array.from({length:count},function(_,i){return Object.assign({},kind==='tv'?series:movie,{subjectId:kind+'-'+page+'-'+i,title:kind+' title '+page+'-'+i});});};
function moreResponse(kind,page){var result={items:makeMoreSubjects(kind,page,__networkMode?12:30),hasMore:__networkMode&&page===1,nextPage:page+1};if(page>1&&__holdMore)return new Promise(function(resolve,reject){__resolveMore=function(){resolve(result);};__rejectMore=function(){reject(Error('fixture timeout'));};});return Promise.resolve(result);}
MovieBoxAPI.prototype.home=function(){return Promise.resolve({operatingList:[{subjects:makeMoreSubjects('home',1,30)}]});};
MovieBoxAPI.prototype.catalogue=function(kind,filters,page){return moreResponse(kind,page);};
MovieBoxAPI.prototype.search=function(query,page){return moreResponse('search',page||1);};
'''


class FixtureServer(ThreadingHTTPServer):
    # A fresh browser context requests many scripts together; avoid the tiny default backlog.
    request_queue_size = 64
    daemon_threads = True


def run():
    server = FixtureServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks = {}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge', headless=True)

            def start(route, network=False):
                context = browser.new_context(viewport={'width': 1920, 'height': 1080}, reduced_motion='reduce')
                context.route('**/*', lambda request: request.abort())
                context.route(f'http://127.0.0.1:{server.server_port}/**', lambda request: request.continue_())
                context.route('**/js/api.js', lambda request: request.fulfill(content_type='text/javascript', body=STUB + EXTRA))
                context.route('**/$WEBAPIS/**', lambda request: request.fulfill(content_type='text/javascript', body=''))
                page = context.new_page()
                errors = []
                failed_requests = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('requestfailed', lambda request: failed_requests.append({'url': request.url, 'failure': request.failure}))
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                try:
                    page.locator('.poster-card').first.wait_for()
                except Exception:
                    (OUT / 'bootstrap-failure.json').write_text(json.dumps({'route': route, 'network': network, 'errors': errors, 'failedRequests': failed_requests, 'text': page.locator('body').inner_text()}, indent=2), encoding='utf-8')
                    page.screenshot(path=str(OUT / 'bootstrap-failure.png'))
                    raise
                page.evaluate('(network)=>{MovieBoxTV.carousel.loaded=true;window.__networkMode=network;}', network)
                if route in ('saved', 'history'):
                    page.evaluate("""route=>{
                      const subjects=makeMoreSubjects(route,1,30);
                      if(route==='saved')MovieBoxTV.state.saved=Object.fromEntries(subjects.map(s=>[s.subjectId,s]));
                      else MovieBoxTV.state.history=Object.fromEntries(subjects.map((s,i)=>[s.subjectId+':0:0',{subject:s,position:1000,duration:100000,updated:30-i}]));
                    }""", route)
                page.locator(f'[data-nav={route}]').click()
                if route == 'search':
                    page.locator('#search-input').fill('Fixture')
                    page.locator('#search-go').click()
                page.wait_for_function('document.querySelectorAll(".poster-card").length===12')
                return context, page

            def assert_first_new(page, index):
                page.wait_for_function('(index)=>document.activeElement===document.querySelectorAll(".poster-card")[index]', arg=index)
                assert page.evaluate('!!document.activeElement.closest("#catalog")')

            for route in ('home', 'movies', 'tv', 'search', 'history', 'saved'):
                context, page = start(route)
                for before, after in [(12, 24), (24, 30)]:
                    page.locator('#more-button').focus()
                    page.keyboard.press('Enter')
                    page.wait_for_function('(count)=>document.querySelectorAll(".poster-card").length===count', arg=after)
                    assert_first_new(page, before)
                page.keyboard.press('ArrowDown')
                assert not page.evaluate('!!document.activeElement.closest(".sidebar")')
                checks[route + '_local_batches_focus_first_new_card_without_sidebar_fallback'] = True
                context.close()

            for route in ('movies', 'tv', 'search'):
                context, page = start(route, network=True)
                page.evaluate('__holdMore=true')
                page.locator('#more-button').focus()
                page.keyboard.press('Enter')
                page.wait_for_function('typeof __resolveMore==="function"')
                assert page.evaluate('document.activeElement===document.querySelector(".poster-card:last-child")')
                page.evaluate('__resolveMore()')
                assert_first_new(page, 12)
                checks[route + '_deferred_append_keeps_anchor_then_focuses_first_new_card'] = True
                context.close()

                context, page = start(route, network=True)
                page.evaluate('__holdMore=true')
                page.locator('#more-button').focus()
                page.keyboard.press('Enter')
                page.wait_for_function('typeof __resolveMore==="function"')
                page.locator('[data-nav=settings]').focus()
                page.evaluate('__resolveMore()')
                page.wait_for_function('document.querySelectorAll(".poster-card").length===24')
                assert page.evaluate('document.activeElement.dataset.nav') == 'settings'
                checks[route + '_delayed_append_does_not_steal_focus_after_user_moves'] = True
                context.close()

                context, page = start(route, network=True)
                page.evaluate('__holdMore=true')
                page.locator('#more-button').focus()
                page.keyboard.press('Enter')
                page.wait_for_function('typeof __rejectMore==="function"')
                page.evaluate('__rejectMore()')
                page.wait_for_function('!document.getElementById("more-button").disabled')
                assert page.evaluate('document.activeElement.id') == 'more-button'
                assert page.evaluate('document.querySelector(".nav-button.active").dataset.nav') == route
                page.evaluate('__holdMore=false')
                page.keyboard.press('Enter')
                assert_first_new(page, 12)
                assert page.locator('.poster-card').nth(12).get_attribute('data-subject-id') == route + '-2-0'
                checks[route + '_failed_append_restores_action_focus_and_current_route'] = True
                context.close()

                context, page = start(route, network=True)
                page.evaluate('__holdMore=true')
                page.locator('#more-button').focus()
                page.keyboard.press('Enter')
                page.wait_for_function('typeof __rejectMore==="function"')
                page.locator('[data-nav=saved]').click()
                page.evaluate('__rejectMore()')
                page.wait_for_function('!document.getElementById("more-button").disabled')
                assert page.evaluate('document.querySelector(".nav-button.active").dataset.nav') == 'saved'
                assert page.evaluate('document.activeElement.dataset.nav') == 'saved'
                assert page.locator('.poster-card').count() == 0
                checks[route + '_timeout_after_leaving_section_preserves_destination_and_focus'] = True
                context.close()
            browser.close()
        result = {'passed': True, 'checks': checks, 'scope': 'Edge remote-key fixture UI, no TV/production data.'}
        (OUT / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(result, indent=2))
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
