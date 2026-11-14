/* Runs before stylesheets and the first app paint. No network or user data leaves the TV. */
(function(){
  'use strict';
  var colors={obsidian:'#0b1016',orbital:'#070f20',prism:'#100c20',aurora:'#edf3f0',eclipse:'#100e0b'},theme='';
  try{theme=localStorage.getItem('moviebox-tv-theme')||'';if(!Object.prototype.hasOwnProperty.call(colors,theme)){['moviebox-tv-library','moviebox-tv-library-backup'].some(function(key){try{var library=JSON.parse(localStorage.getItem(key)||'null'),value=library&&library.settings&&library.settings.theme;if(Object.prototype.hasOwnProperty.call(colors,value)){theme=value;return true;}}catch(_){}return false;});}}catch(_){}
  if(!Object.prototype.hasOwnProperty.call(colors,theme))theme='obsidian';
  document.documentElement.dataset.theme=theme;document.documentElement.style.backgroundColor=colors[theme];
  window.MovieBoxInitialTheme=theme;
})();
