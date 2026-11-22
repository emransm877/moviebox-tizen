(function (global) {
  'use strict';
  var edition=/\s*\[(?:Hindi|English|Tamil|Telugu|Bengali|Bangla|Kannada|Malayalam|Marathi|Punjabi|Urdu|Arabic|Spanish|French|Portuguese|Japanese|Korean|Chinese|Indonesian|Thai|Vietnamese|Turkish|Russian|German|Italian)\]\s*$/i;
  function visualKeys(item){var value=item.cover,record=typeof value==='string'?{url:value}:value||{},source=record.url||'',cover='',year=(String(item.releaseDate||'').match(/^\d{4}(?:$|-)/)||[''])[0].slice(0,4),title=String(item.title||'').replace(edition,'').trim().replace(/\s+/g,' ').toLocaleLowerCase();try{var parsed=new URL(source);if(/^https?:$/.test(parsed.protocol))cover=parsed.hostname.toLowerCase()+parsed.pathname;}catch(_){}return {cover:cover,title:year?title+'|'+year+'|'+Number(item.subjectType):''};}
  function unique(items){var ids={},covers={},titles={},result=[];(items||[]).forEach(function(item){if(!item)return;var id=String(item.subjectId||''),keys=visualKeys(item);if(!id||!item.title||![1,2].includes(Number(item.subjectType))||ids[id]||(keys.cover&&covers[keys.cover])||(keys.title&&titles[keys.title]))return;ids[id]=true;if(keys.cover)covers[keys.cover]=true;if(keys.title)titles[keys.title]=true;result.push(item);});return result;}
  function Carousel(options) {
    this.options=options; this.items=[]; this.index=0; this.paused=false; this.loaded=false; this.loading=false;
    this.timer=null;this.idleUntil=0;
  }
  Carousel.prototype.current=function () { return this.items[this.index] || null; };
  Carousel.prototype.set=function (items) {
    this.retained=(items||[]).slice();var previous=this.current(),clean=unique(items),seen={};clean.forEach(function(item){seen[String(item.subjectId)]=true;});
    if (!clean.length) return;
    if (previous && this.options.interacting() && !seen[String(previous.subjectId)]) clean=unique([previous].concat(clean));
    this.items=clean.slice(0,100); this.index=previous ? this.items.findIndex(function (item) { return String(item.subjectId)===String(previous.subjectId); }) : 0;
    if (this.index<0) this.index=0;
    this.render();this.schedule(2000);
  };
  Carousel.prototype.render=function () { this.options.render(this.current(),this.index,this.items.length,this.paused); };
  Carousel.prototype.move=function (step,automatic) {
    if (!this.items.length || (automatic && !this.options.canRotate())) return;
    if(!automatic)this.interact();
    this.index=(this.index+step+this.items.length)%this.items.length; this.render();
  };
  Carousel.prototype.interact=function(){this.idleUntil=Date.now()+8000;this.schedule(8000);};
  Carousel.prototype.schedule=function(delay){clearTimeout(this.timer);var self=this;if(this.paused||document.hidden||global.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var remaining=this.idleUntil-Date.now();this.timer=setTimeout(function(){if(Date.now()<self.idleUntil){self.schedule();return;}if(!self.paused&&!document.hidden&&!global.matchMedia('(prefers-reduced-motion: reduce)').matches&&self.options.canRotate())self.move(1,true);self.schedule(6000);},remaining>0?remaining:(delay||6000));};
  Carousel.prototype.pause=function(value){this.paused=value!==false;clearTimeout(this.timer);this.render();if(!this.paused)this.schedule(2000);};
  Carousel.prototype.toggle=function () { this.pause(!this.paused); };
  Carousel.prototype.visibilityChanged=function(){clearTimeout(this.timer);if(!document.hidden&&!this.paused)this.schedule(2000);};
  Carousel.prototype.load=function (api) {
    if (this.loaded||this.loading) return;
    this.loading=true;
    var self=this,items=[],seen={},channels=['movies','tv'];
    function channel(index) {
      if(index>=channels.length) { self.loading=false;self.loaded=true;if(items.length){var retained=unique(items.concat(self.retained||self.items)),movies=retained.filter(function(s){return Number(s.subjectType)===1;}),tv=retained.filter(function(s){return Number(s.subjectType)===2;}),balanced=movies.slice(0,50).concat(tv.slice(0,50)),chosen={};balanced.forEach(function(s){chosen[String(s.subjectId)]=true;});retained.forEach(function(s){if(balanced.length<100&&!chosen[String(s.subjectId)]){chosen[String(s.subjectId)]=true;balanced.push(s);}});self.set(balanced.sort(function(a,b){var dates=String(b.releaseDate||'').localeCompare(String(a.releaseDate||''));return dates||String(a.subjectId).localeCompare(String(b.subjectId));}));}return Promise.resolve(); }
      var page=1,count=0,requests=0;
      function next() {
        requests++;
        return api.catalogue(channels[index],{sort:'Latest'},page).then(function(result) {
          var added=0;
          (result.items||[]).forEach(function(item) { var id=String(item.subjectId||'');if(count<300&&!seen[id]&&Number(item.subjectType)===(index===0?1:2)){seen[id]=true;items.push(item);count++;added++;} });
          if(unique(items.filter(function(s){return Number(s.subjectType)===(index===0?1:2);})).length<50&&added&&result.hasMore&&requests<5) { page=result.nextPage;return new Promise(function(resolve){setTimeout(resolve,120);}).then(next); }
        }).catch(function(){ /* Keep the home fallback or a partially available feed. */ });
      }
      return next().then(function(){return channel(index+1);});
    }
    return channel(0);
  };
  Carousel.unique=unique;Carousel.visualKeys=visualKeys;
  global.MovieBoxCarousel=Carousel;
})(window);
