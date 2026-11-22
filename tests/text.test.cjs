/* Encoding contracts: source must be UTF-8; parsed service/cache values stay lossless. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const APP=path.join(__dirname,'../app');
// Specific reversible double-decoding signatures; isolated legitimate Latin letters are allowed.
const suspicious=/\u00c2[\u0080-\u00bf]|\u00c3[\u0080-\u00bf]|\u00e2[\u0080-\u009f\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]{2}|\u00f0\u0178|\u00ef\u00bf\u00bd|\ufffd/u;
const damagedDot=String.fromCodePoint(0xc2,0xb7),damagedAccent=String.fromCodePoint(0xc3,0xa9);
const text='Caf\u00e9 \u2014 \u00c2ngela, S\u00e3o, Fran\u00e7ois; \u00c2 / \u00c3; \u09ac\u09be\u0982\u09b2\u09be \u0939\u093f\u0928\u094d\u0926\u0940 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u4e2d\u6587 \ud83c\udfac';
function environment(){
  const storage=new Map();
  const context=vm.createContext({TextEncoder,TextDecoder,Uint8Array,crypto:crypto.webcrypto,URL,URLSearchParams,Map,Set,Intl,
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),location:{protocol:'file:'},tizen:{},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>1,clearTimeout:()=>{},navigator:{},document:{}});
  context.window=context;
  for(const name of ['crypto.js','catalogue.js','api.js','artwork.js','catalogue-cache.js','player.js'])
    vm.runInContext(fs.readFileSync(path.join(APP,'js',name),'utf8'),context);
  return {context,storage};
}
function snapshot(value){return JSON.parse(JSON.stringify(value));}

test('all shipped UI source is strict UTF-8 without known double-decoded punctuation/accent signatures',()=>{
  function scan(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);if(entry.isDirectory())scan(file);
    else if(/\.(?:js|css|html|json|xml)$/i.test(entry.name)){
      const source=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(file));
      assert.equal(suspicious.test(source),false,path.relative(APP,file)+' contains suspicious encoded text');
    }
  }}
  scan(APP);
  assert.throws(()=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(0xe9)),TypeError);
  assert.equal(suspicious.test('Caf'+damagedAccent),true);
  assert.equal(suspicious.test('Season '+damagedDot+' 1'),true);
  for(const marker of [String.fromCodePoint(0xe2,0x20ac,0x2122),String.fromCodePoint(0xe2,0x20ac,0x0153),String.fromCodePoint(0xe2,0x20ac,0x201c),String.fromCodePoint(0xe2,0x20ac,0x201d)])
    assert.equal(suspicious.test(marker),true,'Double-decoded apostrophes, quotes and dashes must be caught');
  assert.equal(suspicious.test(text),false,'Legitimate Latin letters and international text are not a blanket failure');
});

test('XHR JSON and preview fetch preserve parsed Unicode and opaque fields without repairing raw JSON',async()=>{
  const {context}=environment();
  const opaque='https://example.invalid/'+damagedAccent+'?signed='+damagedDot;
  const payload={items:[{subjectId:'id-'+damagedDot,title:text,description:'Quotes " \\ <details> '+text,genre:text,countryName:text,
    cover:{url:opaque},resourceLink:opaque,token:damagedAccent,headers:{Authorization:'opaque-'+damagedDot},
    dubs:[{subjectId:'audio-'+damagedAccent,lan:'opaque-'+damagedDot,lanName:text}],
    captions:[{id:damagedAccent,lan:'bn',lanName:text,url:opaque}],
    // Unknown literal data remains exact: upstream corruption is not inferred from appearance alone.
    opaqueExample:'Literal '+damagedAccent+' '+damagedDot}]};
  const serialised=JSON.stringify({data:payload});
  context.XMLHttpRequest=class {
    open(){}setRequestHeader(){}getResponseHeader(){return JSON.stringify({token:'token-'+damagedAccent});}
    send(){this.status=200;this.responseText=serialised;this.onload();}
  };
  const api=new context.MovieBoxAPI();
  assert.deepEqual(snapshot(await api.request('https://fixture.invalid',null,{},true)),payload);
  assert.equal(api.nativeToken,'token-'+damagedAccent);
  context.fetch=async()=>({ok:true,json:async()=>JSON.parse(Buffer.from(serialised,'utf8').toString('utf8'))});
  assert.deepEqual(snapshot(await api.proxy('home')),payload);
});

test('catalogue compaction and JSON storage round-trip preserve international titles, IDs and artwork URLs',()=>{
  const {context,storage}=environment();
  const subject={subjectId:'id-'+damagedAccent,subjectType:1,title:text,genre:text,countryName:text,corner:text,
    cover:{url:'https://example.invalid/'+damagedDot,width:300,height:450}};
  const cache=new context.MovieBoxCatalogueCache();
  cache.put('fixture',{items:[subject],at:Date.now(),hasMore:false});cache.flush();
  assert.deepEqual(snapshot(new context.MovieBoxCatalogueCache().get('fixture').items[0]),subject);
  assert.equal(JSON.parse(storage.get('moviebox-tv-catalogue-cache')).entries.fixture.items[0].title,text);
});

test('audio display labels and subtitle cues preserve valid mixed-script text and literal marker letters',()=>{
  const {context}=environment();
  const subtitle='1\n00:00:01,250 --> 00:00:04,500\n'+text+'\n';
  const cues=context.MovieBoxSubtitles.parse(subtitle);
  assert.equal(cues.length,1);assert.equal(cues[0].text,text+'\n');assert.equal(cues[0].start,1250);assert.equal(cues[0].end,4500);
  assert.equal(context.MovieBoxAudio.label({lanName:text}),text);
  assert.equal(context.MovieBoxSubtitles.parse('1\n00:00:00,000 --> 00:00:01,000\n'+damagedAccent+'\n')[0].text,damagedAccent+'\n',
    'Subtitle content is not subjected to speculative metadata repair');
});
