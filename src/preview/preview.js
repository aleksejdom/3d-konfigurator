// Separat ladbare Webvorschau. Der Editor schickt Projekt, Modell und Bilder per postMessage;
// danach läuft hier derselbe Player wie in der exportierten Website.

import { startPlayer } from '../core/player.js';
import { renderCss, renderFreeLayer, renderHotspotLayer, renderSections } from '../export/page.js';

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent) return;
  // Geänderte Testwerte aus dem Vorschau-Dialog
  if (event.data?.type === 'test-data' && window.__player) window.__player.data.feed.push(event.data.data);
  if (event.data?.type !== 'load') return;
  const { project, model, images, throttle, dataMode, testData } = event.data;

  const urls = Object.fromEntries(
    Object.entries(images || {}).map(([name, data]) => {
      const type = name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '';
      return [name, URL.createObjectURL(new Blob([data], { type }))];
    }),
  );
  const options = { assetUrl: (name) => urls[name] || '' };

  document.title = project.name;
  document.querySelector('#page-css').textContent = renderCss(project);
  document.querySelector('.page').innerHTML = renderSections(project, options);
  document.querySelector('.page').insertAdjacentHTML('afterend', renderFreeLayer(project, options) + renderHotspotLayer(project));

  // Für automatische Tests der Vorschau erreichbar.
  window.__player = await startPlayer({
    project,
    canvas: document.querySelector('#stage'),
    modelBuffer: model || undefined,
    throttle: throttle || undefined,
    dataMode,
    onFirstRender: (ms) => window.parent.postMessage({ type: 'first-render', ms }, '*'),
  });
  if (dataMode === 'test' && testData) window.__player.data.feed.push(testData);
});

window.parent.postMessage({ type: 'ready' }, '*');
