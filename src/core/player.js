// Der Player verbindet Seite und 3D-Szene: Er liest die Scrollposition, berechnet daraus
// den Zustand der Szene und rendert ihn. Editor-Vorschau und exportierte Website nutzen
// genau diese Datei.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { evaluate } from './timeline.js';
import { measureSections, scrollToPos } from './scroll.js';
import { bindComponents, breakpointFor, resolveFraming } from './components.js';
import { createInteraction } from './interaction.js';
import { createConfigurator } from './configurator.js';
import { createDataBindings } from './data.js';
import { applyEnvironment, applyFraming, applyHierarchy, applyState, createStage, loadEnvironment, loadModel, renderStage, resizeStage, syncLights } from './stage.js';

gsap.registerPlugin(ScrollTrigger);

/** Wartet so lange, wie die Übertragung über die simulierte Verbindung dauern würde. */
async function simulateDownload(bytes, startedAt, throttle, onProgress) {
  if (!throttle) return;
  const duration = throttle.latencyMs + ((bytes * 8) / (throttle.mbps * 1e6)) * 1000;
  const timer = setInterval(() => onProgress(Math.min(0.99, (performance.now() - startedAt) / duration)), 80);
  const remaining = duration - (performance.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  clearInterval(timer);
}

/** Lädt eine Datei und meldet den Fortschritt (0 bis 1), sofern der Server die Größe nennt. */
async function download(url, onProgress) {
  const response = await fetch(url);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || !total) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(0.99, received / total));
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data.buffer;
}

/**
 * Ladeanzeige der Seite (.loader). Ohne bekannten Fortschritt läuft sie als Animation,
 * mit Fortschritt zeigt sie den Anteil als Ring oder Balken und als Zahl.
 * @param {HTMLElement | null} element
 */
function createLoader(element) {
  const label = element && element.querySelector('.loader-value');
  return {
    progress(fraction) {
      if (!element) return;
      element.classList.add('has-progress');
      element.style.setProperty('--progress', String(fraction));
      element.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
      if (label) label.textContent = Math.round(fraction * 100) + ' %';
    },
    done() {
      if (!element) return;
      element.classList.add('is-done');
      // Nach dem Ausblenden entfernen, damit die Anzeige keine Klicks abfängt und nicht weiter animiert.
      setTimeout(() => element.remove(), 700);
    },
  };
}

/**
 * @param {object} options
 * @param {import('./types').Project} options.project
 * @param {HTMLCanvasElement} options.canvas
 * @param {string} [options.modelUrl] Adresse der Modelldatei
 * @param {ArrayBuffer} [options.modelBuffer] Modell direkt aus dem Speicher (Editor-Vorschau)
 * @param {{latencyMs: number, mbps: number}} [options.throttle] simulierte Verbindung
 * @param {(ms: number) => void} [options.onFirstRender] Zeit vom Seitenstart bis zum ersten Bild mit Modell
 * @param {(name: string) => string | undefined} [options.resourceUrl] Adresse einer Begleitdatei des Modells (Editor-Vorschau)
 * @param {string} [options.envUrl] Adresse des HDRI oder Panoramas
 * @param {string} [options.dracoPath] Ordner mit dem Draco-Decoder
 * @param {boolean} [options.reducedMotion] reduzierte Bewegung erzwingen oder abschalten (Editor-Vorschau)
 * @param {'test' | 'live'} [options.dataMode] Digitaler Zwilling: Testdaten oder Live-Quelle erzwingen (Editor-Vorschau)
 */
