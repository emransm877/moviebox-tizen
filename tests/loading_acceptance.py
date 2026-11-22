"""Immediate known metadata and stale detail response isolation; offline browser only."""
from functools import partial
from http.server import ThreadingHTTPServer
import threading, json
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler
OUT=ROOT/'verification'/'loading';OUT.mkdir(parents=True,exist_ok=True)
EXTRA='''window.detailRequests=[];MovieBoxAPI.prototype.detail=function(s){return new Promise((resolve,reject)=>detailRequests.push({subject:s,resolve,reject}));};window.answerDetail=function(i){const r=detailRequests[i];r.resolve({subject:r.subject,isSeries:false,resource:{seasons:[]}});};'''
def run():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'app')));threading.Thread(target=server.serve_forever,daemon=True).start();checks={}
    try:
        with sync_playwright() as p:
            b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1920,'height':1080})
            page.route('**/*',lambda r:r.abort());page.route(f'http://127.0.0.1:{server.server_port}/**',lambda r:r.continue_());page.route('**/js/api.js',lambda r:r.fulfill(content_type='text/javascript',body=STUB+EXTRA));page.route('**/$WEBAPIS/**',lambda r:r.fulfill(body=''))
            page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('.poster-card').first.wait_for();page.evaluate('MovieBoxTV.carousel.loaded=true;movie.genre="Known genre";MovieBoxTV.openDetail(movie)')
            assert page.locator('#detail-description').inner_text()==page.evaluate('movie.description')
            assert 'Known genre' in page.locator('#detail-meta').inner_text()
            assert page.locator('#watch-button').is_disabled()
            page.screenshot(path=str(OUT/'known-metadata-before-response.png'))
            page.evaluate('answerDetail(0)');page.wait_for_function('!document.getElementById("watch-button").disabled')
            assert not page.evaluate('MovieBoxTV.player.active')
            checks['known_metadata_immediate_watch_waits_for_validated_resource']=True
            page.evaluate('MovieBoxTV.openDetail({...movie,subjectId:"back-race",title:"Back race"})');page.keyboard.press('Escape');page.evaluate('answerDetail(1)')
            page.wait_for_function('document.getElementById("detail-page").hidden')
            checks['late_detail_after_back_cannot_reopen_destination']=True
            page.evaluate('MovieBoxTV.openDetail({...movie,subjectId:"old",title:"Old selection"});MovieBoxTV.openDetail({...movie,subjectId:"new",title:"New selection"});answerDetail(3)')
            page.wait_for_function('!document.getElementById("watch-button").disabled');page.evaluate('answerDetail(2)')
            assert page.locator('#detail-title').inner_text()=='New selection'
            checks['late_old_title_cannot_overwrite_new_selection']=True
            b.close()
        (OUT/'result.json').write_text(json.dumps({'passed':True,'checks':checks},indent=2),encoding='utf-8');print(json.dumps({'passed':True,'checks':checks},indent=2))
    finally:server.shutdown()
if __name__=='__main__':run()
