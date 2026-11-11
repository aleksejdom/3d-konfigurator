// Zuordnung zwischen Scrollposition der Seite und Timeline-Position.
//
// Eine gedachte Leselinie wandert beim Scrollen vom oberen zum unteren Rand des Fensters.
// So durchläuft jeder Abschnitt, auch der letzte, seine relative Position von 0 % bis 100 %.

/**
 * @param {{top: number, height: number}[]} sections Lage der Abschnitte im Dokument (px)
 * @param {number} scrollY
 * @param {number} viewportHeight
 * @returns {number} pos = Abschnittsindex + relative Position
 */
export function scrollToPos(sections, scrollY, viewportHeight) {
  if (sections.length === 0) return 0;
  const last = sections[sections.length - 1];
  const docHeight = last.top + last.height;
  const maxScroll = Math.max(1, docHeight - viewportHeight);
  const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
  const line = scrollY + viewportHeight * progress;

  for (let i = 0; i < sections.length; i++) {
    const { top, height } = sections[i];
    if (line < top + height || i === sections.length - 1) {
      return i + Math.min(1, Math.max(0, (line - top) / Math.max(1, height)));
    }
  }
  return sections.length;
}

/** Umkehrung von scrollToPos: Scrollposition, an der die Timeline bei pos steht. */
export function posToScroll(sections, pos, viewportHeight) {
  if (sections.length === 0) return 0;
  const last = sections[sections.length - 1];
  const docHeight = last.top + last.height;
  const maxScroll = Math.max(1, docHeight - viewportHeight);
  const index = Math.min(sections.length - 1, Math.max(0, Math.floor(pos)));
  const line = sections[index].top + (pos - index) * sections[index].height;
  return Math.min(maxScroll, Math.max(0, line / (1 + viewportHeight / maxScroll)));
}

/** Liest die Lage der Abschnitte aus dem DOM. */
export function measureSections(elements) {
  return [...elements].map((el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top + window.scrollY, height: rect.height };
  });
}
