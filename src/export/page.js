// Erzeugt das HTML und CSS der Seite aus dem Projekt.
// Der Editor-Viewport, die Vorschau und beide Exporte verwenden dieselbe Ausgabe.

import { BREAKPOINT_WIDTHS } from '../core/components.js';

/** Maskiert Text für HTML. Geschweifte Klammern werden ebenfalls maskiert (Astro-Vorlagen). */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

export const CONTAINER_TYPES = ['card', 'infobox'];
const CONTENT_KEYS = ['text', 'href', 'src', 'alt', 'action'];

// ---------- Vorlagen auflösen ----------

/**
 * Macht aus einer Komponente den Baum, der tatsächlich dargestellt wird.
 * Eine Instanz übernimmt Aufbau und Gestaltung ihrer Vorlage und setzt die eigenen Inhalte ein.
 * Jeder Knoten bekommt:
 *   id       eindeutige ID auf der Seite (bei Instanz-Kindern "<Instanz>--<Vorlagen-Element>")
 *   classes  IDs, deren CSS-Regeln gelten (bei Instanzen: Vorlage für das Layout, Instanz für die Position)
 */
export function resolveComponent(project, component) {
  if (component.type !== 'instance') {
    return {
      ...component,
      classes: [component.id],
      children: (component.children || []).map((child) => resolveComponent(project, child)).filter(Boolean),
    };
  }
  const template = project.templates.find((t) => t.id === component.templateId);
  if (!template) return null;

  const fill = (node, isRoot) => {
    const content = isRoot ? {} : (component.content && component.content[node.id]) || {};
    const resolved = { ...node };
    for (const key of CONTENT_KEYS) if (content[key] !== undefined) resolved[key] = content[key];
    resolved.id = isRoot ? component.id : `${component.id}--${node.id}`;
    resolved.classes = isRoot ? [node.id, component.id] : [node.id];
    resolved.children = (node.children || []).map((child) => fill(child, false));
    if (isRoot) {
      resolved.placement = component.placement;
      resolved.hotspotId = component.hotspotId;
      resolved.anchorMode = component.anchorMode;
      resolved.action = component.action;
      resolved.animation = component.animation;
      resolved.templateId = template.id;
    }
    return resolved;
  };
  return fill(template.root, true);
}

/** Alle Komponenten eines Abschnitts, aufgelöst. */
export function resolveSection(project, section) {
  return section.components.map((component) => resolveComponent(project, component)).filter(Boolean);
}

// ---------- HTML ----------

function animationAttributes(node, sectionId, free) {
  let attributes = '';
  const animation = node.animation;
  if (animation && animation.type !== 'none') {
    attributes += ` data-anim="${animation.type}" data-in="${animation.in[0]} ${animation.in[1]}"`;
    if (animation.out) attributes += ` data-out="${animation.out[0]} ${animation.out[1]}"`;
  }
  if (free) attributes += ` data-free data-for="${escapeHtml(sectionId)}"`;
  return attributes;
}

function textHtml(node) {
  const text = node.text ?? '';
  if (!node.animation || node.animation.type !== 'reveal') return escapeHtml(text).replace(/\n/g, '<br>');
  // Text-Reveal: jedes Wort einzeln, damit es nacheinander erscheinen kann.
  let index = 0;
  return text
    .split('\n')
    .map((line) =>
      line
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => `<span class="w" style="--i: ${index++}">${escapeHtml(word)}</span>`)
        .join(' '),
    )
    .join('<br>');
}

function wordCount(node) {
  return (node.text ?? '').split(/\s+/).filter(Boolean).length;
}

/** An einem Hotspot verankert? */
const isAnchored = (node) => node.placement === 'hotspot' && Boolean(node.hotspotId);

/** Liegt die Komponente über dem Canvas (frei oder am Hotspot) statt im Seitenlayout? */
const isOverlay = (node) => node.placement === 'free' || isAnchored(node);

