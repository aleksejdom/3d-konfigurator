import { useMemo } from 'react';
import { EASINGS } from '../core/easing.js';
import { DEFAULT_BLEND } from '../core/timeline.js';
import type { Budget, KeyValue, PageElement, Scope, Section, Value, Vec3 } from '../core/types';
import { EASING_LABELS, SCOPE_LABELS, nodeName, propLabel } from './labels';
import { uid } from './project';
import { currentState, editor } from './stage';
import { moveKeyframe, setDraft, setPos, update, useEditor } from './store';

const DEG = 180 / Math.PI;

function NumberInput(props: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label?: string;
}) {
  return (
    <input
      type="number"
      aria-label={props.label}
      value={Number.isFinite(props.value) ? Math.round(props.value * 1000) / 1000 : 0}
      step={props.step ?? 0.1}
      min={props.min}
      max={props.max}
      onChange={(e) => {
        const value = parseFloat(e.target.value);
        if (Number.isFinite(value)) props.onChange(value);
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function VectorField(props: { label: string; value: Vec3; onChange: (value: Vec3) => void; scale?: number; step?: number }) {
  const scale = props.scale ?? 1;
  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="vector">
        {['X', 'Y', 'Z'].map((axis, i) => (
          <NumberInput
            key={axis}
            label={`${props.label} ${axis}`}
            value={props.value[i] * scale}
            step={props.step}
            onChange={(n) => {
              const next = [...props.value] as Vec3;
              next[i] = n / scale;
              props.onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Gespeicherter Punkt ----------

function KeyframeInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  const keyframe = project.keyframes.find((k) => k.id === id);
  if (!keyframe) return null;

  const patch = (prop: string, change: Partial<KeyValue>) =>
    update((p) => {
      const target = p.keyframes.find((k) => k.id === id);
      if (target) Object.assign(target.values[prop], change);
    }, `kv-${id}-${prop}`);

  return (
    <section className="panel-block highlight">
      <header>
        <h3>Gespeicherter Punkt</h3>
        <button
          onClick={() => {
            update((p) => void (p.keyframes = p.keyframes.filter((k) => k.id !== id)));
            useEditor.setState({ selectedKeyframe: null });
          }}
        >
          Löschen
        </button>
      </header>
      <Field label="Abschnitt">
        <select
          value={keyframe.sectionId}
          onChange={(e) => {
            moveKeyframe(id, e.target.value, keyframe.t);
            setPos(project.sections.findIndex((s) => s.id === e.target.value) + keyframe.t);
          }}
        >
          {project.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Position im Abschnitt (%)">
        <NumberInput
          value={keyframe.t * 100}
          step={1}
          min={0}
          max={100}
          onChange={(n) => {
            moveKeyframe(id, keyframe.sectionId, n / 100);
            setPos(project.sections.findIndex((s) => s.id === keyframe.sectionId) + Math.min(1, Math.max(0, n / 100)));
          }}
        />
      </Field>

      {Object.entries(keyframe.values).map(([prop, kv]) => (
        <div className="keyvalue" key={prop}>
          <div className="keyvalue-head">
            <strong>{propLabel(prop)}</strong>
            <button
              aria-label={`${propLabel(prop)} aus dem Punkt entfernen`}
              title="Aus dem Punkt entfernen"
              onClick={() =>
                update((p) => {
                  const target = p.keyframes.find((k) => k.id === id);
                  if (target) delete target.values[prop];
                })
              }
            >
              ×
            </button>
          </div>
          <Field label="Geltungsbereich">
            <select value={kv.scope} onChange={(e) => patch(prop, { scope: e.target.value as Scope })}>
              <option value="inherit">{SCOPE_LABELS.inherit}</option>
              <option value="local">{SCOPE_LABELS.local}</option>
            </select>
          </Field>
          <Field label="Easing">
            <select value={kv.easing ?? 'easeInOut'} onChange={(e) => patch(prop, { easing: e.target.value })}>
              {Object.keys(EASINGS).map((name) => (
                <option key={name} value={name}>
                  {EASING_LABELS[name] ?? name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Übergangslänge (% eines Abschnitts)">
            <input
              type="number"
              min={0}
              step={5}
              placeholder="automatisch"
              value={kv.transition != null ? Math.round(kv.transition * 100) : ''}
              onChange={(e) => patch(prop, { transition: e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) / 100) })}
            />
          </Field>
          {kv.scope === 'local' && (
            <Field label="Ausblenden danach (% eines Abschnitts)">
              <input
                type="number"
                min={1}
                step={5}
                placeholder={String(DEFAULT_BLEND * 100)}
                value={kv.exit != null ? Math.round(kv.exit * 100) : ''}
                onChange={(e) => patch(prop, { exit: e.target.value === '' ? null : Math.max(0.01, parseFloat(e.target.value) / 100) })}
              />
            </Field>
          )}
        </div>
      ))}
      <p className="hint">
        Werte ändern: Szene an dieser Stelle anpassen und erneut „Merken“ klicken. Ohne eigene Übergangslänge beginnt der
        Übergang am vorherigen Punkt.
      </p>
    </section>
  );
}

// ---------- Abschnitt ----------

const ELEMENT_LABELS: Record<PageElement['type'], string> = { headline: 'Headline', text: 'Text', button: 'Button' };

function SectionEditor({ section }: { section: Section }) {
  const patch = (recipe: (s: Section) => void, key?: string) =>
    update((p) => {
      const target = p.sections.find((s) => s.id === section.id);
      if (target) recipe(target);
    }, key);

  const add = (type: PageElement['type']) =>
    patch((s) =>
      void s.elements.push({
        id: uid('el'),
        type,
        text: type === 'button' ? 'Mehr erfahren' : type === 'headline' ? 'Neue Headline' : 'Neuer Text',
        ...(type === 'button' ? { href: '#' } : {}),
      }),
    );

  return (
    <section className="panel-block">
      <header>
        <h3>Abschnitt</h3>
      </header>
      <Field label="Name">
        <input value={section.name} onChange={(e) => patch((s) => void (s.name = e.target.value), 'sec-name')} />
      </Field>
      <Field label="Höhe (vh)">
        <NumberInput value={section.height} step={10} min={20} onChange={(n) => patch((s) => void (s.height = Math.max(20, n)), 'sec-height')} />
      </Field>
      <Field label="Ausrichtung">
        <select value={section.align} onChange={(e) => patch((s) => void (s.align = e.target.value as Section['align']))}>
          <option value="left">Links</option>
          <option value="center">Mitte</option>
          <option value="right">Rechts</option>
        </select>
      </Field>

      {section.elements.map((element, i) => (
        <div className="element" key={element.id}>
          <div className="keyvalue-head">
            <strong>{ELEMENT_LABELS[element.type]}</strong>
            <span>
              <button disabled={i === 0} aria-label="Nach oben" onClick={() => patch((s) => void s.elements.splice(i - 1, 0, ...s.elements.splice(i, 1)))}>
                ↑
              </button>
              <button
                disabled={i === section.elements.length - 1}
                aria-label="Nach unten"
                onClick={() => patch((s) => void s.elements.splice(i + 1, 0, ...s.elements.splice(i, 1)))}
              >
                ↓
              </button>
              <button aria-label="Element löschen" onClick={() => patch((s) => void s.elements.splice(i, 1))}>
                ×
              </button>
            </span>
          </div>
          <textarea
            rows={element.type === 'text' ? 3 : 1}
            aria-label={`${ELEMENT_LABELS[element.type]} Text`}
            value={element.text}
            onChange={(e) => patch((s) => void (s.elements[i].text = e.target.value), 'el-' + element.id)}
          />
          {element.type === 'button' && (
            <input
              aria-label="Linkziel"
              placeholder="Linkziel, z. B. #kontakt"
              value={element.href ?? ''}
              onChange={(e) => patch((s) => void (s.elements[i].href = e.target.value), 'href-' + element.id)}
            />
          )}
        </div>
      ))}
      <div className="row">
        <button onClick={() => add('headline')}>+ Headline</button>
        <button onClick={() => add('text')}>+ Text</button>
        <button onClick={() => add('button')}>+ Button</button>
      </div>
    </section>
  );
}

// ---------- Szene ----------

function SceneEditor() {
  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const draft = useEditor((s) => s.draft);
  const selectedNode = useEditor((s) => s.selectedNode);
  const modelVersion = useEditor((s) => s.modelVersion);
  const state = useMemo(() => currentState(project, pos, draft), [project, pos, draft, modelVersion]);

  if (!project.model.file) return null;
  const vec = (prop: string) => (state[prop] ?? editor.defaults[prop] ?? [0, 0, 0]) as Vec3;
  const num = (prop: string) => (state[prop] ?? 0) as number;
  const set = (prop: string) => (value: Value) => setDraft({ [prop]: value });
  const node = selectedNode ? `node:${selectedNode}` : null;

  return (
    <>
      {node && (
        <section className="panel-block">
          <header>
            <h3>{selectedNode === 'model' ? 'Modell' : `Bauteil ${nodeName(selectedNode!)}`}</h3>
          </header>
          <VectorField label="Position" value={vec(`${node}.position`)} onChange={set(`${node}.position`)} />
          <VectorField label="Drehung (°)" value={vec(`${node}.rotation`)} scale={DEG} step={5} onChange={set(`${node}.rotation`)} />
          <VectorField label="Skalierung" value={vec(`${node}.scale`)} onChange={set(`${node}.scale`)} />
          <p className="hint">Für eine volle Umdrehung beim Scrollen 360 eintragen.</p>
        </section>
      )}
      <section className="panel-block">
        <header>
          <h3>Kamera</h3>
        </header>
        <VectorField label="Position" value={vec('camera.position')} onChange={set('camera.position')} />
        <VectorField label="Blickziel" value={vec('camera.target')} onChange={set('camera.target')} />
        <Field label={`Bildwinkel: ${Math.round(num('camera.fov'))}°`}>
          <input type="range" min={10} max={90} value={num('camera.fov')} onChange={(e) => set('camera.fov')(parseFloat(e.target.value))} />
        </Field>
      </section>
      <section className="panel-block">
        <header>
          <h3>Licht</h3>
        </header>
        <Field label="Farbe Hauptlicht">
          <input type="color" value={state['keyLight.color'] as string} onChange={(e) => set('keyLight.color')(e.target.value)} />
        </Field>
        <Field label={`Stärke Hauptlicht: ${num('keyLight.intensity').toFixed(1)}`}>
          <input type="range" min={0} max={8} step={0.1} value={num('keyLight.intensity')} onChange={(e) => set('keyLight.intensity')(parseFloat(e.target.value))} />
        </Field>
        <VectorField label="Position Hauptlicht" value={vec('keyLight.position')} onChange={set('keyLight.position')} />
        <Field label={`Umgebungslicht: ${num('ambient.intensity').toFixed(1)}`}>
          <input type="range" min={0} max={4} step={0.1} value={num('ambient.intensity')} onChange={(e) => set('ambient.intensity')(parseFloat(e.target.value))} />
        </Field>
        <p className="hint">Änderungen gelten erst nach „Merken“ für diese Stelle der Seite.</p>
      </section>
    </>
  );
}

// ---------- Seite und Budgets ----------

const BUDGET_FIELDS: { key: keyof Budget; label: string; step: number }[] = [
  { key: 'fileSizeMB', label: 'Dateigröße (MB)', step: 1 },
  { key: 'triangles', label: 'Dreiecke', step: 10000 },
  { key: 'textureSize', label: 'Texturgröße (px)', step: 512 },
  { key: 'drawCalls', label: 'Draw Calls', step: 10 },
];

function PageSettings() {
  const project = useEditor((s) => s.project);
  return (
    <section className="panel-block">
      <header>
        <h3>Seite</h3>
      </header>
      <Field label="Hintergrund">
        <input
          type="color"
          value={project.settings.background}
          onChange={(e) => update((p) => void (p.settings.background = e.target.value), 'background')}
        />
      </Field>
      <Field label={`Scroll-Dämpfung: ${project.settings.scrollSmoothing === 0 ? 'aus' : project.settings.scrollSmoothing.toFixed(2)}`}>
        <input
          type="range"
          min={0}
          max={0.95}
          step={0.05}
          value={project.settings.scrollSmoothing}
          onChange={(e) => update((p) => void (p.settings.scrollSmoothing = parseFloat(e.target.value)), 'smoothing')}
        />
      </Field>
      <h4>Performance-Budgets</h4>
      <div className="budgets">
        <span />
        <span>Desktop</span>
        <span>Mobile</span>
        {BUDGET_FIELDS.map((field) => (
          <div className="budget-row" key={field.key}>
            <span>{field.label}</span>
            {(['desktop', 'mobile'] as const).map((device) => (
              <NumberInput
                key={device}
                label={`${field.label} ${device}`}
                value={project.budgets[device][field.key]}
                step={field.step}
                min={0}
                onChange={(n) => update((p) => void (p.budgets[device][field.key] = n), `budget-${device}-${field.key}`)}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function RightPanel() {
  const project = useEditor((s) => s.project);
  const selectedKeyframe = useEditor((s) => s.selectedKeyframe);
  const selectedSection = useEditor((s) => s.selectedSection);
  const section = project.sections.find((s) => s.id === selectedSection);

  return (
    <aside className="panel right">
      {selectedKeyframe && <KeyframeInspector id={selectedKeyframe} />}
      <SceneEditor />
      {section && <SectionEditor key={section.id} section={section} />}
      <PageSettings />
    </aside>
  );
}
