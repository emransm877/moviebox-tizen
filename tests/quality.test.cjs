/* Resource availability regressions based on redacted 2026-11-22 metadata. */
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
function client(handler){
  const context=vm.createContext({crypto:crypto.webcrypto,Uint8Array,Map,Set,Date,URL,Intl,location:{protocol:'file:'},tizen:{}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/js/api.js'),'utf8'),context);
  const api=new context.MovieBoxAPI();api.warm=async()=>{};api.native=handler;return api;
}
const copy=value=>JSON.parse(JSON.stringify(value));
function row(resolution,extra={}){return {resourceId:'owned-'+resolution,resourceLink:'https://example.invalid/owned-'+resolution+'.mp4',resolution,requireMemberType:0,se:2,ep:1,episode:201,duration:2075,size:resolution===1080?'398882014':'88349558',...extra};}

test('Dhindora metadata exposes actual 1080p and 480p, without inventing 720p',async()=>{
  const requests=[],collection=[{resolution:360,requireMemberType:0},{resolution:480,requireMemberType:0},{resolution:1080,requireMemberType:0}];
  const api=client(async(route,params)=>{assert.equal(route,'/subject-api/resource');requests.push(params.resolution);const quality=params.resolution===1080?1080:480;return {resolution:quality,collectionResolutions:copy(collection),list:[row(quality)]};});
  const subject={subjectId:'5093791662850065232',subjectType:2,title:'Dhindora'};
  const streams=await api.playback(subject,2,1);
  assert.deepEqual(Array.from(streams,s=>s.resolutions),[1080,480]);
  assert.equal(requests.includes(720),false,'Do not manufacture an unadvertised quality');
  const fallback=await api.native('/subject-api/resource',{resolution:720});
  assert.equal(fallback.resolution,480);assert.equal(fallback.list[0].resolution,480);
  assert.equal(subject.subjectId,'5093791662850065232');assert.equal(subject.title,'Dhindora');
});

test('a requested 720p returning actual 480p is never relabelled 720p',async()=>{
  const api=client(async(route,params)=>({resolution:params.resolution===1080?1080:480,collectionResolutions:[{resolution:1080,requireMemberType:0},{resolution:720,requireMemberType:0}],list:[row(params.resolution===1080?1080:480)]}));
  const streams=await api.playback({subjectId:'owned-fallback',subjectType:2},2,1);
  assert.deepEqual(Array.from(streams,s=>s.resolutions),[1080,480]);
});

test('Fidelity first 1080p request returning an actual 720p movie exposes 720p',async()=>{
  const requests=[];
  const api=client(async(route,params)=>{requests.push(copy(params));return {resolution:0,collectionResolutions:[],list:[row(720,{se:0,ep:0,episode:0,duration:3638,size:'105896654',codecName:'h264'})]};});
  const streams=await api.playback({subjectId:'430175108947396672',subjectType:1,title:'Fidelity'},8,65);
  assert.deepEqual(Array.from(streams,s=>s.resolutions),[720]);
  assert.equal(requests.length,1);assert.equal(requests[0].resolution,1080);assert.equal(requests[0].se,0);assert.equal(requests[0].epFrom,0);
});

test('membership-locked 720p remains locked even if another row omits its lock',async()=>{
  const requests=[];
  const api=client(async(route,params)=>{requests.push(params.resolution);return {resolution:1080,collectionResolutions:[{resolution:1080,requireMemberType:0},{resolution:720,requireMemberType:1}],list:[row(1080),row(720),row(720,{resourceId:'also-locked',requireMemberType:1})]};});
  const streams=await api.playback({subjectId:'owned-locked',subjectType:2},2,1);
  assert.deepEqual(Array.from(streams,s=>s.resolutions),[1080]);assert.deepEqual(requests,[1080]);
});

test('same-title subject IDs keep separate quality and multilingual caption metadata',async()=>{
  const captionsA=[{lan:'bn',lanName:'বাংলা · 日本語',url:'https://example.invalid/a.srt',text:'Literal \u00c2\u00b7 cue'}];
  const captionsB=[{lan:'fr',lanName:'Français – São · Ângela',url:'https://example.invalid/b.srt'}];
  const first={subjectId:'5093791662850065232',subjectType:2,title:'Dhindora'},second={subjectId:'6315621773614661832',subjectType:2,title:'Dhindora'};
  const api=client(async(route,params)=>({resolution:0,collectionResolutions:[],list:[row(params.subjectId===first.subjectId?1080:720,{resourceId:'shared-resource-id',extCaptions:copy(params.subjectId===first.subjectId?captionsA:captionsB)})]}));
  const before=JSON.stringify([first,second]);
  assert.deepEqual(Array.from(await api.playback(first,2,1),s=>s.resolutions),[1080]);
  assert.deepEqual(Array.from(await api.playback(second,2,1),s=>s.resolutions),[720]);
  assert.deepEqual(copy((await api.captions(first,'shared-resource-id')).captions),captionsA);
  assert.deepEqual(copy((await api.captions(second,'shared-resource-id')).captions),captionsB);
  assert.equal(JSON.stringify([first,second]),before);
});
