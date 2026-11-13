// Einstiegspunkt des HTML/CSS/JavaScript-Exports. Diese Datei wird zusammen mit Three.js und
// GSAP zu runtime/player.js gebaut und von index.html als gewöhnliches Skript geladen.
//
// Die Seite läuft auf einem Webserver und auch per Doppelklick auf index.html. Im zweiten Fall
// (file://) verbietet der Browser das Nachladen von Dateien; dann kommen Modell und Umgebung aus
// offline-assets.js, das sie als Text enthält.

import { startPlayer } from './player.js';

const MIME = { glb: 'model/gltf-binary', gltf: 'model/gltf+json', js: 'text/javascript', wasm: 'application/wasm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/**
 * Beantwortet Anfragen nach eingebetteten Dateien aus dem Speicher.
 * @param {Record<string, string>} files Pfad relativ zur Seite -> Inhalt als Base64
 */
function serveEmbeddedFiles(files) {
  const base = new URL('.', location.href).href;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href).href;
    const path = url.startsWith(base) ? decodeURIComponent(url.slice(base.length).split(/[?#]/)[0]) : null;
    if (path === null || !(path in files)) return original(input, init);
    const binary = atob(files[path]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const type = MIME[path.split('.').pop().toLowerCase()] || 'application/octet-stream';
    return Promise.resolve(new Response(bytes, { status: 200, headers: { 'Content-Type': type } }));
  };
}

function start() {
  const canvas = document.querySelector('#stage');
  const project = window.SCENE_PROJECT;
  if (!canvas || !project) {
    console.error('Die Szene kann nicht starten: #stage oder project.js fehlt.');
    return;
  }
  if (window.SCENE_FILES) serveEmbeddedFiles(window.SCENE_FILES);
  startPlayer({
    project,
    canvas,
    modelUrl: canvas.dataset.model || undefined,
    envUrl: canvas.dataset.env || undefined,
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
