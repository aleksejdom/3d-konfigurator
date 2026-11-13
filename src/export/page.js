// Erzeugt das HTML und CSS der Seite aus dem Projekt.
// Der Editor-Viewport, die Vorschau und beide Exporte verwenden dieselbe Ausgabe.

import { BREAKPOINT_WIDTHS, cascade } from '../core/components.js';
import { actionToString } from '../core/actions.js';

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
const fieldOf = (project, node) => (node.fieldId && project.data ? project.data.fields.find((field) => field.id === node.fieldId) : undefined);
const groupOf = (project, node) => (node.groupId ? (project.variantGroups || []).find((group) => group.id === node.groupId) : undefined);

export function resolveComponent(project, component) {
  if (component.type !== 'instance') {
    return {
      ...component,
      group: groupOf(project, component),
      field: fieldOf(project, component),
      classes: [component.id],
      children: (component.children || []).map((child) => resolveComponent(project, child)).filter(Boolean),
    };
  }
  const template = project.templates.find((t) => t.id === component.templateId);
  if (!template) return null;

  const fill = (node, isRoot) => {
    const content = isRoot ? {} : (component.content && component.content[node.id]) || {};
    const resolved = { ...node, group: groupOf(project, node), field: fieldOf(project, node) };
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

/** Aktion als Text für data-action, z. B. "hotspot:<ID>" oder "select:<Gruppe>:<Wahl>" (siehe core/actions.js). */
const actionValue = (node) => actionToString(node.action);

/** Auswahlliste einer Variantengruppe. Das Skript stellt die aktive Wahl ein und sperrt nicht verfügbare Varianten. */
function renderSelect(node, attributes, indent) {
  const group = node.group;
  if (!group) return `${indent}<select ${attributes} disabled><option>Keine Gruppe gewählt</option></select>`;
  const options = group.options.map((option) => `${indent}  <option value="${escapeHtml(option.id)}">${escapeHtml(option.name)}</option>`);
  return [`${indent}<select ${attributes} data-group="${escapeHtml(group.id)}" aria-label="${escapeHtml(group.name)}">`, ...options, `${indent}</select>`].join('\n');
}

/** Varianten-Slider: Wechsel per Pfeil-Schaltflächen, Punkten, Wischen und Pfeiltasten. */
function renderSlider(node, attributes, indent) {
  const group = node.group;
  if (!group) return `${indent}<div ${attributes}><span class="variant-item is-active">Keine Gruppe gewählt</span></div>`;
  const id = escapeHtml(group.id);
  const items = group.options.map((option) => `${indent}    <span class="variant-item" data-option="${escapeHtml(option.id)}">${escapeHtml(option.name)}</span>`);
  const dots = group.options.map(
    (option) => `${indent}    <button type="button" class="variant-dot" data-action="select:${id}:${escapeHtml(option.id)}" aria-label="${escapeHtml(option.name)}"></button>`,
  );
  return [
    `${indent}<div ${attributes} data-group="${id}" role="group" aria-label="${escapeHtml(group.name)}" tabindex="0">`,
    `${indent}  <button type="button" class="variant-arrow" data-action="prev:${id}" aria-label="Vorherige Variante">&#8249;</button>`,
    `${indent}  <div class="variant-items" aria-live="polite">`,
    ...items,
    `${indent}  </div>`,
    `${indent}  <button type="button" class="variant-arrow" data-action="next:${id}" aria-label="Nächste Variante">&#8250;</button>`,
    `${indent}  <div class="variant-dots">`,
    ...dots,
    `${indent}  </div>`,
    `${indent}</div>`,
  ].join('\n');
}

function renderNode(node, context, indent, depth) {
  const topLevel = depth === 0;
  const free = topLevel && node.placement === 'free';
  const anchored = topLevel && isAnchored(node);
  const kind = node.type === 'slider' ? ['slider', 'variant-slider'] : [node.type];
  const classes = ['c', ...kind, ...node.classes.map((id) => 'c-' + id), ...(free ? ['free'] : []), ...(anchored ? ['anchored'] : [])].join(' ');
  let attributes = `class="${classes}"` + animationAttributes(node, context.sectionId, free);
  if (anchored) {
    // Das Skript setzt die Komponente an die Stelle des Hotspots im Bild.
    attributes += ` data-hotspot="${escapeHtml(node.hotspotId)}" data-for="${escapeHtml(context.sectionId)}"`;
    if (node.anchorMode === 'open') attributes += ' data-anchor-mode="open"';
  }
  // Digitaler Zwilling: Das Skript trägt Wert, Stufe (data-level) und "veraltet" (data-stale) ein.
  if (node.field) attributes += ` data-field="${escapeHtml(node.field.id)}"`;
  if (node.type === 'connection') attributes += ' data-connection="test" role="status"';
  const action = actionValue(node);
  if (action) attributes += ` data-action="${escapeHtml(action)}"`;
  if (context.editor) attributes += ` data-c="${escapeHtml(node.id)}"`;
  if (node.animation && node.animation.type === 'reveal') attributes += ` style="--n: ${wordCount(node)}"`;

  if (CONTAINER_TYPES.includes(node.type)) {
    const children = node.children.map((child) => renderNode(child, context, indent + '  ', depth + 1));
    if (action) attributes += ' role="button" tabindex="0"';
    return [`${indent}<div ${attributes}>`, ...children, `${indent}</div>`].join('\n');
  }
  if (node.type === 'value') {
    const field = node.field;
    const unit = field && field.unit ? ` <span class="value-unit">${escapeHtml(field.unit)}</span>` : '';
    return [
      `${indent}<div ${attributes}>`,
      `${indent}  <span class="value-label">${escapeHtml(field ? field.label : 'Kein Datenfeld gewählt')}</span>`,
      `${indent}  <span class="value-reading"><span data-field-value>–</span>${unit}</span>`,
      `${indent}</div>`,
    ].join('\n');
  }
  if (node.type === 'status') {
    return [
      `${indent}<div ${attributes}>`,
      `${indent}  <span class="status-dot" aria-hidden="true"></span>`,
      `${indent}  <span class="status-label">${escapeHtml(node.field ? node.field.label : 'Kein Datenfeld gewählt')}</span>`,
      `${indent}  <strong data-field-text>–</strong>`,
      `${indent}</div>`,
    ].join('\n');
  }
  if (node.type === 'connection') {
    return [
      `${indent}<div ${attributes}>`,
      `${indent}  <span class="status-dot" aria-hidden="true"></span>`,
      `${indent}  <span data-connection-text>Testdaten</span>`,
      `${indent}  <span class="connection-time">· Stand <time data-connection-time>–</time></span>`,
      `${indent}</div>`,
    ].join('\n');
  }
  if (node.type === 'select') return renderSelect(node, attributes, indent);
  if (node.type === 'slider') return renderSlider(node, attributes, indent);
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
 * @param {number | number[]} [options.only] nur diese Abschnitte ausgeben (Editor-Viewport)
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

const included = (options, index) => options.only === undefined || [].concat(options.only).includes(index);

/** Die Abschnitte mit ihren Komponenten im Seitenlayout, als echte HTML-Elemente. */
export function renderSections(project, options = {}) {
  const context = makeContext(options);
  const { indent } = context;
  if (options.only !== undefined && Math.min(...[].concat(options.only)) > 0) context.headlineSeen = true;
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
    const field = hotspot.fieldId ? ` data-field="${escapeHtml(hotspot.fieldId)}"` : '';
    return `${indent}  <button type="button" class="hotspot" data-hotspot="${escapeHtml(hotspot.id)}"${scope}${field} aria-label="${escapeHtml(hotspot.name)}"><span class="hotspot-dot"></span>${label}</button>`;
  });
  return [`${indent}<div class="hotspot-layer">`, ...buttons, `${indent}</div>`].join('\n');
}

// ---------- CSS ----------

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance < 0.5;
}

