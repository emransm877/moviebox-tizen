/* Offline protocol and access-control regressions; Node standard library only. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({TextEncoder,Uint8Array,crypto:crypto.webcrypto,URL,URLSearchParams,Map,Set,
  atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),location:{protocol:'file:'},Intl,tizen:{}});
for(const name of ['crypto.js','api.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/js',name),'utf8'),context);
for(const text of ['', 'abc', 'MovieBox 🎬', 'a'.repeat(1000)])assert.equal(context.MovieBoxCrypto.md5(text),crypto.createHash('md5').update(text).digest('hex'));
for(const key of [Buffer.from('key'),Buffer.alloc(90,7)])assert.equal(Buffer.from(context.MovieBoxCrypto.hmac(key,'test payload')).toString('hex'),crypto.createHmac('md5',key).update('test payload').digest('hex'));
(async()=>{
 const api=new context.MovieBoxAPI();let captured;
 api.request=async(url,body,headers)=>{captured={url,body,headers};return {};};
 await api.native('/subject-api/resource',{subjectId:'123',se:1,resolution:1080});
 const u=new URL(captured.url),ts=captured.headers['x-tr-signature'].split('|')[0];
 const query=Array.from(u.searchParams.keys()).sort().map(k=>k+'='+u.searchParams.get(k)).join('&');
 const payload=['GET','application/json','application/json','',ts,'',u.pathname+'?'+query].join('\n');
 const key=Buffer.from('76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O','base64');
 assert.equal(captured.headers['x-tr-signature'],ts+'|2|'+crypto.createHmac('md5',key).update(payload).digest('base64'));
 api.warm=async()=>{};
 let requests=[];
 api.native=async(route,params)=>{requests.push(params);return {resolution:0,collectionResolutions:[{resolution:2160,requireMemberType:1}],list:[
  {resourceId:'sd',resourceLink:'https://example.invalid/sd',resolution:480,size:200000000,duration:7200,se:0,ep:0},
  {resourceId:'hd',resourceLink:'https://example.invalid/hd',resolution:1080,size:900000000,duration:7200,se:0,ep:0},
  {resourceId:'locked',resourceLink:'https://example.invalid/locked',resolution:2160,size:1900000000,duration:7200,se:0,ep:0,requireMemberType:1},
  {resourceId:'preview',resourceLink:'https://example.invalid/preview',resolution:720,size:2000000,duration:23,se:0,ep:0}]};};
 const streams=await api.playback({subjectId:'123',subjectType:1},8,65);
 assert.equal(JSON.stringify(streams.map(s=>s.resolutions)),JSON.stringify([1080,480]));
 assert.equal(requests[0].se,0);assert.equal(requests[0].epFrom,0);
 requests=[];api.native=async(route,params)=>{requests.push(params);return {resolution:1080,list:[{resourceId:'e65',resourceLink:'https://example.invalid/e65',resolution:1080,size:90000000,duration:2400,se:1,ep:65},{resourceId:'e1',resourceLink:'https://example.invalid/e1',resolution:1080,size:90000000,duration:2400,se:1,ep:1}]};};
 const episodes=await api.playback({subjectId:'456',subjectType:2},1,65);
 assert.equal(episodes.length,1);assert.equal(episodes[0].id,'e65');assert.equal(requests[0].pagerMode,2);assert.equal(requests[0].epFrom,65);
 console.log('PASS: MD5, HMAC, canonical request signatures, mixed movie quality, access restrictions, placeholders and episode 65.');
})().catch(error=>{console.error(error);process.exitCode=1;});
