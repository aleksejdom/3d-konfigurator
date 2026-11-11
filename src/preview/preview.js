// Separat ladbare Webvorschau. Der Editor schickt Projekt und Modell per postMessage;
// danach läuft hier derselbe Player wie in der exportierten Website.

import { startPlayer } from '../core/player.js';
import { renderCss, renderSections } from '../export/page.js';

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent || event.data?.type !== 'load') return;
  const { project, model, throttle } = event.data;

  document.title = project.name;
  document.querySelector('#page-css').textContent = renderCss(project);
  document.querySelector('.page').innerHTML = renderSections(project);

  await startPlayer({
    project,
    canvas: document.querySelector('#stage'),
    modelBuffer: model || undefined,
    throttle: throttle || undefined,
    onFirstRender: (ms) => window.parent.postMessage({ type: 'first-render', ms }, '*'),
  });
});

window.parent.postMessage({ type: 'ready' }, '*');