export async function startPlayer({
  project,
  canvas,
  modelUrl,
  modelBuffer,
  resourceUrl,
  envUrl,
  dracoPath,
  throttle,
  onFirstRender,
  dataMode,
  reducedMotion,
}) {
  const stage = createStage(canvas);
  syncLights(stage, project);
  applyEnvironment(stage, project.settings);

  // Reduzierte Bewegung: Wunsch des Geräts, sofern das Projekt ihn beachtet.
  const reduced =
    project.settings.reducedMotion !== 'ignore' &&
    (reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.documentElement.classList.toggle('reduced-motion', reduced);

  // HDRI oder Panorama als Umgebung; bis es geladen ist, gilt die Studio-Umgebung.
  const environmentFile = project.settings.environment.file;
  const environmentReady = environmentFile && envUrl
    ? loadEnvironment(stage, envUrl, environmentFile)
        .then(() => applyEnvironment(stage, project.settings))
        .catch(() => console.warn('Die Umgebung konnte nicht geladen werden:', environmentFile))
    : Promise.resolve();

  const sectionElements = document.querySelectorAll('[data-section]');
  const updateComponents = bindComponents(document, project.sections.map((section) => section.id), {
    reduced,
    pinned: project.settings.textMode !== 'flow',
  });
  let breakpoint = 'desktop';
  const interaction = createInteraction({ stage, project, root: document, canvas, getBreakpoint: () => breakpoint, reduced });
  const configurator = createConfigurator({
    stage,
    project,
    root: document,
    canvas,
    openHotspot: interaction.openHotspot,
    closeDetail: interaction.closeDetail,
    reduced,
  });
  // Digitaler Zwilling: Daten der Quelle auf Modell und Oberfläche übertragen.
  const data = createDataBindings({ stage, project, root: document, configurator, mode: dataMode });
  let layout = [];
  let targetPos = 0;
  let currentPos = 0;
  let needsRender = true;

  const readScroll = () => {
    targetPos = scrollToPos(layout, window.scrollY, window.innerHeight);
    needsRender = true;
  };

  const measure = () => {
    breakpoint = breakpointFor(canvas.clientWidth);
    applyFraming(stage, resolveFraming(project, breakpoint));
    resizeStage(stage, canvas.clientWidth, canvas.clientHeight);
    layout = measureSections(sectionElements);
    readScroll();
  };

  // ScrollTrigger meldet jede Änderung der Scrollposition und jedes Neuvermessen der Seite.
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: readScroll, onRefresh: measure });
  window.addEventListener('resize', measure);
  // Ändert sich die Höhe eines Abschnitts (mehr Inhalt, anderer Breakpoint), wird neu vermessen.
  const observer = new ResizeObserver(measure);
  sectionElements.forEach((el) => observer.observe(el));
  measure();
  currentPos = targetPos;

  let lastTime = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    const smoothing = reduced ? 0 : project.settings.scrollSmoothing || 0;
    if (smoothing > 0 && Math.abs(targetPos - currentPos) > 0.0005) {
      currentPos += (targetPos - currentPos) * (1 - smoothing);
      needsRender = true;
    } else if (currentPos !== targetPos) {
      currentPos = targetPos;
      needsRender = true;
    }
    // Mit Hotspots, Look At oder Follow wird jedes Bild neu gerechnet, sonst nur nach dem Scrollen,
    // nach einer Wahl im Konfigurator oder solange ein Animationsclip läuft.
    if (needsRender || interaction.live || configurator.live || data.live) {
      needsRender = false;
      interaction.reset();
      applyState(stage, evaluate(project, currentPos));
      data.update(dt);
      configurator.update(dt, currentPos);
      interaction.update(dt, currentPos);
      updateComponents(currentPos);
      renderStage(stage);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const loader = createLoader(document.querySelector('.loader'));
  if (modelUrl || modelBuffer) {
    const startedAt = performance.now();
    const buffer = modelBuffer || (await download(modelUrl, loader.progress));
    await simulateDownload(buffer.byteLength, startedAt, throttle, loader.progress);
    loader.progress(1);
    await loadModel(stage, buffer, {
      // Begleitdateien eines .gltf liegen im Ordner der Modelldatei.
      path: modelUrl ? modelUrl.slice(0, modelUrl.lastIndexOf('/') + 1) : '',
      resourceUrl,
      dracoPath,
    });
    // Gruppen und Eltern-Kind-Beziehungen aus dem Editor
    applyHierarchy(stage, project.hierarchy);
    await environmentReady;
    interaction.bind();
    applyState(stage, evaluate(project, currentPos));
    configurator.update(0, currentPos);
    interaction.update(0, currentPos);
    renderStage(stage);
    canvas.dataset.ready = 'true';
    // Blendet Posterbild und Ladeanzeige aus.
    document.documentElement.classList.add('is-ready');
    loader.done();
    // performance.now() zählt ab dem Start der Seite.
    requestAnimationFrame(() => onFirstRender && onFirstRender(performance.now()));
  } else {
    loader.done();
  }

  data.feed.start();
  return { stage, interaction, configurator, data };
}
