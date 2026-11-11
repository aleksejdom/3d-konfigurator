// Abschnittsgebundene Scroll-Timeline.
//
// Die Position auf der Timeline ist eine Zahl "pos" = Abschnittsindex + relative Position
// im Abschnitt. Beispiel: 1.6 = zweiter Abschnitt bei 60 %. Weil ein gespeicherter Punkt nur
// Abschnitt und relative Position kennt, bleibt er an seiner Stelle, wenn sich die
// Abschnittshöhe ändert.
//
// evaluate(project, pos) ist eine reine Funktion: Dieselbe Position ergibt immer denselben
// Zustand, egal ob vorwärts, rückwärts oder per Sprung dorthin gescrollt wurde.

import { ease } from './easing.js';

/** Standardlänge für das Ein- und Ausblenden lokaler Werte (in Abschnittslängen). */
export const DEFAULT_BLEND = 0.25;

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ---------- Interpolation ----------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  return '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

/** Mischt zwei Werte gleichen Typs (Zahl, Vektor oder Farbe). w = 0 ergibt a, w = 1 ergibt b. */
export function mix(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  if (typeof a === 'number') return a + (b - a) * w;
  if (typeof a === 'string') {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    return rgbToHex(ca.map((c, i) => c + (cb[i] - c) * w));
  }
  return a.map((c, i) => c + (b[i] - c) * w);
}

// ---------- Spuren aufbauen ----------

const trackCache = new WeakMap();

/**
 * Sortiert alle gespeicherten Werte pro Eigenschaft in zwei Ebenen:
 * - inherit: Kette vererbbarer Werte über die ganze Seite
 * - local:   pro Abschnitt die Werte, die nur dort gelten
 */
export function buildTracks(project) {
  const cached = trackCache.get(project);
  if (cached) return cached;

  const sectionIndex = new Map(project.sections.map((s, i) => [s.id, i]));
  const tracks = new Map();

  for (const kf of project.keyframes) {
    const index = sectionIndex.get(kf.sectionId);
    if (index === undefined) continue;
    const t = clamp01(kf.t);
    for (const [prop, kv] of Object.entries(kf.values)) {
      if (!tracks.has(prop)) tracks.set(prop, { inherit: [], local: new Map() });
      const track = tracks.get(prop);
      const point = { ...kv, t, section: index, p: index + t };
      if (kv.scope === 'local') {
        if (!track.local.has(index)) track.local.set(index, []);
        track.local.get(index).push(point);
      } else {
        track.inherit.push(point);
      }
    }
  }

  for (const track of tracks.values()) {
    track.inherit.sort((a, b) => a.p - b.p);
    for (const points of track.local.values()) points.sort((a, b) => a.p - b.p);
    track.localSections = [...track.local.keys()].sort((a, b) => a - b);
  }

  trackCache.set(project, tracks);
  return tracks;
}

// ---------- Auswertung ----------

/** Läuft eine sortierte Punktliste ab und interpoliert zwischen dem Punkt davor und danach. */
function walk(points, startPoint, pos) {
  let prev = startPoint;
  for (const point of points) {
    if (pos >= point.p) {
      prev = point;
      continue;
    }
    // Der Übergang endet am Punkt. Ohne eigene Länge beginnt er am vorherigen Punkt.
    const start = point.transition != null ? Math.max(prev.p, point.p - point.transition) : prev.p;
    if (pos <= start) return prev.value;
    return mix(prev.value, point.value, ease(point.easing, (pos - start) / (point.p - start)));
  }
  return prev.value;
}

/** Wert aus der Kette vererbbarer Punkte. Vor dem ersten Punkt gilt der Ausgangswert. */
function evalInherit(points, base, pos) {
  if (points.length === 0) return base;
  return walk(points, { p: 0, value: base !== undefined ? base : points[0].value }, pos);
}

/**
 * Legt die lokalen Werte eines Abschnitts über den darunterliegenden Wert "under".
 * Vor dem ersten lokalen Punkt wird eingeblendet, nach dem letzten wieder ausgeblendet.
 * "under" ist der Zustand ohne diesen Abschnitt, also der Wert des nächsten Abschnitts
 * oder der zuvor vererbte Wert.
 */
function applyLocal(points, under, pos, sectionCount) {
  const first = points[0];
  const last = points[points.length - 1];
  const section = first.section;

  const entryLength = first.transition != null ? first.transition : first.t > 0 ? first.t : DEFAULT_BLEND;
  const entryStart = first.p - entryLength;

  const isLastSection = section === sectionCount - 1;
  const exitLength = last.exit != null ? last.exit : DEFAULT_BLEND;
  const exitStart = isLastSection ? Infinity : section + Math.max(last.t, 1 - exitLength);
  const exitEnd = exitStart + exitLength;

  if (pos <= entryStart || pos >= exitEnd) return under;

  if (pos < first.p) {
    return mix(under, first.value, ease(first.easing, (pos - entryStart) / entryLength));
  }
  if (pos <= last.p) return walk(points, first, pos);
  if (pos <= exitStart) return last.value;
  return mix(last.value, under, ease('easeInOut', (pos - exitStart) / exitLength));
}

/** Wert einer einzelnen Eigenschaft an der Position pos. */
export function evaluateProp(track, base, pos, sectionCount) {
  let value = evalInherit(track.inherit, base, pos);
  for (const section of track.localSections) {
    value = applyLocal(track.local.get(section), value, pos, sectionCount);
  }
  return value;
}

/**
 * Zustand der ganzen Szene an der Position pos.
 * @param {import('./types').Project} project
 * @param {number} pos Abschnittsindex + relative Position, z. B. 1.6
 * @returns {Record<string, import('./types').Value>}
 */
export function evaluate(project, pos) {
  const tracks = buildTracks(project);
  const sectionCount = project.sections.length;
  const p = Math.min(sectionCount, Math.max(0, pos));
  const state = { ...project.base };
  for (const [prop, track] of tracks) {
    const value = evaluateProp(track, project.base[prop], p, sectionCount);
    if (value !== undefined) state[prop] = value;
  }
  return state;
}

/** Zerlegt pos in Abschnittsindex und relative Position. */
export function splitPos(project, pos) {
  const count = project.sections.length;
  if (count === 0) return { index: 0, t: 0 };
  const p = Math.min(count, Math.max(0, pos));
  const index = Math.min(count - 1, Math.floor(p));
  return { index, t: p - index };
}
