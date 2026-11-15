const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../../js/lyrics.js'), 'utf8');
function setup(type = 'jellyfin') {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '', style: {},
      removeAttribute() {}, classList: { add() {}, remove() {} }, scrollIntoView() {} });
    return elements.get(id);
  };
  const calls = [];
  const ctx = vm.createContext({ URL, URLSearchParams, TextEncoder, AbortController, setTimeout, clearTimeout,
    window: {}, document: { getElementById: element, querySelector: () => null },
    audio: { currentTime: 0 }, escapeHtml: s => s.replaceAll('<', '&lt;'), t: s => s, showToast() {},
    playlist: [{ Id: '1', Name: 'Song', Artists: ['Artist'], Duration: 180 }], currentTrackIndex: 0,
    embyConfig: { serverType: type, host: 'https://server.test', token: 'secret', userId: 'u' },
    fetch: async (url, opts) => { calls.push(String(url)); return ctx.respond(String(url), opts); }
  });
  ctx.respond = () => { throw Error('Unexpected request'); };
  vm.runInContext(code, ctx);
  return { ctx, calls, element, run: s => vm.runInContext(s, ctx) };
}
const response = value => ({ ok: true, json: async () => value, text: async () => typeof value === 'string' ? value : JSON.stringify(value) });
for (const type of ['emby', 'jellyfin']) test(type + ' stored lyrics prevent internet lookup', async () => {
  const h = setup(type);
  h.ctx.respond = () => response({ Lyrics: [{ Start: 12500000, Text: 'Server lyric' }] });
  await h.run('loadLyrics()');
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0], new RegExp(type === 'emby' ? '/Items/1/Lyrics' : '/Audio/1/Lyrics'));
  assert.equal(h.run('lrcLines[0].time'), 1.25);
  assert.match(h.element('lyrics-body').innerHTML, /Server lyric/);
});
test('Jellyfin main track supports unsynced lyrics', async () => {
  const h = setup();
  h.ctx.respond = () => response({ Tracks: [{ Type: 'Translation', Lyrics: [{ Text: 'Wrong' }] }, { Type: 'Main', Lyrics: [{ Text: 'Original' }] }] });
  await h.run('loadLyrics()');
  assert.equal(h.run('lrcLines[0].time'), null);
  assert.match(h.element('lyrics-body').innerHTML, /Original/);
});
test('LRCLIB is requested only after the source has no lyrics', async () => {
  const h = setup();
  h.ctx.respond = url => response(url.includes('lrclib') ? { plainLyrics: 'Web line\nNext line' } : { Lyrics: [] });
  await h.run('loadLyrics()');
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1], /lrclib/);
  assert.equal(h.run('lrcLines.length'), 2);
  assert.equal(h.run('lrcLines[0].time'), null);
});
test('Plex fetches stored timed lyric streams and never leaks tokens to external streams', async () => {
  const h = setup('plex');
  h.ctx.respond = url => response(url.includes('/metadata/') ? { MediaContainer: { Metadata: [{ Media: [{ Part: [{ Stream: [
    { streamType: 4, timed: true, key: 'https://other.test/lyrics' },
    { streamType: 4, timed: true, key: '/library/streams/7' }
  ] }] }] }] } } : '[00:01.005]Plex lyric');
  await h.run('loadLyrics()');
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1], /server.test\/library\/streams\/7/);
  assert.equal(h.run('lrcLines[0].time'), 1.005);
});
test('local companion and embedded lyrics are used offline', async () => {
  const h = setup('local');
  h.ctx.playlist[0]._lyricsFiles = [{ text: async () => '[00:02][00:04]Local lyric' }];
  await h.run('loadLyrics()');
  assert.equal(h.calls.length, 0);
  assert.equal(h.run('lrcLines.length'), 2);
  h.ctx.playlist[0]._lyricsFiles = [];
  h.ctx.playlist[0]._file = {};
  h.ctx.window.jsmediatags = { BlobReader: class {}, Reader: class {
    setReader() { return this; }
    read(options) { options.onSuccess({ tags: { USLT: { data: { lyrics: 'Embedded text' } } } }); }
  } };
  await h.run('loadLyrics()');
  assert.equal(h.calls.length, 0);
  assert.match(h.element('lyrics-body').innerHTML, /Embedded text/);
});
test('translation batches unique lines and reuses cached languages', async () => {
  const h = setup('local');
  h.ctx.playlist[0].Lyrics = '[00:01]Hello\n[00:02]World\n[00:03]Hello';
  await h.run('loadLyrics()');
  h.ctx.respond = url => {
    assert.equal(new URL(url).searchParams.get('q'), 'Hello\nWorld');
    return response([[['Hola\nMundo', 'Hello\nWorld']], null, 'en']);
  };
  await h.run("translateLyrics('es')");
  assert.equal(h.calls.length, 1);
  assert.equal(h.run('lrcLines[2].text'), 'Hola');
  assert.equal(h.run('lrcLines[2].time'), 3);
  await h.run("translateLyrics('')");
  assert.equal(h.run('lrcLines[0].text'), 'Hello');
  await h.run("translateLyrics('es')");
  assert.equal(h.calls.length, 1);
});
test('late loading or translating never overwrites the new track', async () => {
  const h = setup();
  let release;
  h.ctx.respond = () => new Promise(r => { release = r; });
  const pending = h.run('loadLyrics()');
  h.ctx.playlist.push({ Id: '2', Name: 'New', Lyrics: 'New lyrics' });
  h.ctx.currentTrackIndex = 1;
  await h.run('loadLyrics()');
  release(response({ Lyrics: [{ Text: 'Old lyrics' }] }));
  await pending;
  assert.match(h.element('lyrics-body').innerHTML, /New lyrics/);
  h.ctx.respond = () => new Promise(r => { release = r; });
  const translating = h.run("translateLyrics('es')");
  h.ctx.currentTrackIndex = 0;
  h.ctx.playlist[0].Lyrics = 'Third lyrics';
  await h.run('loadLyrics()');
  release(response([[['Viejo']], null, 'en']));
  await translating;
  assert.match(h.element('lyrics-body').innerHTML, /Third lyrics/);
  assert.equal(h.element('lyrics-translating').style.display, 'none');
});
test('translation falls back to individual lines when a provider loses newlines', async () => {
  const h = setup('local');
  h.ctx.playlist[0].Lyrics = 'Hello\nWorld';
  await h.run('loadLyrics()');
  h.ctx.respond = url => {
    const q = new URL(url).searchParams.get('q');
    return response([[[q.includes('\n') ? 'Merged' : q === 'Hello' ? 'Hola' : 'Mundo']], null, 'en']);
  };
  await h.run("translateLyrics('es')");
  assert.equal(h.calls.length, 3);
  assert.equal(h.run('lrcLines[1].text'), 'Mundo');
});
test('MyMemory remains available when Google is blocked', async () => {
  const h = setup('local');
  h.ctx.playlist[0].Lyrics = 'Hello';
  await h.run('loadLyrics()');
  h.ctx.respond = url => {
    if (url.includes('googleapis')) throw Error('Blocked');
    const pair = new URL(url).searchParams.get('langpair');
    return response({ responseStatus: 200, responseData: { translatedText: 'Hola', match: pair === 'en|es' ? 1 : 0 } });
  };
  await h.run("translateLyrics('es')");
  assert.equal(h.run('lrcLines[0].text'), 'Hola');
});
test('failed translations can be retried instead of caching the original text', async () => {
  const h = setup('local');
  h.ctx.playlist[0].Lyrics = 'Hello';
  await h.run('loadLyrics()');
  await h.run("translateLyrics('es')");
  assert.equal(h.run('lyricsTranslationCache.size'), 0);
  h.ctx.respond = () => response([[['Hola']], null, 'en']);
  await h.run("translateLyrics('es')");
  assert.equal(h.run('lrcLines[0].text'), 'Hola');
});
test('request timeout aborts stalled response bodies', async () => {
  const h = setup();
  h.ctx.respond = (_, options) => ({ ok: true, json: () => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
  }) });
  await assert.rejects(h.run("lyricsRequest('https://server.test', 'json', {}, 5)"), /aborted/);
});
test('directory scan retains audio files and only matching companions from the same folder', async () => {
  const h = setup('local');
  h.ctx.URL.createObjectURL = () => 'blob:audio';
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/local.js'), 'utf8'), h.ctx);
  const file = name => ({ name, kind: 'file', getFile: async () => ({ name, lastModified: 0 }) });
  const directory = { name: 'Album', async *values() {
    yield file('Track.mp3'); yield file('TRACK.LRC'); yield file('Track.txt'); yield file('Other.lrc');
  } };
  h.ctx.directory = directory;
  await h.run('scanDirectory(directory)');
  assert.equal(h.run('localTracks.length'), 1);
  assert.equal(h.run('localTracks[0]._file.name'), 'Track.mp3');
  assert.equal(h.run('localTracks[0]._lyricsFiles.map(f => f.name).join(",")'), 'TRACK.LRC,Track.txt');
});
