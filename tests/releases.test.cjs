/* Optional update policy and artwork regressions. No live network or dependencies. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const store=new Map(),requests=[];let response={status:200,body:{tag_name:'v0.9.0',html_url:'https://github.com/emransm877/moviebox-tizen/releases/tag/v0.9.0'}},busy=false;
class XHR {
 open(method,url,async){this.method=method;this.url=url;assert.equal(async,true);}
 setRequestHeader(name,value){assert.equal(name,'Accept');assert.equal(value,'application/vnd.github+json');}
 send(){requests.push(this.url);const current=response;setTimeout(()=>{this.status=current.status;this.responseText=JSON.stringify(current.body);this.onload();},0);}
}
const context=vm.createContext({URL,XMLHttpRequest:XHR,localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},setTimeout,clearTimeout,console});
context.window=context;
for(const name of ['releases.js','artwork.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/js',name),'utf8'),context);
(async()=>{
 const R=context.MovieBoxReleaseVersion;
 assert.equal(R.current,'0.8.4');assert(R.newer('v0.9.0','0.8.4'));assert(!R.newer('v0.8.4','0.8.4'));assert(!R.newer('v0.3.1-beta','0.8.4'));
 assert.equal(R.safeRelease({tag_name:'v0.9.0',html_url:'https://evil.invalid/releases/tag/v0.9.0'}),null);
 assert.equal(R.safeRelease({...response.body,prerelease:true}),null);
 const releases=new context.MovieBoxReleases({isBusy:()=>busy});
 busy=true;await releases.check(false);assert.equal(requests.length,0,'Automatic update checks wait until playback/startup is idle');
 busy=false;const available=await releases.check(false);assert.equal(available.tag,'v0.9.0');assert.equal(requests.length,1);
 await releases.check(false);assert.equal(requests.length,1,'At most one automatic check per day');
 releases.later();assert.equal(releases.pending,null);assert(releases.preferences.snoozeUntil>Date.now()+86000000);
 releases.preferences.checkedAt=0;await releases.check(false);assert.equal(releases.pending,null,'Later suppresses the reminder');
 await releases.check(true);assert(releases.pending,'Explicit manual checks can review a deferred update');
 releases.skip();releases.preferences.checkedAt=0;releases.preferences.snoozeUntil=0;await releases.check(false);assert.equal(releases.pending,null,'Skipped version stays skipped');
 response={status:200,body:{tag_name:'v0.10.0',html_url:'https://github.com/emransm877/moviebox-tizen/releases/tag/v0.10.0'}};
 releases.preferences.checkedAt=0;await releases.check(false);assert.equal(releases.pending.tag,'v0.10.0','A newer release is not skipped');
 releases.setEnabled(false);const count=requests.length;releases.preferences.checkedAt=0;await releases.check(false);assert.equal(requests.length,count,'Settings disable automatic checks');
 await releases.check(true);assert(releases.pending&&releases.manualPending,'Manual checks work even with automatic checks disabled');
 response={status:404,body:{}};await releases.check(true);assert.equal(releases.status,'no-release');assert.equal(releases.pending,null);
 const artwork=context.MovieBoxArtwork;
 const source='https://pbcdnw.aoneroom.com/image/2026/huge.jpg?existing=preserved#art';
 const nativePoster=artwork.url({cover:{url:source,width:6750,height:6750,thumbnail:'e76tt7xa0LIpt6IUWCtRoekCNdR+xYxZayR+j@s.j[juRjjZofWXt6'}},'cover',300);
 assert.equal(new URL(nativePoster).hostname,'pbcdnw.aoneroom.com','Native BlurHash placeholders are not image URLs');
 assert(new URL(nativePoster).searchParams.get('x-oss-process').includes('w_300'));
 assert(artwork.metrics.ignoredPlaceholders>0);
 const poster=new URL(artwork.url({cover:{url:source,width:6750,height:6750}},'cover',300));
 assert.equal(poster.searchParams.get('x-oss-process'),'image/resize,w_300/format,webp');assert.equal(poster.searchParams.get('existing'),'preserved');assert.equal(poster.hash,'#art');
 const twice=new URL(artwork.url({cover:{url:poster.href}},'cover',360));assert.equal(twice.searchParams.getAll('x-oss-process').length,1);assert(twice.searchParams.get('x-oss-process').includes('w_360'));
 assert.equal(artwork.url({cover:{url:'https://unknown.invalid/image/huge.jpg',width:6750,height:6750}},'cover',300),'','Unknown enormous originals are not decoded');
 assert.equal(artwork.url({cover:{url:'https://aoneroom.com.evil.invalid/image/a.jpg'}},'cover',300),'https://aoneroom.com.evil.invalid/image/a.jpg','Untrusted lookalike hosts are not rewritten');
 const manifest=fs.readFileSync(path.join(__dirname,'../app/config.xml'),'utf8');assert(manifest.includes('version="'+R.current+'"'));assert(manifest.includes('https://api.github.com'));
 console.log('PASS: optional daily releases, playback/opt-out/defer/skip policy, safe release origin, stable versions, verified CDN artwork resizing, oversized-image gate and matching manifest.');
})().catch(error=>{console.error(error);process.exitCode=1;});
