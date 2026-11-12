// Aktionen und Variantenregeln des Konfigurators, ohne 3D-Anteil.
//
// Eine Aktion steht im HTML als Text in data-action, z. B. "select:<Gruppe>:<Wahl>".
// Die Wahl einer Variantengruppe steht in der Timeline als Eigenschaft "option:<Gruppe>.value".

/** Name der Timeline-Eigenschaft einer Variantengruppe. */
export const optionProp = (groupId) => `option:${groupId}.value`;

/** @param {import('./types').ComponentAction | null | undefined} action */
export function actionToString(action) {
  if (!action) return '';
  switch (action.type) {
    case 'hotspot':
      return action.hotspotId ? 'hotspot:' + action.hotspotId : '';
    case 'close':
      return 'close';
    case 'select':
      return `select:${action.groupId}:${action.optionId}`;
    case 'next':
    case 'prev':
      return `${action.type}:${action.groupId}`;
    case 'reset':
      return 'reset:' + (action.groupId || '*');
    case 'clip':
      return `clip:${action.mode}:${action.clip}`;
    default:
      return '';
  }
}

/** @returns {import('./types').ComponentAction | null} */
export function parseAction(text) {
  if (!text) return null;
  if (text === 'close') return { type: 'close' };
  const colon = text.indexOf(':');
  const type = text.slice(0, colon);
  const rest = text.slice(colon + 1);
  if (type === 'hotspot') return { type, hotspotId: rest };
  if (type === 'next' || type === 'prev') return { type, groupId: rest };
  if (type === 'reset') return { type, groupId: rest === '*' ? null : rest };
  if (type === 'select') {
    const split = rest.indexOf(':');
    return { type, groupId: rest.slice(0, split), optionId: rest.slice(split + 1) };
  }
  if (type === 'clip') {
    const split = rest.indexOf(':');
    return { type, mode: rest.slice(0, split), clip: rest.slice(split + 1) };
  }
  return null;
}

/** Die Wahl mit dem größten Gewicht. Die Timeline liefert mitten in einem Übergang Gewichte statt einer einzelnen Wahl. */
export function dominant(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  let best;
  let bestWeight = -1;
  for (const [key, weight] of Object.entries(value)) {
    if (weight > bestWeight) {
      best = key;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Variantenregel prüfen: Ist die Wahl bei der aktuellen Auswahl verfügbar?
 * @param {import('./types').Project} project
 * @param {import('./types').VariantOption} option
 * @param {Record<string, string>} selection Gruppe -> aktive Wahl
 */
export function isAvailable(project, option, selection) {
  return (option.requires || []).every((rule) => {
    // Regeln, die auf eine gelöschte Gruppe zeigen, gelten nicht mehr.
    if (!project.variantGroups.some((group) => group.id === rule.groupId)) return true;
    return selection[rule.groupId] === rule.optionId;
  });
}

/**
 * Sorgt dafür, dass die Auswahl alle Regeln erfüllt: Wird eine Wahl durch eine andere Änderung
 * unzulässig, rückt die erste verfügbare Wahl ihrer Gruppe nach.
 * @returns {Record<string, string>} bereinigte Auswahl
 */
export function resolveSelection(project, selection) {
  const result = { ...selection };
  for (let pass = 0; pass <= project.variantGroups.length; pass++) {
    let changed = false;
    for (const group of project.variantGroups) {
      const current = group.options.find((option) => option.id === result[group.id]);
      if (current && isAvailable(project, current, result)) continue;
      const fallback = group.options.find((option) => isAvailable(project, option, result));
      if (fallback && fallback.id !== result[group.id]) {
        result[group.id] = fallback.id;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

/** Nächste (direction 1) oder vorherige (-1) verfügbare Wahl einer Gruppe, mit Umlauf. */
export function stepOption(project, group, selection, direction) {
  const count = group.options.length;
  const start = Math.max(0, group.options.findIndex((option) => option.id === selection[group.id]));
  for (let i = 1; i <= count; i++) {
    const option = group.options[(start + direction * i + count * i) % count];
    if (isAvailable(project, option, selection)) return option.id;
  }
  return selection[group.id];
}

/** Nähert Gewichte schrittweise einem Ziel an (für das Überblenden bei einer Wahl des Besuchers). */
export function approachWeights(current, target, step) {
  const result = {};
  let done = true;
  for (const key of new Set([...Object.keys(current), ...Object.keys(target)])) {
    const from = current[key] || 0;
    const to = target[key] || 0;
    const value = from + Math.min(step, Math.max(-step, to - from));
    if (Math.abs(value - to) > 1e-4) done = false;
    if (value > 1e-4) result[key] = value;
  }
  return { weights: result, done };
}

/** Auswahl als Gewichte: eine einzelne Wahl oder die Gewichte aus der Timeline. */
export const toWeights = (value) => (typeof value === 'string' ? { [value]: 1 } : value || {});
