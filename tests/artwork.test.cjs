const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({window:{},URL});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../app/js/artwork.js'),'utf8'),context);
const banner=context.window.MovieBoxArtwork.banner;
assert.equal(banner({trailer:{cover:{url:'https://example.com/frame',width:1920,height:1080}}}),'');
assert.equal(banner({cover:{url:'https://example.com/poster',width:1920,height:1080}}),'');
assert.equal(banner({stills:{url:'https://example.com/tiny',width:854,height:480}}),'');
assert.equal(banner({subjectId:'one',stills:{url:'https://example.com/wrong',width:1920,height:1080,subjectId:'two'}}),'');
assert.equal(banner({stills:{url:'https://example.com/real',thumbnail:'https://example.com/tiny',width:1920,height:1080}}),'https://example.com/real');
const title={subjectId:'542588344010695272',title:'Murder in Galicia',releaseDate:'2026-11-13',subjectType:2};
assert.ok(banner(title).includes('.nflxso.net/'));
for(const override of [{title:'Unprotected: Murder in Galicia'},{subjectId:'wrong'},{releaseDate:'2025-11-13'},{subjectType:1}])assert.equal(banner({...title,...override}),'');
console.log('Banner identity, HD quality and thumbnail fallback checks passed.');
const index={},prepare=context.window.MovieBoxArtwork.prepare,subject={subjectId:'one',subjectType:1,title:'Actual title',releaseDate:'2026-01-01'};
const home=prepare({operatingList:[{banner:{items:[{subjectId:'one',subjectType:1,title:'Editorial label',subject:{...subject},image:{url:'https://example.com/promo',width:1920,height:1080}}]}}]},index);
assert.equal(banner(home.operatingList[0].banner.items[0].subject),'https://example.com/promo');
const later=prepare({items:[{...subject},{...subject,subjectId:'two'},{...subject,releaseDate:'2025-01-01'}]},index);
assert.equal(banner(later.items[0]),'https://example.com/promo');assert.equal(banner(later.items[1]),'');assert.equal(banner(later.items[2]),'');
console.log('Service promotional banners join only their matching subjects.');
// Actual native Dhindora search metadata observed 2026-11-22. The thumbnail
// field is a compact placeholder, not an image URL. Covers remain subject-bound.
const artwork=context.window.MovieBoxArtwork;
const observedSearch=[
  {subjectId:'5093791662850065232',title:'Dhindora',cover:{url:'https://pbcdn.aoneroom.com/image/2023/08/11/c6c48e25def461480497383d1bb79143.jpg',width:900,height:1600,thumbnail:'ebCQ_gbdR:b0S%ERR-t8W?o2U[V[oebIjYyEbIbGazbFOtj=aefijE'}},
  {subjectId:'6315621773614661832',title:'Dhindora',cover:{url:'https://pbcdn.aoneroom.com/image/2026/01/26/388fcd25d2fa5eb028039ca2770cada1.jpg',width:236,height:421,thumbnail:'eaCQ[YbdR:bJS%ERNdt8W?o2U[V[s.a~jYyEflbHaybEKQj=aefhnh'}}
];
for(const item of observedSearch){
  const before=JSON.stringify(item),selected=new URL(artwork.url(item,'cover',300));
  assert.equal(artwork.imageUrl(item.cover.thumbnail),'');
  assert.equal(selected.origin+selected.pathname,item.cover.url);
  assert.equal(selected.searchParams.get('x-oss-process'),'image/resize,w_300/format,webp');
  assert.equal(JSON.stringify(item),before,'Selecting artwork must not change subject identity or metadata');
}
assert.notEqual(artwork.url(observedSearch[0],'cover',300),artwork.url(observedSearch[1],'cover',300));
assert.equal(artwork.url({subjectId:'missing-cover',title:'No substitute',banner:observedSearch[0].cover},'cover',300),'');
console.log('Observed search covers reject placeholder strings, preserve original image paths and never invent a cover.');
// Reserve the source shape before loading. Never crop a wide cover into a
// portrait poster, or infer image dimensions from another title's banner.
assert.equal(artwork.aspectRatio(observedSearch[0],'cover'),900/1600);
assert.equal(artwork.aspectRatio(observedSearch[1]),236/421);
assert.equal(artwork.aspectRatio({cover:{width:300,height:169}}),300/169);
// Actual Movies API records: OJU EJU and Fidelity, captured 2026-11-22.
assert.equal(artwork.aspectRatio({subjectId:'8492453872672328368',cover:{width:1280,height:720}}),16/9);
assert.equal(artwork.aspectRatio({subjectId:'430175108947396672',cover:{width:600,height:800}}),3/4);
// Genuine square feed cover: Clash [Version française], captured 2026-11-22.
assert.equal(artwork.aspectRatio({subjectId:'1218401881828097232',cover:{width:986,height:986}}),1);
assert.equal(artwork.aspectRatio({cover:{width:600,height:600}}),1);
assert.equal(artwork.aspectRatio({cover:{width:'900',height:'1600'}}),900/1600);
assert.equal(artwork.aspectRatio({cover:'https://example.test/no-dimensions.jpg'}),0);
assert.equal(artwork.aspectRatio({banner:{width:1920,height:1080}}),0);
for(const dimensions of [{width:0,height:100},{width:100,height:0},{width:-1,height:100},{width:Infinity,height:100},{width:100,height:NaN},{width:true,height:100},{width:100,height:false}])assert.equal(artwork.aspectRatio({cover:dimensions}),0);
for(const item of observedSearch){const before=JSON.stringify(item);artwork.aspectRatio(item);assert.equal(JSON.stringify(item),before);}
console.log('Wide, square and tall artwork reserve their own finite source aspect without changing metadata or inventing dimensions.');
