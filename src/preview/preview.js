// Separat ladbare Webvorschau. Hier läuft derselbe Player wie in der exportierten Website.
//
// Zwei Wege, die Seite zu füllen:
// 1. Im Vorschau-Dialog des Editors (iframe): Projekt, Modell und Bilder kommen per postMessage.
// 2. Über den Vorschau-Link im WLAN (Adresse mit ?lan=<Token>): Die Desktop-App liefert die Dateien
//    über ihren lokalen Webserver. So lässt sich die Seite auf einem echten Smartphone prüfen.

import { startPlayer } from '../core/player.js';
import { renderCss, renderFreeLayer, renderHotspotLayer, renderSections } from '../export/page.js';

const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

function blobUrls(files) {
  return Object.fromEntries(
    Object.entries(files || {}).map(([name, data]) => {
      const type = MIME[name.split('.').pop().toLowerCase()] || '';
      return [name, URL.createObjectURL(new Blob([data], { type }))];
    }),
  );
}

/** Baut die Seite so auf, wie sie der Export als HTML enthält. */
function buildPage(project, assetUrl) {
  const options = { assetUrl };
  document.title = project.name;
  document.querySelector('#page-css').textContent = renderCss(project);
  document.querySelector('.page').innerHTML = renderSections(project, options);
  document.querySelector('.page').insertAdjacentHTML('afterend', renderFreeLayer(project, options) + renderHotspotLayer(project));
  if (project.settings.poster) {
    const poster = document.createElement('img');
    poster.className = 'poster';
    poster.alt = '';
    poster.src = assetUrl(project.settings.poster);
    document.querySelector('#stage').after(poster);
  }
}

const canvas = document.querySelector('#stage');
const lanToken = new URLSearchParams(location.search).get('lan');

if (lanToken) {
  // ---------- Vorschau-Link im WLAN ----------
  const base = `lan/${lanToken}/`;
  const project = await (await fetch(base + 'project.json', { cache: 'no-store' })).json();
  buildPage(project, (name) => base + 'images/' + encodeURI(name));
  window.__player = await startPlayer({
    project,
    canvas,
    modelUrl: project.model.file ? base + 'model/' + encodeURI(project.model.file) : undefined,
    envUrl: project.settings.environment.file ? base + 'env/' + encodeURI(project.settings.environment.file) : undefined,
    dracoPath: './draco/',
    // Messung auf dem echten Gerät an den Editor melden.
    onFirstRender: (ms) =>
      fetch(base + 'report', {
        method: 'POST',
        body: JSON.stringify({ ms, userAgent: navigator.userAgent, width: window.innerWidth, connection: navigator.connection?.effectiveType || null }),
      }).catch(() => {}),
  });
} else {
  // ---------- Vorschau-Dialog des Editors ----------
  window.addEventListener('message', async (event) => {
    if (event.source !== window.parent) return;
    // Geänderte Testwerte aus dem Vorschau-Dialog
    if (event.data?.type === 'test-data' && window.__player) window.__player.data.feed.push(event.data.data);
    if (event.data?.type !== 'load') return;
    const { project, model, resources, images, throttle, dataMode, testData, reducedMotion } = event.data;

    const imageUrls = blobUrls(images);
    const resourceUrls = blobUrls(resources);
    buildPage(project, (name) => imageUrls[name] || '');

    // Für automatische Tests der Vorschau erreichbar.
    window.__player = await startPlayer({
      project,
      canvas,
      modelBuffer: model || undefined,
      resourceUrl: (name) => resourceUrls[name],
      envUrl: imageUrls[project.settings.environment.file] || undefined,
      dracoPath: './draco/',
      throttle: throttle || undefined,
      dataMode,
      reducedMotion,
      onFirstRender: (ms) => window.parent.postMessage({ type: 'first-render', ms }, '*'),
    });
    if (dataMode === 'test' && testData) window.__player.data.feed.push(testData);
  });

  window.parent.postMessage({ type: 'ready' }, '*');
}
