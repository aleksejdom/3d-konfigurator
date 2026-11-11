import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { applyState, createStage, readProp, renderStage, resizeStage, setBackground } from '../core/stage.js';
import { splitPos } from '../core/timeline.js';
import type { Scope, Value } from '../core/types';
import { SCOPE_LABELS, lastScope, posLabel, propGroups } from './labels';
import { currentState, editor, sameValue } from './stage';
import { discardDraft, importModel, loadSampleModel, merken, setDraft, useEditor } from './store';

type GizmoMode = 'translate' | 'rotate' | 'scale';
const MODE_FIELD: Record<GizmoMode, string> = { translate: 'position', rotate: 'rotation', scale: 'scale' };
const MODE_LABEL: Record<GizmoMode, string> = { translate: 'Verschieben', rotate: 'Drehen', scale: 'Skalieren' };

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<GizmoMode>('translate');
  const [mode, setMode] = useState<GizmoMode>('translate');
  const [merkenOpen, setMerkenOpen] = useState(false);

  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const draft = useEditor((s) => s.draft);
  const modelVersion = useEditor((s) => s.modelVersion);
  const selectedNode = useEditor((s) => s.selectedNode);
  const drawCalls = useEditor((s) => s.drawCalls);
  const hasModel = project.model.file !== null;
  const dirty = Object.keys(draft).length > 0;

  // Bühne, Kamerasteuerung und Anfasser einmalig aufbauen.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const host = hostRef.current!;
    const stage = createStage(canvas);
    const orbit = new OrbitControls(stage.camera, canvas);
    const gizmo = new TransformControls(stage.camera, canvas);
    const gizmoHelper = gizmo.getHelper();
    stage.scene.add(gizmoHelper);
    editor.stage = stage;
    editor.orbit = orbit;
    editor.gizmo = gizmo;

    // Kamera bewegt: Position und Blickziel als ungespeicherte Änderung vormerken.
    orbit.addEventListener('end', () => {
      const { project, pos, draft } = useEditor.getState();
      stage.target.copy(orbit.target);
      const state = currentState(project, pos, draft);
      const patch: Record<string, Value> = {};
      for (const prop of ['camera.position', 'camera.target']) {
        const value = readProp(stage, prop) as Value;
        if (!sameValue(value, state[prop])) patch[prop] = value;
      }
      if (Object.keys(patch).length > 0) setDraft(patch);
    });

    gizmo.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !(event as unknown as { value: boolean }).value;
    });
    gizmo.addEventListener('objectChange', () => {
      const id = useEditor.getState().selectedNode;
      if (!id) return;
      const prop = `node:${id}.${MODE_FIELD[modeRef.current]}`;
      setDraft({ [prop]: readProp(stage, prop) as Value });
    });

    // Klick auf ein Bauteil wählt es aus.
    const raycaster = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const onDown = (event: PointerEvent) => (down = { x: event.clientX, y: event.clientY });
    const onUp = (event: PointerEvent) => {
      if (event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return;
      if (gizmo.dragging || gizmo.axis !== null) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, stage.camera);
      const hit = raycaster.intersectObject(stage.model, true)[0];
      useEditor.setState({ selectedNode: hit ? (hit.object.userData.nodeId ?? null) : null });
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    const resize = () => resizeStage(stage, host.clientWidth, host.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let raf = 0;
    let frame = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // Draw Calls der Szene ohne die Hilfselemente des Editors messen.
      if (frame++ % 30 === 0) {
        const visible = gizmoHelper.visible;
        gizmoHelper.visible = false;
        renderStage(stage);
        const calls = stage.renderer.info.render.calls;
        if (calls !== useEditor.getState().drawCalls) useEditor.setState({ drawCalls: calls });
        gizmoHelper.visible = visible;
      }
      renderStage(stage);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      gizmo.dispose();
      orbit.dispose();
      stage.renderer.dispose();
      editor.stage = editor.orbit = editor.gizmo = null;
    };
  }, []);

  // Zustand an der Timeline-Position anzeigen, überlagert von ungespeicherten Änderungen.
  useEffect(() => {
    const { stage, orbit } = editor;
    if (!stage || !orbit) return;
    setBackground(stage, project.settings.background);
    applyState(stage, currentState(project, pos, draft));
    orbit.target.copy(stage.target);
    orbit.update();
  }, [project, pos, draft, modelVersion]);

  // Anfasser an das ausgewählte Bauteil hängen.
  useEffect(() => {
    const { stage, gizmo } = editor;
    if (!stage || !gizmo) return;
    modeRef.current = mode;
    gizmo.setMode(mode);
    const object = selectedNode ? stage.nodes.get(selectedNode) : undefined;
    if (object) gizmo.attach(object);
    else gizmo.detach();
  }, [selectedNode, mode, modelVersion]);

  const { index } = splitPos(project, pos);
  const section = project.sections[index];

  return (
    <div className="viewport" ref={hostRef}>
      <canvas ref={canvasRef} />

      {section && (
        <div className={`viewport-content align-${section.align}`} aria-hidden="true">
          <div>
            {section.elements.map((element) =>
              element.type === 'headline' ? (
                <h2 key={element.id}>{element.text}</h2>
              ) : element.type === 'button' ? (
                <span key={element.id} className="content-button">
                  {element.text}
                </span>
              ) : (
                <p key={element.id}>{element.text}</p>
              ),
            )}
          </div>
        </div>
      )}

      {!hasModel && (
        <div className="viewport-empty">
          <h2>Modell importieren</h2>
          <p>GLB oder glTF mit eingebetteten Daten.</p>
          <div className="row">
            <button className="primary" onClick={importModel}>
              Datei wählen
            </button>
            <button onClick={loadSampleModel}>Beispielmodell laden</button>
          </div>
        </div>
      )}

      <div className="viewport-tools">
        {(Object.keys(MODE_LABEL) as GizmoMode[]).map((m) => (
          <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
            {MODE_LABEL[m]}
          </button>
        ))}
        <button onClick={() => useEditor.setState({ selectedNode: 'model' })} disabled={!hasModel}>
          Modell wählen
        </button>
      </div>

      <div className="viewport-merken">
        <div className="merken-row">
          {dirty && (
            <button onClick={discardDraft} title="Ungespeicherte Änderungen an dieser Stelle verwerfen">
              Verwerfen
            </button>
          )}
          <button className="merken" onClick={() => setMerkenOpen(!merkenOpen)} disabled={!hasModel}>
            Merken
          </button>
        </div>
        <div className="merken-caption">
          {posLabel(project, pos)}
          {dirty && <span className="badge">ungespeichert</span>}
        </div>
        {merkenOpen && <MerkenPopover onClose={() => setMerkenOpen(false)} />}
      </div>

      <div className="viewport-hud">{hasModel ? `${drawCalls} Draw Calls` : ''}</div>
    </div>
  );
}