const DISPLAY = { card: 'flex', infobox: 'flex', button: 'inline-block', select: 'inline-block', slider: 'grid', value: 'grid', status: 'flex', connection: 'flex' };
const ALIGN_ITEMS = { left: 'flex-start', center: 'center', right: 'flex-end' };
const POSITION_KEYS = ['x', 'y', 'anchorX', 'anchorY', 'visible'];
const PLACE_KEYS = ['x', 'y', 'anchorX', 'anchorY'];

/** Schriften zur Auswahl. Eigene Schriftdateien des Projekts heißen "font:<ID>". */
export const FONT_STACKS = {
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  grotesk: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  humanist: "'Segoe UI', Candara, 'Trebuchet MS', Verdana, sans-serif",
  geometric: "Avenir, Montserrat, 'Century Gothic', Corbel, sans-serif",
  rounded: "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, 'Arial Rounded MT Bold', sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  transitional: "Charter, 'Bitstream Charter', Cambria, 'Times New Roman', serif",
  slab: "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', serif",
  mono: "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace",
};

/** CSS-Wert für eine gewählte Schrift. */
export function fontFamily(project, key) {
  if (!key) return null;
  if (key.startsWith('font:')) {
    const font = (project.fonts || []).find((f) => f.id === key.slice(5));
    return font ? `'${font.name.replace(/['\\]/g, '')}', ${FONT_STACKS.system}` : null;
  }
  return FONT_STACKS[key] || null;
}

