// Digitaler Zwilling: Daten lesen, bewerten und auf Modell und Oberfläche übertragen.
//
// Eine Datenquelle liefert ein JSON-Objekt, z. B. { "motor": { "rpm": 1480, "status": "running" } }.
// Jedes Datenfeld des Projekts liest daraus einen Wert über seinen Pfad ("motor.rpm"), prüft den Typ
// und leitet eine Stufe ab (ok, warn, alarm, off). Bindungen übertragen Wert und Stufe auf Bauteile.
// Live-Quellen werden nur gelesen.

import * as THREE from 'three';

// ---------- Werte lesen und bewerten ----------

/** Liest einen Wert über einen Pfad wie "motor.rpm" oder "sensors[0].value". */
export function getPath(data, key) {
  let current = data;
  for (const part of String(key).replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (part === '') continue;
    if (current === null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function setPath(data, key, value) {
  const parts = String(key).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = data;
  parts.forEach((part, i) => {
    if (i === parts.length - 1) current[part] = value;
    else current = current[part] && typeof current[part] === 'object' ? current[part] : (current[part] = {});
  });
}

/** Fügt neue Daten in den bisherigen Stand ein. Live-Kanäle dürfen Teilobjekte schicken. */
export function mergeData(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const result = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) result[key] = mergeData(result[key], value);
  return result;
}

/** Die Testwerte aller Felder als Datenobjekt, so wie es eine Quelle liefern würde. */
export function testData(project) {
  const data = {};
  for (const field of project.data.fields) if (field.key) setPath(data, field.key, field.test);
  return data;
}

/** Wert eines Felds aus den Daten, auf den Typ des Felds gebracht. undefined = kein gültiger Wert. */
export function readField(field, data) {
  const raw = getPath(data, field.key);
  if (raw === undefined || raw === null) return undefined;
  if (field.type === 'number') {
    const number = typeof raw === 'number' ? raw : parseFloat(raw);
    return Number.isFinite(number) ? number : undefined;
  }
  if (field.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 1 || raw === '1' || raw === 'true') return true;
    if (raw === 0 || raw === '0' || raw === 'false') return false;
    return undefined;
  }
  return String(raw);
}

/** Stufe eines Werts: aus Grenzwerten (Zahl) oder aus der Zuordnung der Zustände (Status, Ja/Nein). */
export function levelOf(field, value) {
  if (value === undefined) return null;
  if (field.type === 'number') {
    const limits = field.limits || {};
    const set = (limit) => limit !== undefined && limit !== null;
    if ((set(limits.alarmAbove) && value >= limits.alarmAbove) || (set(limits.alarmBelow) && value <= limits.alarmBelow)) return 'alarm';
    if ((set(limits.warnAbove) && value >= limits.warnAbove) || (set(limits.warnBelow) && value <= limits.warnBelow)) return 'warn';
    return Object.values(limits).some(set) ? 'ok' : null;
  }
  if (field.type === 'text') return null;
  const state = (field.states || []).find((item) => item.value === String(value));
  return state ? state.level : null;
}

/** Text, der für einen Wert angezeigt wird (ohne Einheit). */
export function formatValue(field, value) {
  if (value === undefined) return '–';
  if (field.type === 'number') {
    const digits = field.decimals ?? 0;
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  }
  if (field.type === 'text') return value;
  const state = (field.states || []).find((item) => item.value === String(value));
  return state ? state.label : String(value);
}

/**
 * Alle Felder auswerten.
 * @returns {Record<string, { value: any, text: string, level: string | null }>} Feld-ID -> Wert, Anzeigetext, Stufe
 */
export function resolveFields(project, data) {
  const result = {};
  for (const field of project.data.fields) {
    const value = readField(field, data);
    result[field.id] = { value, text: formatValue(field, value), level: levelOf(field, value) };
  }
  return result;
}

/** Bauteil-ID -> Farbe für alle Bindungen "Bauteil einfärben". */
export function levelTints(project, resolved) {
  const tints = {};
  for (const binding of project.data.bindings) {
    if (binding.kind !== 'color') continue;
    const level = resolved[binding.fieldId] && resolved[binding.fieldId].level;
    if (!level) continue;
    for (const id of binding.nodeIds) tints[id] = project.data.levelColors[level];
  }
  return tints;
}

// ---------- Oberfläche ----------

export const CONNECTION_LABELS = {
  test: 'Testdaten',
  connecting: 'Verbinde …',
  connected: 'Verbunden',
  stale: 'Daten veraltet',
  offline: 'Offline',
};

/**
 * Schreibt Werte, Stufen und den Zustand der Verbindung in die Seite.
 * @param {ParentNode} root
 * @param {import('./types').Project} project
 * @param {ReturnType<typeof resolveFields>} resolved
 * @param {{ status: string, lastUpdate: number | null }} connection
 */
export function syncDataElements(root, project, resolved, connection) {
  // Bei veralteten Daten oder ohne Verbindung bleibt der letzte Stand stehen und wird gekennzeichnet.
  const outdated = connection.status === 'stale' || connection.status === 'offline';
  for (const element of root.querySelectorAll('[data-field]')) {
    const entry = resolved[element.dataset.field];
    if (!entry) continue;
    if (entry.level) element.dataset.level = entry.level;
    else delete element.dataset.level;
    element.dataset.stale = String(outdated);
    for (const target of element.querySelectorAll('[data-field-value], [data-field-text]')) {
      if (target.closest('[data-field]') === element && target.textContent !== entry.text) target.textContent = entry.text;
    }
  }
  const time = connection.lastUpdate ? new Date(connection.lastUpdate).toLocaleTimeString('de-DE') : '–';
  for (const element of root.querySelectorAll('[data-connection]')) {
    element.dataset.connection = connection.status;
    const text = element.querySelector('[data-connection-text]');
    if (text) text.textContent = CONNECTION_LABELS[connection.status] || connection.status;
    const stamp = element.querySelector('[data-connection-time]');
    if (stamp) stamp.textContent = time;
  }
}

// ---------- Datenquelle ----------

/**
 * Verbindet sich mit der Datenquelle des Projekts und meldet jeden neuen Stand.
 * @param {object} options
 * @param {import('./types').Project} options.project
 * @param {'test' | 'live'} [options.mode] erzwingt Testdaten oder die Live-Quelle (Editor-Vorschau)
 * @param {(state: { data: object, status: string, lastUpdate: number | null }) => void} options.onChange
 */
export function createDataFeed({ project, mode, onChange }) {
  const source = project.data.source;
  const kind = mode === 'test' ? 'test' : mode === 'live' && source.mode === 'test' ? 'rest' : source.mode;
  let data = {};
  let status = kind === 'test' ? 'test' : 'connecting';
  let lastUpdate = null;
  let stopped = false;
  let pollTimer = 0;
  let staleTimer = 0;
  let retryTimer = 0;
  let retries = 0;
  let events = null;
  let socket = null;

  const emit = () => onChange({ data, status, lastUpdate });

  const receive = (patch) => {
    data = mergeData(data, patch);
    lastUpdate = Date.now();
    status = kind === 'test' ? 'test' : 'connected';
    emit();
  };

  const fail = () => {
    if (status === 'offline') return;
    status = 'offline';
    emit();
  };

  const parse = (text) => {
    try {
      receive(JSON.parse(text));
    } catch {
      // Nachrichten, die kein JSON sind, werden übergangen.
    }
  };

  const poll = async () => {
    try {
      const response = await fetch(source.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      receive(await response.json());
    } catch {
      fail();
    }
  };

  const connectSocket = () => {
    socket = new WebSocket(source.url);
    socket.onopen = () => (retries = 0);
    socket.onmessage = (event) => parse(event.data);
    socket.onclose = () => {
      if (stopped) return;
      fail();
      // Neuer Versuch mit wachsendem Abstand, höchstens alle 30 Sekunden.
      retryTimer = setTimeout(connectSocket, Math.min(30000, 1000 * 2 ** retries++));
    };
  };

  return {
    get state() {
      return { data, status, lastUpdate };
    },

    start() {
      emit();
      if (kind === 'test') {
        receive(testData(project));
        return;
      }
      if (!source.url) {
        fail();
        return;
      }
      if (kind === 'rest') {
        poll();
        pollTimer = setInterval(poll, Math.max(1, source.interval) * 1000);
      } else if (kind === 'sse') {
        // EventSource verbindet sich nach einem Abbruch selbst neu.
        events = new EventSource(source.url);
        events.onmessage = (event) => parse(event.data);
        events.onerror = fail;
      } else if (kind === 'websocket') {
        try {
          connectSocket();
        } catch {
          fail();
        }
      }
      staleTimer = setInterval(() => {
        const limit = source.staleAfter * 1000;
        if (status === 'connected' && limit > 0 && lastUpdate && Date.now() - lastUpdate > limit) {
          status = 'stale';
          emit();
        }
      }, 1000);
    },

    /** Testdaten von außen setzen (Editor-Vorschau). */
    push(patch) {
      receive(patch);
    },

    stop() {
      stopped = true;
      clearInterval(pollTimer);
      clearInterval(staleTimer);
      clearTimeout(retryTimer);
      if (events) events.close();
      if (socket) socket.close();
    },
  };
}

// ---------- Bindungen in Vorschau und Export ----------

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/**
 * @param {object} options
 * @param {ReturnType<import('./stage.js').createStage>} options.stage
 * @param {import('./types').Project} options.project
 * @param {Document} options.root
 * @param {ReturnType<import('./configurator.js').createConfigurator>} options.configurator
 * @param {'test' | 'live'} [options.mode]
 */
export function createDataBindings({ stage, project, root, configurator, mode }) {
  let resolved = {};
  let dirty = false;
  /** Bindung -> bisher zurückgelegter Drehwinkel */
  const angles = new Map();

  const feed = createDataFeed({
    project,
    mode,
    onChange(state) {
      resolved = resolveFields(project, state.data);
      syncDataElements(root, project, resolved, state);
      configurator.setTints(levelTints(project, resolved));
      for (const binding of project.data.bindings) {
        if (binding.kind !== 'clip') continue;
        const value = resolved[binding.fieldId] && resolved[binding.fieldId].value;
        configurator.driveClip(binding.clip, typeof value === 'number' && binding.reference ? value / binding.reference : 0);
      }
      dirty = true;
    },
  });

  const rotating = () =>
    project.data.bindings.some((binding) => binding.kind === 'rotate' && typeof (resolved[binding.fieldId] || {}).value === 'number' && resolved[binding.fieldId].value !== 0);

  return {
    feed,
    /** true, solange sich etwas dreht oder neue Daten angekommen sind */
    get live() {
      return dirty || rotating();
    },

    /** Nach dem Setzen des Timeline-Zustands: Drehungen aus Messwerten hinzufügen. */
    update(dt) {
      dirty = false;
      for (const binding of project.data.bindings) {
        if (binding.kind !== 'rotate') continue;
        const node = stage.nodes.get(binding.nodeId);
        const value = (resolved[binding.fieldId] || {}).value;
        if (!node) continue;
        // Wert = Umdrehungen pro Minute
        const angle = (angles.get(binding.id) || 0) + (typeof value === 'number' ? (value * binding.factor * dt * Math.PI * 2) / 60 : 0);
        angles.set(binding.id, angle % (Math.PI * 2));
        node.rotateOnAxis(AXES[binding.axis], angle);
      }
    },

    dispose() {
      feed.stop();
    },
  };
}
