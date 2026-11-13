/* Standalone Tizen adapter. Browser preview uses the optional loopback dev server. */
(function(root) {
  'use strict';
  const C = root.MovieBoxCrypto;
  const NATIVE = 'https://api6.aoneroom.com', PREFIX = '/wefeed-mobile-bff';
  const WEB = 'https://h5-api.aoneroom.com/wefeed-h5api-bff';
  function query(value) { return Object.keys(value).map(k => encodeURIComponent(k)+'='+encodeURIComponent(value[k])).join('&'); }
  function randomId() {
    const data = new Uint8Array(16); crypto.getRandomValues(data);
    return Array.from(data).map(v => v.toString(16).padStart(2,'0')).join('');
  }
  class MovieBoxAPI {
    constructor() {
      this.webToken = ''; this.nativeToken = ''; this.warming = null; this.captionCache = new Map(); this.resourceContext = new Map(); this.captionTimes = new Map();
      this.preview = !root.tizen && /^https?:$/.test(location.protocol);
      this.streamUserAgent = 'com.community.oneroom/50020104 (Linux; U; Android 17; en_US; TizenTV; Build/LOCAL; Cronet/135.0.7012.3) MovieBoxTV/0.1';
      this.client = {package_name:'com.community.oneroom',version_name:'4.0.03.0930.03',version_code:50020104,
        os:'android',os_version:'17',device_id:randomId(),gaid:randomId().slice(0,16),install_ch:'google-play',install_store:'gp',
        brand:'Samsung',model:'TizenTV',system_language:'en',net:'NETWORK_WIFI',region:'US',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        sp_code:'20801','X-Child-UID':'','X-Play-Mode':'2','X-Idle-Data':'1','X-Family-Mode':'0','X-Content-Mode':'0'};
    }
    async proxy(method,args) {
      const response = await fetch('/dev-api', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:method,args:args || []})});
      const result = await response.json(); if (!response.ok || result.error) throw new Error(result.error || 'Preview service unavailable'); return result.data;
    }
    request(url, body, headers, native) {
      return new Promise((resolve,reject) => {
        const xhr = new XMLHttpRequest(); xhr.open(body == null ? 'GET' : 'POST',url,true); xhr.timeout=18000;
        Object.keys(headers || {}).forEach(k => xhr.setRequestHeader(k,headers[k]));
        xhr.onload=() => {
          try {
            if (xhr.status < 200 || xhr.status >= 300) throw new Error('Service HTTP '+xhr.status);
            const user=xhr.getResponseHeader('x-user'); if (user) { const token=JSON.parse(user).token; if(native)this.nativeToken=token;else this.webToken=token; }
            const result=JSON.parse(xhr.responseText); if(result.code != null && Number(result.code)!==0)throw new Error(result.message || 'Service refused this request');
            resolve(result.data == null ? result : result.data);
          } catch(error) { reject(error); }
        };
        xhr.onerror=() => reject(new Error('Cannot reach MovieBox. Check the TV network.'));
        xhr.ontimeout=() => reject(new Error('MovieBox request timed out. Try again.'));
        xhr.send(body == null ? null : body);
      });
    }
    web(path, body) {
      const ts=String(Math.floor(Date.now()/1000));
      const headers={'Accept':'application/json','Content-Type':'application/json','X-Request-Lang':'en','X-Client-Info':JSON.stringify({timezone:this.client.timezone}),'X-Vip-Restrict':'1'};
      if(this.webToken)headers.Authorization='Bearer '+this.webToken;
      else headers['X-Client-Token']=ts+','+C.md5(ts.split('').reverse().join(''));
      return this.request(WEB+path,body==null?null:JSON.stringify(body),headers,false);
    }
    native(path,params,body) {
      const url=NATIVE+PREFIX+path+(params?'?'+query(params):'');
      const parsed=new URL(url); const sorted=Array.from(parsed.searchParams.keys()).sort().map(k=>k+'='+parsed.searchParams.get(k)).join('&');
      const canonical=parsed.pathname+(sorted?'?'+sorted:''); const ts=String(Date.now());
      const key=Array.from(atob('76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O')).map(c=>c.charCodeAt(0));
      const payload=body==null?null:JSON.stringify(body),data=payload==null?null:C.bytes(payload),method=payload==null?'GET':'POST';
      const signature=C.base64(C.hmac(key,[method,'application/json','application/json',data?String(data.length):'',ts,data?C.md5(data.slice(0,102400)):'',canonical].join('\n')));
      const headers={'Accept':'application/json','Content-Type':'application/json','X-Client-Token':ts+','+C.md5(ts.split('').reverse().join('')),
        'x-tr-signature':ts+'|2|'+signature,'X-Client-Info':JSON.stringify(this.client),'X-Client-Status':'0',
        'X-Child-UID':'','X-Play-Mode':'2','X-Idle-Data':'1','X-Family-Mode':'0','X-Content-Mode':'0'};
      if(this.nativeToken)headers.Authorization='Bearer '+this.nativeToken;
      return this.request(url,payload,headers,true);
    }
    warm() {
      if(!this.warming)this.warming=this.native('/tab-operating',{page:1,tabId:0,version:''}).catch(error=>{this.warming=null;throw error;});
      return this.warming;
    }
    async home() { if(this.preview)return this.proxy('home'); this.warm().catch(()=>{}); return this.web('/home?host=movieboxhd.net'); }
    async catalogue(kind,filters,page) {
      const body=root.MovieBoxCatalogue.body(kind,filters,page);
      if(this.preview)return this.proxy('catalogue',[kind,filters||{},body.page]);
      const result=await this.web('/subject/filter',body),pager=result.pager||{};
      return Object.assign({},result,{hasMore:pager.hasMore===true||pager.hasMore===1,nextPage:Number(pager.nextPage)||body.page+1});
    }
    async search(keyword,page) { if(this.preview)return this.proxy('search',[keyword,page||1]);await this.warm();const result=await this.native('/subject-api/search',{host:NATIVE},{keyword:keyword,page:page||1,perPage:10,subjectType:0});return Object.assign({},result,{hasMore:!!(result.pager&&result.pager.hasMore),nextPage:result.pager&&result.pager.nextPage}); }
    async suggest(keyword) { if(this.preview)return this.proxy('suggest',[keyword]);await this.warm();const result=await this.native('/subject-api/search-suggest',{keyword:keyword,perPage:10,resultMode:0});return result.items||[]; }
    async detail(subject) {
      if(this.preview)return this.proxy('detail',[subject]);
      await this.warm();
      const result={subject:await this.native('/subject-api/get',{host:NATIVE,subjectId:subject.subjectId})};result.subject=result.subject||subject;
      result.isSeries=Number(result.subject.subjectType)===2;result.resource=result.resource||{};
      if(!result.isSeries)result.resource.seasons=[];
      else { await this.warm(); const metadata=await this.native('/subject-api/season-info',{host:NATIVE,subjectId:subject.subjectId});if(metadata.seasons)result.resource.seasons=metadata.seasons; }
      return result;
    }
    async playback(subject,season,episode) {
      if(this.preview)return this.proxy('playback',[subject,season||0,episode||0]);
      await this.warm();if(Number(subject.subjectType)===1)season=episode=0;
      if(Number(subject.subjectType)===2 && !(season>0 && episode>0))throw new Error('Choose a season and episode.');
      const fetchQuality=resolution=>this.native('/subject-api/resource',{host:NATIVE,subjectId:subject.subjectId,page:1,perPage:20,all:0,startPosition:1,endPosition:1,pagerMode:season>0?2:0,resolution:resolution,se:season||0,epFrom:episode||0,epTo:episode||0});
      const first=await fetchQuality(1080), found=new Map(), locked=new Set(), allowed=new Set();
      (first.collectionResolutions||[]).forEach(r=>{if(Number(r.requireMemberType))locked.add(Number(r.resolution));else if(Number(r.resolution)<=2160)allowed.add(Number(r.resolution));});
      const collect=batch=>(batch.list||[]).forEach(item=>{
        const quality=Number(item.resolution||batch.resolution||0),duration=Number(item.duration||0),size=Number(item.size||0);
        if(season>0&&(Number(item.se)!==Number(season)||Number(item.ep)!==Number(episode)))return;
        if(!item.resourceLink||item.requireMemberType&&Number(item.requireMemberType)||item.vipLocked||!quality||quality>2160||locked.has(quality))return;
        if(duration>0 && size>0 && size<3145728)return;
        const stream={url:item.resourceLink,resolutions:quality,duration:duration,size:size,id:String(item.resourceId||''),
          headers:{'User-Agent':this.streamUserAgent},season:Number(item.se||0),episode:Number(item.ep||0)};
        if(!found.has(quality)||size>found.get(quality).size)found.set(quality,stream);
        this.captionCache.set(subject.subjectId+':'+stream.id,item.extCaptions||[]);
        this.captionTimes.set(subject.subjectId+':'+stream.id,Date.now());
        this.resourceContext.set(subject.subjectId+':'+stream.id,{season:stream.season,episode:stream.episode,
          encodedEpisode:Number(item.episode || item.ep || 0),duration:duration});
      });
      collect(first);
      await Promise.all(Array.from(allowed).filter(r=>r>0&&r!==1080&&!found.has(r)).map(r=>fetchQuality(r).then(collect).catch(()=>{})));
      const streams=Array.from(found.values()).sort((a,b)=>b.resolutions-a.resolutions);
      if(!streams.length)throw new Error('No playable unlocked stream is available.');return streams;
    }
    async captions(subject,id,options) {
      if(this.preview)return this.proxy('captions',[subject,id]);const cached=this.captionCache.get(subject.subjectId+':'+id);
      options=options||{};
      if(!options.refresh&&cached&&cached.length&&Date.now()-(this.captionTimes.get(subject.subjectId+':'+id)||0)<240000)return {captions:cached};
      const context=this.resourceContext.get(subject.subjectId+':'+id)||{};
      const endpoints=[['/subject-api/get-ext-captions',{resourceId:id,episode:context.encodedEpisode||context.episode||0}],
        ['/subject-api/get-stream-captions',{streamId:id}]];
      let failure=null, succeeded=false;
      for(const [path,params] of endpoints){
        try {
          const result=await this.native(path,Object.assign({host:NATIVE,subjectId:subject.subjectId},params));succeeded=true;
          const captions=Array.isArray(result)?result:result.captions||result.extCaptions||result.list||result.items||[];
          if(captions.length){this.captionCache.set(subject.subjectId+':'+id,captions);this.captionTimes.set(subject.subjectId+':'+id,Date.now());return {captions:captions};}
        }catch(error){failure=error;}
      }
      if(options.variantFallback!==false&&context.duration>0){
        const prefix=subject.subjectId+':';
        const peers=Array.from(this.resourceContext.entries()).filter(([key,peer])=>key.indexOf(prefix)===0&&key!==prefix+id&&peer.season===context.season&&peer.episode===context.episode&&Math.abs(peer.duration-context.duration)<=2).slice(0,3);
        for(const [key] of peers){
          try{const result=await this.captions(subject,key.slice(prefix.length),{refresh:options.refresh,variantFallback:false});if(result.captions.length)return result;}catch(error){failure=error;}
        }
      }
      if(failure&&!succeeded)throw failure;
      return {captions:[]};
    }
    async text(url,headers) {
      if(this.preview)return this.proxy('text',[url,headers||{}]);
      const response=await fetch(url);if(!response.ok)throw new Error('Subtitle download failed');return response.text();
    }
  }
  root.MovieBoxAPI=MovieBoxAPI;
})(typeof globalThis!=='undefined'?globalThis:window);
