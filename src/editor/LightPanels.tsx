import { Cone, Crosshair, Lightbulb, Move3d, RectangleHorizontal, Sun, SunDim } from 'lucide-react';
import { useMemo } from 'react';
import type { SceneLight, Value, Vec3 } from '../core/types';
import { Block } from './Block';
import { Field, NumberInput, VectorField } from './fields';
import { LIGHT_LABELS, addLight, removeLight, renameLight } from './lights';
import { currentState } from './stage';
import { setDraft, setSceneValue, useEditor } from './store';

const TYPE_ICON = { spot: Cone, area: RectangleHorizontal, point: Lightbulb };

/** Liste der Lichter links: Hauptlicht, Umgebungslicht und zusätzliche Lichter. */
export function LightList() {
  const lights = useEditor((s) => s.project.lights);
  const selected = useEditor((s) => s.selectedLight);
  const hasModel = useEditor((s) => s.project.model.file !== null);
  const select = (id: string) => useEditor.setState({ selectedLight: id, lightHandle: 'position' });
  return (
    <Block id="lights" icon={Lightbulb} title="Lichter">
      <ul className="list">
        <li className={selected === 'keyLight' ? 'selected' : ''}>
          <button className="list-main" onClick={() => select('keyLight')} disabled={!hasModel}>
            <Sun size={15} aria-hidden /> Hauptlicht
            <small>Sonne</small>
          </button>
        </li>
        {lights.map((light) => {
          const Icon = TYPE_ICON[light.type];
          return (
            <li key={light.id} className={selected === light.id ? 'selected' : ''}>
              <button className="list-main" onClick={() => select(light.id)}>
                <Icon size={15} aria-hidden /> {light.name}
                <small>{LIGHT_LABELS[light.type]}</small>
              </button>
              <button onClick={() => removeLight(light.id)} aria-label={`${light.name} löschen`} title="Licht löschen">
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row wrap add-lights">
        {(Object.keys(LIGHT_LABELS) as SceneLight['type'][]).map((type) => {
          const Icon = TYPE_ICON[type];
          return (
            <button key={type} onClick={() => addLight(type)} disabled={!hasModel} title={`${LIGHT_LABELS[type]} hinzufügen`}>
              <Icon size={15} aria-hidden />+ {LIGHT_LABELS[type]}
            </button>
          );
        })}
      </div>
      <p className="hint">
        {hasModel
          ? 'Ein Licht auswählen, dann im Viewport mit dem Anfasser verschieben. Mit „Merken“ gilt eine Einstellung ab dieser Stelle der Seite, so kann jeder Abschnitt sein eigenes Licht haben.'
          : 'Importiere zuerst ein Modell.'}
      </p>
    </Block>
  );
}

/** Einstellungen des ausgewählten Lichts. */
export function LightInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const draft = useEditor((s) => s.draft);
  const handle = useEditor((s) => s.lightHandle);
  const modelVersion = useEditor((s) => s.modelVersion);
  const state = useMemo(() => currentState(project, pos, draft), [project, pos, draft, modelVersion]);
  const isKey = id === 'keyLight';
  const light = project.lights.find((l) => l.id === id);
  if (!isKey && !light) return null;

  const prefix = isKey ? 'keyLight' : `light:${id}`;
  const type = light?.type;
  const vec = (field: string) => (state[`${prefix}.${field}`] ?? [0, 0, 0]) as Vec3;
  const num = (field: string) => (state[`${prefix}.${field}`] ?? 0) as number;
  // Hauptlicht und Umgebungslicht folgen wie die Kamera dem „Merken“; zusätzliche Lichter gelten sofort,
  // solange sie noch an keiner Stelle gemerkt sind.
  const set = (field: string) => (value: Value) => (isKey ? setDraft({ [`${prefix}.${field}`]: value }) : setSceneValue(`${prefix}.${field}`, value));
  const slider = (field: string, label: string, max: number, step: number, unit = '') => (
    <Field label={`${label}: ${num(field).toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0)}${unit}`}>
      <input type="range" min={0} max={max} step={step} value={num(field)} onChange={(e) => set(field)(parseFloat(e.target.value))} />
    </Field>
  );
  const strengthMax = Math.max(10, Math.ceil(num('intensity') * 3));

  return (
    <Block id="light-inspector" icon={isKey ? Sun : TYPE_ICON[type!]} title={isKey ? 'Hauptlicht' : LIGHT_LABELS[type!]} highlight>
      {light && (
        <Field label="Name">
          <input value={light.name} onChange={(e) => renameLight(id, e.target.value)} />
        </Field>
      )}
      <Field label="Farbe">
        <input type="color" value={(state[`${prefix}.color`] as string) ?? '#ffffff'} onChange={(e) => set('color')(e.target.value)} />
      </Field>
      {isKey ? (
        slider('intensity', 'Stärke', 8, 0.1)
      ) : (
        <Field label="Stärke">
          <div className="row">
            <input type="range" min={0} max={strengthMax} step={strengthMax / 200} value={num('intensity')} onChange={(e) => set('intensity')(parseFloat(e.target.value))} />
            <NumberInput label="Stärke" value={num('intensity')} min={0} step={1} onChange={set('intensity')} />
          </div>
        </Field>
      )}
      {type === 'spot' && (
        <>
          {slider('angle', 'Öffnungswinkel', 120, 1, '°')}
          {slider('penumbra', 'Weicher Rand', 1, 0.05)}
        </>
      )}
      {type === 'area' && (
        <div className="field">
          <span>Größe der Fläche (Breite, Höhe)</span>
          <div className="vector two">
            <NumberInput label="Breite der Fläche" value={num('width')} min={0.01} step={0.1} onChange={set('width')} />
            <NumberInput label="Höhe der Fläche" value={num('height')} min={0.01} step={0.1} onChange={set('height')} />
          </div>
        </div>
      )}
      {(type === 'spot' || type === 'point') && (
        <Field label="Reichweite (0 = unbegrenzt)">
          <NumberInput label="Reichweite" value={num('distance')} min={0} step={0.5} onChange={set('distance')} />
        </Field>
      )}
      <VectorField label="Position" value={vec('position')} onChange={set('position')} />
      {(type === 'spot' || type === 'area') && (
        <>
          <VectorField label="Blickziel" value={vec('target')} onChange={set('target')} />
          <div className="field">
            <span>Anfasser im Viewport bewegt</span>
            <div className="segmented">
              <button className={handle === 'position' ? 'active' : ''} onClick={() => useEditor.setState({ lightHandle: 'position' })}>
                <Move3d size={14} aria-hidden /> das Licht
              </button>
              <button className={handle === 'target' ? 'active' : ''} onClick={() => useEditor.setState({ lightHandle: 'target' })}>
                <Crosshair size={14} aria-hidden /> das Blickziel
              </button>
            </div>
          </div>
        </>
      )}
      {type === 'area' && <p className="hint">Flächenlichter wirken auf Materialien mit Rauheit und Metall-Eigenschaften (Standard bei glTF) und werfen weiches Licht ohne Schatten.</p>}
      {isKey && (
        <Field label={`Umgebungslicht: ${((state['ambient.intensity'] as number) ?? 0).toFixed(1)}`}>
          <div className="row">
            <SunDim size={15} aria-hidden />
            <input type="range" min={0} max={4} step={0.1} value={(state['ambient.intensity'] as number) ?? 0} onChange={(e) => setDraft({ 'ambient.intensity': parseFloat(e.target.value) })} />
          </div>
        </Field>
      )}
      <p className="hint">
        {isKey
          ? 'Änderungen am Hauptlicht gelten nach „Merken“ für diese Stelle der Seite.'
          : 'Solange das Licht an keiner Stelle gemerkt ist, gelten Änderungen für die ganze Seite. Mit „Merken“ bekommt es pro Abschnitt eigene Werte.'}
      </p>
    </Block>
  );
}
