/* Image resize syntax is used by MovieBox's shipped web client and verified on its CDN. */
(function (global) {
  'use strict';
  var metrics = {resized:0,blockedOversized:0};
  function url(subject, kind, width) {
    var value = subject && subject[kind || 'cover'];
    if (!value) return '';
    var record = typeof value === 'string' ? {url:value} : value;
    var thumbnail = record.thumbnail;
    var original = typeof thumbnail === 'string' && thumbnail ? thumbnail : thumbnail && thumbnail.url || record.url || '';
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
  global.MovieBoxArtwork = {url:url,metrics:metrics};
})(window);
