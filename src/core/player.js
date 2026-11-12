// Der Player verbindet Seite und 3D-Szene: Er liest die Scrollposition, berechnet daraus
// den Zustand der Szene und rendert ihn. Editor-Vorschau und exportierte Website nutzen
// genau diese Datei.

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { evaluate } from './timeline.js';
import { measureSections, scrollToPos } from './scroll.js';
import { bindComponents, breakpointFor, resolveFraming } from './components.js';
import { createInteraction } from './interaction.js';
import { applyFraming, applyState, createStage, loadModel, renderStage, resizeStage, setBackground } from './stage.js';

gsap.registerPlugin(ScrollTrigger);

/** Wartet so lange, wie die Übertragung über die simulierte Verbindung dauern würde. */
async function simulateDownload(bytes, startedAt, throttle) {
  if (!throttle) return;
  const duration = throttle.latencyMs + ((bytes * 8) / (throttle.mbps * 1e6)) * 1000;
  const remaining = duration - (performance.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

/**
 * @param {object} options
 * @param {import('./types').Project} options.project
 * @param {HTMLCanvasElement} options.canvas
 * @param {string} [options.modelUrl] Adresse der Modelldatei
 * @param {ArrayBuffer} [options.modelBuffer] Modell direkt aus dem Speicher (Editor-Vorschau)
 * @param {{latencyMs: number, mbps: number}} [options.throttle] simulierte Verbindung
 * @param {(ms: number) => void} [options.onFirstRender] Zeit vom Seitenstart bis zum ersten Bild mit Modell
 */
export async function startPlayer({ project, canvas, modelUrl, modelBuffer, throttle, onFirstRender }) {
  const stage = createStage(canvas);
  setBackground(stage, project.settings.background);

  const sectionElements = document.querySelectorAll('[data-section]');
  const updateComponents = bindComponents(document, project.sections.map((section) => section.id));
  let breakpoint = 'desktop';
  const interaction = createInteraction({ stage, project, root: document, canvas, getBreakpoint: () => breakpoint });
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
    const smoothing = project.settings.scrollSmoothing || 0;
    if (smoothing > 0 && Math.abs(targetPos - currentPos) > 0.0005) {
      currentPos += (targetPos - currentPos) * (1 - smoothing);
      needsRender = true;
    } else if (currentPos !== targetPos) {
      currentPos = targetPos;
      needsRender = true;
    }
    // Mit Hotspots, Look At oder Follow wird jedes Bild neu gerechnet, sonst nur nach dem Scrollen.
    if (needsRender || interaction.live) {
      needsRender = false;
      interaction.reset();
      applyState(stage, evaluate(project, currentPos));
      interaction.update(dt, currentPos);
      updateComponents(currentPos);
      renderStage(stage);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (modelUrl || modelBuffer) {
    const startedAt = performance.now();
    const buffer = modelBuffer || (await (await fetch(modelUrl)).arrayBuffer());
    await simulateDownload(buffer.byteLength, startedAt, throttle);
    await loadModel(stage, buffer);
    interaction.bind();
    applyState(stage, evaluate(project, currentPos));
    interaction.update(0, currentPos);
    renderStage(stage);
    canvas.dataset.ready = 'true';
    // performance.now() zählt ab dem Start der Seite.
    requestAnimationFrame(() => onFirstRender && onFirstRender(performance.now()));
  }

  return { stage, interaction };
}
