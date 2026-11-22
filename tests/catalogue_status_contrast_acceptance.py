"""Actual catalogue status must remain readable in all five theme palettes."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
import threading
from playwright.sync_api import sync_playwright
from ui_acceptance import ROOT, STUB, QuietHandler


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT/'app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = {}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='msedge', headless=True)
            for theme in ['obsidian', 'orbital', 'prism', 'aurora', 'eclipse']:
                context = browser.new_context(viewport={'width':1280, 'height':720})
                context.route('**/*', lambda route: route.abort())
                context.route(f'http://127.0.0.1:{server.server_port}/**', lambda route: route.continue_())
                context.route('**/js/api.js', lambda route: route.fulfill(content_type='text/javascript', body=STUB))
                context.route('**/$WEBAPIS/**', lambda route: route.fulfill(content_type='text/javascript', body=''))
                context.add_init_script('localStorage.setItem("moviebox-tv-library",JSON.stringify({settings:{theme:'+json.dumps(theme)+'},history:{},saved:{}}));')
                page = context.new_page()
                page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.locator('.poster-card').first.wait_for()
                page.locator('[data-nav=movies]').click()
                status = page.locator('#catalogue-status')
                status.wait_for(state='visible')
                page.wait_for_function('document.getElementById("catalogue-status").textContent.includes("loaded")')
                result = status.evaluate('''element=>{
                  function rgb(value){return value.match(/[\\d.]+/g).map(Number);}
                  function luminance(color){return color.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
                  var node=element,background;
                  while(node){background=rgb(getComputedStyle(node).backgroundColor);if(background.length===3||background[3]===1)break;node=node.parentElement;}
                  if(!node)throw Error('No opaque background for contrast measurement');
                  var color=rgb(getComputedStyle(element).color),a=luminance(color),b=luminance(background);
                  return {text:element.textContent,color:color,background:background,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
                }''')
                assert result['contrast'] >= 4.5, (theme, result)
                results[theme] = result
                context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(json.dumps({'passed':True,'themes':results}, indent=2))


if __name__ == '__main__':
    run()
