(function(global){
  'use strict';
  var STORAGE='moviebox-tv-catalogue-cache',TTL=300000;
  function compact(subject){var out={};['subjectId','subjectType','title','releaseDate','imdbRatingValue','genre','countryName','hasResource','corner'].forEach(function(k){if(subject[k]!==undefined)out[k]=subject[k];});if(subject.cover&&typeof subject.cover==='object'){out.cover={};['url','width','height','thumbnail'].forEach(function(k){if(subject.cover[k]!==undefined)out.cover[k]=subject.cover[k];});}return out;}
  function Cache(){this.entries={};this.timer=null;try{var text=localStorage.getItem(STORAGE);if(text&&text.length<1200000){var data=JSON.parse(text);if(data.version===1&&data.entries&&typeof data.entries==='object')this.entries=data.entries;}}catch(_){} }
  Cache.prototype.key=function(kind,filters){var out={};Object.keys(filters).sort().forEach(function(k){if(['All','ForYou','',null,undefined].indexOf(filters[k])<0)out[k]=filters[k];});return kind+':'+JSON.stringify(out);};
  Cache.prototype.get=function(key){var value=this.entries[key];if(!value||!Array.isArray(value.items)||!Number.isFinite(value.at)||Date.now()-value.at>7*86400000||!value.items.every(function(s){return s&&s.subjectId&&s.title;}))return null;return JSON.parse(JSON.stringify(value));};
  Cache.prototype.put=function(key,entry){delete this.entries[key];this.entries[key]=Object.assign({},entry,{items:entry.items.slice(0,120).map(compact)});var keys=Object.keys(this.entries);while(keys.length>5)delete this.entries[keys.shift()];var self=this;if(!this.timer)this.timer=setTimeout(function(){self.timer=null;if(global.requestIdleCallback)requestIdleCallback(function(){self.flush();},{timeout:1000});else self.flush();},200);};
  Cache.prototype.flush=function(){try{localStorage.setItem(STORAGE,JSON.stringify({version:1,entries:this.entries}));}catch(_){} };
  Cache.prototype.ttl=TTL;Cache.compact=compact;global.MovieBoxCatalogueCache=Cache;
})(window);
