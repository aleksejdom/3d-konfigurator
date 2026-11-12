import { useMemo } from 'react';
import { resolveFields, testData } from '../core/data.js';
import type { DataBinding, DataField, DataLevel, DataSource } from '../core/types';
import { NodeChips } from './ConfiguratorPanels';
import { addBinding, addField, removeBinding, removeField, setSource, updateBinding, updateField } from './data';
import { Field, NumberInput, OptionalNumber } from './fields';
import { nodeName } from './labels';
import { useEditor } from './store';

const TYPE_LABELS: Record<DataField['type'], string> = { number: 'Zahl', status: 'Status', boolean: 'Ja/Nein', text: 'Text' };
const LEVEL_LABELS: Record<DataLevel, string> = { ok: 'In Ordnung', warn: 'Warnung', alarm: 'Alarm', off: 'Aus' };
const MODE_LABELS: Record<DataSource['mode'], string> = {
  test: 'Testdaten',
  rest: 'REST: JSON regelmäßig abfragen',
  sse: 'Live-Kanal: Server-Sent Events',
  websocket: 'Live-Kanal: WebSocket',
};
const LIMITS: { key: keyof NonNullable<DataField['limits']>; label: string }[] = [
  { key: 'warnAbove', label: 'Warnung ab' },
  { key: 'alarmAbove', label: 'Alarm ab' },
  { key: 'warnBelow', label: 'Warnung bis' },
  { key: 'alarmBelow', label: 'Alarm bis' },
];

/** Testwert eines Felds, passend zu seinem Typ. */
export function TestValueInput({ field, onChange }: { field: DataField; onChange: (value: DataField['test']) => void }) {
  const label = `Testwert ${field.label}`;
  if (field.type === 'number') return <NumberInput label={label} value={Number(field.test) || 0} step={1} onChange={onChange} />;
  if (field.type === 'text') return <input aria-label={label} value={String(field.test)} onChange={(e) => onChange(e.target.value)} />;
  return (
    <select
      aria-label={label}
      value={String(field.test)}
      onChange={(e) => onChange(field.type === 'boolean' ? e.target.value === 'true' : e.target.value)}
    >
      {(field.states ?? []).map((state) => (
        <option key={state.value} value={state.value}>
          {state.label} ({state.value})
        </option>
      ))}
    </select>
  );
}

