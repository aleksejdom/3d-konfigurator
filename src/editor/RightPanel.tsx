import { Block, Fold } from './Block';
import { Bookmark, Camera, Move3d, PanelTop, Settings, Sun } from 'lucide-react';
import { capturePoster, importEnvironment, importPoster } from './store';
import { FieldInspector } from './DataPanels';
import { GroupInspector, MeshActionField } from './ConfiguratorPanels';
import { useMemo } from 'react';
import { EASINGS } from '../core/easing.js';
import { DEFAULT_BLEND } from '../core/timeline.js';
import type { Breakpoint, Budget, Framing, KeyValue, Scope, Section, Value, Vec3, SectionClip } from '../core/types';
import { BREAKPOINT_LABELS, Field, InheritRow, NumberInput, OptionalNumber, VectorField } from './fields';
import { ComponentInspector } from './Inspector';
import { HotspotInspector, InteractionEditor } from './InteractionPanels';
import { EASING_LABELS, SCOPE_LABELS, nodeName, propLabel } from './labels';
import { currentState, editor } from './stage';
import { moveKeyframe, setDraft, setPos, update, useEditor } from './store';

const DEG = 180 / Math.PI;

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
    <Block id="keyframe" icon={Bookmark} title="Gespeicherter Punkt" highlight actions={<><button
          onClick={() => {
            update((p) => void (p.keyframes = p.keyframes.filter((k) => k.id !== id)));
            useEditor.setState({ selectedKeyframe: null });
          }}
        >
          Löschen
        </button></>}>
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
    </Block>
  );
}

// ---------- Abschnitt ----------

const ALL_CLIPS = '*';
const NO_CLIPS: string[] = [];

function SectionEditor({ section }: { section: Section }) {
  const patch = (recipe: (s: Section) => void, key?: string) =>
    update((p) => {
      const target = p.sections.find((s) => s.id === section.id);
      if (target) recipe(target);
    }, key);
  const clips = useEditor((s) => s.project.model.stats?.clips ?? NO_CLIPS);
  const modeOf = (clip: string) => section.clips?.find((entry) => entry.clip === clip)?.mode ?? '';
  const setClipMode = (clip: string, mode: string) =>
    patch((s) => {
      const rest = (s.clips ?? []).filter((entry) => entry.clip !== clip);
      // „Alle Animationen“ steht vorn und gilt für jeden Clip ohne eigene Einstellung.
      s.clips = mode ? (clip === ALL_CLIPS ? [{ clip, mode: mode as SectionClip['mode'] }, ...rest] : [...rest, { clip, mode: mode as SectionClip['mode'] }]) : rest;
    });

  return (
    <Block id="section" icon={PanelTop} title="Abschnitt">
      <Field label="Name">
        <input value={section.name} onChange={(e) => patch((s) => void (s.name = e.target.value), 'sec-name')} />
      </Field>
      <Field label="Höhe (vh)">
        <NumberInput value={section.height} step={10} min={20} onChange={(n) => patch((s) => void (s.height = n), 'sec-height')} />
      </Field>
      <Field label="Ausrichtung der Textspalte">
        <select value={section.align} onChange={(e) => patch((s) => void (s.align = e.target.value as Section['align']))}>
          <option value="left">Links</option>
          <option value="center">Mitte</option>
          <option value="right">Rechts</option>
        </select>
      </Field>
      {clips.length > 0 && (
        <>
          <Fold id="section-clips" title="Animation des Modells in diesem Abschnitt">
          {[ALL_CLIPS, ...clips].map((clip) => (
            <div className="clip-mode" key={clip}>
              <span title={clip}>{clip === ALL_CLIPS ? 'Alle Animationen' : clip}</span>
              <select aria-label={`Animation ${clip === ALL_CLIPS ? 'alle' : clip}`} value={modeOf(clip)} onChange={(e) => setClipMode(clip, e.target.value)}>
                <option value="">{clip === ALL_CLIPS ? 'Einzeln festlegen' : 'Aus'}</option>
                <option value="loop">In Schleife abspielen</option>
                <option value="once">Einmal abspielen</option>
                <option value="scroll">Mit dem Scrollen abspielen</option>
              </select>
            </div>
          ))}
          <p className="hint">
            Die Animation läuft, solange dieser Abschnitt zu sehen ist. „Mit dem Scrollen“ spielt sie über die Länge des
            Abschnitts vor und zurück.
          </p>
          </Fold>
        </>
      )}
    </Block>
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
        <Block id="node" icon={Move3d} title={<>{selectedNode === 'model' ? 'Modell' : `Bauteil ${nodeName(selectedNode!)}`}</>}>
          <VectorField label="Position" value={vec(`${node}.position`)} onChange={set(`${node}.position`)} />
          <VectorField label="Drehung (°)" value={vec(`${node}.rotation`)} scale={DEG} step={5} onChange={set(`${node}.rotation`)} />
          <VectorField label="Skalierung" value={vec(`${node}.scale`)} onChange={set(`${node}.scale`)} />
          <p className="hint">Für eine volle Umdrehung beim Scrollen 360 eintragen.</p>
          <MeshActionField nodeId={selectedNode!} />
          <InteractionEditor subject={node} />
        </Block>
      )}
      <Block id="camera" icon={Camera} title="Kamera">
        <VectorField label="Position" value={vec('camera.position')} onChange={set('camera.position')} />
        <VectorField label="Blickziel" value={vec('camera.target')} onChange={set('camera.target')} />
        <Field label={`Bildwinkel: ${Math.round(num('camera.fov'))}°`}>
          <input type="range" min={10} max={90} value={num('camera.fov')} onChange={(e) => set('camera.fov')(parseFloat(e.target.value))} />
        </Field>
        <InteractionEditor subject="camera" />
        <FramingEditor />
      </Block>
      <Block id="light" icon={Sun} title="Licht" closed>
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
      </Block>
    </>
  );
}

