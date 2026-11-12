import { describe, expect, it } from 'vitest';
import { formatValue, getPath, levelOf, levelTints, mergeData, readField, resolveFields, testData } from '../src/core/data.js';
import type { DataField } from '../src/core/types';
import { renderCss, renderSections } from '../src/export/page.js';
import { buildExport } from '../src/export/exporter.js';
import { createComponent, createProject, migrateProject } from '../src/editor/project';

const status: DataField = {
  id: 'fStatus',
  label: 'Betriebsstatus',
  key: 'motor.status',
  type: 'status',
  states: [
    { value: 'running', label: 'In Betrieb', level: 'ok' },
    { value: 'error', label: 'Störung', level: 'alarm' },
  ],
  test: 'running',
};
const temperature: DataField = {
  id: 'fTemp',
  label: 'Temperatur',
  key: 'motor.temperature',
  type: 'number',
  unit: '°C',
  decimals: 1,
  limits: { warnAbove: 70, alarmAbove: 85, alarmBelow: 5 },
  test: 62.5,
};
const door: DataField = {
  id: 'fDoor',
  label: 'Tür',
  key: 'door.open',
  type: 'boolean',
  states: [
    { value: 'true', label: 'Offen', level: 'warn' },
    { value: 'false', label: 'Geschlossen', level: 'ok' },
  ],
  test: false,
};

function makeProject() {
  const project = createProject();
  project.data.fields = [status, temperature, door];
  project.data.bindings = [{ id: 'b1', fieldId: 'fStatus', kind: 'color', nodeIds: ['Motor', 'Gehaeuse'] }];
  return project;
}

describe('Werte lesen', () => {
  it('folgt Pfaden mit Punkten und Listenindex', () => {
    expect(getPath({ motor: { rpm: 1480 } }, 'motor.rpm')).toBe(1480);
    expect(getPath({ sensors: [{ value: 3 }, { value: 7 }] }, 'sensors[1].value')).toBe(7);
    expect(getPath({ motor: null }, 'motor.rpm')).toBeUndefined();
  });

  it('bringt Werte auf den Typ des Felds und verwirft Unpassendes', () => {
    expect(readField(temperature, { motor: { temperature: '71.5' } })).toBe(71.5);
    expect(readField(temperature, { motor: { temperature: 'kaputt' } })).toBeUndefined();
    expect(readField(door, { door: { open: 1 } })).toBe(true);
    expect(readField(door, { door: { open: 'vielleicht' } })).toBeUndefined();
    expect(readField(status, { motor: { status: 'error' } })).toBe('error');
  });

  it('fügt Teilnachrichten eines Live-Kanals in den bisherigen Stand ein', () => {
    const merged = mergeData({ motor: { rpm: 1480, status: 'running' }, door: { open: false } }, { motor: { status: 'error' } });
    expect(merged).toEqual({ motor: { rpm: 1480, status: 'error' }, door: { open: false } });
  });
});

describe('Stufen und Anzeige', () => {
  it('leitet die Stufe einer Zahl aus den Grenzwerten ab', () => {
    expect(levelOf(temperature, 62.5)).toBe('ok');
    expect(levelOf(temperature, 70)).toBe('warn');
    expect(levelOf(temperature, 90)).toBe('alarm');
    expect(levelOf(temperature, 2)).toBe('alarm');
    expect(levelOf({ ...temperature, limits: {} }, 90)).toBeNull();
  });

  it('leitet die Stufe von Status und Ja/Nein aus der Zuordnung ab', () => {
    expect(levelOf(status, 'error')).toBe('alarm');
    expect(levelOf(status, 'unbekannt')).toBeNull();
    expect(levelOf(door, true)).toBe('warn');
  });

  it('formatiert Zahlen deutsch und zeigt Zustände mit ihrem Text', () => {
    expect(formatValue(temperature, 1062.46)).toBe('1.062,5');
    expect(formatValue(status, 'error')).toBe('Störung');
    expect(formatValue(door, false)).toBe('Geschlossen');
    expect(formatValue(temperature, undefined)).toBe('–');
  });
});

describe('Testdaten und Bindungen', () => {
  const project = makeProject();

  it('baut aus den Testwerten ein Datenobjekt wie von einer Quelle', () => {
    expect(testData(project)).toEqual({ motor: { status: 'running', temperature: 62.5 }, door: { open: false } });
  });

  it('färbt gebundene Bauteile in der Farbe der Stufe', () => {
    const running = resolveFields(project, testData(project));
    expect(levelTints(project, running)).toEqual({ Motor: '#3ecf8e', Gehaeuse: '#3ecf8e' });
    const failed = resolveFields(project, { motor: { status: 'error' } });
    expect(levelTints(project, failed)).toEqual({ Motor: '#e5484d', Gehaeuse: '#e5484d' });
    expect(failed.fTemp.value).toBeUndefined();
  });
});

describe('HTML und Export', () => {
  const project = makeProject();
  const card = createComponent('card');
  card.fieldId = 'fStatus';
  const badge = createComponent('status');
  badge.fieldId = 'fStatus';
  const reading = createComponent('value');
  reading.fieldId = 'fTemp';
  card.children = [badge, reading, createComponent('connection')];
  project.sections[0].components = [card];
  const html = renderSections(project);

  it('gibt Karte, Statusanzeige, Messwert und Verbindungsstatus mit Datenfeld aus', () => {
    expect(html).toMatch(/class="c card[^"]*" data-field="fStatus"/);
    expect(html).toMatch(/class="c status[^"]*" data-field="fStatus"/);
    expect(html).toContain('<span class="value-unit">°C</span>');
    expect(html).toContain('data-connection="test" role="status"');
    expect(renderCss(project)).toContain('--level-alarm: #e5484d');
  });

  it('dokumentiert die Datenquelle im Export und enthält keine Zugangsdaten', () => {
    project.data.source = { mode: 'sse', url: '/api/daten', interval: 5, staleAfter: 15 };
    const { files } = buildExport(project, 'vanilla', { 'data.js': '// data' });
    expect(files['README.md']).toContain('## Datenquelle');
    expect(files['README.md']).toContain('`motor.temperature`');
    expect(files['README.md']).toContain('Zugangsdaten');
    expect(Object.keys(JSON.parse(files['src/project.json']).data.source).sort()).toEqual(['interval', 'mode', 'staleAfter', 'url']);
  });
});

describe('Projektformat', () => {
  it('öffnet Projekte der Version 4 ohne Daten', () => {
    const old = { ...createProject(), formatVersion: 4 } as Record<string, unknown>;
    delete old.data;
    const project = migrateProject(old);
    expect(project.formatVersion).toBe(5);
    expect(project.data.fields).toEqual([]);
    expect(project.data.source.mode).toBe('test');
  });
});