function MerkenPopover({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const draft = useEditor((s) => s.draft);
  const groups = useMemo(() => propGroups(project, draft), [project, draft]);
  const anyDirty = groups.some((g) => g.dirty);

  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, anyDirty ? g.dirty : !g.key.startsWith('node:')])),
  );
  const [scopes, setScopes] = useState<Record<string, Scope>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, lastScope(project, g.props)])),
  );

  const save = () => {
    merken(groups.filter((g) => checked[g.key]).flatMap((g) => g.props.map((prop) => ({ prop, scope: scopes[g.key] }))));
    onClose();
  };

  return (
    <div className="popover merken-popover">
      <div className="popover-title">Was soll bei „{posLabel(project, useEditor.getState().pos)}“ gelten?</div>
      <div className="row links">
        <button onClick={() => setChecked(Object.fromEntries(groups.map((g) => [g.key, true])))}>Ganze Szene</button>
        <button onClick={() => setChecked(Object.fromEntries(groups.map((g) => [g.key, g.dirty])))} disabled={!anyDirty}>
          Nur Geändertes
        </button>
      </div>
      {groups.map((group) => (
        <div className="merken-group" key={group.key}>
          <label>
            <input
              type="checkbox"
              checked={!!checked[group.key]}
              onChange={(e) => setChecked({ ...checked, [group.key]: e.target.checked })}
            />
            {group.label}
            {group.dirty && <span className="badge">geändert</span>}
          </label>
          <select
            value={scopes[group.key]}
            disabled={!checked[group.key]}
            onChange={(e) => setScopes({ ...scopes, [group.key]: e.target.value as Scope })}
          >
            <option value="inherit">{SCOPE_LABELS.inherit}</option>
            <option value="local">{SCOPE_LABELS.local}</option>
          </select>
        </div>
      ))}
      <div className="row end">
        <button onClick={onClose}>Abbrechen</button>
        <button className="primary" onClick={save} disabled={!groups.some((g) => checked[g.key])}>
          Merken
        </button>
      </div>
    </div>
  );
}
