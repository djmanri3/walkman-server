const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
  availableLibraries: [{ Id: 'library', Name: 'My Library' }],
  embyConfig: { libraryId: 'library' }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/folders.js'), 'utf8'), context);
const build = paths => context.buildFolderTree(paths.map((Path, index) => ({ Id: String(index), Path })));
const names = tree => [...tree.folders.keys()].sort();

let tree = build([
  '/data/music/My Library/Artist A/Album/song.mp3',
  '/data/music/My Library/Artist B/Album/song.mp3',
  '/data/music/My Library/direct.mp3'
]);
assert.deepEqual(names(tree), ['Artist A', 'Artist B']);
assert.equal(tree.folders.get('Artist A').path, 'Artist A');
assert.equal(tree.tracks.length, 1);
assert.deepEqual(names(build(['/data/music/My Library/Artist A/Album/song.mp3'])), ['Artist A']);

// Locations may report the storage parent or the full library root.
for (const location of ['/data/music', '/data/music/My Library']) {
  context.availableLibraries[0].Locations = [location];
  assert.deepEqual(names(build(['/data/music/My Library/Artist A/Album/song.mp3'])), ['Artist A']);
}
delete context.availableLibraries[0].Locations;
assert.deepEqual(names(build([
  '/data/music/My Library/Rock/song.mp3',
  '/mnt/music/My Library/Jazz/song.mp3',
  'C:\\data\\music\\My Library\\Blues\\song.mp3'
])), ['Blues', 'Jazz', 'Rock']);

context.availableLibraries[0].Name = 'Music';
assert.deepEqual(names(build(['/data/music/Music/Artist/Album/song.mp3'])), ['Artist']);
context.availableLibraries = [];
assert.deepEqual(names(build(['/data/music/Rock/song.mp3', '/data/music/Jazz/song.mp3'])), ['Jazz', 'Rock']);
console.log('PASS Folders opens inside the selected library, preserving artists, root songs and multiple locations');

// Android playback URLs carry no folder information. SAF paths are explicitly
// relative to the selected directory and must survive all root heuristics.
const localTracks = [
  { Id: 'one', IsLocal: true, RelativePath: 'Artist A/Album/song.flac', Path: 'http://127.0.0.1:9999/a1' },
  { Id: 'two', IsLocal: true, RelativePath: 'Artist B/Album/song.flac', Path: 'http://127.0.0.1:9999/a2' },
  { Id: 'root', IsLocal: true, RelativePath: 'direct.mp3', Path: 'http://127.0.0.1:9999/a3' }
];
tree = context.buildFolderTree(localTracks, {});
assert.deepEqual(names(tree), ['Artist A', 'Artist B']);
assert.equal(tree.tracks[0].Id, 'root');
assert.equal(tree.folders.get('Artist A').folders.get('Album').tracks[0].Path, localTracks[0].Path);
assert.deepEqual(names(context.buildFolderTree([localTracks[0]], {})), ['Artist A']);
assert.deepEqual(names(context.buildFolderTree([
  { IsLocal: true, RelativePath: 'Music/Album/song.mp3', Path: 'http://127.0.0.1:9999/a4' }
], {})), ['Music']);
assert.deepEqual(names(context.buildFolderTree([
  { IsLocal: true, RelativePath: 'Álbum #1/100% + música.flac', Path: 'http://127.0.0.1:9999/a5' }
], {})), ['Álbum #1']);
console.log('PASS Android relative folders preserve hierarchy, duplicate album names and playback URLs');
