(function (global) {
  'use strict';
  var themes = {
    obsidian:{name:'Obsidian Cinema',description:'Cinematic charcoal with mint highlights.'},
    orbital:{name:'Orbital',description:'Midnight blue, ice-blue accents and top navigation.'},
    prism:{name:'Prism',description:'Indigo and violet with a compact navigation rail.'},
    aurora:{name:'Aurora',description:'Pearl surfaces, emerald accents and an airy layout.'},
    eclipse:{name:'Eclipse',description:'Cinema black, champagne gold and elegant typography.'}
  };
  function key(value) { return Object.prototype.hasOwnProperty.call(themes,value) ? value : 'obsidian'; }
  function apply(value) {
    value = key(value); document.documentElement.dataset.theme = value;
    document.documentElement.style.backgroundColor=({obsidian:'#0b1016',orbital:'#070f20',prism:'#100c20',aurora:'#edf3f0',eclipse:'#100e0b'})[value];
    try{localStorage.setItem('moviebox-tv-theme',value);}catch(_){}
    var logo = document.querySelector('.brand img');
    if (logo) logo.src = 'assets/moviebox-logo-' + value + '.svg';
    var hint = document.getElementById('theme-description');
    if (hint) hint.textContent = themes[value].description;
    return value;
  }
  global.MovieBoxThemes = {themes:themes,key:key,apply:apply};
})(window);
