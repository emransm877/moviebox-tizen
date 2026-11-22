"""Content-fit remote menus and episode drawer; fixture API/AVPlay, no TV claims."""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler

CASES = {
    'season-single': ['Season 1'],
    'season-eight': ['Season '+str(number) for number in range(1, 9)],
    'episode': ['Episode '+str(number) for number in range(1, 17)],
    'quality': ['Auto', '480p', '720p', '1080p · account required'],
    'subtitle': ['Off', 'English', 'বাংলা', 'Português (Brasil)'],
    'audio': ['Original audio', 'Español (Latinoamérica)', 'Audio edition with a very long descriptive language name '+('unbroken'*18)],
    'filter-genre': ['All', 'Adventure', 'Crime & Thriller'],
    'filter-country': ['All', 'United Arab Emirates', 'United States of America'],
    'filter-year': ['All', '2026', '2025'],
    'filter-language': ['All', 'English', 'Bahasa Indonesia'],
    'filter-sort': ['For you', 'Latest', 'Most popular'],
    'filter-rating': ['Any rating', '6+', '9+'],
}


def run(out):
    out.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT/'app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks = {}
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
                    for name, options in CASES.items():
                        page.evaluate('''options=>{
                          document.getElementById('owned-options')?.remove();
                          const select=document.createElement('select');select.id='owned-options';
                          select.setAttribute('aria-label','Choose '+options.name);select.style.width='480px';
                          options.values.forEach((text,index)=>select.add(new Option(text,String(index))));
                          document.querySelector('.settings-card').appendChild(select);
                          MovieBoxTV.navigation.invalidate();select.focus();
                        }''', {'name': name, 'values': options})
                        page.keyboard.press('Enter')
                        page.locator('.remote-picker').wait_for()
                        bounds = page.evaluate('''()=>{
                          const panel=document.querySelector('.remote-picker .modal'),list=panel.querySelector('.remote-picker-options');
                          const buttons=[...list.querySelectorAll('button')],cancel=panel.querySelector(':scope>button');
                          const canvas=document.createElement('canvas').getContext('2d');
                          const extras=element=>{const s=getComputedStyle(element);return ['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'].reduce((n,k)=>n+(parseFloat(s[k])||0),0);};
                          canvas.font=getComputedStyle(buttons[0]).font;
                          const options=Math.max(...buttons.map(button=>canvas.measureText(button.textContent).width))+extras(buttons[0]);
                          canvas.font=getComputedStyle(cancel).font;
                          const desired=Math.max(options,canvas.measureText(cancel.textContent).width+extras(cancel))+extras(panel)+(list.offsetWidth-list.clientWidth);
                          const r=panel.getBoundingClientRect();
                          return {width:r.width,left:r.left,right:r.right,expected:Math.ceil(Math.min(innerWidth-40,560,desired)),
                            noOverflow:panel.scrollWidth<=panel.clientWidth+1 && buttons.every(button=>button.scrollWidth<=button.clientWidth+1),
                            accessibleHeight:buttons.every(button=>button.getBoundingClientRect().height>=48)};
                        }''')
                        assert abs(bounds['width']-bounds['expected']) <= 2, (width, theme, name, bounds)
                        assert bounds['left'] >= 19 and bounds['right'] <= width-19, bounds
                        assert bounds['noOverflow'] and bounds['accessibleHeight'], bounds
                        checks[f'{width}_{theme}_{name}'] = bounds
                        if name in ['season-single', 'audio']:
                            page.screenshot(path=str(out/f'{width}-{theme}-{name}.png'))
                        page.locator('.remote-picker-options button').last.click()
                        assert not page.locator('.remote-picker').count()
                        assert page.evaluate('document.activeElement.id') == 'owned-options'
                        assert page.locator('#owned-options').input_value() == str(len(options)-1)
                    page.locator('#owned-options').evaluate('element=>element.remove()')
                    page.locator('[data-nav=movies]').click()
                    page.locator('.catalogue-filter-fields select').first.wait_for()
                    filter_checks = page.evaluate('''async()=>{
                      let count=0;
                      const canvas=document.createElement('canvas').getContext('2d');
                      for(const select of document.querySelectorAll('.catalogue-filter-fields select')){
                        const original=select.value;
                        for(const option of select.options){
                          select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
                          await new Promise(requestAnimationFrame);
                          const style=getComputedStyle(select);canvas.font=style.font;
                          const text=canvas.measureText(option.textContent).width,width=select.getBoundingClientRect().width;
                          if(width<text+52 || width>text+105)throw new Error('Selected filter text does not fit compactly: '+option.textContent+' '+width+'/'+text);
                          count++;
                        }
                        select.value=original;select.dispatchEvent(new Event('change',{bubbles:true}));
                      }
                      return count;
                    }''')
                    assert filter_checks > 100, filter_checks
                    checks[f'{width}_{theme}_actual_filter_values'] = {'selected_values': filter_checks}
                    page.evaluate('MovieBoxTV.openDetail(window.series)')
                    page.wait_for_function('!document.getElementById("watch-button").disabled')
                    compact = page.locator('#season-select').evaluate('''select=>{
                      select.textContent='';select.add(new Option('Season 1','1'));
                      const canvas=document.createElement('canvas').getContext('2d');canvas.font=getComputedStyle(select).font;
                      return {width:select.getBoundingClientRect().width,text:canvas.measureText('Season 1').width};
                    }''')
                    assert compact['width'] <= compact['text']+70, compact
                    # Reopen actual details to restore the real episode records.
                    page.evaluate('MovieBoxTV.openDetail(window.series)')
                    page.wait_for_function('!document.getElementById("watch-button").disabled')
                    page.locator('#watch-button').click()
                    page.wait_for_function('MovieBoxTV.player.active && nativeState==="PLAYING"')
                    page.evaluate("MovieBoxTV.player.page.classList.add('controls-hidden');MovieBoxTV.player.page.focus()")
                    page.keyboard.press('ArrowUp')
                    page.locator('#episode-drawer').wait_for()
                    drawer = page.locator('#episode-drawer').evaluate('''element=>{
                      const r=element.getBoundingClientRect(),s=getComputedStyle(element),select=element.querySelector('select');
                      return {width:r.width,right:r.right,animation:s.animationName,filter:s.filter,backdrop:s.backdropFilter,
                        selected:element.querySelector('.player-episode-list button.active .episode-row-label')?.textContent,
                        seasonWidth:select.getBoundingClientRect().width};
                    }''')
                    assert 320 <= drawer['width'] <= 430, drawer
                    assert 20 <= width-drawer['right'] <= 40 and drawer['animation'] == 'none', drawer
                    assert drawer['filter'] == 'none' and drawer['backdrop'] == 'none', drawer
                    assert drawer['selected'] == 'Episode 1' and drawer['seasonWidth'] < 180, drawer
                    page.screenshot(path=str(out/f'{width}-{theme}-drawer.png'))
                    page.keyboard.press('Escape')
                    assert not page.locator('#episode-drawer').is_visible()
                    assert page.evaluate('MovieBoxTV.player.active && nativeState==="PLAYING"')
                    page.emulate_media(reduced_motion='no-preference')
                    page.evaluate("MovieBoxTV.player.page.classList.add('controls-hidden');MovieBoxTV.player.page.focus()")
                    page.keyboard.press('ArrowUp')
                    duration = page.locator('#episode-drawer').evaluate('element=>getComputedStyle(element).animationDuration')
                    assert duration == '0.16s', duration
                    checks[f'{width}_{theme}_drawer'] = drawer
                    context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        (out/'result.json').write_text(json.dumps({'checks': checks, 'page_errors': errors, 'passed': len(checks)==140 and not errors}, indent=2), encoding='utf-8')
    assert not errors, errors
    print('PASS 120 content-fit menus, all actual filter values and 10 reduced-motion/remote episode drawers')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'verification/dropdown-fit')
    run(parser.parse_args().output)
