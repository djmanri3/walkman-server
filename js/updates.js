/* Release checks bypass cached metadata; updates retain server and user settings. */
let appUpdateRegistration = null;
let installedAppRelease = null;
let pendingAppRelease = null;
let dismissedAppRelease = null;
let appUpdateBusy = false;
let appUpdateError = false;

function loadedAppRelease() {
  const release = {
    version: document.querySelector('meta[name="walkman-version"]')?.content,
    cacheVersion: document.querySelector('meta[name="walkman-cache-version"]')?.content
  };
  return validAppRelease(release) ? release : null;
}

function validAppRelease(release) {
  return release && typeof release.version === 'string'
    && /^\d+\.\d+(?:\.\d+)?$/.test(release.version)
    && /^walkman-v\d+$/.test(release.cacheVersion);
}

async function readInstalledAppRelease() {
  try {
    const saved = JSON.parse(loadLS('walkman_installed_release'));
    if (validAppRelease(saved)) return saved;
  } catch (e) {}
  // Migrate installations predating the update notice using their actual cache.
  try {
    const keys = (await caches.keys()).filter(key => /^walkman-v\d+$/.test(key));
    // A downloaded waiting worker may already have a newer cache.
    // Until it activates, the older cache is still the installed release.
    keys.sort((a, b) => Number(a.slice(9)) - Number(b.slice(9)));
    if (keys.length) {
      const cache = await caches.open(keys[0]);
      const response = await cache.match(new URL('./index.html', location.href).href);
      const html = response ? await response.text() : '';
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const version = doc.querySelector('#settings-app-version span:last-child')?.textContent.trim();
      return { version: /^\d+\.\d+(?:\.\d+)?$/.test(version || '') ? version : '0.0', cacheVersion: keys[0] };
    }
  } catch (e) {}
  return null;
}

function appReleaseLabel(release) {
  const build = release.cacheVersion.replace('walkman-', '');
  return release.version === '0.0' ? build : `${release.version} (${build})`;
}

function renderAppUpdateBanner() {
  const banner = document.getElementById('app-update-banner');
  if (!banner) return;
  banner.hidden = !pendingAppRelease || dismissedAppRelease === pendingAppRelease.cacheVersion;
  if (banner.hidden) return;
  document.getElementById('app-update-versions').textContent = t('appUpdateVersions')
    .replace('{previous}', appReleaseLabel(installedAppRelease))
    .replace('{next}', appReleaseLabel(pendingAppRelease));
  const update = document.getElementById('app-update-now');
  update.disabled = appUpdateBusy;
  update.textContent = t(appUpdateBusy ? 'appUpdateApplying' : 'appUpdateNow');
  document.getElementById('app-update-later').disabled = appUpdateBusy;
  document.getElementById('app-update-error').hidden = !appUpdateError;
  banner.setAttribute('aria-busy', String(appUpdateBusy));
}

function deferAppUpdate() {
  if (appUpdateBusy || !pendingAppRelease) return;
  dismissedAppRelease = pendingAppRelease.cacheVersion;
  renderAppUpdateBanner();
}

async function checkForAppUpdate() {
  try {
    let available;
    if (location.protocol === 'file:') {
      // Local files cannot fetch deployment metadata or use service workers.
      // Compare this loaded bundle with the last accepted local bundle instead.
      available = loadedAppRelease();
    } else {
      const response = await fetch(new URL('./version.json', location.href), { cache: 'no-store' });
      if (!response.ok) return;
      available = await response.json();
    }
    if (!validAppRelease(available)) return;
    if (!installedAppRelease) {
      installedAppRelease = available;
      saveLS('walkman_installed_release', JSON.stringify(available));
    } else if (Number(available.cacheVersion.slice(9)) > Number(installedAppRelease.cacheVersion.slice(9))) {
      pendingAppRelease = available;
      renderAppUpdateBanner();
    }
    if (appUpdateRegistration) await appUpdateRegistration.update();
  } catch (e) {
    // Offline: retain the accepted version and do not invent an update.
  }
}

function waitForAppWorker(worker, target) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); worker.removeEventListener('statechange', changed); };
    const changed = () => {
      if (worker.state === target || (target === 'installed' && worker.state === 'activated')) {
        cleanup(); resolve();
      } else if (worker.state === 'redundant') { cleanup(); reject(new Error('Update installation failed')); }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Update timed out')); }, 30000);
    worker.addEventListener('statechange', changed);
    changed();
  });
}

async function applyAppUpdate() {
  const local = location.protocol === 'file:';
  if (!pendingAppRelease || appUpdateBusy) return;
  appUpdateBusy = true;
  appUpdateError = false;
  renderAppUpdateBanner();
  try {
    if (local) {
      saveLS('walkman_installed_release', JSON.stringify(pendingAppRelease));
      const url = new URL(location.href);
      url.searchParams.set('v', pendingAppRelease.cacheVersion);
      location.replace(url.href);
      return;
    }
    if (!appUpdateRegistration) {
      appUpdateRegistration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    }
    await appUpdateRegistration.update();
    const worker = appUpdateRegistration.waiting || appUpdateRegistration.installing;
    if (worker) await waitForAppWorker(worker, 'installed');
    const keys = await caches.keys();
    if (!keys.includes(pendingAppRelease.cacheVersion)) throw new Error('New app cache is not ready');
    const cache = await caches.open(pendingAppRelease.cacheVersion);
    const metadata = await cache.match(new URL('./version.json', location.href).href);
    const downloaded = metadata && await metadata.json();
    if (!validAppRelease(downloaded) || downloaded.cacheVersion !== pendingAppRelease.cacheVersion
      || downloaded.version !== pendingAppRelease.version) throw new Error('Incomplete app update');
    if (worker && worker.state !== 'activated') {
      const activated = waitForAppWorker(worker, 'activated');
      worker.postMessage({ type: 'ACTIVATE_UPDATE' });
      await activated;
    }
    // The newly downloaded cache is already fresh. Clear only obsolete app
    // builds, leaving other apps, localStorage and IndexedDB untouched.
    await Promise.all(keys.filter(key => /^walkman-v\d+$/.test(key) && key !== pendingAppRelease.cacheVersion)
      .map(key => caches.delete(key)));
    saveLS('walkman_installed_release', JSON.stringify(pendingAppRelease));
    const url = new URL(location.href);
    url.searchParams.set('v', pendingAppRelease.cacheVersion);
    location.replace(url.href);
  } catch (e) {
    appUpdateBusy = false;
    appUpdateError = true;
    renderAppUpdateBanner();
  }
}

async function initAppUpdates() {
  if (!/^(?:https?|file):$/.test(location.protocol)) return;
  installedAppRelease = await readInstalledAppRelease();
  if (location.protocol !== 'file:' && 'serviceWorker' in navigator) {
    try {
      appUpdateRegistration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    } catch (e) {
      // A failed worker registration must not suppress the release notice.
    }
  }
  await checkForAppUpdate();
  window.addEventListener('online', checkForAppUpdate);
}

window.addEventListener('load', initAppUpdates);
