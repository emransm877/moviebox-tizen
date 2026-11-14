(function(){
  'use strict';
  var fields=document.querySelector('.catalogue-filter-fields');if(!fields)return;
  var pending=false,context=document.createElement('canvas').getContext('2d');
  function fit(){pending=false;fields.querySelectorAll('select').forEach(function(select){var style=getComputedStyle(select);context.font=style.font||[style.fontWeight,style.fontSize,style.fontFamily].join(' ');var text=select.selectedOptions[0]?select.selectedOptions[0].textContent:'';var label=select.closest('label'),caption=label&&label.firstChild?label.firstChild.textContent.trim():'';var width=context.measureText(text).width+60;context.font='15px '+style.fontFamily;width=Math.max(84,width,context.measureText(caption).width+8);select.style.width=Math.ceil(width)+'px';});if(window.MovieBoxTV)MovieBoxTV.navigation.invalidate();}
  function schedule(){if(!pending){pending=true;requestAnimationFrame(fit);}}
  fields.addEventListener('change',schedule);new MutationObserver(schedule).observe(fields,{subtree:true,childList:true});window.addEventListener('resize',schedule);schedule();
})();
