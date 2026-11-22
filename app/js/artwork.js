/* Image resize syntax is used by MovieBox's shipped web client and verified on its CDN. */
(function (global) {
  'use strict';
  var metrics = {resized:0,blockedOversized:0,ignoredPlaceholders:0};
  function imageUrl(value) { if (typeof value !== 'string') return ''; value = value.trim(); if (/^data:image\//i.test(value)) return value; if (/^\/\//.test(value)) value = 'https:' + value; try { var parsed = new URL(value); return /^https?:$/.test(parsed.protocol) ? parsed.href : ''; } catch (_) { return ''; } }
  function aspectRatio(subject, kind) {
    var record = subject && subject[kind || 'cover'];
    if (!record || typeof record !== 'object' || typeof record.width === 'boolean' || typeof record.height === 'boolean') return 0;
    var width = Number(record.width), height = Number(record.height), ratio = width / height;
    return width > 0 && height > 0 && isFinite(width) && isFinite(height) && ratio > 0 && isFinite(ratio) ? ratio : 0;
  }
  function url(subject, kind, width) {
    var value = subject && subject[kind || 'cover'];
    if (!value) return '';
    var record = typeof value === 'string' ? {url:value} : value;
    var thumbnail = imageUrl(typeof record.thumbnail === 'object' && record.thumbnail ? record.thumbnail.url : record.thumbnail);
    if (record.thumbnail && !thumbnail) metrics.ignoredPlaceholders++;
    var original = thumbnail || imageUrl(record.url);
    if (!original) return '';
    try {
      var parsed = new URL(original);
      if (parsed.protocol === 'https:' && /(^|\.)aoneroom\.com$/i.test(parsed.hostname) && parsed.pathname.indexOf('/image/') === 0) {
        parsed.searchParams.set('x-oss-process','image/resize,w_' + Math.max(120,Math.min(1280,Math.round(width || 300))) + '/format,webp');
        metrics.resized++;
        return parsed.href;
      }
    } catch (_) { /* Non-URL fixture artwork and other service hosts remain unchanged. */ }
    // Unknown CDNs cannot be assumed to support resizing. Avoid decoding huge originals.
    if (!thumbnail && Number(record.width) * Number(record.height) > 8000000) { metrics.blockedOversized++; return ''; }
    return original;
  }
  var verifiedBanners = [{"titles": ["Murder in Galicia", "Murder in Galicia [Hindi]"], "subjectIds": ["1662924910995431272", "542588344010695272"], "year": "2026", "subjectType": 2, "width": 1280, "height": 720, "source": "https://www.netflix.com/title/82023389", "url": "https://occ-0-8831-2164.1.nflxso.net/dnm/api/v6/6AYY37jfdO6hpXcMjf9Yu5cnmO0/AAAABUHyuVP5cZ1zSvrBVJAiXO0RZbTaph-Blc_Ff0OulodAIvmIqIlzCg7U9LVUB7FDSi2Yt91ZIDuSnufPZJaYXP4a_xChecwIR-tP.jpg?r=4f5"}];
  function banner(subject,width) {
    subject=subject||{};
    for(var n=0;n<verifiedBanners.length;n++) {
      var verified=verifiedBanners[n];
      if(verified.subjectIds.indexOf(String(subject.subjectId))>=0 && verified.titles.indexOf(subject.title)>=0 && String(subject.releaseDate||'').slice(0,4)===verified.year && Number(subject.subjectType)===verified.subjectType) return verified.url;
    }
    var candidates=[['stills',subject.stills],['banner',subject.banner],['backdrop',subject.backdrop]];
    for(var i=0;i<candidates.length;i++) {
      var records=Array.isArray(candidates[i][1])?candidates[i][1]:[candidates[i][1]];
      for(var j=0;j<records.length;j++) {
        var record=records[j];if(!record||typeof record!=='object'||!record.url)continue;
        var w=Number(record.width)||0,h=Number(record.height)||0;
        if(w<1280||h<600||w/h<1.45||w/h>3.2)continue;
        if(record.subjectId!=null && String(record.subjectId)!==String(subject.subjectId))continue;
        // Use the original HD source, never a small thumbnail field.
        return url({stills:{url:record.url,width:w,height:h}},'stills',width||1280);
      }
    }
    return '';
  }
  function prepare(data,index) {
    ((data&&data.operatingList)||[]).forEach(function(section){
      (((section.banner||{}).items)||[]).forEach(function(item){
        var subject=item.subject||{},id=String(item.subjectId||'');
        if(!id||id!==String(subject.subjectId)||item.subjectType!==subject.subjectType||!subject.title||!subject.releaseDate)return;
        var image=Object.assign({},item.image,{subjectId:id});
        if(banner({subjectId:id,banner:image}))index[id]={title:subject.title,releaseDate:subject.releaseDate,subjectType:subject.subjectType,image:image};
      });
    });
    var keys=Object.keys(index);while(keys.length>512)delete index[keys.shift()];
    function attach(node) {
      if(Array.isArray(node)){node.forEach(attach);return;}
      if(!node||typeof node!=='object')return;
      var match=index[String(node.subjectId)];
      if(match&&node.title===match.title&&node.releaseDate===match.releaseDate&&node.subjectType===match.subjectType)node.banner=Object.assign({},match.image);
      Object.keys(node).forEach(function(key){attach(node[key]);});
    }
    attach(data);return data;
  }
  global.MovieBoxArtwork = {url:url,banner:banner,prepare:prepare,metrics:metrics,imageUrl:imageUrl,aspectRatio:aspectRatio};
})(window);
