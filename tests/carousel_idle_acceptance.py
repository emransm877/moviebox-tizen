"""Hero-only edition dedupe,8-second idle resume and guarded own-art rebinding."""
import json,threading
from datetime import datetime,timezone
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT,STUB,QuietHandler
OUT=ROOT/'verification/carousel-idle';OUT.mkdir(parents=True,exist_ok=True)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'app')));threading.Thread(target=server.serve_forever,daemon=True).start();checks={}
try:
 with sync_playwright()as pw:
  b=pw.chromium.launch(channel='msedge',headless=True);p=b.new_page(viewport={'width':1920,'height':1080});p.clock.install();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.route('**/*',lambda r:r.abort());p.route(f'http://127.0.0.1:{server.server_port}/**',lambda r:r.continue_());p.route('**/js/api.js',lambda r:r.fulfill(content_type='text/javascript',body=STUB));p.route('**/$WEBAPIS/**',lambda r:r.fulfill(body=''));p.goto(f'http://127.0.0.1:{server.server_port}/');p.wait_for_function('!!window.MovieBoxTV');p.clock.pause_at(datetime.fromtimestamp(p.evaluate('Date.now()+1000')/1000,timezone.utc))
  p.evaluate('''()=>{let a=MovieBoxTV;a.carousel.loaded=true;a.carousel.paused=false;a.carousel.idleUntil=0;a.carousel.set(Array.from({length:12},(_,i)=>({...movie,subjectId:'idle-'+i,title:'Idle title '+i})));}''')
  p.locator('.hero-poster[data-active=true]').focus();old=p.evaluate('MovieBoxTV.carousel.index');p.keyboard.press('ArrowRight');manual=p.evaluate('MovieBoxTV.carousel.index');assert manual==(old+1)%12
  p.clock.run_for(7999);assert p.evaluate('MovieBoxTV.carousel.index')==manual,p.evaluate('({i:MovieBoxTV.carousel.index,manual:'+str(manual)+',idle:MovieBoxTV.carousel.idleUntil,now:Date.now(),items:MovieBoxTV.carousel.items.length})')
  p.clock.run_for(1);assert p.evaluate('MovieBoxTV.carousel.index')==(manual+1)%12
  assert p.evaluate('document.activeElement.dataset.active')=='true'
  checks['manual8sec_idle_resumes_at_deadline_with_focus_remaining_in_component']=True
  p.clock.run_for(6000);assert p.evaluate('MovieBoxTV.carousel.index')==(manual+2)%12,p.evaluate('({i:MovieBoxTV.carousel.index,idle:MovieBoxTV.carousel.idleUntil,now:Date.now(),paused:MovieBoxTV.carousel.paused})');checks['then6sec_cadence']=True
  p.keyboard.press('Space');at=p.evaluate('MovieBoxTV.carousel.index');p.clock.run_for(20000);assert p.evaluate('MovieBoxTV.carousel.index')==at;assert p.evaluate('MovieBoxTV.carousel.paused');p.keyboard.press('Space');p.clock.run_for(2000);assert p.evaluate('MovieBoxTV.carousel.index')!=at;checks['explicit_space_pause_and_resume']=True
  p.locator('[data-nav=settings]').click();at=p.evaluate('MovieBoxTV.carousel.index');p.clock.run_for(16000);assert p.evaluate('MovieBoxTV.carousel.index')==at;checks['settings_does_not_rotate']=True
  p.locator('[data-nav=home]').click();p.evaluate('''()=>{let a=MovieBoxTV,items=[{...movie,subjectId:'edition-1',title:'Mangolik [Hindi]',subjectType:2,releaseDate:'2026',cover:{url:'https://pbcdnw.aoneroom.com/image/mangolik.jpg?resize=360'}},{...movie,subjectId:'edition-2',title:'Mangolik [Tamil]',subjectType:2,releaseDate:'2026',cover:{url:'https://pbcdnw.aoneroom.com/image/mangolik.jpg?resize=720'}},{...movie,subjectId:'edition-3',title:'Mangolik',subjectType:2,releaseDate:'2026',cover:{url:'https://other.example/own-poster.jpg'}}];a.carousel.set(items);window.unchangedEditions=items;}''');assert p.evaluate('MovieBoxTV.carousel.items.length')==1;assert p.evaluate('unchangedEditions.length')==3;checks['initial_home_language_cover_dedupe_catalogue_input_unchanged']=True
  held=[];p.route('https://owned-fixture.invalid/slow.svg',lambda route:held.append(route))
  p.evaluate("MovieBoxTV.carousel.set([{...movie,subjectId:'slow-own',title:'Own pending title',cover:{url:'https://owned-fixture.invalid/slow.svg'}}])");p.wait_for_timeout(50)
  img=p.locator('.hero-poster[data-active=true] img');assert img.is_hidden();assert p.locator('.hero-poster[data-active=true] .hero-poster-placeholder').inner_text()=='Own pending title'
  assert held;held[0].fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#246"/></svg>');p.wait_for_function('document.querySelector(".hero-poster img").naturalWidth>0&&!document.querySelector(".hero-poster img").hidden');checks['recycled_node_hides_previous_image_until_matching_own_decode']=True
  assert not errors,errors;b.close()
 result={'passed':True,'checks':checks,'scope':'Browser fixture/controlled clock; not hardware cadence measurement'};(OUT/'result.json').write_text(json.dumps(result,indent=2),'utf-8');print(json.dumps(result,indent=2))
finally:server.shutdown()