const sides = (value) => (Array.isArray(value) ? value.map((n) => `${n}px`).join(' ') : `${value}px`);

/**
 * Position einer frei platzierten Komponente. Sie hängt an einem Anker: horizontal am linken Rand, an der
 * Mitte oder am rechten Rand des Inhaltsbereichs (Inner-Wrapper), vertikal oben, mittig oder unten im Bild.
 * x und y sind der Abstand zum Anker in px. So bleiben Abstände bei jeder Fenstergröße gleich.
 * --dx und --dy verschieben die Komponente während des Ziehens im Editor.
 */
export function placementLines(style) {
  const ax = style.anchorX || 'left';
  const ay = style.anchorY || 'center';
  const x = Math.round(style.x || 0);
  const y = Math.round(style.y || 0);
  const lines = [];
  if (ax === 'right') lines.push('left: auto;', `right: calc(var(--wrap) - ${x}px - var(--dx, 0px));`);
  else lines.push(`left: calc(${ax === 'center' ? '50%' : 'var(--wrap)'} + ${x}px + var(--dx, 0px));`, 'right: auto;');
  if (ay === 'bottom') lines.push('top: auto;', `bottom: calc(${-y}px - var(--dy, 0px));`);
  else lines.push(`top: calc(${ay === 'center' ? '50%' : '0px'} + ${y}px + var(--dy, 0px));`, 'bottom: auto;');
  lines.push(`translate: ${ax === 'center' ? '-50%' : '0'} ${ay === 'center' ? '-50%' : '0'};`);
  return lines;
}

