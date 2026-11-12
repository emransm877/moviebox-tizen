/* Opt-in live service check. Does not emulate TV CORS, AVPlay or the remote. */
const fs=require('node:fs'),path=require('node:path');
global.location={protocol:'file:'};global.tizen={};
class XHR {
  constructor(){this.headers={'User-Agent':'Mozilla/5.0 (SMART-TV; Linux; Tizen 9.0) AppleWebKit/537.36 Chrome/120.0 TV Safari/537.36'};this.timeout=18000;}
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(key,value){this.headers[key]=value;}
  getResponseHeader(name){return this.response.headers.get(name);}
  async send(body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeout);
    try{this.response=await fetch(this.url,{method:this.method,headers:this.headers,body:body||undefined,signal:controller.signal});this.status=this.response.status;this.responseText=await this.response.text();clearTimeout(timer);if(this.status>=400)console.error('Endpoint:',new URL(this.url).host+new URL(this.url).pathname);this.onload();}
    catch(error){clearTimeout(timer);if(error.name==='AbortError')this.ontimeout();else this.onerror();}
  }
}
global.XMLHttpRequest=XHR;
require('../app/js/crypto.js');require('../app/js/api.js');
(async()=>{
 const api=new MovieBoxAPI(),out={};
 const home=await api.home();out.catalog_sections=(home.operatingList||[]).length;
 const suggestions=await api.suggest('Game of Thrones');out.suggestions=suggestions.length;
 const search=await api.search('Game of Thrones',1);out.search_results=(search.items||[]).length;
 const subject={subjectId:'2036860087691609120',subjectType:2};
 const detail=await api.detail(subject);out.seasons=(detail.resource.seasons||[]).length;
 const streams=await api.playback(subject,8,6);out.qualities=streams.map(s=>s.resolutions);
 const captions=await api.captions(subject,streams.find(s=>s.resolutions===1080).id);
 out.languages=captions.captions.map(c=>c.lan);
 const english=captions.captions.find(c=>c.lan==='en');if(!english)throw new Error('Missing exact GOT English captions');
 const text=await api.text(english.url,english.headers);out.english_cues=(text.match(/-->/g)||[]).length;
 if(out.english_cues<400)throw new Error('Unexpected subtitle payload');
 console.log(JSON.stringify({passed:true,checks:out},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