function BindingBlock({ binding }: { binding: DataBinding }) {
  const clips = useEditor((s) => s.project.model.stats?.clips ?? []);
  const selectedNode = useEditor((s) => s.selectedNode);
  const title = binding.kind === 'color' ? 'Bauteile einfärben' : binding.kind === 'rotate' ? 'Bauteil drehen' : 'Tempo eines Animationsclips';
  return (
    <div className="keyvalue">
      <div className="keyvalue-head">
        <strong>{title}</strong>
        <button aria-label={`${title} entfernen`} onClick={() => removeBinding(binding.id)}>
          ×
        </button>
      </div>
      {binding.kind === 'color' && (
        <>
          <NodeChips
            ids={binding.nodeIds}
            empty="Noch kein Bauteil gewählt."
            onAdd={(id) => updateBinding<typeof binding>(binding.id, (b) => void b.nodeIds.push(id))}
            onRemove={(id) => updateBinding<typeof binding>(binding.id, (b) => void (b.nodeIds = b.nodeIds.filter((n) => n !== id)))}
          />
          <p className="hint">Die Bauteile bekommen die Farbe der Stufe: in Ordnung, Warnung, Alarm oder aus.</p>
        </>
      )}
      {binding.kind === 'rotate' && (
        <>
          <Field label="Bauteil">
            <div className="row">
              <span className="chip static">{binding.nodeId ? nodeName(binding.nodeId) : 'keines'}</span>
              <button
                disabled={!selectedNode || selectedNode === 'model'}
                onClick={() => updateBinding<typeof binding>(binding.id, (b) => void (b.nodeId = selectedNode!))}
              >
                Ausgewähltes übernehmen
              </button>
            </div>
          </Field>
          <Field label="Drehachse">
            <select value={binding.axis} onChange={(e) => updateBinding<typeof binding>(binding.id, (b) => void (b.axis = e.target.value as 'x' | 'y' | 'z'))}>
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </Field>
          <Field label="Faktor (Wert × Faktor = Umdrehungen pro Minute)">
            <NumberInput value={binding.factor} step={0.01} onChange={(n) => updateBinding<typeof binding>(binding.id, (b) => void (b.factor = n), 'bind-factor')} />
          </Field>
        </>
      )}
      {binding.kind === 'clip' && (
        <>
          <Field label="Animationsclip">
            <select value={binding.clip} onChange={(e) => updateBinding<typeof binding>(binding.id, (b) => void (b.clip = e.target.value))}>
              {clips.length === 0 && <option value="">Das Modell hat keine Clips</option>}
              {clips.map((clip) => (
                <option key={clip} value={clip}>
                  {clip}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Wert für Originalgeschwindigkeit">
            <NumberInput value={binding.reference} step={10} onChange={(n) => updateBinding<typeof binding>(binding.id, (b) => void (b.reference = n), 'bind-ref')} />
          </Field>
        </>
      )}
    </div>
  );
}

/** Eigenschaften des ausgewählten Datenfelds. */
export function FieldInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  const field = project.data.fields.find((f) => f.id === id);
  if (!field) return null;
  const set = (recipe: (f: DataField) => void, key?: string) => updateField(id, recipe, key);
  const bindings = project.data.bindings.filter((binding) => binding.fieldId === id);
  const hasLevel = field.type !== 'text';
  const hasClips = (project.model.stats?.clips ?? []).length > 0;

  return (
    <section className="panel-block highlight">
      <header>
        <h3>Datenfeld · {TYPE_LABELS[field.type]}</h3>
        <button onClick={() => removeField(id)}>Löschen</button>
      </header>
      <Field label="Name">
        <input value={field.label} onChange={(e) => set((f) => void (f.label = e.target.value), 'df-label')} />
      </Field>
      <Field label="Pfad in den Daten der Quelle">
        <input value={field.key} placeholder="z. B. motor.rpm" onChange={(e) => set((f) => void (f.key = e.target.value.trim()), 'df-key')} />
      </Field>

      {field.type === 'number' && (
        <>
          <div className="pair">
            <Field label="Einheit">
              <input value={field.unit ?? ''} placeholder="z. B. °C" onChange={(e) => set((f) => void (f.unit = e.target.value), 'df-unit')} />
            </Field>
            <Field label="Nachkommastellen">
              <NumberInput value={field.decimals ?? 0} step={1} min={0} max={6} onChange={(n) => set((f) => void (f.decimals = Math.round(n)), 'df-dec')} />
            </Field>
          </div>
          <h4>Grenzwerte</h4>
          <div className="pair">
            {LIMITS.map((limit) => (
              <Field key={limit.key} label={limit.label}>
                <OptionalNumber
                  label={limit.label}
                  placeholder="keine"
                  value={field.limits?.[limit.key] ?? undefined}
                  onChange={(n) => set((f) => void (f.limits = { ...f.limits, [limit.key]: n ?? null }), 'df-' + limit.key)}
                />
              </Field>
            ))}
          </div>
        </>
      )}

      {(field.type === 'status' || field.type === 'boolean') && (
        <>
          <h4>Zustände</h4>
          {(field.states ?? []).map((state, i) => (
            <div className="state-row" key={i}>
              <input
                aria-label="Wert in den Daten"
                value={state.value}
                disabled={field.type === 'boolean'}
                onChange={(e) => set((f) => void (f.states![i].value = e.target.value), 'df-sv' + i)}
              />
              <input aria-label="Anzeigetext" value={state.label} onChange={(e) => set((f) => void (f.states![i].label = e.target.value), 'df-sl' + i)} />
              <select aria-label="Stufe" value={state.level} onChange={(e) => set((f) => void (f.states![i].level = e.target.value as DataLevel))}>
                {(Object.keys(LEVEL_LABELS) as DataLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
              {field.type === 'status' && (
                <button aria-label={`Zustand ${state.label} entfernen`} onClick={() => set((f) => void f.states!.splice(i, 1))}>
                  ×
                </button>
              )}
            </div>
          ))}
          {field.type === 'status' && (
            <div className="row">
              <button onClick={() => set((f) => void (f.states = [...(f.states ?? []), { value: 'neu', label: 'Neuer Zustand', level: 'ok' }]))}>+ Zustand</button>
            </div>
          )}
          <p className="hint">Spalten: Wert in den Daten, Anzeigetext, Stufe.</p>
        </>
      )}

      <h4>Testdaten</h4>
      <Field label="Testwert">
        <TestValueInput field={field} onChange={(value) => set((f) => void (f.test = value), 'df-test')} />
      </Field>
      <p className="hint">Viewport und Vorschau reagieren sofort auf den Testwert.</p>

      <h4>Reaktionen am Modell</h4>
      {bindings.map((binding) => (
        <BindingBlock key={binding.id} binding={binding} />
      ))}
      <div className="row wrap">
        {hasLevel && <button onClick={() => addBinding(id, 'color')}>+ Bauteile einfärben</button>}
        {field.type === 'number' && <button onClick={() => addBinding(id, 'rotate')}>+ Bauteil drehen</button>}
        {field.type === 'number' && hasClips && <button onClick={() => addBinding(id, 'clip')}>+ Clip-Tempo</button>}
      </div>
      <p className="hint">
        Messwert, Statusanzeige, Karten, Infoboxen und Hotspots bindest du in deren Eigenschaften über „Datenfeld“ an dieses Feld.
      </p>
    </section>
  );
}

/** Datenfelder und Datenquelle in der linken Leiste. */
export function DataList() {
  const project = useEditor((s) => s.project);
  const selected = useEditor((s) => s.selectedField);
  const { fields, source, levelColors } = project.data;
  const resolved = useMemo(() => resolveFields(project, testData(project)), [project]);

  return (
    <section className="panel-block">
      <header>
        <h3>Daten</h3>
        <select
          className="add-select"
          aria-label="Datenfeld hinzufügen"
          value=""
          onChange={(e) => e.target.value && addField(e.target.value as DataField['type'])}
        >
          <option value="">+ Datenfeld</option>
          {(Object.keys(TYPE_LABELS) as DataField['type'][]).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </header>
      {fields.length === 0 && <p className="hint">Datenfelder verbinden Messwerte und Zustände einer Maschine mit Modell und Oberfläche.</p>}
      <ul className="list">
        {fields.map((field) => {
          const entry = resolved[field.id];
          return (
            <li key={field.id} className={field.id === selected ? 'selected' : ''}>
              <button className="list-main" onClick={() => useEditor.setState({ selectedField: field.id })}>
                <span className="level-dot" style={{ background: entry.level ? levelColors[entry.level as DataLevel] : 'var(--line)' }} /> {field.label}
                <small>
                  {entry.text}
                  {field.unit ? ' ' + field.unit : ''}
                </small>
              </button>
              <button onClick={() => removeField(field.id)} aria-label={`${field.label} löschen`} title="Datenfeld löschen">
                ×
              </button>
            </li>
          );
        })}
      </ul>

      {fields.length > 0 && (
        <>
          <h4>Datenquelle der veröffentlichten Seite</h4>
          <Field label="Art">
            <select value={source.mode} onChange={(e) => setSource({ mode: e.target.value as DataSource['mode'] })}>
              {(Object.keys(MODE_LABELS) as DataSource['mode'][]).map((mode) => (
                <option key={mode} value={mode}>
                  {MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </Field>
          {source.mode !== 'test' && (
            <>
              <Field label="Adresse">
                <input
                  value={source.url}
                  placeholder={source.mode === 'websocket' ? 'wss://…' : 'https://… oder /api/daten'}
                  onChange={(e) => setSource({ url: e.target.value.trim() }, 'src-url')}
                />
              </Field>
              <div className="pair">
                {source.mode === 'rest' && (
                  <Field label="Abfrage alle (s)">
                    <NumberInput value={source.interval} step={1} min={1} onChange={(n) => setSource({ interval: n }, 'src-int')} />
                  </Field>
                )}
                <Field label="Veraltet nach (s)">
                  <NumberInput value={source.staleAfter} step={1} min={0} onChange={(n) => setSource({ staleAfter: n }, 'src-stale')} />
                </Field>
              </div>
              <p className="hint">
                Die Quelle wird nur gelesen. Braucht sie Zugangsdaten, trage hier die Adresse deines eigenen Backend-Endpunkts
                oder Proxys ein. Zugangsdaten gehören nicht in das Projekt und nicht in den Export.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
