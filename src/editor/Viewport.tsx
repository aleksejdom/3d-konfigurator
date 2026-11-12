import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { bindComponents, resolveFraming } from '../core/components.js';
import { applyFraming, applyState, createStage, readProp, renderStage, resizeStage, setBackground } from '../core/stage.js';
import { splitPos } from '../core/timeline.js';
import type { Breakpoint, Scope, Value } from '../core/types';
import { renderCss, renderFreeLayer, renderSections } from '../export/page.js';
import { addComponent, removeComponent, setStyle } from './components';
import { SCOPE_LABELS, lastScope, posLabel, propGroups } from './labels';
import { currentState, editor, sameValue } from './stage';
import { discardDraft, importModel, loadSampleModel, merken, setDraft, useEditor } from './store';

type GizmoMode = 'translate' | 'rotate' | 'scale';
const MODE_FIELD: Record<GizmoMode, string> = { translate: 'position', rotate: 'rotation', scale: 'scale' };
const MODE_LABEL: Record<GizmoMode, string> = { translate: 'Verschieben', rotate: 'Drehen', scale: 'Skalieren' };

/** Breite, in der die Seite für einen Breakpoint dargestellt wird. Desktop: mindestens 1280 px. */
const DEVICE_WIDTH: Record<Breakpoint, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const DEVICE_LABEL: Record<Breakpoint, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };

export const DRAG_TYPE = 'application/x-component';

