import { useMemo } from 'react';
import { EASINGS } from '../core/easing.js';
import { resolveView } from '../core/interaction.js';
import type { Breakpoint, Follow, LookAt, TouchMode, Value, Vec3 } from '../core/types';
import { BREAKPOINT_LABELS, Field, NumberInput, VectorField } from './fields';
import {
  addFollow,
  addLookAt,
  clearHotspotView,
  removeFollow,
  removeHotspot,
  removeLookAt,
  saveHotspotView,
  setLookParam,
  setViewDistance,
  showHotspotView,
  updateFollow,
  updateHotspot,
  updateLookAt,
} from './interactions';
import { EASING_LABELS, lookProps, nodeName } from './labels';
import { currentState, editor } from './stage';
import { useEditor } from './store';

const ORDER: Breakpoint[] = ['desktop', 'tablet', 'mobile'];

function TouchSelect({ value, onChange }: { value: TouchMode; onChange: (value: TouchMode) => void }) {
  return (
    <Field label="Auf Touch-Geräten">
      <select value={value} onChange={(e) => onChange(e.target.value as TouchMode)}>
        <option value="off">Aus: Grundposition der Timeline</option>
        <option value="drag">Folgt dem Finger, solange er aufliegt</option>
      </select>
    </Field>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------- Hotspot ----------

export function HotspotInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  const breakpoint = useEditor((s) => s.breakpoint);
  const hotspot = project.hotspots.find((h) => h.id === id);
  if (!hotspot) return null;

  const own = hotspot.views[breakpoint] !== undefined;
  const view = resolveView(hotspot, breakpoint);
  const source = ORDER.slice(0, ORDER.indexOf(breakpoint) + 1)
    .reverse()
    .find((b) => hotspot.views[b]);
  const distance = view
    ? Math.hypot(view.position[0] - view.target[0], view.position[1] - view.target[1], view.position[2] - view.target[2])
    : 0;
  const status = !view ? 'noch keine' : own ? (breakpoint === 'desktop' ? 'gemerkt' : 'eigene Ansicht') : `geerbt von ${BREAKPOINT_LABELS[source!]}`;

  return (
    <section className="panel-block highlight">
      <header>
        <h3>Hotspot</h3>
        <button onClick={() => removeHotspot(id)}>Löschen</button>
      </header>
      <Field label="Name">
        <input value={hotspot.name} onChange={(e) => updateHotspot(id, { name: e.target.value }, 'hs-name-' + id)} />
      </Field>
      <Field label="Beschriftung neben dem Punkt">
        <input placeholder="leer = nur der Punkt" value={hotspot.label} onChange={(e) => updateHotspot(id, { label: e.target.value }, 'hs-label-' + id)} />
      </Field>
      <Field label={`Sichtbar · hängt an ${nodeName(hotspot.nodeId)}`}>
        <select value={hotspot.sectionId ?? ''} onChange={(e) => updateHotspot(id, { sectionId: e.target.value || null })}>
          <option value="">In allen Abschnitten</option>
          {project.sections.map((section) => (
            <option key={section.id} value={section.id}>
              Nur in „{section.name}“
            </option>
          ))}
        </select>
      </Field>
      {project.data.fields.length > 0 && (
        <Field label="Datenfeld (färbt den Punkt nach Stufe)">
          <select value={hotspot.fieldId ?? ''} onChange={(e) => updateHotspot(id, { fieldId: e.target.value || undefined })}>
            <option value="">Keines</option>
            {project.data.fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <h4>Detailansicht · {BREAKPOINT_LABELS[breakpoint]}</h4>
      <p className="hint view-status">Kameraansicht: {status}</p>
      <div className="row wrap">
        <button className="primary" onClick={() => saveHotspotView(id, breakpoint)}>
          Kameraansicht merken
        </button>
        <button disabled={!view} onClick={() => showHotspotView(id, breakpoint)}>
          Ansicht zeigen
        </button>
        {own && (
          <button onClick={() => clearHotspotView(id, breakpoint)} title={breakpoint === 'desktop' ? 'Detailansicht entfernen' : 'Zurück zur geerbten Ansicht'}>
            {breakpoint === 'desktop' ? 'Entfernen' : 'Zurücksetzen'}
          </button>
        )}
      </div>
      <p className="hint">
        Kamera im Viewport auf das Detail richten, dann „Kameraansicht merken“. Die Ansicht ist am Bauteil verankert und
        ändert die Timeline nicht.
      </p>
      {view && (
        <>
          <Field label="Abstand zum Blickziel">
            <NumberInput value={distance} step={0.1} min={0.001} onChange={(n) => setViewDistance(id, breakpoint, n)} />
          </Field>
          <Field label="Dauer der Kamerafahrt (s)">
            <NumberInput value={hotspot.duration} step={0.1} min={0} max={10} onChange={(n) => updateHotspot(id, { duration: n }, 'hs-duration-' + id)} />
          </Field>
          <Field label="Easing">
            <select value={hotspot.easing} onChange={(e) => updateHotspot(id, { easing: e.target.value })}>
              {Object.keys(EASINGS).map((name) => (
                <option key={name} value={name}>
                  {EASING_LABELS[name] ?? name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Beim Weiterscrollen">
            <select value={hotspot.onScroll} onChange={(e) => updateHotspot(id, { onScroll: e.target.value as 'return' | 'stay' })}>
              <option value="return">Weich zur aktuellen Scroll-Kamera zurück</option>
              <option value="stay">Detailansicht bleibt bis zum Schließen</option>
            </select>
          </Field>
        </>
      )}
    </section>
  );
}

// ---------- Look At ----------

const NODE_LIMIT = 300;

function LookAtBlock({ look, state }: { look: LookAt; state: Record<string, Value> }) {
  const hotspots = useEditor((s) => s.project.hotspots);
  const modelVersion = useEditor((s) => s.modelVersion);
  const nodes = useMemo(() => [...(editor.stage?.nodes.keys() ?? [])].slice(0, NODE_LIMIT), [modelVersion]);
  const [targetProp, strengthProp] = lookProps(look.id);
  const isCamera = look.subject === 'camera';

  let target = state[targetProp] ?? 'pointer';
  // Mitten in einem Übergang zwischen zwei Zielen: das mit dem größeren Gewicht anzeigen.
  if (typeof target === 'object' && !Array.isArray(target)) {
    const weights = target;
    target = Object.keys(weights).sort((a, b) => weights[b] - weights[a])[0];
  }
  const targetText = String(target);
  const strength = (state[strengthProp] ?? 1) as number;
  const point = targetText.startsWith('point:') ? (targetText.slice(6).split(',').map(Number) as Vec3) : null;
  const set = (patch: Partial<LookAt>, key?: string) => updateLookAt(look.id, patch, key && `${key}-${look.id}`);

  return (
    <div className="subblock">
      <div className="keyvalue-head">
        <strong>Look At</strong>
        <button onClick={() => removeLookAt(look.id)} aria-label="Look At entfernen" title="Look At entfernen">
          ×
        </button>
      </div>
      <Field label="Ziel">
        <select
          value={point ? 'point' : targetText}
          onChange={(e) => setLookParam(targetProp, e.target.value === 'point' ? 'point:0,0,0' : e.target.value)}
        >
          <option value="pointer">Mauszeiger</option>
          {!isCamera && <option value="camera">Kamera</option>}
          <option value="point">Freier 3D-Punkt</option>
          {hotspots.length > 0 && (
            <optgroup label="Hotspots">
              {hotspots.map((hotspot) => (
                <option key={hotspot.id} value={'hotspot:' + hotspot.id}>
                  {hotspot.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Objekte und Meshes">
            {nodes
              .filter((nodeId) => 'node:' + nodeId !== look.subject)
              .map((nodeId) => (
                <option key={nodeId} value={'node:' + nodeId}>
                  {nodeName(nodeId)}
                </option>
              ))}
          </optgroup>
        </select>
      </Field>
      {point && <VectorField label="Punkt" value={point} onChange={(v) => setLookParam(targetProp, 'point:' + v.join(','))} />}
      <Field label={`Stärke: ${Math.round(strength * 100)} %`}>
        <input type="range" min={0} max={1} step={0.05} value={strength} onChange={(e) => setLookParam(strengthProp, parseFloat(e.target.value))} />
      </Field>
      {!isCamera && (
        <Field label="Vorderseite des Bauteils">
          <select value={look.forward} onChange={(e) => set({ forward: e.target.value as LookAt['forward'] })}>
            <option value="+z">+Z (Standard)</option>
            <option value="-z">−Z</option>
            <option value="+x">+X</option>
            <option value="-x">−X</option>
          </select>
        </Field>
      )}
      <div className="checks">
        <Check label="Seitlich drehen" checked={look.yaw} onChange={(yaw) => set({ yaw })} />
        <Check label="Auf und ab" checked={look.pitch} onChange={(pitch) => set({ pitch })} />
      </div>
      <div className="field">
        <span>Winkelgrenzen seitlich / auf und ab (°)</span>
        <div className="vector two">
          <NumberInput label="Winkelgrenze seitlich" value={look.maxYaw} step={5} min={0} max={180} onChange={(n) => set({ maxYaw: n }, 'la-yaw')} />
          <NumberInput label="Winkelgrenze auf und ab" value={look.maxPitch} step={5} min={0} max={90} onChange={(n) => set({ maxPitch: n }, 'la-pitch')} />
        </div>
      </div>
      <Field label={`Dämpfung: ${look.damping === 0 ? 'aus' : look.damping.toFixed(2)}`}>
        <input type="range" min={0} max={0.98} step={0.01} value={look.damping} onChange={(e) => set({ damping: parseFloat(e.target.value) }, 'la-damping')} />
      </Field>
      <TouchSelect value={look.touch} onChange={(touch) => set({ touch })} />
    </div>
  );
}

function FollowBlock({ follow }: { follow: Follow }) {
  const set = (patch: Partial<Follow>, key?: string) => updateFollow(follow.id, patch, key && `${key}-${follow.id}`);
  return (
    <div className="subblock">
      <div className="keyvalue-head">
        <strong>Follow (Maus)</strong>
        <button onClick={() => removeFollow(follow.id)} aria-label="Follow entfernen" title="Follow entfernen">
          ×
        </button>
      </div>
      <div className="checks">
        <Check label="Horizontal" checked={follow.x} onChange={(x) => set({ x })} />
        <Check label="Vertikal" checked={follow.y} onChange={(y) => set({ y })} />
      </div>
      <Field label="Distanz (größte Verschiebung)">
        <NumberInput value={follow.distance} step={0.05} min={0} onChange={(n) => set({ distance: n }, 'fo-distance')} />
      </Field>
      <Field label={`Dämpfung: ${follow.damping === 0 ? 'aus' : follow.damping.toFixed(2)}`}>
        <input type="range" min={0} max={0.98} step={0.01} value={follow.damping} onChange={(e) => set({ damping: parseFloat(e.target.value) }, 'fo-damping')} />
      </Field>
      <Check label="Kehrt zurück, wenn der Zeiger das Fenster verlässt" checked={follow.returns} onChange={(returns) => set({ returns })} />
      <TouchSelect value={follow.touch} onChange={(touch) => set({ touch })} />
    </div>
  );
}

/** Look At und Follow für die Kamera ("camera") oder ein Bauteil ("node:<ID>"). */
export function InteractionEditor({ subject }: { subject: string }) {
  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const draft = useEditor((s) => s.draft);
  const state = useMemo(() => currentState(project, pos, draft), [project, pos, draft]);
  const looks = project.lookAts.filter((look) => look.subject === subject);
  const follows = project.follows.filter((follow) => follow.subject === subject);

  return (
    <>
      {looks.map((look) => (
        <LookAtBlock key={look.id} look={look} state={state} />
      ))}
      {follows.map((follow) => (
        <FollowBlock key={follow.id} follow={follow} />
      ))}
      <div className="row interaction-add">
        {looks.length === 0 && <button onClick={() => addLookAt(subject)}>+ Look At</button>}
        {follows.length === 0 && <button onClick={() => addFollow(subject)}>+ Follow</button>}
      </div>
      {(looks.length > 0 || follows.length > 0) && (
        <p className="hint">
          Wirkt zusätzlich zur Timeline und ist in der Vorschau zu sehen. Ziel und Stärke von Look At lassen sich mit
          „Merken“ pro Abschnitt speichern.
        </p>
      )}
    </>
  );
}
