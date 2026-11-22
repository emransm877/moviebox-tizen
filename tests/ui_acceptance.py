"""Browser/remote UI checks using a mocked Samsung AVPlay API, not TV evidence."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'verification' / 'ui'
OUTPUT.mkdir(parents=True, exist_ok=True)

STUB = r'''
window.__avcalls=[];window.__subtitleFetches=0;window.__captionCalls=0;
var nativeState='NONE',nativePosition=0,nativeListener={},nativeSource='',nativeAudioIndex=0;
window.__seekDelay=0;window.__prepareDelay=15;window.__seekMaxConcurrent=0;window.__nativeGeneration=0;window.__nativeSeekSerial=0;window.__nativeSeeks={};window.__seekFailure=null;
window.webapis={avplay:{getState:function(){return nativeState;},close:function(){nativeState='NONE';__avcalls.push(['close']);},open:function(url){nativeState='IDLE';__avcalls.push(['open',url]);},setStreamingProperty:function(k,v){__avcalls.push(['property',k,v]);},setDisplayRect:function(){__avcalls.push(['rect'].concat(Array.from(arguments)));},setDisplayMethod:function(){},setListener:function(l){nativeListener=l;},prepareAsync:function(ok){__avcalls.push(['prepareAsync']);setTimeout(function(){nativeState='READY';ok();},15);},getDuration:function(){return 100000;},seekTo:function(t,ok){nativePosition=t;__avcalls.push(['seekTo',t]);if(ok)setTimeout(ok,0);},play:function(){nativeState='PLAYING';__avcalls.push(['play']);setTimeout(function(){if(nativeState==='PLAYING'&&nativeListener.oncurrentplaytime)nativeListener.oncurrentplaytime(nativePosition||1200);},5);},pause:function(){nativeState='PAUSED';__avcalls.push(['pause']);}}};
var poster='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#194d40"/><circle cx="150" cy="200" r="90" fill="#38e3a3"/><text x="150" y="360" text-anchor="middle" fill="white" font-size="26">MOVIEBOX</text></svg>');
var movie={subjectId:'movie1',subjectType:1,title:'The Test Movie',releaseDate:'2026-01-01',description:'A fixture movie used to check the actual rendered TV interface and keyboard navigation.',cover:{url:poster},genre:'Adventure',hasResource:true};
var series={subjectId:'series1',subjectType:2,title:'The Test Series',releaseDate:'2025-01-01',description:'A fixture series with multiple seasons and episodes beyond the first twenty.',cover:{url:poster},hasResource:true};
series.dubs=[{subjectId:'series1',type:0,lanCode:'en',lanName:'English dub'},{subjectId:'series-hi',type:0,lanCode:'hi',lanName:'Hindi dub'},{subjectId:'series-cut',type:0,lanCode:'fr',lanName:'Different runtime'},{subjectId:'series-ar-sub',type:1,lanCode:'ar',lanName:'Arabic sub'}];
webapis.avplay.setBufferingParam=function(option,unit,value){if(nativeState!=='IDLE')throw new Error('Buffer policy must be set in IDLE');__avcalls.push(['bufferPolicy',option,unit,value]);};
var originalOpen=webapis.avplay.open;webapis.avplay.open=function(url){nativeSource=url;nativeAudioIndex=0;originalOpen(url);};
var originalClose=webapis.avplay.close;webapis.avplay.close=function(){__nativeGeneration++;originalClose();};
webapis.avplay.prepareAsync=function(ok){__avcalls.push(['prepareAsync']);var generation=__nativeGeneration;setTimeout(function(){if(generation===__nativeGeneration){nativeState='READY';ok();}},__prepareDelay);};
webapis.avplay.getCurrentTime=function(){return nativePosition;};
webapis.avplay.seekTo=function(target,ok,fail){var generation=__nativeGeneration,id=++__nativeSeekSerial,error=__seekFailure;__seekFailure=null;__nativeSeeks[id]=generation;__seekMaxConcurrent=Math.max(__seekMaxConcurrent,Object.values(__nativeSeeks).filter(function(g){return g===generation;}).length);__avcalls.push(['seekTo',target,nativeState]);setTimeout(function(){delete __nativeSeeks[id];if(error){if(fail)fail(error);}else{if(generation===__nativeGeneration)nativePosition=target;if(ok)ok();}},__seekDelay);};
webapis.avplay.getTotalTrackInfo=function(){return nativeSource.includes('series-hi')?[{type:'AUDIO',index:0,extra_info:'{"language":"hin"}'}]:[{type:'AUDIO',index:0,extra_info:'{"language":"eng"}'},{type:'AUDIO',index:1,extra_info:'{"language":"hin"}'}];};
webapis.avplay.getCurrentStreamInfo=function(){return[{type:'AUDIO',index:nativeAudioIndex}];};
webapis.avplay.setSelectTrack=function(type,index){nativeAudioIndex=index;__avcalls.push(['setSelectTrack',type,index]);};
window.MovieBoxAPI=function(){this.streamUserAgent='MovieBoxTV/test';};
MovieBoxAPI.prototype.home=function(){return Promise.resolve({operatingList:[{subjects:[movie,series]}]});};
MovieBoxAPI.prototype.search=function(q){return Promise.resolve({items:q.toLowerCase().includes('series')?[series]:[movie]});};
MovieBoxAPI.prototype.catalogue=function(kind,filters,page){window.__catalogueCalls=window.__catalogueCalls||[];__catalogueCalls.push({kind:kind,filters:filters,page:page});var sample=kind==='movies'?movie:series;return Promise.resolve({items:Array.from({length:12},function(_,i){return Object.assign({},sample,{subjectId:kind+'-'+page+'-'+i,title:(filters.genre==='All'?'':filters.genre+' ')+sample.title+' '+page+'-'+i});}),hasMore:page<2,nextPage:page+1});};
MovieBoxAPI.prototype.suggest=function(q){return Promise.resolve([{word:q+' movie'},{word:'The Test Series',subject:series}]);};
MovieBoxAPI.prototype.detail=function(s){return Promise.resolve({subject:s,isSeries:s.subjectType===2,resource:{seasons:s.subjectType===2?[{se:1,maxEp:65},{se:2,maxEp:8}]:[{se:0,maxEp:1}]}});};
MovieBoxAPI.prototype.playback=function(s,se,ep){return Promise.resolve([{url:'https://fixture.invalid/'+s.subjectId+'/'+se+'/'+ep+'/1080.mp4',resolutions:1080,size:30000000,duration:s.subjectId==='series-hi'||s.subjectId==='series-cut'?40:100,id:'1080',headers:{'User-Agent':'MovieBoxTV/test'}},{url:'https://fixture.invalid/'+s.subjectId+'/'+se+'/'+ep+'/low.mp4',resolutions:s.subjectId==='series-hi'?720:480,size:10000000,duration:s.subjectId==='series-cut'?40:100,id:'low'}]);};
MovieBoxAPI.prototype.captions=function(s){__captionCalls++;return Promise.resolve({captions:[{lan:'en',lanName:'English',url:'https://fixture.invalid/'+s.subjectId+'/en.srt'},{lan:'fr',lanName:'French',url:'https://fixture.invalid/fr.srt'}]});};
MovieBoxAPI.prototype.text=function(url){__subtitleFetches++;return Promise.resolve('1\n00:00:00,000 --> 00:01:40,000\n'+(url.includes('fr.srt')?'Bonjour le monde':'A cached subtitle on your TV.'));};
var originalText=MovieBoxAPI.prototype.text;MovieBoxAPI.prototype.text=function(url){if(url.includes('series-hi')){__subtitleFetches++;return Promise.resolve('1\n00:00:00,000 --> 00:01:40,000\nHindi edition subtitle.');}return originalText(url);};
'''

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'app')))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    result = {'scope': 'Headless Edge, fixture service, mocked Samsung AVPlay. Not physical TV playback verification.', 'checks': {}}
    checks = result['checks']
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge', headless=True)
            page = browser.new_page(viewport={'width':1920,'height':1080})
            errors=[]
            github_requests=[]
            page.on('pageerror',lambda error: errors.append(str(error)))
            def github_release(route):
                github_requests.append(route.request.url)
                route.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps({'tag_name':'v0.10.0','html_url':'https://github.com/emransm877/moviebox-tizen/releases/tag/v0.10.0'}))
            page.route('https://api.github.com/repos/emransm877/moviebox-tizen/releases/latest',github_release)
            page.route('**/js/api.js',lambda route: route.fulfill(status=200,content_type='text/javascript',body=STUB))
            page.route('**/$WEBAPIS/**',lambda route: route.fulfill(status=200,content_type='text/javascript',body=''))
            page.goto('http://127.0.0.1:%d/' % server.server_port)
            def remote_pick(selector,value):
                page.locator(selector).focus()
                page.keyboard.press('Enter')
                page.locator('.remote-picker').wait_for()
                for _ in range(40):
                    if page.evaluate('document.activeElement.dataset.value')==value:
                        break
                    page.keyboard.press('ArrowDown')
                assert page.evaluate('document.activeElement.dataset.value')==value
                page.keyboard.press('Enter')
                assert page.locator('.remote-picker').count()==0
            page.locator('.poster-card').first.wait_for()
            assert page.locator('.poster-card').count()==2
            page.locator('[data-nav=home]').focus()
            page.keyboard.press('ArrowDown')
            assert page.evaluate('document.activeElement.dataset.nav')=='movies'
            page.keyboard.press('ArrowDown')
            assert page.evaluate('document.activeElement.dataset.nav')=='tv'
            page.keyboard.press('ArrowDown')
            assert page.evaluate('document.activeElement.dataset.nav')=='search'
            checks['remote_navigation_between_sidebar_items']=True
            page.locator('.poster-card').first.focus()
            page.keyboard.press('Enter')
            page.wait_for_function("!document.getElementById('watch-button').disabled")
            assert not page.locator('#season-row').is_visible()
            assert not page.locator('#episode-panel').is_visible()
            checks['movies_hide_seasons_and_episodes']=True
            page.screenshot(path=str(OUTPUT/'movie-detail.png'))
            page.keyboard.press('Escape')
            page.locator('.poster-card').nth(1).click()
            page.wait_for_function("document.querySelectorAll('[data-episode]').length===65")
            assert page.locator('#season-select option').count()==2
            checks['series_lists_all_65_episodes']=True
            remote_pick('#season-select','2')
            assert page.locator('[data-episode]').count()==8
            page.locator('#season-select').select_option('1')
            checks['season_change_updates_episode_buttons']=True
            page.locator('#save-button').click()
            assert page.locator('#save-button').inner_text()=='✓ Saved'
            page.wait_for_function("JSON.parse(localStorage.getItem('moviebox-tv-library') || '{}').saved?.series1")
            checks['saved_list_persists']=page.evaluate("JSON.parse(localStorage.getItem('moviebox-tv-library')).saved.series1.title")=='The Test Series'
            page.evaluate("MovieBoxTV.state.history['series1:1:65']={subject:MovieBoxTV.state.saved.series1,position:64000,duration:100000,updated:Date.now()};")
            page.locator('[data-episode="65"]').focus()
            page.keyboard.press('Enter')
            page.wait_for_function("MovieBoxTV.player.active && MovieBoxTV.player.position>=64000 && nativeState==='PLAYING'")
            page.wait_for_function("MovieBoxTV.player.cues.length>0")
            calls=page.evaluate('__avcalls')
            assert any(row[0]=='property' and row[1]=='USER_AGENT' for row in calls)
            assert next(i for i,row in enumerate(calls) if row[0]=='seekTo') < next(i for i,row in enumerate(calls) if row[0]=='play')
            checks['native_prepare_is_async_and_resume_seek_precedes_play']=True
            assert page.locator('#subtitle-overlay').inner_text()=='A cached subtitle on your TV.'
            checks['automatic_subtitle_download_and_overlay']=True
            page.locator('#seek-bar').fill('75000')
            page.locator('#seek-bar').dispatch_event('change')
            page.wait_for_function('MovieBoxTV.player.position===75000')
            checks['seek_bar_requests_exact_target']=True
            page.locator('#play-pause').click()
            assert page.evaluate('MovieBoxTV.player.paused')
            page.locator('#quality-select').select_option('480')
            page.wait_for_function("MovieBoxTV.player.stream.resolutions===480 && nativeState==='PAUSED'")
            checks['quality_switch_preserves_paused_state_and_position']=page.evaluate('MovieBoxTV.player.position')==75000
            assert page.locator('#audio-select option[value="edition:series-ar-sub"]').count()==0
            checks['subtitle_only_editions_excluded_from_audio']=True
            remote_pick('#audio-select','track:1')
            assert page.evaluate('nativeAudioIndex')==1
            assert page.evaluate('MovieBoxTV.player.paused')
            checks['remote_embedded_audio_track_selection']=True
            before_audio=page.evaluate('__subtitleFetches')
            remote_pick('#audio-select','edition:series-hi')
            page.wait_for_function("MovieBoxTV.player.subject.subjectId==='series-hi' && nativeState==='PAUSED' && MovieBoxTV.player.cues.length>0")
            assert page.evaluate('MovieBoxTV.player.stream.resolutions')==720
            assert page.evaluate('MovieBoxTV.player.position')==75000
            assert page.evaluate('__subtitleFetches')==before_audio+1
            assert page.locator('#subtitle-overlay').inner_text()=='Hindi edition subtitle.'
            checks['audio_edition_uses_matching_full_runtime_and_replaces_subtitles']=True
            before_calls=page.evaluate('__avcalls.filter(c=>c[0]==="open").length')
            remote_pick('#audio-select','edition:series-cut')
            page.wait_for_function("document.getElementById('toast').textContent.includes('different cut')")
            assert page.evaluate('MovieBoxTV.player.subject.subjectId')=='series-hi'
            assert page.evaluate('__avcalls.filter(c=>c[0]==="open").length')==before_calls
            checks['different_cut_audio_is_rejected_without_interrupting_playback']=True
            assert page.evaluate("MovieBoxTV.state.audioPreferences.series1.subjectId")=='series-hi'
            assert page.evaluate("Object.keys(MovieBoxTV.state.history).some(k=>k.startsWith('series-hi:'))")==False
            checks['audio_preference_and_canonical_history_preserved']=True
            assert page.locator('#autoplay-next').count()==0
            assert page.locator('#preferred-autoplay').count()==0
            assert page.evaluate('MovieBoxTV.player.options.autoplay') is True
            checks['series_autoplay_is_default_without_checkbox']=True
            page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Unidentified',keyCode:415,bubbles:true,cancelable:true}))")
            assert page.evaluate('nativeState')=='PLAYING'
            page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Unidentified',keyCode:19,bubbles:true,cancelable:true}))")
            assert page.evaluate('nativeState')=='PAUSED'
            checks['samsung_transport_key_codes']=True
            page.locator('#player-page').click(position={'x':1800,'y':350})
            page.wait_for_timeout(3800)
            assert page.locator('#player-page').evaluate("e=>e.classList.contains('controls-hidden')")
            page.keyboard.press('ArrowRight')
            page.wait_for_function('MovieBoxTV.player.position===85000')
            checks['remote_seek_from_hidden_controls']=True
            page.mouse.move(1300,400)
            assert not page.locator('#player-page').evaluate("e=>e.classList.contains('controls-hidden')")
            page.screenshot(path=str(OUTPUT/'player-controls.png'))
            checks['remote_controls_auto_hide_and_mouse_reveal']=True
            page.keyboard.press('Escape')
            page.wait_for_function('!MovieBoxTV.player.active')
            before=page.evaluate('__subtitleFetches')
            page.locator('#watch-button').click()
            page.wait_for_function('MovieBoxTV.player.cues.length>0')
            assert page.evaluate('__subtitleFetches')==before
            assert page.evaluate('MovieBoxTV.player.subject.subjectId')=='series-hi'
            checks['subtitle_replay_uses_indexeddb_without_download']=True
            page.keyboard.press('Escape')
            page.keyboard.press('Escape')
            page.locator('[data-nav=search]').click()
            page.locator('#search-input').fill('Series')
            page.locator('#suggestions button').first.wait_for()
            assert page.locator('#suggestions button').count()==2
            checks['database_suggestions_render']=True
            page.locator('#suggestions button').nth(1).click()
            page.wait_for_function("document.getElementById('detail-title').textContent==='The Test Series'")
            checks['suggestion_opens_real_subject']=True
            page.locator('[data-nav=search]').click()
            page.evaluate("window.tizen={tvinputdevice:{registerKey:function(){}}};var input=document.getElementById('search-input');window.__inputFocusCalls=0;var originalFocus=input.focus.bind(input);input.focus=function(){__inputFocusCalls++;originalFocus();};input.focus();")
            page.evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Unidentified',keyCode:13,bubbles:true,cancelable:true}))")
            assert page.evaluate('__inputFocusCalls')>=2
            assert page.locator('#search-panel').is_visible()
            checks['remote_ok_focuses_search_for_native_samsung_ime']=True
            prevented=page.evaluate("var e=new KeyboardEvent('keydown',{key:'Unidentified',keyCode:229,bubbles:true,cancelable:true});document.activeElement.dispatchEvent(e);e.defaultPrevented")
            assert not prevented
            checks['ime_composition_is_not_intercepted']=True
            page.locator('#search-input').fill('Series')
            page.evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Unidentified',keyCode:65376,bubbles:true,cancelable:true}))")
            page.wait_for_function("document.getElementById('catalog-title').textContent.includes('Results for')")
            checks['samsung_ime_done_submits_search']=True
            page.locator('[data-nav=search]').click()
            page.locator('#search-input').focus()
            page.evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Unidentified',keyCode:10009,bubbles:true,cancelable:true}))")
            assert page.locator('#search-panel').is_visible()
            assert not page.locator('#exit-dialog').is_visible()
            assert page.evaluate('document.activeElement.id')=='search-go'
            checks['back_dismisses_ime_without_exiting_app']=True
            page.locator('[data-nav=settings]').click()
            assert page.locator('#settings-page').is_visible()
            checks['settings_available']=True
            page.locator('#check-updates').focus()
            page.keyboard.press('Enter')
            page.locator('#update-notice').wait_for()
            assert page.evaluate('document.activeElement.id')=='check-updates'
            assert page.locator('#update-title').inner_text()=='MovieBox 0.10.0 is available'
            original_url=page.url
            page.locator('#update-download').focus()
            page.keyboard.press('Enter')
            assert page.locator('#update-instructions').is_visible()
            assert page.locator('#update-url').inner_text()=='https://github.com/emransm877/moviebox-tizen/releases/tag/v0.10.0'
            assert page.url==original_url
            checks['optional_update_notice_does_not_take_focus_or_auto_navigate']=True
            page.locator('#update-later').focus()
            page.keyboard.press('Enter')
            assert not page.locator('#update-notice').is_visible()
            assert page.evaluate('MovieBoxTV.releases.preferences.snoozeUntil>Date.now()')
            page.locator('#check-updates').click()
            page.locator('#update-notice').wait_for()
            page.locator('#update-skip').click()
            assert page.evaluate('MovieBoxTV.releases.preferences.skipped')=='v0.10.0'
            checks['update_later_and_skip_are_user_controlled']=True
            page.locator('#optional-updates').focus()
            page.keyboard.press('Enter')
            assert page.evaluate('MovieBoxTV.releases.preferences.enabled')==False
            page.locator('#check-updates').click()
            page.locator('#update-notice').wait_for()
            checks['update_settings_disable_auto_checks_but_allow_manual_review']=True
            page.locator('#update-later').click()
            # Delayed callbacks exercise the asynchronous contract the real TV uses.
            page.locator('[data-nav=home]').click()
            page.locator('.poster-card').nth(1).click()
            page.wait_for_function("document.querySelector('[data-episode=\"1\"]') && !document.getElementById('watch-button').disabled")
            page.locator('[data-episode="1"]').click()
            page.wait_for_function("nativeState==='PLAYING' && !MovieBoxTV.player.preparing")
            page.evaluate('MovieBoxTV.releases.check(true)')
            assert not page.locator('#update-notice').is_visible()
            assert page.evaluate('nativeState')=='PLAYING'
            checks['update_check_never_blocks_or_overlays_playback']=True
            persistence=page.evaluate("MovieBoxTV.flushPersistence();var p=MovieBoxTV.player,before=MovieBoxTV.persistenceMetrics.writes;for(var i=0;i<50;i++)p.callbacks.onProgress(1000+i*100,100000);var delayed=MovieBoxTV.persistenceMetrics.writes===before;MovieBoxTV.flushPersistence();({delayed:delayed,writes:MovieBoxTV.persistenceMetrics.writes-before,stored:JSON.parse(localStorage.getItem('moviebox-tv-library'))})")
            assert persistence['delayed'] and persistence['writes']==1
            saved_subject=persistence['stored']['history']['series1:1:1']['subject']
            assert 'dubs' not in saved_subject and 'description' not in saved_subject
            checks['history_writes_are_compact_and_coalesced_outside_key_handlers']=True
            caption_mutations=page.evaluate("var p=MovieBoxTV.player;p.cues=[{start:0,end:100000,text:'A stable caption'}];p.position=1000;p.renderCaption();var observer=new MutationObserver(function(){});observer.observe(document.getElementById('subtitle-overlay'),{childList:true,subtree:true});for(var i=0;i<100;i++){p.position=1000+i;p.renderCaption();}var count=observer.takeRecords().length;observer.disconnect();count")
            assert caption_mutations==0
            checks['unchanged_subtitle_text_does_not_recreate_dom_nodes']=True
            assert page.evaluate('MovieBoxAudio.matchingRuntime([{duration:7157}],7160).length')==1
            for wrong in [1717,6517]:
                assert page.evaluate('(function(){try{MovieBoxAudio.matchingRuntime([{duration:'+str(wrong)+'}],7160);return false;}catch(error){return error.code==="DIFFERENT_RUNTIME";}})()')
            checks['audio_tolerates_small_padding_but_rejects_different_cuts']=True
            assert page.evaluate('MovieBoxTV.player.bufferConfiguration.applied')
            assert page.evaluate('__avcalls.filter(c=>c[0]==="bufferPolicy").every(c=>c[2]==="PLAYER_BUFFER_SIZE_IN_SECOND" && c[3]===4)')
            checks['native_buffer_targets_use_supported_four_second_minimum_in_idle']=True
            page.evaluate('MovieBoxTV.player.loading(false);MovieBoxTV.player.seekGraceUntil=Date.now()+8000;nativeListener.onbufferingstart();nativeListener.onbufferingprogress(40);')
            page.wait_for_timeout(120)
            assert page.locator('#player-loading').is_hidden()
            page.evaluate('nativeListener.onbufferingcomplete();')
            page.wait_for_timeout(950)
            assert page.locator('#player-loading').is_hidden()
            checks['brief_seek_buffer_events_do_not_flash_spinner']=True
            page.evaluate("MovieBoxTV.player.preference='1080';MovieBoxTV.player.seekGraceUntil=0;nativeListener.onbufferingstart();")
            page.wait_for_timeout(550)
            assert page.locator('#player-loading').is_visible()
            page.evaluate('nativeListener.onbufferingcomplete();')
            assert page.locator('#player-loading').is_hidden()
            checks['real_buffer_stalls_remain_visible']=True
            page.evaluate("__seekDelay=250;__seekMaxConcurrent=0;__avcalls=[];nativePosition=10000;MovieBoxTV.player.tick(10000);for(var i=0;i<10;i++)MovieBoxTV.player.skip(1000);")
            assert page.evaluate('MovieBoxTV.player.position')==10000
            assert page.evaluate('MovieBoxTV.player.previewPosition()')==20000
            assert page.evaluate('__avcalls.filter(c=>c[0]==="seekTo").length')==0
            page.wait_for_function('MovieBoxTV.player.seekInFlight!==null')
            page.evaluate('for(var i=0;i<3;i++)MovieBoxTV.player.skip(5000);')
            page.wait_for_function('MovieBoxTV.player.position===35000 && MovieBoxTV.player.seekInFlight===null && MovieBoxTV.player.seekTarget===null')
            assert page.evaluate('__seekMaxConcurrent')==1
            assert page.evaluate('__avcalls.filter(c=>c[0]==="seekTo").map(c=>c[1])')==[20000,35000]
            checks['rapid_remote_seeks_accumulate_coalesce_and_never_overlap']=True
            checks['seek_preview_does_not_announce_unconfirmed_completion']=True
            page.evaluate("nativePosition=10000;MovieBoxTV.player.tick(10000);document.getElementById('player-page').classList.add('controls-hidden');document.getElementById('player-page').focus();__seekMaxConcurrent=0;")
            for _ in range(6):
                page.keyboard.press('ArrowRight')
            assert page.evaluate('MovieBoxTV.player.previewPosition()')==70000
            assert page.evaluate('document.activeElement.id')=='seek-bar'
            page.wait_for_function('MovieBoxTV.player.position===70000 && MovieBoxTV.player.seekInFlight===null && MovieBoxTV.player.seekTarget===null')
            assert page.evaluate('__seekMaxConcurrent')==1
            checks['held_dpad_continues_ten_second_seeks_after_controls_reveal']=True
            page.evaluate("__avcalls=[];nativeState='IDLE';MovieBoxTV.player.seek(42000.7);")
            page.wait_for_timeout(190)
            assert page.evaluate('__avcalls.filter(c=>c[0]==="seekTo").length')==0
            assert page.evaluate('MovieBoxTV.player.seekDiagnostics.state')=='waiting-state'
            page.evaluate("nativeState='PAUSED';MovieBoxTV.player.pause();MovieBoxTV.player.flushSeek();")
            page.wait_for_function('MovieBoxTV.player.position===42001 && MovieBoxTV.player.seekInFlight===null')
            assert page.evaluate('nativeState')=='PAUSED'
            checks['seek_state_guard_integer_clamp_and_paused_preservation']=True
            page.evaluate("__prepareDelay=280;__avcalls=[];MovieBoxTV.player.start(MovieBoxTV.player.stream,0,true);MovieBoxTV.player.seek(64000);")
            page.wait_for_timeout(190)
            assert page.evaluate('__avcalls.filter(c=>c[0]==="seekTo").length')==0
            page.wait_for_function("nativeState==='PAUSED' && MovieBoxTV.player.position===64000 && !MovieBoxTV.player.preparing && MovieBoxTV.player.seekInFlight===null")
            calls=page.evaluate('__avcalls')
            assert next(i for i,row in enumerate(calls) if row[0]=='seekTo') < next(i for i,row in enumerate(calls) if row[0]=='play')
            checks['seek_during_prepare_waits_for_ready_and_uses_latest_target']=True
            page.evaluate("__prepareDelay=15;__seekFailure={name:'PLAYER_ERROR_SEEK_FAILED',code:'seek-test'};MovieBoxTV.player.seek(44000);")
            page.wait_for_function("MovieBoxTV.player.lastNativeError && MovieBoxTV.player.lastNativeError.name==='PLAYER_ERROR_SEEK_FAILED'")
            assert page.evaluate('MovieBoxTV.player.position')==64000
            assert page.evaluate('MovieBoxTV.player.seekDiagnostics.state')=='failed'
            checks['native_seek_error_name_is_retained_without_false_completion']=True
            page.evaluate("__seekDelay=350;MovieBoxTV.player.seek(50000);")
            page.wait_for_function('MovieBoxTV.player.seekInFlight!==null')
            old_epoch=page.evaluate('MovieBoxTV.player.epoch')
            page.evaluate('MovieBoxTV.player.start(MovieBoxTV.player.stream,20000,false);')
            page.wait_for_function("MovieBoxTV.player.position===20000 && nativeState==='PLAYING' && !MovieBoxTV.player.preparing && MovieBoxTV.player.seekInFlight===null")
            assert page.evaluate('MovieBoxTV.player.epoch')>old_epoch
            assert page.evaluate('MovieBoxTV.player.seekDiagnostics.lastConfirmed')==20000
            checks['source_epoch_cancels_stale_seek_callbacks']=True
            # Reproduce the physical-TV fault: seek buffering must not vote for downgrade.
            page.evaluate("var p=MovieBoxTV.player;p.preference='auto';p.streams=[Object.assign({},p.stream,{resolutions:1080,url:'https://fixture.invalid/full1080'}),Object.assign({},p.stream,{resolutions:480,url:'https://fixture.invalid/full480'})];p.stream=p.streams[0];p.lastQualityChange=Date.now()-30000;p.bufferEvents=[Date.now()-1000];p.seek(30000);p.buffering();p.buffering();")
            assert page.evaluate('MovieBoxTV.player.stream.resolutions')==1080
            assert page.evaluate('MovieBoxTV.player.bufferEvents.length')==0
            page.wait_for_function('MovieBoxTV.player.seekInFlight===null && MovieBoxTV.player.seekTarget===null && MovieBoxTV.player.position===30000')
            page.evaluate('MovieBoxTV.player.buffering();MovieBoxTV.player.buffering();')
            assert page.evaluate('MovieBoxTV.player.stream.resolutions')==1080
            assert page.evaluate('MovieBoxTV.player.lastBufferEvent.reason')=='seek-grace'
            checks['explicit_seek_and_resume_buffering_never_trigger_auto_downgrade']=True
            page.evaluate("MovieBoxTV.player.seekGraceUntil=0;MovieBoxTV.player.bufferEvents=[];nativeState='READY';MovieBoxTV.player.buffering();MovieBoxTV.player.buffering();")
            assert page.evaluate('MovieBoxTV.player.stream.resolutions')==1080
            checks['ready_state_is_not_counted_as_network_failure']=True
            page.evaluate("nativeState='PLAYING';MovieBoxTV.player.buffering();MovieBoxTV.player.buffering();")
            page.wait_for_function('MovieBoxTV.player.stream.resolutions===480')
            checks['genuine_repeated_playback_buffering_still_adapts_quality']=True
            page.evaluate("MovieBoxTV.state.settings.language='fr';dispatchEvent(new Event('pagehide'));")
            assert page.evaluate("JSON.parse(localStorage.getItem('moviebox-tv-library')).settings.language")=='fr'
            checks['lifecycle_flush_preserves_pending_preferences']=True
            backup=page.evaluate("localStorage.getItem('moviebox-tv-library-backup')")
            assert backup and 'saved' in __import__('json').loads(backup)
            checks['saved_library_has_recovery_copy']=True
            page.evaluate('MovieBoxTV.player.stop();')
            saved_ids=page.evaluate('Object.keys(MovieBoxTV.state.saved).sort()')
            page.evaluate("MovieBoxTV.flushPersistence();localStorage.setItem('moviebox-tv-library','{damaged');")
            page.reload()
            page.wait_for_function('window.MovieBoxTV && Object.keys(MovieBoxTV.state.saved).length>0')
            assert page.evaluate('Object.keys(MovieBoxTV.state.saved).sort()')==saved_ids
            checks['damaged_primary_library_recovers_my_list_from_backup']=True
            page.locator('[data-nav=movies]').click()
            page.wait_for_function('document.querySelectorAll(".poster-card").length===12')
            assert page.locator('#catalogue-filter-fields select').count()==6
            page.wait_for_timeout(80)
            filter_boxes=page.locator('#catalogue-filter-fields select').evaluate_all('els=>els.map(e=>{var r=e.getBoundingClientRect();return {y:r.y,right:r.right,left:r.left,width:r.width};})')
            assert max(b['y'] for b in filter_boxes)-min(b['y'] for b in filter_boxes)<2
            assert all(b['right']<=page.viewport_size['width'] and b['left']>=0 for b in filter_boxes)
            page.locator('#catalogue-filters').screenshot(path=str(OUTPUT/'single-filter-row.png'))
            assert page.evaluate('MovieBoxTV.allSubjects({items:[]}).length')==0
            remote_pick('#filter-genre','Action')
            remote_pick('#filter-country','India')
            remote_pick('#filter-year','2024')
            page.locator('#filter-sort').select_option('Rating')
            page.locator('#filter-minRating').select_option('8')
            assert page.evaluate('__catalogueCalls.length')==1
            page.locator('#apply-filters').click()
            page.wait_for_function('__catalogueCalls.length===2 && document.getElementById("catalogue-status").textContent.includes("12 titles")')
            request=page.evaluate('__catalogueCalls[1]')
            assert request['kind']=='movies' and request['filters']['genre']=='Action' and request['filters']['country']=='India' and request['filters']['year']=='2024' and request['filters']['minRating']=='8'
            assert page.locator('.poster-title').first.inner_text().startswith('Action')
            checks['movie_filters_apply_together_through_remote_without_changing_my_list']=True
            page.locator('#more-button').click()
            page.wait_for_function('document.querySelectorAll(".poster-card").length===24')
            assert page.evaluate('__catalogueCalls[2].page')==2
            checks['catalogue_requests_real_next_page']=True
            page.locator('[data-nav=tv]').click()
            page.wait_for_function('__catalogueCalls.at(-1).kind==="tv" && document.querySelectorAll(".poster-card").length===12')
            assert page.locator('#catalog-title').inner_text()=='TV Shows'
            assert page.locator('#filter-genre').input_value()=='All'
            page.locator('[data-nav=movies]').click()
            page.wait_for_function('document.getElementById("filter-genre").value==="Action"')
            assert page.locator('#filter-country').input_value()=='India'
            page.locator('#reset-filters').click()
            page.wait_for_function('document.getElementById("filter-genre").value==="All" && document.getElementById("catalogue-status").textContent.includes("12 titles")')
            assert page.evaluate('Object.keys(MovieBoxTV.state.saved).sort()')==saved_ids
            checks['movies_tv_separate_choices_and_reset_keep_saved_titles']=True
            page.locator('#filter-country').focus()
            page.keyboard.press('Enter')
            for _ in range(22): page.keyboard.press('ArrowDown')
            assert page.evaluate('(function(){var a=document.activeElement.getBoundingClientRect(),b=document.querySelector(".remote-picker-options").getBoundingClientRect();return a.top>=b.top-1&&a.bottom<=b.bottom+1;})()')
            page.keyboard.press('Escape')
            checks['long_remote_picker_keeps_focused_option_visible']=True
            # A large home feed is rendered in bounded batches, not 180 poster nodes.
            perf=browser.new_page(viewport={'width':1920,'height':1080})
            large_stub=STUB+"\nMovieBoxAPI.prototype.home=function(){return Promise.resolve({items:Array.from({length:180},function(_,i){return Object.assign({},movie,{subjectId:'perf'+i,title:'Performance title '+i,cover:{url:poster,thumbnail:poster+'#thumbnail'}});})});};"
            perf.route('**/js/api.js',lambda route: route.fulfill(status=200,content_type='text/javascript',body=large_stub))
            perf.route('**/$WEBAPIS/**',lambda route: route.fulfill(status=200,content_type='text/javascript',body=''))
            perf.goto('http://127.0.0.1:%d/' % server.server_port)
            perf.wait_for_function("document.querySelectorAll('.poster-card').length===12")
            perf.locator('.poster-card img[src]').first.wait_for()
            assert perf.locator('.poster-card img').first.get_attribute('src').endswith('#thumbnail')
            perf.locator('#more-button').focus()
            perf.keyboard.press('Enter')
            assert perf.locator('.poster-card').count()==24
            checks['catalog_uses_12_item_batches_and_available_thumbnails']=True
            perf.locator('.poster-card').first.focus()
            metrics=perf.evaluate("var n=MovieBoxTV.navigation;n.invalidate();var times=[];for(var i=0;i<50;i++){var start=performance.now();n.move(i%2?'ArrowLeft':'ArrowRight');times.push(performance.now()-start);}times.sort(function(a,b){return a-b;});({metrics:n.metrics,p95:times[47],max:times[49]})")
            assert metrics['metrics']['cacheHits']>=50
            assert metrics['metrics']['layoutBuilds']<12
            checks['navigation_reuses_cached_focus_bounds']=True
            for _ in range(3): perf.locator('#more-button').click()
            perf.evaluate('MovieBoxTV.navigation.focus(document.querySelector(".poster-card:last-child"));')
            assert perf.evaluate('document.getElementById("main-content").scrollTop')>0
            for _ in range(100): perf.keyboard.press('ArrowUp')
            assert perf.evaluate('document.getElementById("main-content").scrollTop')==0
            assert perf.evaluate('document.activeElement.closest("#main-content")!==null||document.activeElement.dataset.nav==="home"')
            checks['remote_up_returns_all_the_way_to_page_top']=True
            perf.locator('.poster-card').first.focus()
            perf.wait_for_timeout(200)
            assert perf.evaluate('new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".poster-card")).transform).a')>1
            checks['focused_poster_enlarges_with_short_composited_transition']=True
            result['desktop_browser_navigation_p95_ms']=round(metrics['p95'],3)
            result['desktop_browser_navigation_max_ms']=round(metrics['max'],3)
            result['navigation_metrics']=metrics['metrics']
            perf.close()
            # A metadata-declared 6750px cover must be resized before any request.
            art=browser.new_page(viewport={'width':1920,'height':1080})
            artwork_requests=[]
            art.route('**/js/api.js',lambda route: route.fulfill(status=200,content_type='text/javascript',body=STUB+"\nmovie.cover={url:'https://pbcdnw.aoneroom.com/image/huge.jpg?existing=kept#cover',width:6750,height:6750};"))
            art.route('**/$WEBAPIS/**',lambda route: route.fulfill(status=200,content_type='text/javascript',body=''))
            def small_artwork(route):
                artwork_requests.append(route.request.url)
                route.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#194d40"/></svg>')
            art.route('https://pbcdnw.aoneroom.com/**',small_artwork)
            art.goto('http://127.0.0.1:%d/' % server.server_port)
            art.locator('.poster-card img[src]').first.wait_for()
            art.wait_for_timeout(100)
            assert artwork_requests
            assert all('x-oss-process=' in url for url in artwork_requests)
            assert all('existing=kept' in url for url in artwork_requests)
            checks['oversized_artwork_is_resized_before_request_or_decode']=True
            art.close()
            native_art=browser.new_page(viewport={'width':1920,'height':1080})
            native_art.route('**/js/api.js',lambda route: route.fulfill(status=200,content_type='text/javascript',body=STUB+"\nmovie.cover={url:'https://pbcdnw.aoneroom.com/image/native.jpg',thumbnail:'e76tt7xa0LIpt6IUWCtRoekCNdR+xYxZayR+j@s.j[juRjjZofWXt6',width:6750,height:6750};series.cover=movie.cover;"))
            native_art.route('**/$WEBAPIS/**',lambda route: route.fulfill(status=200,content_type='text/javascript',body=''))
            native_art.route('https://pbcdnw.aoneroom.com/**',lambda route: route.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#194d40"/></svg>'))
            native_art.goto('http://127.0.0.1:%d/' % server.server_port)
            native_art.locator('.poster-card').first.click()
            native_art.wait_for_function('document.getElementById("detail-poster").naturalWidth>0 && !document.getElementById("save-button").disabled')
            assert 'x-oss-process=' in native_art.locator('#detail-poster').get_attribute('src')
            checks['native_blurhash_detail_uses_real_cover_url']=True
            native_art.locator('#save-button').click()
            native_art.locator('[data-nav=saved]').click()
            native_art.wait_for_function('document.querySelector(".poster-card img")?.naturalWidth>0')
            checks['native_blurhash_my_list_retains_and_renders_cover']=True
            native_art.locator('[data-nav=search]').click()
            native_art.locator('#search-input').fill('Movie')
            native_art.locator('#search-go').click()
            native_art.wait_for_function('document.querySelector(".poster-card img")?.naturalWidth>0')
            assert native_art.evaluate('MovieBoxArtwork.metrics.ignoredPlaceholders')>0
            checks['native_blurhash_search_results_render_cover']=True
            native_art.screenshot(path=str(OUTPUT/'native-search-artwork.png'))
            native_art.close()
            assert not errors, errors
            checks['no_javascript_exceptions']=True
            result['passed']=True
            browser.close()
    except Exception as error:
        result['passed']=False
        result['error']=repr(error)
        raise
    finally:
        (OUTPUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        server.shutdown()
        print(json.dumps(result,indent=2),flush=True)

if __name__=='__main__':
    run()
