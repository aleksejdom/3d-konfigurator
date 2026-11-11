// Erzeugt das HTML und CSS der Seite aus dem Projekt.
// Die Vorschau im Editor und beide Exporte verwenden dieselbe Ausgabe.

/** Maskiert Text für HTML. Geschweifte Klammern werden ebenfalls maskiert (Astro-Vorlagen). */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function renderElement(element, isFirstHeadline) {
  const text = escapeHtml(element.text).replace(/\n/g, '<br>');
  if (element.type === 'headline') return isFirstHeadline ? `<h1>${text}</h1>` : `<h2>${text}</h2>`;
  if (element.type === 'button') return `<a class="button" href="${escapeHtml(element.href || '#')}">${text}</a>`;
  return `<p>${text}</p>`;
}

/** Die Abschnitte als echte HTML-Elemente. */
export function renderSections(project, indent = '    ') {
  let headlineSeen = false;
  const sections = project.sections.map((section) => {
    const elements = section.elements.map((element) => {
      const first = element.type === 'headline' && !headlineSeen;
      if (first) headlineSeen = true;
      return `${indent}    ${renderElement(element, first)}`;
    });
    return [
      `${indent}<section class="section align-${section.align}" data-section="${escapeHtml(section.id)}" aria-label="${escapeHtml(section.name)}" style="min-height: ${section.height}vh">`,
      `${indent}  <div class="section-inner">`,
      ...elements,
      `${indent}  </div>`,
      `${indent}</section>`,
    ].join('\n');
  });
  return sections.join('\n');
}

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance < 0.5;
}

export function renderCss(project) {
  const background = project.settings.background;
  const dark = isDark(background);
  return `:root {
  --background: ${background};
  --text: ${dark ? '#f4f4f2' : '#16181c'};
  --text-muted: ${dark ? 'rgba(244, 244, 242, 0.72)' : 'rgba(22, 24, 28, 0.72)'};
  --button-background: ${dark ? '#f4f4f2' : '#16181c'};
  --button-text: ${dark ? '#16181c' : '#f4f4f2'};
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
}

/* Die 3D-Szene liegt fest hinter dem Seiteninhalt. */
#stage {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.page {
  position: relative;
  z-index: 1;
}

.section {
  display: flex;
  align-items: center;
  padding: 12vh 6vw;
}

.section.align-center {
  justify-content: center;
  text-align: center;
}

.section.align-right {
  justify-content: flex-end;
}

.section-inner {
  max-width: 30rem;
}

h1,
h2 {
  margin: 0 0 0.5em;
  line-height: 1.08;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

h1 {
  font-size: clamp(2.4rem, 6vw, 4.5rem);
}

h2 {
  font-size: clamp(1.9rem, 4.2vw, 3.2rem);
}

p {
  margin: 0 0 1.2em;
  font-size: clamp(1rem, 1.4vw, 1.2rem);
  color: var(--text-muted);
}

.button {
  display: inline-block;
  padding: 0.8em 1.5em;
  border-radius: 999px;
  background: var(--button-background);
  color: var(--button-text);
  font-weight: 600;
  text-decoration: none;
}

.button:focus-visible {
  outline: 3px solid var(--text);
  outline-offset: 3px;
}
`;
}
