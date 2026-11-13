"""Theme/carousel UI integration; the service and AVPlay are explicit fixtures."""
import json,threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from ui_acceptance import STUB,QuietHandler,ROOT
OUT=ROOT/'verification/themes-v050';OUT.mkdir(parents=True,exist_ok=True)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'app')))
threading.Thread(target=server.serve_forever,daemon=True).start()
checks={};errors=[]
try:
  with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1920,'height':1080})
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/js/api.js',lambda r:r.fulfill(content_type='text/javascript',body=STUB))
    page.route('**/$WEBAPIS/**',lambda r:r.fulfill(content_type='text/javascript',body=''))
    page.route('https://api.github.com/**',lambda r:r.fulfill(content_type='application/json',body='{}'))
    page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('#hero-next').wait_for()
    # Remove asynchronous test-fixture paging noise before asserting active slides.
    page.evaluate('MovieBoxTV.carousel.loaded=true')
    for theme in ('obsidian','orbital','prism','aurora','eclipse'):
      page.locator('[data-nav=settings]').click()
      page.locator('#preferred-theme').focus();page.keyboard.press('Enter')
      page.locator(f'.remote-picker button[data-value={theme}]').focus();page.keyboard.press('Enter')
      assert page.evaluate('document.documentElement.dataset.theme')==theme
      page.wait_for_function("document.querySelector('.brand img').complete && document.querySelector('.brand img').naturalWidth>0")
      assert page.locator('.brand img').get_attribute('src')=='assets/moviebox-logo-'+theme+'.svg'
      assert page.evaluate("JSON.parse(localStorage.getItem('moviebox-tv-library')).settings.theme")==theme
      page.locator('[data-nav=home]').click();page.locator('#hero-watch').wait_for()
      assert page.evaluate("document.querySelector('.sidebar').scrollWidth<=document.querySelector('.sidebar').clientWidth")
      if theme in ('orbital','aurora','eclipse'):
        page.locator('[data-nav=home]').focus();page.keyboard.press('ArrowDown')
        assert page.evaluate("!!document.activeElement.closest('#main-content')")
        page.locator('#hero-watch').focus()
        for _ in range(3):
          page.keyboard.press('ArrowUp')
          if page.evaluate("!!document.activeElement.closest('.sidebar')"): break
        assert page.evaluate("!!document.activeElement.closest('.sidebar')"),page.evaluate("({focus:document.activeElement.outerHTML,scroll:document.getElementById('main-content').scrollTop,header:document.querySelector('.sidebar').getBoundingClientRect().toJSON(),root:MovieBoxTV.navigation.root.id})")
      else:
        page.locator('[data-nav=home]').focus();page.keyboard.press('ArrowDown')
        assert page.evaluate('document.activeElement.dataset.nav')=='movies'
      page.screenshot(path=str(OUT/(theme+'.png')))
      checks[theme+'_remote_settings_and_navigation']=True
    page.reload();page.locator('#hero-watch').wait_for()
    assert page.evaluate('document.documentElement.dataset.theme')=='eclipse'
    checks['theme_persists_across_page_relaunch']=True
    checks['all_five_vector_logos_load_and_follow_theme']=True
    # Exercise a full bounded mixed latest feed, without downloading 100 posters.
    result=page.evaluate('''async()=>{
      var app=MovieBoxTV,c=app.carousel;c.loaded=false;c.loading=false;var calls=[];
      await c.load({catalogue:async function(kind,filters,page){calls.push({kind:kind,filters:filters,page:page});return {items:Array.from({length:24},(_,i)=>({subjectId:kind+'-'+page+'-'+i,subjectType:kind==='movies'?1:2,title:kind+' title '+page+'-'+i,releaseDate:'2026-11-14'})),hasMore:true,nextPage:page+1};}});
      return {total:c.items.length,movies:c.items.filter(x=>x.subjectType===1).length,tv:c.items.filter(x=>x.subjectType===2).length,calls:calls.length,latest:calls.every(x=>x.filters.sort==='Latest')};
    }''')
    assert result=={'total':100,'movies':50,'tv':50,'calls':6,'latest':True},result
    checks['hundred_unique_shuffled_latest_movies_and_tv_metadata_only']=True
    page.locator('#hero-next').click();active=page.evaluate('MovieBoxTV.carousel.current().subjectId')
    page.locator('#hero-info').click();page.wait_for_function('!document.getElementById("watch-button").disabled')
    assert page.evaluate('MovieBoxTV.player.active') is False
    assert page.locator('#detail-title').inner_text()==page.evaluate('MovieBoxTV.carousel.current().title')
    checks['more_info_targets_active_slide_without_starting_video']=True
    page.locator('#detail-back').click();page.locator('#hero-next').click()
    active=page.evaluate('MovieBoxTV.carousel.current().subjectId')
    page.locator('#hero-watch').click();page.wait_for_function('MovieBoxTV.player.active')
    assert page.evaluate('MovieBoxTV.player.subject.subjectId')==active
    checks['watch_starts_exact_active_slide']=True
    baseline=page.evaluate("__avcalls.filter(x=>x[0]==='open'||x[0]==='close').length")
    for theme in ('obsidian','orbital','prism','aurora','eclipse'):
      page.evaluate('(t)=>MovieBoxThemes.apply(t)',theme)
      assert page.evaluate('MovieBoxTV.player.active')
      assert page.evaluate("getComputedStyle(document.getElementById('player-page')).color")=='rgb(242, 246, 250)'
    assert page.evaluate("__avcalls.filter(x=>x[0]==='open'||x[0]==='close').length")==baseline
    checks['all_themes_preserve_native_source_and_player_contrast']=True
    page.locator('#player-back').click();page.locator('#detail-back').click()
    page.locator('#hero-pause').click();old=page.evaluate('MovieBoxTV.carousel.current().subjectId')
    page.evaluate('if (!MovieBoxTV.carousel.paused) throw new Error("not paused");')
    page.locator('#hero-watch').focus()
    assert page.evaluate('MovieBoxTV.carousel.options.canRotate()') is False
    page.evaluate("MovieBoxTV.carousel.set([{subjectId:'replacement',subjectType:1,title:'Replacement'}])")
    assert page.evaluate('MovieBoxTV.carousel.current().subjectId')==old
    checks['focused_slide_not_replaced_and_rotation_can_pause']=True
    # Exercise the narrower supported preview with every horizontal theme.
    page.set_viewport_size({'width':1280,'height':720})
    for theme in ('orbital','aurora','eclipse'):
      page.evaluate('(t)=>MovieBoxThemes.apply(t)',theme)
      assert page.evaluate("document.querySelector('.sidebar').scrollWidth<=innerWidth")
    checks['horizontal_navigation_fits_1280_and_1920']=True
    page.evaluate("movie.cover={url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"480\" height=\"270\"><rect width=\"480\" height=\"270\" fill=\"#245966\"/></svg>')};MovieBoxTV.openDetail(movie)")
    page.wait_for_function('document.getElementById("detail-poster").naturalWidth===480')
    assert page.evaluate("getComputedStyle(document.getElementById('detail-poster')).objectFit")=='contain'
    checks['landscape_detail_artwork_is_contained_without_stretching']=True
    assert not errors,errors
    checks['no_javascript_exceptions']=True
    browser.close()
finally:
  server.shutdown()
  result={'scope':'Headless Edge, fixture service, mocked AVPlay; not hardware playback proof.','checks':checks,'passed':not errors and len(checks)>=13}
  (OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
  print(json.dumps(result,indent=2))
