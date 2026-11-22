"""Exact-subject 3D poster carousel compositions, offline."""
from functools import partial
from http.server import ThreadingHTTPServer
import threading,json
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT,STUB,QuietHandler
OUT=ROOT/'verification'/'hero-artwork';OUT.mkdir(parents=True,exist_ok=True)
EXTRA='''window.heroSubject={subjectId:'577120636984879608',subjectType:1,title:'Datang Akan Pergi',releaseDate:'2026-01-01',cover:{url:'https://pbcdn.aoneroom.com/image/owned-portrait.svg',width:3276,height:4096}};MovieBoxAPI.prototype.home=async()=>({subjects:[heroSubject]});'''
def run():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'app')));threading.Thread(target=server.serve_forever,daemon=True).start();checks={}
    try:
        with sync_playwright() as p:
            b=p.chromium.launch(channel='msedge',headless=True)
            for width,height in [(1920,1080),(1280,720)]:
                page=b.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
                page.route('**/*',lambda r:r.abort());page.route(f'http://127.0.0.1:{server.server_port}/**',lambda r:r.continue_());page.route('**/js/api.js',lambda r:r.fulfill(content_type='text/javascript',body=STUB+EXTRA));page.route('**/$WEBAPIS/**',lambda r:r.fulfill(body=''))
                page.route('**/image/owned-portrait.svg*',lambda r:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="360" height="450"><rect width="100%" height="100%" fill="#276d60"/><text x="16" y="77" font-size="33" fill="white">OWN COVER</text></svg>'))
                page.route('**/hero-fixture/**',lambda r:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="360" height="450"><rect width="100%" height="100%" fill="#276d60"/><text x="16" y="77" font-size="33" fill="white">OWN COVER</text></svg>' if 'portrait' in r.request.url else '<svg xmlns="http://www.w3.org/2000/svg" width="920" height="518"><rect width="100%" height="100%" fill="#276d60"/><text x="80" y="260" font-size="80" fill="white">OWN BANNER</text></svg>'))
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                try:
                    page.wait_for_function('document.querySelector(".hero-poster img")?.naturalWidth>0')
                except PlaywrightTimeoutError:
                    # Preserve useful evidence if a hosted browser cannot decode the
                    # intercepted fixture; no network retries or skipped assertions.
                    page.screenshot(path=str(OUT/f'{width}-initial-artwork-failure.png'))
                    print(json.dumps(page.evaluate('''()=>({ready:document.readyState,heroHidden:document.getElementById('hero').hidden,stage:document.getElementById('hero-poster-stage').getBoundingClientRect().toJSON(),images:[...document.querySelectorAll('.hero-poster img')].map(n=>({src:n.src,currentSrc:n.currentSrc,complete:n.complete,width:n.naturalWidth,hidden:n.hidden})),status:document.getElementById('status')?.textContent})''')),flush=True)
                    raise
                page.evaluate('MovieBoxTV.carousel.loaded=true')
                for theme in ('obsidian','orbital','prism','aurora','eclipse'):
                    page.evaluate('t=>MovieBoxThemes.apply(t)',theme)
                    assert page.locator('.hero-poster').count()==1
                    assert page.locator('.hero-poster').get_attribute('data-subject-id')=='577120636984879608'
                    assert page.locator('.hero-poster img').evaluate('e=>getComputedStyle(e).objectFit')=='cover'
                    assert page.locator('#hero-title').inner_text()=='Datang Akan Pergi'
                    assert page.locator('#hero-watch,#hero-info,#hero-save').count()==0
                    page.screenshot(path=str(OUT/f'{width}-{theme}-contained-own-cover.png'))
                    checks[f'{width}_{theme}_own_poster_proportional_fill_without_redundant_controls']=True
                page.evaluate('MovieBoxTV.carousel.index=0;MovieBoxTV.carousel.set([{...heroSubject,subjectId:"own-banner",stills:{url:location.origin+"/hero-fixture/wide.svg",width:920,height:518}}])')
                assert page.locator('.hero-poster img').evaluate('n=>n.src.includes("owned-portrait.svg")')
                checks[f'{width}_carousel_uses_own_poster_not_another_subject_banner']=True
                page.close()
            b.close()
        result={'passed':True,'checks':checks,'scope':'Offline SVG source-schema/layout fixtures; not real Datang artwork or TV hardware.'};(OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result,indent=2))
    finally:server.shutdown()
if __name__=='__main__':run()