/** Aktion als Text für data-action: "hotspot:<ID>" fährt die Kamera zum Hotspot, "close" schließt die Detailansicht. */
function actionValue(node) {
  if (!node.action) return '';
  if (node.action.type === 'close') return 'close';
  return node.action.hotspotId ? 'hotspot:' + node.action.hotspotId : '';
}

function renderNode(node, context, indent, depth) {
  const topLevel = depth === 0;
  const free = topLevel && node.placement === 'free';
  const anchored = topLevel && isAnchored(node);
  const classes = ['c', node.type, ...node.classes.map((id) => 'c-' + id), ...(free ? ['free'] : []), ...(anchored ? ['anchored'] : [])].join(' ');
  let attributes = `class="${classes}"` + animationAttributes(node, context.sectionId, free);
  if (anchored) {
    // Das Skript setzt die Komponente an die Stelle des Hotspots im Bild.
    attributes += ` data-hotspot="${escapeHtml(node.hotspotId)}" data-for="${escapeHtml(context.sectionId)}"`;
    if (node.anchorMode === 'open') attributes += ' data-anchor-mode="open"';
  }
  const action = actionValue(node);
  if (action) attributes += ` data-action="${escapeHtml(action)}"`;
  if (context.editor) attributes += ` data-c="${escapeHtml(node.id)}"`;
  if (node.animation && node.animation.type === 'reveal') attributes += ` style="--n: ${wordCount(node)}"`;

  if (CONTAINER_TYPES.includes(node.type)) {
    const children = node.children.map((child) => renderNode(child, context, indent + '  ', depth + 1));
    if (action) attributes += ' role="button" tabindex="0"';
    return [`${indent}<div ${attributes}>`, ...children, `${indent}</div>`].join('\n');
  }
  if (node.type === 'headline') {
    let tag = 'h3';
    if (topLevel) {
      tag = context.headlineSeen ? 'h2' : 'h1';
      context.headlineSeen = true;
    }
    return `${indent}<${tag} ${attributes}>${textHtml(node)}</${tag}>`;
  }
  if (node.type === 'button') {
    if (action) return `${indent}<button type="button" ${attributes}>${textHtml(node)}</button>`;
    return `${indent}<a ${attributes} href="${escapeHtml(node.href || '#')}">${textHtml(node)}</a>`;
  }
  if (node.type === 'image') {
    if (!node.src) return context.editor ? `${indent}<div ${attributes.replace('image', 'image placeholder')}>Bild wählen</div>` : '';
    return `${indent}<img ${attributes} src="${escapeHtml(context.assetUrl(node.src))}" alt="${escapeHtml(node.alt)}" loading="lazy">`;
  }
  return `${indent}<p ${attributes}>${textHtml(node)}</p>`;
}

/**
 * @param {object} [options]
 * @param {string} [options.indent]
 * @param {(name: string) => string} [options.assetUrl] Adresse eines Bildes
 * @param {boolean} [options.editor] IDs für die Auswahl im Editor mitgeben
 * @param {number} [options.only] nur diesen Abschnitt ausgeben (Editor-Viewport)
 */
function makeContext(options) {
  return {
    indent: options.indent ?? '    ',
    assetUrl: options.assetUrl ?? ((name) => 'images/' + encodeURI(name)),
    editor: options.editor ?? false,
    headlineSeen: false,
    sectionId: '',
  };
}

const included = (options, index) => options.only === undefined || options.only === index;

