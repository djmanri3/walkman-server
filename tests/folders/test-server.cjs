const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const requested = [];
const context = vm.createContext({
  URLSearchParams, availableLibraries: [], t: key => key,
  embyConfig: { host: 'https://music.test', userId: 'user', token: 'test-token', libraryId: 'selected-library' },
  fetch: async input => {
    const url = new URL(input);
    requested.push(url);
    const start = Number(url.searchParams.get('StartIndex'));
    const count = start === 0 ? 500 : 1;
    return { ok: true, json: async () => ({
      TotalRecordCount: 501,
      Items: Array.from({ length: count }, (_, index) => ({ Id: String(start + index), Name: 'Folder ' + (start + index), IsFolder: true }))
    }) };
  }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/folders.js'), 'utf8'), context);

(async () => {
  const items = await context.fetchServerFolderChildren('selected-library');
  assert.equal(items.length, 501);
  assert.equal(requested.length, 2);
  for (const url of requested) {
    assert.equal(url.pathname, '/Users/user/Items');
    assert.equal(url.searchParams.get('ParentId'), 'selected-library');
    assert.equal(url.searchParams.get('Recursive'), 'false');
    assert.equal(url.searchParams.has('IncludeItemTypes'), false, 'Empty folders must not be excluded');
  }
  const root = context.populateServerFolder({ path: '', id: 'selected-library' }, items);
  assert.equal(root.folders.size, 501);
  assert.equal(root.folders.get('0').path, '0');
  assert.equal(root.folders.get('0').loaded, false);
  const album = context.populateServerFolder(root.folders.get('0'), [{ Id: 'song', Type: 'Audio' }]);
  assert.equal(album.tracks.length, 1);
  assert.equal(album.loaded, true);
  await assert.rejects(context.fetchServerFolderChildren(''), /No selected library/);
  context.fetch = async () => ({ ok: false });
  await assert.rejects(context.fetchServerFolderChildren('selected-library'), /Could not load/);
  console.log('PASS Native folder browsing uses the selected library ID, includes empty folders, paginates and handles errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
