(function(global){
  'use strict';
  function numbers(record){var values=record.episodeNumbers;if(!Array.isArray(values)){values=String(record.allEp||'').split(',').map(Number).filter(function(n){return n>0;});if(!values.length){values=[];for(var n=1;n<=Math.min(10000,Number(record.maxEp)||0);n++)values.push(n);}}return Array.from(new Set(values.map(Number).filter(function(n){return Number.isInteger(n)&&n>0;}))).sort(function(a,b){return a-b;});}
  function next(seasons,season,episode){var ordered=(seasons||[]).slice().sort(function(a,b){return Number(a.se)-Number(b.se);});for(var i=0;i<ordered.length;i++){var se=Number(ordered[i].se)||0;if(se<Math.max(1,season))continue;var ep=numbers(ordered[i]).find(function(n){return se>season||n>episode;});if(ep)return {season:se,episode:ep};}return null;}
  function promptAt(duration,metadata){if(!(duration>0))return null;var marker=Number((metadata||{}).creditsStartMs);if(marker>duration/2&&marker<duration)return marker;return Math.max(0,duration-Math.min(30000,Math.max(5000,duration/10)));}
  global.MovieBoxSeriesPolicy={numbers:numbers,next:next,promptAt:promptAt};
})(window);
