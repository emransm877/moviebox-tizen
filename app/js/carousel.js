(function (global) {
  'use strict';
  function shuffle(items) {
    for (var i=items.length-1;i>0;i--) { var j=Math.floor(Math.random()*(i+1)),temp=items[i];items[i]=items[j];items[j]=temp; }
    return items;
  }
  function Carousel(options) {
    this.options=options; this.items=[]; this.index=0; this.paused=false; this.loaded=false; this.loading=false;
    var self=this;
    this.timer=setInterval(function () { if (!self.paused && self.options.canRotate()) self.move(1,true); },8000);
  }
  Carousel.prototype.current=function () { return this.items[this.index] || null; };
  Carousel.prototype.set=function (items) {
    var previous=this.current(),seen={},clean=[];
    items.forEach(function (item) { var id=String(item.subjectId||''); if(id&&item.title&&!seen[id]&&(Number(item.subjectType)===1||Number(item.subjectType)===2)) { seen[id]=true;clean.push(item); } });
    if (!clean.length) return;
    if (previous && this.options.interacting() && !seen[String(previous.subjectId)]) clean=[previous].concat(clean.slice(0,99));
    this.items=clean.slice(0,100); this.index=previous ? this.items.findIndex(function (item) { return String(item.subjectId)===String(previous.subjectId); }) : 0;
    if (this.index<0) this.index=0;
    this.render();
  };
  Carousel.prototype.render=function () { this.options.render(this.current(),this.index,this.items.length,this.paused); };
  Carousel.prototype.move=function (step,automatic) {
    if (!this.items.length || (automatic && !this.options.canRotate())) return;
    this.index=(this.index+step+this.items.length)%this.items.length; this.render();
  };
  Carousel.prototype.toggle=function () { this.paused=!this.paused;this.render(); };
  Carousel.prototype.load=function (api) {
    if (this.loaded||this.loading) return;
    this.loading=true;
    var self=this,items=[],seen={},channels=['movies','tv'];
    function channel(index) {
      if(index>=channels.length) { self.loading=false;self.loaded=true;if(items.length)self.set(shuffle(items));return Promise.resolve(); }
      var page=1,count=0,requests=0;
      function next() {
        requests++;
        return api.catalogue(channels[index],{sort:'Latest'},page).then(function(result) {
          var added=0;
          (result.items||[]).forEach(function(item) { var id=String(item.subjectId||'');if(count<50&&!seen[id]&&Number(item.subjectType)===(index===0?1:2)){seen[id]=true;items.push(item);count++;added++;} });
          if(count<50&&added&&result.hasMore&&requests<5) { page=result.nextPage;return new Promise(function(resolve){setTimeout(resolve,120);}).then(next); }
        }).catch(function(){ /* Keep the home fallback or a partially available feed. */ });
      }
      return next().then(function(){return channel(index+1);});
    }
    return channel(0);
  };
  global.MovieBoxCarousel=Carousel;
})(window);