/** CSS-Deklarationen für die gesetzten Werte einer Gestaltung. */
function declarations(project, style, type, keys) {
  const lines = [];
  for (const key of Object.keys(style)) {
    if (keys && !keys.includes(key)) continue;
    const value = style[key];
    if (value === undefined || value === null) continue;
    if (PLACE_KEYS.includes(key)) continue;
    else if (key === 'width') lines.push(`width: ${value}px;`);
    else if (key === 'fontSize') lines.push(`font-size: ${value}px;`);
    else if (key === 'fontFamily') {
      const family = fontFamily(project, value);
      if (family) lines.push(`font-family: ${family};`);
    } else if (key === 'fontWeight') lines.push(`font-weight: ${value};`);
    else if (key === 'lineHeight') lines.push(`line-height: ${value};`);
    else if (key === 'letterSpacing') lines.push(`letter-spacing: ${value}em;`);
    else if (key === 'visible') lines.push(`display: ${value ? DISPLAY[type] || 'block' : 'none'};`);
    else if (key === 'color') lines.push(`color: ${value};`);
    else if (key === 'background') lines.push(`background: ${value};`);
    else if (key === 'padding') lines.push(`padding: ${sides(value)};`);
    else if (key === 'margin') lines.push(`margin: ${sides(value)};`);
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
  const add = (id, type, component, keys, free) => {
    const sources = { desktop: component.style, tablet: component.overrides.tablet, mobile: component.overrides.mobile };
    for (const breakpoint of Object.keys(rules)) {
      const own = sources[breakpoint] || {};
      const lines = declarations(project, own, type, keys);
      // Frei platziert: Position aus den am Breakpoint geltenden Werten, sobald dort einer davon gesetzt ist.
      if (free && (breakpoint === 'desktop' || PLACE_KEYS.some((key) => own[key] !== undefined))) {
        lines.unshift(...placementLines(cascade(component.style, component.overrides, breakpoint)));
      }
      if (lines.length > 0) rules[breakpoint].push({ selector: `.c.c-${id}`, lines });
    }
  };
  const visit = (component, top) => {
    if (component.type === 'instance') {
      const template = project.templates.find((t) => t.id === component.templateId);
      // Die Instanz selbst bestimmt nur Position und Sichtbarkeit.
      if (template) add(component.id, template.root.type, component, POSITION_KEYS, top && component.placement === 'free');
      return;
    }
    add(component.id, component.type, component, undefined, top && component.placement === 'free');
    (component.children || []).forEach((child) => visit(child, false));
  };
  project.sections.forEach((section) => section.components.forEach((component) => visit(component, true)));
  // Vorlagen: Layout für alle Instanzen gemeinsam, ohne Position.
  const visitTemplate = (component, isRoot) => {
    const keys = isRoot ? Object.keys({ ...component.style, ...component.overrides.tablet, ...component.overrides.mobile }).filter((k) => !PLACE_KEYS.includes(k)) : undefined;
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

/**
 * Feste Texte (settings.textMode "pinned"): Die Abschnitte geben nur die Scrollstrecke vor. Ihre Textspalte
 * steht fest im Bild. Das Skript setzt --text-opacity und --text-shift: Der Text ist sichtbar, solange sein
 * Abschnitt aktiv ist, und gleitet beim Wechsel zum nächsten Abschnitt aus dem Bild.
 */
const PINNED_CSS = `
/* Feste Texte: Die Textspalte steht im Bild, der Abschnitt ist nur Scrollstrecke. */
.section {
  padding: 0;
}

.section-inner {
  position: fixed;
  top: 0;
  bottom: 0;
  left: var(--page-left);
  width: min(100%, var(--page-width));
  justify-content: center;
  max-width: none;
  padding: 12vh var(--wrap);
  pointer-events: none;
  opacity: var(--text-opacity, 0);
  transform: translateY(var(--text-shift, 0px));
  visibility: hidden;
}

/* Vor dem Start des Skripts ist der Text des ersten Abschnitts zu sehen. */
.section:first-child .section-inner {
  --text-opacity: 1;
  visibility: visible;
}

.section-inner > * {
  max-width: min(30rem, 100%);
  pointer-events: auto;
}

.section.align-right .section-inner {
  align-items: flex-end;
}
`;

/**
 * @font-face-Regeln für die Schriftdateien des Projekts.
 * @param {(file: string) => string} assetUrl Adresse einer Schriftdatei
 */
export function renderFontFaces(project, assetUrl = (file) => 'fonts/' + file) {
  return (project.fonts || [])
    .map((font) => `@font-face {\n  font-family: '${font.name.replace(/['\\]/g, '')}';\n  src: url('${assetUrl(font.file)}');\n  font-display: swap;\n}\n\n`)
    .join('');
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

  const pinned = project.settings.textMode !== 'flow';
  const layout = { pageWidth: 0, innerWidth: 1200, padding: 24, ...project.settings.layout };
  const levels = (project.data && project.data.levelColors) || { ok: '#3ecf8e', warn: '#f5a623', alarm: '#e5484d', off: '#8b9099' };

  return `.site {
  --background: ${background};
  --text: ${dark ? '#f4f4f2' : '#16181c'};
  --text-muted: ${dark ? 'rgba(244, 244, 242, 0.72)' : 'rgba(22, 24, 28, 0.72)'};
  --surface: ${dark ? 'rgba(30, 33, 39, 0.72)' : 'rgba(255, 255, 255, 0.78)'};
  --surface-line: ${dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.1)'};
  --button-background: ${dark ? '#f4f4f2' : '#16181c'};
  --button-text: ${dark ? '#16181c' : '#f4f4f2'};
  --level-ok: ${levels.ok};
  --level-warn: ${levels.warn};
  --level-alarm: ${levels.alarm};
  --level-off: ${levels.off};
  /* Seitenbreite und Inhaltsbereich (Inner-Wrapper). --wrap ist der Abstand des Inhaltsbereichs zum Seitenrand. */
  --page-width: ${layout.pageWidth ? layout.pageWidth + 'px' : '100%'};
  --page-left: max(0px, (100% - var(--page-width)) / 2);
  --inner-width: ${layout.innerWidth}px;
  --inner-pad: ${layout.padding}px;
  --wrap: max(var(--inner-pad), (100cqw - var(--inner-width)) / 2);
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family: ${fontFamily(project, project.settings.font) || FONT_STACKS.system};
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
  top: 0;
  left: var(--page-left);
  width: min(100%, var(--page-width));
  height: 100%;
  display: block;
}

/* Posterbild während des Ladens. Das Skript setzt .is-ready, sobald das Modell zu sehen ist. */
.poster {
  position: fixed;
  top: 0;
  left: var(--page-left);
  width: min(100%, var(--page-width));
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  transition: opacity 0.4s;
}

.is-ready .poster {
  opacity: 0;
}

/* ---------- Ladeanzeige ---------- */

.loader {
  --progress: 0;
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 5;
  display: grid;
  justify-items: center;
  gap: 0.9rem;
  min-width: 11rem;
  padding: 1.4rem 1.6rem 1.2rem;
  border: 1px solid var(--surface-line);
  border-radius: 20px;
  background: var(--surface);
  backdrop-filter: blur(16px);
  color: var(--text);
  translate: -50% -50%;
  transition: opacity 0.5s, scale 0.5s, visibility 0.5s;
}

.loader.is-done {
  opacity: 0;
  scale: 0.94;
  visibility: hidden;
}

.loader-text {
  color: var(--text-muted);
  font-size: 0.85rem;
  letter-spacing: 0.02em;
  text-align: center;
}

.loader-value {
  margin-left: 0.25em;
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.loader-circle {
  width: 4.5rem;
  height: 4.5rem;
  rotate: -90deg;
  animation: loader-spin 1.1s linear infinite;
}

.loader-circle circle {
  fill: none;
  stroke-width: 4;
  stroke-linecap: round;
}

.loader-track {
  stroke: var(--surface-line);
}

.loader-arc {
  stroke: var(--text);
  stroke-dasharray: 28 100;
  transition: stroke-dasharray 0.25s;
}

/* Mit bekanntem Fortschritt füllt sich der Ring, statt sich zu drehen. */
.has-progress .loader-circle {
  animation: none;
}

.has-progress .loader-arc {
  stroke-dasharray: calc(var(--progress) * 100) 100;
}

.loader-track-bar {
  position: relative;
  display: block;
  width: 14rem;
  max-width: 60vw;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--surface-line);
}

.loader-track-bar span {
  position: absolute;
  inset: 0;
  width: 35%;
  border-radius: 3px;
  background: var(--text);
  animation: loader-slide 1.2s ease-in-out infinite;
}

.has-progress .loader-track-bar span {
  width: calc(var(--progress) * 100%);
  animation: none;
  transition: width 0.25s;
}

.loader-pulse {
  display: flex;
  gap: 0.5rem;
  padding: 0.6rem 0;
}

.loader-pulse span {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--text);
  animation: loader-pulse 1s ease-in-out infinite;
}

.loader-pulse span:nth-child(2) {
  animation-delay: 0.15s;
}

.loader-pulse span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes loader-spin {
  to {
    rotate: 270deg;
  }
}

@keyframes loader-slide {
  from {
    translate: -100% 0;
  }

  to {
    translate: 290% 0;
  }
}

@keyframes loader-pulse {
  0%,
  100% {
    opacity: 0.25;
    scale: 0.7;
  }

  50% {
    opacity: 1;
    scale: 1;
  }
}

/* Reduzierte Bewegung: Die Ladeanzeige steht still und zeigt nur Text und Zahl. */
.reduced-motion .loader-circle,
.reduced-motion .loader-track-bar span,
.reduced-motion .loader-pulse span {
  animation: none;
}

/* Reduzierte Bewegung: keine weichen Übergänge in der Oberfläche. */
.reduced-motion * {
  transition: none !important;
}

/* Breakpoints richten sich nach der Breite dieses Containers (Container Queries). */
.page {
  position: relative;
  z-index: 1;
  max-width: var(--page-width);
  margin: 0 auto;
  container-type: inline-size;
}

.section {
  display: flex;
  align-items: center;
  padding: 12vh var(--wrap);
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
${pinned ? PINNED_CSS : ''}
/* Frei platzierte Komponenten liegen fest über dem 3D-Canvas. */
.free-layer {
  position: fixed;
  top: 0;
  bottom: 0;
  left: var(--page-left);
  width: min(100%, var(--page-width));
  z-index: 2;
  pointer-events: none;
  container-type: size;
}

.free-layer > .c {
  position: absolute;
  left: 50%;
  top: 40%;
  max-width: calc(100% - 2 * var(--inner-pad));
  pointer-events: auto;
}

.c {
  margin: 0;
}

.headline {
  font-size: 2.75rem;
  line-height: 1.08;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

h1.headline {
  font-size: 4rem;
}

.text {
  font-size: 1.125rem;
  color: var(--text-muted);
}

/* Schriftgrößen sind je Breakpoint fest, damit Abstände in jedem Fenster gleich aussehen. */
@container (max-width: ${BREAKPOINT_WIDTHS.tablet}px) {
  .headline {
    font-size: 2.25rem;
  }

  h1.headline {
    font-size: 3rem;
  }
}

@container (max-width: ${BREAKPOINT_WIDTHS.mobile}px) {
  .headline {
    font-size: 1.75rem;
  }

  h1.headline {
    font-size: 2.25rem;
  }

  .text {
    font-size: 1rem;
  }
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
  top: 0;
  bottom: 0;
  left: var(--page-left);
  width: min(100%, var(--page-width));
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

/* ---------- Digitaler Zwilling ----------
   Das Skript setzt data-level (ok, warn, alarm, off) und data-stale="true" bei veralteten Daten. */

[data-level='ok'] {
  --level: var(--level-ok);
}

[data-level='warn'] {
  --level: var(--level-warn);
}

[data-level='alarm'] {
  --level: var(--level-alarm);
}

[data-level='off'] {
  --level: var(--level-off);
}

.card[data-level],
.infobox[data-level] {
  border-left: 5px solid var(--level);
}

.value {
  display: grid;
  gap: 0.1rem;
}

.value-label,
.status-label {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.value-reading {
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.value[data-level='warn'] .value-reading,
.value[data-level='alarm'] .value-reading {
  color: var(--level);
}

.value-unit {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-muted);
}

.status,
.connection {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-dot {
  flex: none;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: var(--level, var(--text-muted));
}

.connection {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.connection[data-connection='connected'] .status-dot {
  background: var(--level-ok);
}

.connection[data-connection='stale'] .status-dot {
  background: var(--level-warn);
}

.connection[data-connection='offline'] .status-dot {
  background: var(--level-alarm);
}

.connection[data-connection='stale'],
.connection[data-connection='offline'] {
  color: var(--text);
  font-weight: 600;
}

/* Letzter bekannter Stand bleibt stehen, wird aber als veraltet gekennzeichnet. */
.value[data-stale='true'] .value-reading,
.status[data-stale='true'] strong {
  opacity: 0.5;
}

.value[data-stale='true'] .value-label::after,
.status[data-stale='true'] .status-label::after {
  content: ' (veraltet)';
}

.hotspot[data-level] .hotspot-dot {
  background: var(--level);
}

/* ---------- Konfigurator ----------
   Das Skript setzt .is-active auf die gewählte Variante und .is-unavailable auf gesperrte Varianten. */

.button.is-active,
.card.is-active,
.infobox.is-active {
  outline: 3px solid var(--text);
  outline-offset: 3px;
}

.is-unavailable {
  opacity: 0.4;
  cursor: not-allowed;
}

.select {
  min-height: 44px;
  padding: 0.6em 2.2em 0.6em 1em;
  border: 1px solid var(--surface-line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.select option {
  color: #16181c;
  background: #ffffff;
}

.variant-slider {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 0.4rem 0.5rem;
  width: 18rem;
  max-width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--surface-line);
  border-radius: 14px;
  background: var(--surface);
  backdrop-filter: blur(14px);
  touch-action: pan-y;
  user-select: none;
}

.variant-slider:focus-visible {
  outline: 3px solid var(--text);
  outline-offset: 3px;
}

.variant-arrow {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: var(--button-background);
  color: var(--button-text);
  font: inherit;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.variant-items {
  display: grid;
  text-align: center;
  font-weight: 600;
}

/* Alle Namen liegen übereinander, sichtbar ist nur die aktive Variante. */
.variant-item {
  grid-area: 1 / 1;
  opacity: 0;
  transition: opacity 0.25s;
}

.variant-item.is-active {
  opacity: 1;
}

.variant-dots {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  gap: 0.25rem;
}

.variant-dot {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 8px solid transparent;
  border-radius: 50%;
  background: var(--text-muted);
  background-clip: padding-box;
  opacity: 0.5;
  cursor: pointer;
}

.variant-dot.is-active {
  opacity: 1;
  background-color: var(--text);
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

/**
 * Ladeanzeige: liegt über der Szene, bis das Modell zum ersten Mal gerendert ist.
 * Das Skript setzt --progress (0 bis 1) und die Zahl, sobald der Fortschritt bekannt ist.
 */
export function renderLoader(project, indent = '') {
  const kind = project.settings.loader || 'ring';
  if (kind === 'none' || !project.model.file) return '';
  // Oben die Anzeige (Ring, Balken oder Punkte), darunter der Hinweis und der Fortschritt in Prozent.
  const graphic =
    kind === 'ring'
      ? '<svg class="loader-circle" viewBox="0 0 64 64" aria-hidden="true"><circle class="loader-track" cx="32" cy="32" r="27" pathLength="100"></circle><circle class="loader-arc" cx="32" cy="32" r="27" pathLength="100"></circle></svg>'
      : kind === 'bar'
        ? '<span class="loader-track-bar" aria-hidden="true"><span></span></span>'
        : '<span class="loader-pulse" aria-hidden="true"><span></span><span></span><span></span></span>';
  return `${indent}<div class="loader loader--${kind}" role="progressbar" aria-label="3D-Modell wird geladen" aria-valuemin="0" aria-valuemax="100">${graphic}<span class="loader-text">3D-Modell wird geladen <span class="loader-value"></span></span></div>`;
}

/** Namen aller Bilder und Schriftdateien, die das Projekt verwendet. */
export function usedImages(project) {
  const names = new Set();
  const visit = (component) => {
    if (component.src) names.add(component.src);
    Object.values(component.content || {}).forEach((content) => content.src && names.add(content.src));
    (component.children || []).forEach(visit);
  };
  project.sections.forEach((section) => section.components.forEach(visit));
  project.templates.forEach((template) => visit(template.root));
  if (project.settings.poster) names.add(project.settings.poster);
  (project.fonts || []).forEach((font) => names.add(font.file));
  return [...names];
}