/** Die Abschnitte mit ihren Komponenten im Seitenlayout, als echte HTML-Elemente. */
export function renderSections(project, options = {}) {
  const context = makeContext(options);
  const { indent } = context;
  if (options.only > 0) context.headlineSeen = true;
  return project.sections
    .map((section, index) => {
      if (!included(options, index)) return null;
      context.sectionId = section.id;
      const flow = resolveSection(project, section)
        .filter((node) => !isOverlay(node))
        .map((node) => renderNode(node, context, indent + '    ', 0))
        .filter(Boolean);
      return [
        `${indent}<section class="section align-${section.align}" data-section="${escapeHtml(section.id)}" aria-label="${escapeHtml(section.name)}" style="min-height: ${section.height}vh">`,
        `${indent}  <div class="section-inner">`,
        ...flow,
        `${indent}  </div>`,
        `${indent}</section>`,
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

/** Die frei über dem 3D-Canvas platzierten und die an Hotspots verankerten Komponenten. Leer, wenn es keine gibt. */
export function renderFreeLayer(project, options = {}) {
  const context = makeContext(options);
  context.headlineSeen = true;
  const { indent } = context;
  const nodes = [];
  project.sections.forEach((section, index) => {
    if (!included(options, index)) return;
    context.sectionId = section.id;
    for (const node of resolveSection(project, section)) {
      if (isOverlay(node)) nodes.push(renderNode(node, context, indent + '  ', 0));
    }
  });
  if (nodes.length === 0 && !context.editor) return '';
  return [`${indent}<div class="free-layer">`, ...nodes.filter(Boolean), `${indent}</div>`].join('\n');
}

/** Die Hotspot-Punkte als Buttons: per Maus, Touch und Tastatur bedienbar. Leer, wenn es keine gibt. */
export function renderHotspotLayer(project, options = {}) {
  const indent = options.indent ?? '    ';
  if (project.hotspots.length === 0 && !options.editor) return '';
  const buttons = project.hotspots.map((hotspot) => {
    const label = hotspot.label ? `<span class="hotspot-label">${escapeHtml(hotspot.label)}</span>` : '';
    const scope = hotspot.sectionId ? ` data-for="${escapeHtml(hotspot.sectionId)}"` : '';
    return `${indent}  <button type="button" class="hotspot" data-hotspot="${escapeHtml(hotspot.id)}"${scope} aria-label="${escapeHtml(hotspot.name)}"><span class="hotspot-dot"></span>${label}</button>`;
  });
  return [`${indent}<div class="hotspot-layer">`, ...buttons, `${indent}</div>`].join('\n');
}

// ---------- CSS ----------

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance < 0.5;
}

const DISPLAY = { card: 'flex', infobox: 'flex', button: 'inline-block' };
const ALIGN_ITEMS = { left: 'flex-start', center: 'center', right: 'flex-end' };
const POSITION_KEYS = ['x', 'y', 'visible'];

/** CSS-Deklarationen für die gesetzten Werte einer Gestaltung. */
function declarations(style, type, keys) {
  const lines = [];
  for (const key of Object.keys(style)) {
    if (keys && !keys.includes(key)) continue;
    const value = style[key];
    if (value === undefined || value === null) continue;
    if (key === 'x') lines.push(`left: ${value}%;`);
    else if (key === 'y') lines.push(`top: ${value}%;`);
    else if (key === 'width') lines.push(`width: ${value}px;`);
    else if (key === 'fontSize') lines.push(`font-size: ${value}px;`);
    else if (key === 'visible') lines.push(`display: ${value ? DISPLAY[type] || 'block' : 'none'};`);
    else if (key === 'color') lines.push(`color: ${value};`);
    else if (key === 'background') lines.push(`background: ${value};`);
    else if (key === 'padding') lines.push(`padding: ${value}px;`);
    else if (key === 'radius') lines.push(`border-radius: ${value}px;`);
    else if (key === 'gap') lines.push(`gap: ${value}px;`);
    else if (key === 'align') {
      lines.push(`text-align: ${value};`);
      if (CONTAINER_TYPES.includes(type)) lines.push(`align-items: ${ALIGN_ITEMS[value]};`);
    }
  }
  return lines;
}

/** Sammelt je Breakpoint die Regeln aller Komponenten und Vorlagen. */
function componentRules(project) {
  const rules = { desktop: [], tablet: [], mobile: [] };
  const add = (id, type, component, keys) => {
    const sources = { desktop: component.style, tablet: component.overrides.tablet, mobile: component.overrides.mobile };
    for (const breakpoint of Object.keys(rules)) {
      const lines = declarations(sources[breakpoint] || {}, type, keys);
      if (lines.length > 0) rules[breakpoint].push({ selector: `.c.c-${id}`, lines });
    }
  };
  const visit = (component) => {
    if (component.type === 'instance') {
      const template = project.templates.find((t) => t.id === component.templateId);
      // Die Instanz selbst bestimmt nur Position und Sichtbarkeit.
      if (template) add(component.id, template.root.type, component, POSITION_KEYS);
      return;
    }
    add(component.id, component.type, component);
    (component.children || []).forEach(visit);
  };
  project.sections.forEach((section) => section.components.forEach(visit));
  // Vorlagen: Layout für alle Instanzen gemeinsam, ohne Position.
  const visitTemplate = (component, isRoot) => {
    const keys = isRoot ? Object.keys({ ...component.style, ...component.overrides.tablet, ...component.overrides.mobile }).filter((k) => k !== 'x' && k !== 'y') : undefined;
    add(component.id, component.type, component, keys);
    (component.children || []).forEach((child) => visitTemplate(child, false));
  };
  project.templates.forEach((template) => visitTemplate(template.root, true));
  return rules;
}

function ruleBlock(rules, indent) {
  return rules
    .map(({ selector, lines }) => `${indent}${selector} {\n${lines.map((line) => `${indent}  ${line}`).join('\n')}\n${indent}}`)
    .join('\n\n');
}

export function renderCss(project) {
  const background = project.settings.background;
  const dark = isDark(background);
  const rules = componentRules(project);
  const sections = [];
  if (rules.desktop.length > 0) sections.push('/* ---------- Komponenten ---------- */\n\n' + ruleBlock(rules.desktop, ''));
  if (rules.tablet.length > 0) {
    sections.push(`/* Tablet */\n@container (max-width: ${BREAKPOINT_WIDTHS.tablet}px) {\n${ruleBlock(rules.tablet, '  ')}\n}`);
  }
  if (rules.mobile.length > 0) {
    sections.push(`/* Mobile */\n@container (max-width: ${BREAKPOINT_WIDTHS.mobile}px) {\n${ruleBlock(rules.mobile, '  ')}\n}`);
  }

  return `.site {
  --background: ${background};
  --text: ${dark ? '#f4f4f2' : '#16181c'};
  --text-muted: ${dark ? 'rgba(244, 244, 242, 0.72)' : 'rgba(22, 24, 28, 0.72)'};
  --surface: ${dark ? 'rgba(30, 33, 39, 0.72)' : 'rgba(255, 255, 255, 0.78)'};
  --surface-line: ${dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)'};
  --button-background: ${dark ? '#f4f4f2' : '#16181c'};
  --button-text: ${dark ? '#16181c' : '#f4f4f2'};
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
}

.site *,
.site *::before,
.site *::after {
  box-sizing: border-box;
}

/* Die 3D-Szene liegt fest hinter dem Seiteninhalt. */
#stage {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* Breakpoints richten sich nach der Breite dieses Containers (Container Queries). */
.page {
  position: relative;
  z-index: 1;
  container-type: inline-size;
}

.section {
  display: flex;
  align-items: center;
  padding: 12vh 6cqi;
}

.section.align-center {
  justify-content: center;
}

.section.align-right {
  justify-content: flex-end;
}

.section-inner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
  max-width: 30rem;
}

.section.align-center .section-inner {
  align-items: center;
  text-align: center;
}

/* Frei platzierte Komponenten liegen fest über dem 3D-Canvas. */
.free-layer {
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  container-type: size;
}

.free-layer > .c {
  position: absolute;
  left: 50%;
  top: 40%;
  max-width: calc(100% - 2rem);
  pointer-events: auto;
}

.c {
  margin: 0;
}

.headline {
  font-size: clamp(1.9rem, 4.2cqi, 3.2rem);
  line-height: 1.08;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

h1.headline {
  font-size: clamp(2.4rem, 6cqi, 4.5rem);
}

.text {
  font-size: clamp(1rem, 1.4cqi, 1.2rem);
  color: var(--text-muted);
}

.image {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
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

.card,
.infobox {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  width: 22rem;
  max-width: 100%;
  padding: 1.5rem;
  border: 1px solid var(--surface-line);
  border-radius: 16px;
  background: var(--surface);
  backdrop-filter: blur(14px);
}

.infobox {
  width: 16rem;
  gap: 0.35rem;
  padding: 1rem 1.1rem;
  border-radius: 10px;
}

.card .headline,
.infobox .headline {
  font-size: 1.35rem;
  letter-spacing: -0.01em;
}

.card .text,
.infobox .text {
  font-size: 1rem;
}

.infobox .headline {
  font-size: 1rem;
}

.infobox .text {
  font-size: 0.9rem;
}

/* ---------- Hotspots ----------
   Das Skript setzt left/top jedes Punkts auf die Stelle des Bauteils im Bild. */

.hotspot-layer {
  position: fixed;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.hotspot {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
  translate: -15px -50%;
  visibility: hidden;
}

.hotspot-dot {
  width: 30px;
  height: 30px;
  border: 9px solid color-mix(in srgb, var(--button-background) 35%, transparent);
  border-radius: 50%;
  background: var(--button-background);
  background-clip: padding-box;
  transition: border-width 0.2s;
}

.hotspot:hover .hotspot-dot,
.hotspot.active .hotspot-dot {
  border-width: 6px;
}

.hotspot:focus-visible {
  outline: 3px solid var(--text);
  outline-offset: 2px;
  border-radius: 999px;
}

.hotspot-label {
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--surface-line);
  border-radius: 999px;
  background: var(--surface);
  backdrop-filter: blur(10px);
  font-size: 0.9rem;
  white-space: nowrap;
}

/* An einem Hotspot verankerte Komponenten stehen unter dem Punkt. */
.free-layer > .anchored {
  translate: -15px 26px;
  visibility: hidden;
}

button.button {
  border: 0;
  font: inherit;
  cursor: pointer;
}

[data-action] {
  cursor: pointer;
}

/* ---------- Scrollgesteuerte Animationen ----------
   --u läuft von 0 (unsichtbar) bis 1 (sichtbar) und wird beim Scrollen gesetzt. */

[data-anim] {
  --u: 1;
}

/* Frei platzierte Komponenten zeigt das Skript nur in ihrem Abschnitt. */
[data-free] {
  visibility: hidden;
}

[data-anim='fade'],
[data-anim^='slide'] {
  opacity: var(--u);
}

[data-anim='slide-up'] {
  transform: translateY(calc((1 - var(--u)) * 3rem));
}

[data-anim='slide-down'] {
  transform: translateY(calc((1 - var(--u)) * -3rem));
}

[data-anim='slide-left'] {
  transform: translateX(calc((1 - var(--u)) * 4rem));
}

[data-anim='slide-right'] {
  transform: translateX(calc((1 - var(--u)) * -4rem));
}

/* Text-Reveal: Die Wörter erscheinen nacheinander. */
[data-anim='reveal'] .w {
  opacity: clamp(0.12, calc(var(--u) * (var(--n) + 1) - var(--i)), 1);
}
${sections.length > 0 ? '\n' + sections.join('\n\n') + '\n' : ''}`;
}

/** Namen aller Bilder, die das Projekt verwendet. */
export function usedImages(project) {
  const names = new Set();
  const visit = (component) => {
    if (component.src) names.add(component.src);
    Object.values(component.content || {}).forEach((content) => content.src && names.add(content.src));
    (component.children || []).forEach(visit);
  };
  project.sections.forEach((section) => section.components.forEach(visit));
  project.templates.forEach((template) => visit(template.root));
  return [...names];
}
