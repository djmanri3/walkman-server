/* Browse the actual paths reported by the library, independently of album tags. */
let folderLibrary = null;

function buildFolderTree(tracks, selectedLibrary) {
  const root = { name: '', path: '', folders: new Map(), tracks: [] };
  const library = selectedLibrary || availableLibraries.find(item => String(item.Id) === String(embyConfig.libraryId));
  const splitPath = path => String(path || '').replace(/\\/g, '/').replace(/^file:\/\//i, '').split('/').filter(Boolean);
  const roots = [library?.Path, ...(library?.Locations || []).map(location => typeof location === 'string' ? location : location.Path)]
    .filter(Boolean).map(splitPath).sort((a, b) => b.length - a.length);
  const libraryName = library?.Name?.trim().toLowerCase();
  let resolvedLibraryRoot = false;
  for (const track of tracks) {
    // Stream/content URLs do not expose a physical folder hierarchy.
    const path = String(track.Path || track.MediaSources?.[0]?.Path || '');
    let parts = /^(?!file:)[a-z][a-z\d+.-]*:\/\//i.test(path) ? [] : splitPath(path).slice(0, -1);
    const configuredRoot = roots.find(prefix => prefix.every((name, index) => parts[index] === name));
    const musicRootIndex = parts.findIndex(name => name.toLowerCase() === 'music');
    const libraryNameIndex = libraryName ? parts.findIndex((name, index) =>
      name.toLowerCase() === libraryName && index > musicRootIndex) : -1;
    if (configuredRoot) {
      parts = parts.slice(configuredRoot.length);
      if (libraryName && parts[0]?.toLowerCase() === libraryName) parts = parts.slice(1);
      resolvedLibraryRoot = true;
    } else if (libraryNameIndex >= 0) {
      // Open inside /data/music/<selected library>, not at its parent.
      parts = parts.slice(libraryNameIndex + 1);
      resolvedLibraryRoot = true;
    } else if (musicRootIndex >= 0) {
      // Each storage location can have its own prefix (/data/music, /mnt/music).
      // Remove it before combining locations so neither prefix becomes a row.
      parts = parts.slice(musicRootIndex + 1);
      resolvedLibraryRoot = true;
    }
    let node = root;
    for (const name of parts) {
      if (!node.folders.has(name)) node.folders.set(name, {
        name, path: [node.path, name].filter(Boolean).join('/'), folders: new Map(), tracks: []
      });
      node = node.folders.get(name);
    }
    node.tracks.push(track);
  }
  // Skip shared storage containers (for example /data/music), while keeping
  // the last actual music folder visible even in a one-album library.
  let libraryRoot = root;
  while (!resolvedLibraryRoot && (libraryRoot === root || !libraryRoot.tracks.length) && libraryRoot.folders.size === 1) {
    const child = libraryRoot.folders.values().next().value;
    const musicRoot = child.name.toLowerCase() === 'music';
    if (!child.folders.size && !musicRoot) break;
    libraryRoot = child;
    if (musicRoot) break;
  }
  if (libraryRoot !== root) {
    libraryRoot.tracks = [...root.tracks, ...libraryRoot.tracks];
    const rebase = (node, path) => {
      node.path = path;
      for (const child of node.folders.values()) rebase(child, [path, child.name].filter(Boolean).join('/'));
    };
    rebase(libraryRoot, '');
    libraryRoot.name = '';
  }
  return libraryRoot;
}

async function fetchServerFolderChildren(parentId) {
  if (!parentId) throw new Error('No selected library');
  const { host, userId, token } = embyConfig;
  const items = [];
  let total = Infinity;
  while (items.length < total) {
    const query = new URLSearchParams({
      ParentId: String(parentId), Recursive: 'false', StartIndex: String(items.length), Limit: '500',
      SortBy: 'SortName', SortOrder: 'Ascending',
      Fields: 'Path,MediaSources,MediaStreams,ImageTags,AlbumId,AlbumPrimaryImageTag', api_key: token
    });
    const response = await fetch(`${host}/Users/${encodeURIComponent(userId)}/Items?${query}`);
    if (!response.ok) throw new Error('Could not load library folders');
    const data = await response.json();
    if (!Array.isArray(data.Items)) throw new Error('Invalid library folder response');
    items.push(...data.Items);
    total = Number.isFinite(data.TotalRecordCount) ? data.TotalRecordCount : items.length;
    if (!data.Items.length) break;
  }
  return items;
}

function populateServerFolder(node, items) {
  const loaded = { ...node, folders: new Map(), tracks: [], loaded: true };
  for (const item of items) {
    if (item.Type === 'Audio') loaded.tracks.push(item);
    else if (item.IsFolder || ['Folder', 'CollectionFolder', 'MusicAlbum', 'MusicArtist', 'Playlist'].includes(item.Type)) {
      const key = encodeURIComponent(String(item.Id));
      loaded.folders.set(key, { key, id: item.Id, name: item.Name || t('folders'),
        path: [node.path, key].filter(Boolean).join('/'), folders: new Map(), tracks: [], loaded: false });
    }
  }
  return loaded;
}

async function loadFolderView(path = '', refresh = !path) {
  beginMusicLibraryRequest('folder:' + path);
  const requestId = musicLibraryRequestId;
  const source = musicLibrarySource();
  currentCategory = 'Folders';
  currentCategoryItems = null;
  favoritesViewKind = '';
  subItems = null;
  showSortBar(false);
  navStack = [{ type: 'category', category: 'Folders' }];
  if (path) navStack.push({ type: 'folder', path });
  document.getElementById('category-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'block';
  document.getElementById('selected-category-title').textContent = path || t('folders');
  const container = document.getElementById('items-container');
  container.textContent = t('loadingSongs');
  updateMusicLibraryChrome();
  try {
    let library = folderLibrary;
    if ((refresh && (!path || !library?.native)) || !library || library.source !== source
      || (embyConfig.serverType === 'local' && (library.localTracks !== localTracks || library.localCount !== localTracks.length))) {
      if (['emby', 'jellyfin'].includes(embyConfig.serverType)) {
        library = { source, native: true, tree: { id: embyConfig.libraryId, name: '', path: '',
          folders: new Map(), tracks: [], loaded: false } };
      } else if (embyConfig.serverType === 'plex') {
        const [data, sections] = await Promise.all([
          fetchItems(SERVER_TYPES.plex.Audio),
          fetchPlexJson(`${embyConfig.host}/library/sections?X-Plex-Token=${encodeURIComponent(embyConfig.token)}`, true)
        ]);
        const selected = sections.MediaContainer?.Directory?.find(section => String(section.key) === String(embyConfig.libraryId));
        if (!selected) throw new Error('Selected Plex library not found');
        library = { source, tree: buildFolderTree(data.Items || [], { Name: selected.title,
          Locations: (selected.Location || []).map(location => location.path) }) };
      } else {
        const data = await fetchItems(SERVER_TYPES[embyConfig.serverType].Audio);
        library = { source, tree: buildFolderTree(data.Items || []), localTracks, localCount: localTracks.length };
      }
    }
    if (requestId !== musicLibraryRequestId || source !== musicLibrarySource()) return;
    let node = library.tree;
    let parent = null;
    for (const name of path.split('/').filter(Boolean)) { parent = node; node = node?.folders.get(name); }
    if (!node) return loadFolderView('', false);
    if (library.native && (!node.loaded || refresh)) {
      const items = await fetchServerFolderChildren(node.id);
      if (requestId !== musicLibraryRequestId || source !== musicLibrarySource()) return;
      node = populateServerFolder(node, items);
      if (parent) parent.folders.set(node.key, node);
      else library.tree = node;
    }
    folderLibrary = library;
    document.getElementById('count-folders').textContent = library.tree.folders.size;
    document.getElementById('selected-category-title').textContent = node.name || t('folders');
    renderFolderView(node);
    restoreMusicLibraryScroll();
  } catch (error) {
    if (requestId !== musicLibraryRequestId || source !== musicLibrarySource()) return;
    const message = document.createElement('p');
    message.textContent = t('foldersLoadError');
    const retry = document.createElement('button');
    retry.className = 'settings-btn';
    retry.textContent = t('musicRecentRetry');
    retry.onclick = () => loadFolderView(path, true);
    container.replaceChildren(message, retry);
  }
}

function renderFolderView(node) {
  const fragment = document.createDocumentFragment();
  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'folder-breadcrumb';
  breadcrumb.setAttribute('aria-label', t('folders'));
  const parts = node.path.split('/').filter(Boolean);
  let ancestor = folderLibrary?.tree;
  const labels = parts.map(key => { ancestor = ancestor?.folders.get(key); return ancestor?.name || key; });
  [t('folders'), ...labels].forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    if (index === parts.length) button.setAttribute('aria-current', 'page');
    button.onclick = () => loadFolderView(parts.slice(0, index).join('/'), false);
    breadcrumb.appendChild(button);
  });
  fragment.appendChild(breadcrumb);
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const folder of folders) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'list-item folder-row';
    const icon = document.createElement('span');
    icon.className = 'material-icons folder-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'folder';
    const label = document.createElement('span');
    label.className = 'list-item-info';
    const title = document.createElement('span');
    title.className = 'list-item-title';
    title.textContent = folder.name;
    label.appendChild(title);
    row.append(icon, label);
    row.onclick = () => loadFolderView(folder.path, false);
    fragment.appendChild(row);
  }
  const tracks = [...node.tracks].sort((a, b) => (a.Name || '').localeCompare(b.Name || '', undefined, { numeric: true }));
  if (tracks.length) {
    const shuffle = document.createElement('button');
    shuffle.type = 'button';
    shuffle.className = 'list-item folder-row list-item-shuffle';
    const icon = document.createElement('span');
    icon.className = 'material-icons list-item-shuffle-icon';
    icon.textContent = 'shuffle';
    const label = document.createElement('span');
    label.textContent = t('shuffleAll');
    shuffle.append(icon, label);
    shuffle.onclick = () => playShuffleAll(tracks);
    fragment.appendChild(shuffle);
  }
  tracks.forEach((track, index) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    renderMediaRow(row, getEmbyImageUrl(track), track.Name, (track.Artists || []).join(', '), isHiResAudio(track));
    decorateMusicMediaRow(row, track, index, true);
    row.onclick = () => {
      playlist = [...tracks];
      originalPlaylist = [...tracks];
      playlistVersion++;
      renderQueueList();
      refreshCarouselImages();
      playTrack(index);
      saveQueue();
      switchTab('playing');
    };
    row.querySelector('.list-item-more').onclick = event => {
      event.stopPropagation();
      openContextMenu(event, track);
    };
    fragment.appendChild(row);
  });
  if (!folders.length && !tracks.length) {
    const empty = document.createElement('p');
    empty.textContent = t('foldersEmpty');
    fragment.appendChild(empty);
  }
  document.getElementById('items-container').replaceChildren(fragment);
  updateMusicLibraryChrome();
}