// ---------- Kameraausschnitt pro Breakpoint ----------

const FRAMING_FIELDS: { key: keyof Framing; label: string; fallback: number; step: number }[] = [
  { key: 'zoom', label: 'Zoom', fallback: 1, step: 0.05 },
  { key: 'shiftX', label: 'Nach rechts schieben (%)', fallback: 0, step: 1 },
  { key: 'shiftY', label: 'Nach unten schieben (%)', fallback: 0, step: 1 },
];
const ORDER: Breakpoint[] = ['desktop', 'tablet', 'mobile'];

function FramingEditor() {
  const framing = useEditor((s) => s.project.framing);
  const breakpoint = useEditor((s) => s.breakpoint);

  return (
    <>
      <Fold id="framing" title={<>Kameraausschnitt · {BREAKPOINT_LABELS[breakpoint]}</>} closed>
      {FRAMING_FIELDS.map((field) => {
        let source: 'own' | Breakpoint | null = null;
        let value: number | undefined;
        for (let i = ORDER.indexOf(breakpoint); i >= 0 && value === undefined; i--) {
          value = framing[ORDER[i]][field.key];
          if (value !== undefined) source = ORDER[i] === breakpoint ? 'own' : ORDER[i];
        }
        const set = (next: number | undefined) =>
          update((p) => {
            if (next === undefined) delete p.framing[breakpoint][field.key];
            else p.framing[breakpoint][field.key] = next;
          }, `framing-${breakpoint}-${field.key}`);
        return (
          <InheritRow key={field.key} label={field.label} breakpoint={breakpoint} source={source} onReset={() => set(undefined)}>
            <OptionalNumber
              label={field.label}
              value={source === 'own' ? value : undefined}
              placeholder={String(value ?? field.fallback)}
              step={field.step}
              min={field.key === 'zoom' ? 0.1 : undefined}
              onChange={set}
            />
          </InheritRow>
        );
      })}
      <p className="hint">Der Ausschnitt gilt für die ganze Seite und wird nicht mit „Merken“ gespeichert.</p>
      </Fold>
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
  const environment = project.settings.environment;
  const posterUrl = useEditor((s) => (project.settings.poster ? s.assets[project.settings.poster]?.url : undefined));
  const setEnvironment = (patch: Partial<typeof environment>) => update((p) => void Object.assign(p.settings.environment, patch), 'environment');
  return (
    <Block id="page" icon={Settings} title="Seite" closed>
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
      <Field label="Texte beim Scrollen">
        <select value={project.settings.textMode} onChange={(e) => update((p) => void (p.settings.textMode = e.target.value as 'pinned' | 'flow'))}>
          <option value="pinned">Fest an ihrem Platz, Wechsel mit dem Abschnitt</option>
          <option value="flow">Scrollen mit der Seite</option>
        </select>
      </Field>
      <Field label="Reduzierte Bewegung">
        <select
          value={project.settings.reducedMotion}
          onChange={(e) => update((p) => void (p.settings.reducedMotion = e.target.value as 'respect' | 'ignore'))}
        >
          <option value="respect">Wunsch des Geräts beachten</option>
          <option value="ignore">Immer volle Bewegung</option>
        </select>
      </Field>

      <Fold id="environment" title="Umgebung (HDRI / Skybox)" closed>
      <div className="row">
        <button onClick={importEnvironment}>{environment.file ? 'Austauschen' : 'HDRI oder Panorama wählen'}</button>
        {environment.file && <button onClick={() => update((p) => void (p.settings.environment.file = null))}>Entfernen</button>}
      </div>
      {!environment.file && <p className="hint">Ohne Datei beleuchtet eine neutrale Studio-Umgebung das Modell.</p>}
      {environment.file && (
        <>
          <p className="hint" title={environment.file}>
            {environment.file}. Die Stärke der Beleuchtung stellst du unter „Licht“ als Umgebungslicht ein; sie lässt sich merken.
          </p>
          <Field label={`Ausrichtung: ${Math.round(environment.rotation)}°`}>
            <input type="range" min={0} max={360} step={1} value={environment.rotation} onChange={(e) => setEnvironment({ rotation: parseFloat(e.target.value) })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={environment.showBackground} onChange={(e) => setEnvironment({ showBackground: e.target.checked })} />
            Umgebung als Hintergrund zeigen
          </label>
          {environment.showBackground && (
            <>
              <Field label={`Helligkeit des Hintergrunds: ${environment.backgroundIntensity.toFixed(1)}`}>
                <input type="range" min={0} max={3} step={0.1} value={environment.backgroundIntensity} onChange={(e) => setEnvironment({ backgroundIntensity: parseFloat(e.target.value) })} />
              </Field>
              <Field label={`Unschärfe des Hintergrunds: ${environment.backgroundBlur.toFixed(2)}`}>
                <input type="range" min={0} max={1} step={0.05} value={environment.backgroundBlur} onChange={(e) => setEnvironment({ backgroundBlur: parseFloat(e.target.value) })} />
              </Field>
            </>
          )}
        </>
      )}

      </Fold>
      <Fold id="poster" title="Posterbild beim Laden" closed>
      {posterUrl && <img className="poster-thumb" src={posterUrl} alt="Posterbild" />}
      <div className="row wrap">
        <button onClick={capturePoster} disabled={!project.model.file}>
          Aus aktueller Ansicht
        </button>
        <button onClick={importPoster}>Bild wählen</button>
        {project.settings.poster && <button onClick={() => update((p) => void (p.settings.poster = null))}>Entfernen</button>}
      </div>
      <p className="hint">Das Bild ist zu sehen, bis das Modell geladen und zum ersten Mal gerendert ist.</p>

      </Fold>
      <Fold id="budgets" title="Performance-Budgets" closed>
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
      </Fold>
    </Block>
  );
}

export function RightPanel() {
  const project = useEditor((s) => s.project);
  const selectedKeyframe = useEditor((s) => s.selectedKeyframe);
  const selectedSection = useEditor((s) => s.selectedSection);
  const selectedComponent = useEditor((s) => s.selectedComponent);
  const selectedHotspot = useEditor((s) => s.selectedHotspot);
  const selectedGroup = useEditor((s) => s.selectedGroup);
  const selectedField = useEditor((s) => s.selectedField);
  const section = project.sections.find((s) => s.id === selectedSection);

  return (
    <aside className="panel right">
      {selectedComponent && <ComponentInspector key={selectedComponent} id={selectedComponent} />}
      {selectedHotspot && <HotspotInspector key={selectedHotspot} id={selectedHotspot} />}
      {selectedGroup && <GroupInspector key={selectedGroup} id={selectedGroup} />}
      {selectedField && <FieldInspector key={selectedField} id={selectedField} />}
      {selectedKeyframe && <KeyframeInspector id={selectedKeyframe} />}
      <SceneEditor />
      {section && <SectionEditor key={section.id} section={section} />}
      <PageSettings />
    </aside>
  );
}
