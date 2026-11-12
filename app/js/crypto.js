/* MD5/HMAC-MD5 public protocol compatibility, implemented from RFC 1321/2104.
 * These hashes sign the service's existing public protocol; not password storage. */
(function (root) {
  'use strict';
  function bytes(value) {
    if (typeof value !== 'string') return Array.from(value);
    return Array.from(new TextEncoder().encode(value));
  }
  function digest(value) {
    const data = bytes(value), length = data.length * 8;
    data.push(128); while (data.length % 64 !== 56) data.push(0);
    for (let i = 0; i < 8; i++) data.push(Math.floor(length / Math.pow(256, i)) & 255);
    let state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    const shifts = [7,12,17,22, 5,9,14,20, 4,11,16,23, 6,10,15,21];
    for (let offset = 0; offset < data.length; offset += 64) {
      const block = [];
      for (let i = 0; i < 16; i++) block.push(data[offset+i*4] | data[offset+i*4+1]<<8 | data[offset+i*4+2]<<16 | data[offset+i*4+3]<<24);
      let [a,b,c,d] = state;
      for (let i = 0; i < 64; i++) {
        let f, g;
        if (i < 16) { f = (b & c) | (~b & d); g = i; }
        else if (i < 32) { f = (d & b) | (~d & c); g = (5*i+1)%16; }
        else if (i < 48) { f = b ^ c ^ d; g = (3*i+5)%16; }
        else { f = c ^ (b | ~d); g = 7*i%16; }
        const n = (a + f + (Math.floor(Math.abs(Math.sin(i+1))*4294967296) | 0) + block[g]) | 0;
        const shift = shifts[Math.floor(i/16)*4+i%4];
        a = d; d = c; c = b; b = (b + ((n << shift) | (n >>> (32-shift)))) | 0;
      }
      state = state.map((v,i) => (v+[a,b,c,d][i])|0);
    }
    const output = [];
    state.forEach(word => { for (let i=0; i<4; i++) output.push((word >>> (i*8)) & 255); });
    return output;
  }
  function hex(value) { return digest(value).map(b => b.toString(16).padStart(2,'0')).join(''); }
  function hmac(key, value) {
    key = bytes(key); if (key.length > 64) key = digest(key);
    while (key.length < 64) key.push(0);
    return digest(key.map(b => b ^ 92).concat(digest(key.map(b => b ^ 54).concat(bytes(value)))));
  }
  root.MovieBoxCrypto = {md5:hex, digest:digest, hmac:hmac,
    base64: value => btoa(String.fromCharCode.apply(null, value)), bytes:bytes};
})(typeof globalThis !== 'undefined' ? globalThis : window);
