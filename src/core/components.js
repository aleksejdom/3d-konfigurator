// Breakpoints und scrollgesteuerte Animationen der HTML-Komponenten.
//
// Jede animierte Komponente bekommt pro Bild einen Fortschritt --u zwischen 0 und 1 gesetzt.
// Das CSS der Seite leitet daraus Deckkraft und Verschiebung ab. Der Fortschritt hängt nur
// von der Scrollposition ab und läuft deshalb beim Zurückscrollen rückwärts.

/** Bis zu dieser Breite (px) gilt der jeweilige Breakpoint. Dieselben Werte stehen im CSS. */
export const BREAKPOINT_WIDTHS = { tablet: 1024, mobile: 640 };

export function breakpointFor(width) {
  if (width <= BREAKPOINT_WIDTHS.mobile) return 'mobile';
  if (width <= BREAKPOINT_WIDTHS.tablet) return 'tablet';
  return 'desktop';
}

/** Wert für einen Breakpoint: Desktop, überschrieben von Tablet, überschrieben von Mobile. */
export function cascade(base, overrides, breakpoint) {
  return {
    ...base,
    ...(breakpoint !== 'desktop' ? overrides.tablet : null),
    ...(breakpoint === 'mobile' ? overrides.mobile : null),
  };
}

/** Kameraausschnitt für einen Breakpoint. */
export function resolveFraming(project, breakpoint) {
  return { zoom: 1, shiftX: 0, shiftY: 0, ...cascade(project.framing.desktop, project.framing, breakpoint) };
}

const smooth = (u) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

const ramp = (t, from, to) => (to > from ? smooth((t - from) / (to - from)) : t >= to ? 1 : 0);

/**
 * Fortschritt einer Komponente.
 * @param {number} t relative Position im Abschnitt der Komponente (kann außerhalb 0..1 liegen)
 * @param {[number, number] | null} inRange Einblenden von/bis
 * @param {[number, number] | null} outRange Ausblenden von/bis
 * @param {boolean} free frei platzierte Komponenten sind nur in ihrem Abschnitt sichtbar
 */
export function animationProgress(t, inRange, outRange, free) {
  if (free && (t < 0 || t > 1)) return 0;
  const shown = inRange ? ramp(t, inRange[0], inRange[1]) : 1;
  const hidden = outRange ? ramp(t, outRange[0], outRange[1]) : 0;
  return Math.min(shown, 1 - hidden);
}

const parseRange = (text) => (text ? text.split(' ').map(Number) : null);

/**
 * Sucht alle animierten und frei platzierten Komponenten unter root.
 * @param {ParentNode} root
 * @param {string[]} sectionIds IDs der Abschnitte in Seitenreihenfolge
 * @returns {(pos: number) => void} Funktion, die den Fortschritt für eine Timeline-Position setzt
 */
export function bindComponents(root, sectionIds, { reduced = false } = {}) {
  const items = [...root.querySelectorAll('[data-anim], [data-free]')].map((element) => {
    const sectionId = element.dataset.for || element.closest('[data-section]')?.dataset.section;
    return {
      element,
      index: sectionIds.indexOf(sectionId),
      inRange: parseRange(element.dataset.in),
      outRange: parseRange(element.dataset.out),
      free: 'free' in element.dataset,
      last: -1,
    };
  });

  return (pos) => {
    for (const item of items) {
      let u = Math.round(animationProgress(pos - item.index, item.inRange, item.outRange, item.free) * 1000) / 1000;
      // Reduzierte Bewegung: Komponenten stehen ohne Einblendung an ihrem Platz.
      if (reduced) u = item.free ? (u > 0 ? 1 : 0) : 1;
      if (u === item.last) continue;
      item.last = u;
      item.element.style.setProperty('--u', String(u));
      if (item.free) item.element.style.visibility = u > 0 ? 'visible' : 'hidden';
    }
  };
}
