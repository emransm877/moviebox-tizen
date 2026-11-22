"""Own-image geometry for shared cards/details, including mixed rows and late loads."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
import threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler

OUT = ROOT / 'verification' / 'artwork-layout'
OUT.mkdir(parents=True, exist_ok=True)
SHAPES = {'wide': (300, 169), 'square': (300, 300), 'tall': (236, 421), 'unknown': (400, 225), 'mismatch': (300, 169)}
EXTRA = r'''
window.artSubjects=function(kind){return Array.from({length:20},function(_,i){var shape=['wide','square','tall','unknown','mismatch'][i%5],dimensions={wide:[300,169],square:[300,300],tall:[236,421],unknown:[0,0],mismatch:[300,450]}[shape];return {subjectId:kind+'-'+i,title:kind+' '+shape+' '+i,subjectType:kind==='tv'?2:1,releaseDate:'2026-01-01',hasResource:true,cover:{url:location.origin+'/fixture-art/'+shape+'.svg',width:dimensions[0],height:dimensions[1]}};});};
MovieBoxAPI.prototype.home=function(){return Promise.resolve({operatingList:[{subjects:artSubjects('home')}]});};
MovieBoxAPI.prototype.catalogue=function(kind){return Promise.resolve({items:artSubjects(kind),hasMore:false,nextPage:2});};
MovieBoxAPI.prototype.search=function(){return Promise.resolve({items:artSubjects('search'),hasMore:false});};
'''


def svg(shape):
    width, height = SHAPES[shape]
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"><rect width="100%" height="100%" fill="#24664e"/><text x="12" y="35" fill="white" font-size="24">{shape}</text></svg>'


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks = {}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge', headless=True)
            for width, height in [(1920, 1080), (1280, 720)]:
                context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
                context.route('**/*', lambda request: request.abort())
                context.route(f'http://127.0.0.1:{server.server_port}/**', lambda request: request.continue_())
                context.route('**/js/api.js', lambda request: request.fulfill(content_type='text/javascript', body=STUB + EXTRA))
                context.route('**/$WEBAPIS/**', lambda request: request.fulfill(content_type='text/javascript', body=''))
                context.route('**/fixture-art/**', lambda request: request.fulfill(content_type='image/svg+xml', body=svg(request.request.url.rsplit('/', 1)[1].split('.')[0])))
                page = context.new_page()
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.wait_for_function('document.querySelectorAll(".poster-card").length===12')
                # Reserve metadata immediately; actual own-image dimensions win after decoding.
                page.wait_for_function('[...document.querySelectorAll(".poster-art img")].slice(0,5).every(img=>img.naturalWidth>0)')
                for theme in ('obsidian', 'orbital', 'prism', 'aurora', 'eclipse'):
                    page.evaluate('(theme)=>{MovieBoxTV.state.settings.theme=theme;MovieBoxThemes.apply(theme);}', theme)
                    page.locator('[data-nav=home]').focus()
                    for index, shape in enumerate(SHAPES):
                        art = page.locator('.poster-art').nth(index)
                        ratio = art.evaluate('element=>element.getBoundingClientRect().width/element.getBoundingClientRect().height')
                        expected = SHAPES[shape][0] / SHAPES[shape][1]
                        assert abs(ratio - expected) < .015, (width, theme, shape, ratio, expected)
                        assert art.locator('img').evaluate('img=>getComputedStyle(img).objectFit') == 'contain'
                    # Layout alignment excludes the intentional focused-card transform.
                    tops = page.locator('.poster-card').evaluate_all('cards=>cards.slice(0,3).map(card=>card.offsetTop)')
                    assert max(tops) - min(tops) < 1, (width, theme, tops)
                    page.locator('.poster-card').first.focus()
                    page.keyboard.press('ArrowRight')
                    assert page.evaluate('document.activeElement===document.querySelectorAll(".poster-card")[1]'), (width, theme, page.evaluate('[...document.querySelectorAll(".poster-card")].indexOf(document.activeElement)'))
                    page.keyboard.press('ArrowRight')
                    assert page.evaluate('document.activeElement===document.querySelectorAll(".poster-card")[2]')
                    columns = page.locator('#catalog').evaluate('e=>getComputedStyle(e).gridTemplateColumns.split(" ").length')
                    page.locator('.poster-card').first.focus()
                    page.keyboard.press('ArrowDown')
                    assert page.evaluate('(index)=>document.activeElement===document.querySelectorAll(".poster-card")[index]', columns)
                    page.keyboard.press('ArrowUp')
                    assert page.evaluate('document.activeElement===document.querySelectorAll(".poster-card")[0]')
                    page.screenshot(path=str(OUT / f'{width}-{theme}-mixed-row.png'))
                    checks[f'{width}_{theme}_own_ratios_top_alignment_and_mixed_row_arrows'] = True
                for route in ('home', 'movies', 'tv', 'search', 'history', 'saved'):
                    if route in ('saved', 'history'):
                        page.evaluate("""route=>{const items=artSubjects(route);if(route==='saved')MovieBoxTV.state.saved=Object.fromEntries(items.map(s=>[s.subjectId,s]));else MovieBoxTV.state.history=Object.fromEntries(items.map((s,i)=>[s.subjectId+':0:0',{subject:s,position:1000,duration:100000,updated:20-i}]));}""", route)
                    page.locator(f'[data-nav={route}]').click()
                    if route == 'search':
                        page.locator('#search-input').fill('Own artwork')
                        page.locator('#search-go').click()
                    page.wait_for_function('document.querySelector(".poster-art img")?.naturalWidth>0')
                    assert abs(page.locator('.poster-art').first.evaluate('e=>e.clientWidth/e.clientHeight') - 300 / 169) < .02
                    page.locator('.poster-card').first.click()
                    page.wait_for_function('document.getElementById("detail-poster").naturalWidth===300')
                    assert abs(page.locator('#detail-poster').evaluate('e=>e.clientWidth/e.clientHeight') - 300 / 169) < .02
                    assert page.locator('#detail-title').inner_text().endswith('wide 0')
                    checks[f'{width}_{route}_shared_cards_and_details_use_their_own_wide_image'] = True
                page.evaluate('MovieBoxTV.openDetail(artSubjects("home")[0]);MovieBoxTV.openDetail(artSubjects("home")[2]);')
                page.wait_for_function('document.getElementById("detail-poster").naturalWidth===236')
                assert page.locator('#detail-title').inner_text() == 'home tall 2'
                assert page.locator('#detail-poster').evaluate('img=>img.currentSrc.endsWith("/tall.svg")')
                checks[f'{width}_rapid_detail_change_keeps_current_subject_image_and_ratio'] = True
                pending = []
                page.route('**/fixture-art/unknown.svg', lambda request: pending.append(request))
                page.reload(wait_until='domcontentloaded')
                page.wait_for_function('document.querySelectorAll(".poster-card").length===12')
                page.locator('#more-button').focus()
                page.keyboard.press('Enter')
                page.wait_for_function('document.activeElement===document.querySelectorAll(".poster-card")[12]')
                assert pending
                for request in pending:
                    request.fulfill(content_type='image/svg+xml', body=svg('unknown'))
                page.wait_for_function('[...document.images].some(img=>img.currentSrc.endsWith("/unknown.svg")&&img.naturalWidth===400)')
                assert page.evaluate('document.activeElement===document.querySelectorAll(".poster-card")[12]')
                checks[f'{width}_late_natural_image_size_does_not_steal_load_more_focus'] = True
                context.close()
            browser.close()
        result = {'passed': True, 'checks': checks, 'scope': 'Controlled own-image SVG dimensions, Edge fixture UI; no service/TV requests or replacement production artwork.'}
        (OUT / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(result, indent=2))
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