export function Viewport() {
  const outerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<GizmoMode>('translate');
  const [mode, setMode] = useState<GizmoMode>('translate');
  const [merkenOpen, setMerkenOpen] = useState(false);
  const [available, setAvailable] = useState({ width: 1280, height: 720 });

  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const draft = useEditor((s) => s.draft);
  const modelVersion = useEditor((s) => s.modelVersion);
  const selectedNode = useEditor((s) => s.selectedNode);
  const drawCalls = useEditor((s) => s.drawCalls);
  const breakpoint = useEditor((s) => s.breakpoint);
  const assets = useEditor((s) => s.assets);
  const dragging = useEditor((s) => s.dragging);
  const hasModel = project.model.file !== null;
  const dirty = Object.keys(draft).length > 0;

  // Gerätefläche: Auf Desktop füllt sie den Viewport, die Seite wird aber mindestens 1280 px breit
  // gerechnet und verkleinert dargestellt, damit der Desktop-Breakpoint auch in einem kleinen Fenster stimmt.
  const deviceWidth = breakpoint === 'desktop' ? available.width : Math.min(available.width, DEVICE_WIDTH[breakpoint]);
  const logicalWidth = breakpoint === 'desktop' ? Math.max(available.width, DEVICE_WIDTH.desktop) : DEVICE_WIDTH[breakpoint];
  const scale = deviceWidth / logicalWidth;

  useEffect(() => {
    const outer = outerRef.current!;
    const observer = new ResizeObserver(() => setAvailable({ width: outer.clientWidth, height: outer.clientHeight }));
    observer.observe(outer);
    return () => observer.disconnect();
  }, []);

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
      useEditor.setState({ selectedNode: hit ? (hit.object.userData.nodeId ?? null) : null, selectedComponent: null });
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
    applyFraming(stage, resolveFraming(project, breakpoint));
    applyState(stage, currentState(project, pos, draft));
    orbit.target.copy(stage.target);
    orbit.update();
  }, [project, pos, draft, modelVersion, breakpoint]);

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

  // ---------- Seite über dem Canvas ----------

  const { index } = splitPos(project, pos);
  const section = project.sections[index];

  const css = useMemo(() => `@scope (.page-frame) {\n${renderCss(project)}\n}`, [project]);
  const html = useMemo(() => {
    const options = { only: index, editor: true, indent: '', assetUrl: (name: string) => assets[name]?.url ?? '' };
    return `<main class="page">${renderSections(project, options)}</main>${renderFreeLayer(project, options)}`;
  }, [project, index, assets]);

  // Scroll-Animationen der Komponenten: dieselbe Funktion wie in Vorschau und Export.
  useLayoutEffect(() => {
    const update = bindComponents(
      frameRef.current!,
      project.sections.map((s) => s.id),
    );
    update(pos);
  }, [html, pos, project.sections]);

  /** Komponente anklicken (auswählen) oder, wenn sie frei platziert ist, ziehen. */
  const onFramePointerDown = (event: React.PointerEvent) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-c]');
    if (!element || event.button !== 0) return;
    event.preventDefault();
    const frame = frameRef.current!.getBoundingClientRect();
    const root = element.closest<HTMLElement>('.free-layer > .c');
    const rootRect = root?.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    let position: { x: number; y: number } | null = null;

    const onMove = (e: PointerEvent) => {
      if (!position && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      if (!root || !rootRect) return;
      position = {
        x: Math.round(((rootRect.left + e.clientX - start.x - frame.left) / frame.width) * 1000) / 10,
        y: Math.round(((rootRect.top + e.clientY - start.y - frame.top) / frame.height) * 1000) / 10,
      };
      root.style.left = position.x + '%';
      root.style.top = position.y + '%';
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (position && root) {
        setStyle(root.dataset.c!, position, useEditor.getState().breakpoint);
        useEditor.setState({ selectedComponent: root.dataset.c! });
      } else {
        useEditor.setState({ selectedComponent: element.dataset.c! });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Komponente aus der Bibliothek ablegen: in eine Karte, ins Seitenlayout oder frei über dem Canvas. */
  const onDrop = (event: React.DragEvent) => {
    const data = event.dataTransfer.getData(DRAG_TYPE);
    useEditor.setState({ dragging: false });
    if (!data || !section) return;
    event.preventDefault();
    const spec = JSON.parse(data);
    const frame = frameRef.current!;

    let element = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((el) => frame.contains(el) && el.closest('[data-c]'))
      ?.closest<HTMLElement>('[data-c]');
    while (element && !element.classList.contains('card') && !element.classList.contains('infobox')) {
      element = element.parentElement?.closest<HTMLElement>('[data-c]') ?? undefined;
    }
    if (element) {
      addComponent(spec, { sectionId: section.id, containerId: element.dataset.c });
      return;
    }

    const inner = frame.querySelector('.section-inner')?.getBoundingClientRect();
    const inFlow =
      inner && event.clientX >= inner.left && event.clientX <= inner.right && event.clientY >= inner.top && event.clientY <= inner.bottom;
    if (inFlow) {
      addComponent(spec, { sectionId: section.id });
      return;
    }
    const rect = frame.getBoundingClientRect();
    addComponent(spec, {
      sectionId: section.id,
      free: { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 },
    });
  };

  return (
    <div
      className="viewport"
      ref={outerRef}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
    >
      <div className={`device ${breakpoint}`} ref={hostRef} style={{ width: deviceWidth }}>
        <canvas ref={canvasRef} />
        <style>{css}</style>
        <div
          ref={frameRef}
          className={`page-frame site ${dragging ? 'dragging' : ''}`}
          style={{ width: logicalWidth, height: available.height / scale, transform: `scale(${scale})` }}
          onPointerDown={onFramePointerDown}
          onClick={(event) => event.preventDefault()}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <SelectionBox frameRef={frameRef} hostRef={hostRef} scale={scale} html={html} />
      </div>

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
        <button onClick={() => useEditor.setState({ selectedNode: 'model', selectedComponent: null })} disabled={!hasModel}>
          Modell wählen
        </button>
        <span className="tool-gap" />
        {(Object.keys(DEVICE_LABEL) as Breakpoint[]).map((b) => (
          <button
            key={b}
            className={breakpoint === b ? 'active' : ''}
            onClick={() => useEditor.setState({ breakpoint: b })}
            title={`Vorschau und Gestaltung für ${DEVICE_LABEL[b]}`}
          >
            {DEVICE_LABEL[b]}
          </button>
        ))}
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

      <div className="viewport-hud">
        {hasModel ? `${drawCalls} Draw Calls` : ''}
        {breakpoint !== 'desktop' && ` · ${DEVICE_LABEL[breakpoint]}: Gestaltungswerte gelten nur für diesen Breakpoint`}
      </div>
    </div>
  );
}

/** Rahmen um die ausgewählte Komponente, mit Anfasser für die Breite. */
function SelectionBox(props: {
  frameRef: React.RefObject<HTMLDivElement | null>;
  hostRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  html: string;
}) {
  const selected = useEditor((s) => s.selectedComponent);
  const boxRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const box = boxRef.current!;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const frame = props.frameRef.current;
      const host = props.hostRef.current;
      const element = selected && frame ? frame.querySelector<HTMLElement>(`[data-c="${CSS.escape(selected)}"]`) : null;
      if (element !== elementRef.current) {
        elementRef.current?.classList.remove('is-selected');
        element?.classList.add('is-selected');
        elementRef.current = element;
      }
      if (!element || !host) {
        box.style.display = 'none';
        return;
      }
      const rect = element.getBoundingClientRect();
      const origin = host.getBoundingClientRect();
      box.style.display = rect.width === 0 ? 'none' : 'block';
      box.style.left = rect.left - origin.left + 'px';
      box.style.top = rect.top - origin.top + 'px';
      box.style.width = rect.width + 'px';
      box.style.height = rect.height + 'px';
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      elementRef.current?.classList.remove('is-selected');
      elementRef.current = null;
    };
  }, [selected, props.html, props.frameRef, props.hostRef]);

  const onResize = (event: React.PointerEvent) => {
    const element = elementRef.current;
    if (!element || !selected) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = element.getBoundingClientRect().width / props.scale;
    let width = startWidth;
    const onMove = (e: PointerEvent) => {
      width = Math.max(40, Math.round(startWidth + (e.clientX - startX) / props.scale));
      element.style.width = width + 'px';
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (width !== startWidth) setStyle(selected, { width }, useEditor.getState().breakpoint);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Entf löscht die ausgewählte Komponente (nicht während der Eingabe in einem Feld).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || !selected) return;
      if ((event.target as HTMLElement).closest('input, textarea, select')) return;
      removeComponent(selected);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  return (
    <div className="selection-box" ref={boxRef}>
      <div className="resize-handle" onPointerDown={onResize} title="Breite ändern" />
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
