import { levelTints, resolveFields, syncDataElements, testData } from '../core/data.js';
import { dominant, optionProp } from '../core/actions.js';
import { applyOptions, syncOptionElements, timelineWeights } from '../core/configurator.js';
import { Box, MapPin, Monitor, Move3d, Rotate3d, Ruler, Scaling, Smartphone, Tablet } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';
import { bindComponents, resolveFraming } from '../core/components.js';
import { applyEnvironment, applyFraming, applyState, createStage, loadEnvironment, readProp, renderStage, resizeStage, syncLights, updateClips } from '../core/stage.js';
import { splitPos } from '../core/timeline.js';
import type { Breakpoint, Scope, Value } from '../core/types';
import { positionHotspots } from '../core/interaction.js';
import { renderCss, renderFontFaces, renderFreeLayer, renderHotspotLayer, renderSections } from '../export/page.js';
import { addComponent, effectiveStyle, locate, removeComponent, setStyle, setStyles } from './components';
import { addHotspot } from './interactions';
import { syncHierarchy } from './hierarchy';
import { SCOPE_LABELS, lastScope, posLabel, propGroups } from './labels';
import { currentState, editor, sameValue } from './stage';
import { discardDraft, importModel, loadSampleModel, merken, notify, selectComponent, selectedComponents, setDraft, setSceneValue, useEditor } from './store';

type GizmoMode = 'translate' | 'rotate' | 'scale';
const MODE_FIELD: Record<GizmoMode, string> = { translate: 'position', rotate: 'rotation', scale: 'scale' };
const MODE_LABEL: Record<GizmoMode, string> = { translate: 'Verschieben', rotate: 'Drehen', scale: 'Skalieren' };

/** Breite, in der die Seite für einen Breakpoint dargestellt wird. Desktop: mindestens 1280 px. */
const DEVICE_WIDTH: Record<Breakpoint, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const MODE_ICON = { translate: Move3d, rotate: Rotate3d, scale: Scaling };
const DEVICE_ICON = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };
const DEVICE_LABEL: Record<Breakpoint, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };

export const DRAG_TYPE = 'application/x-component';

/**
 * Hilfsfigur eines Lichts im Editor: Markierung am Ort des Lichts, Linie zum Blickziel und
 * bei Spotlichtern der Lichtkreis am Ziel. update() folgt den aktuellen Werten des Lichts.
 */
function lightHelper(light: THREE.Light & { angle?: number }, color: number, size: number) {
  const material = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 });
  const marker = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.OctahedronGeometry(size, 0)), material);
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), material);
  const circle = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 48 }, (_, i) => new THREE.Vector3(Math.cos((i / 48) * Math.PI * 2), Math.sin((i / 48) * Math.PI * 2), 0))),
    material,
  );
  const group = new THREE.Group() as THREE.Group & { update: () => void; dispose: () => void };
  const type = light.userData.type as string;
  group.add(marker);
  if (type !== 'point') group.add(ray);
  if (type === 'spot') group.add(circle);
  group.update = () => {
    const target = light.userData.target as THREE.Vector3;
    marker.position.copy(light.position);
    ray.geometry.setFromPoints([light.position, target]);
    circle.position.copy(target);
    circle.lookAt(light.position);
    circle.scale.setScalar(Math.max(1e-3, light.position.distanceTo(target) * Math.tan(light.angle ?? 0)));
  };
  group.dispose = () => {
    material.dispose();
    [marker, ray, circle].forEach((object) => object.geometry.dispose());
  };
  group.renderOrder = 10;
  return group;
}

/**
 * Passt das CSS der Seite an den Rahmen im Editor an, damit er dasselbe zeigt wie Vorschau und Export:
 * Der Rahmen selbst ist die Seite (.site), und rem zählt wie im Browser 16 px, nicht die Schriftgröße des Editors.
 */
function editorCss(css: string): string {
  return css
    .replace(/(^|\n)\.site(?=[ {*])/g, '$1:scope')
    .replace(/(\d*\.?\d+)rem\b/g, (_, n: string) => `${Math.round(parseFloat(n) * 16 * 100) / 100}px`);
}

export function Viewport() {
  const outerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<GizmoMode>('translate');
  /** Eigenschaft, die der Anfasser gerade bewegt, wenn er an einem Licht hängt */
  const gizmoProp = useRef<string | null>(null);
  const lightHelpers = useRef(new THREE.Group());
  const [mode, setMode] = useState<GizmoMode>('translate');
  const [merkenOpen, setMerkenOpen] = useState(false);
  const [environmentVersion, setEnvironmentVersion] = useState(0);
  const [available, setAvailable] = useState({ width: 1280, height: 720 });

  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const draft = useEditor((s) => s.draft);
  const modelVersion = useEditor((s) => s.modelVersion);
  // Gruppen werden beim Umbau der Hierarchie neu angelegt; der Anfasser hängt sich danach an das neue Objekt.
  const treeVersion = useEditor((s) => s.treeVersion);
  const selectedNode = useEditor((s) => s.selectedNode);
  const drawCalls = useEditor((s) => s.drawCalls);
  const breakpoint = useEditor((s) => s.breakpoint);
  const assets = useEditor((s) => s.assets);
  const dragging = useEditor((s) => s.dragging);
  const placingHotspot = useEditor((s) => s.placingHotspot);
  const hasModel = project.model.file !== null;
  const dirty = Object.keys(draft).length > 0;

  // Gerätefläche: Auf Desktop füllt sie den Viewport, die Seite wird aber mindestens 1280 px breit
  // gerechnet und verkleinert dargestellt, damit der Desktop-Breakpoint auch in einem kleinen Fenster stimmt.
  // Ist eine Seitenbreite gesetzt und schmaler, zeigt die Fläche genau diese Breite.
  const pageWidth = project.settings.layout.pageWidth || Infinity;
  const logicalWidth = Math.min(pageWidth, breakpoint === 'desktop' ? Math.max(available.width, DEVICE_WIDTH.desktop) : DEVICE_WIDTH[breakpoint]);
  const scale = Math.min(1, available.width / logicalWidth);
  const deviceWidth = logicalWidth * scale;
  const guides = useEditor((s) => s.guides);
  const selectedLight = useEditor((s) => s.selectedLight);
  const lightHandle = useEditor((s) => s.lightHandle);

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
    stage.scene.add(lightHelpers.current);
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
      // Hängt der Anfasser an einem Licht oder seinem Blickziel, wandert dessen Wert mit.
      if (gizmoProp.current) {
        setSceneValue(gizmoProp.current, gizmo.object!.position.toArray() as Value);
        return;
      }
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
      if (useEditor.getState().placingHotspot) {
        // Hotspot setzen: Punkt und Flächenrichtung im Koordinatensystem des getroffenen Bauteils.
        if (hit && hit.object.userData.nodeId) {
          addHotspot(hit.object.userData.nodeId, hit.object.worldToLocal(hit.point.clone()), hit.face ? hit.face.normal.clone() : null);
        }
        return;
      }
      useEditor.setState({ selectedNode: hit ? (hit.object.userData.nodeId ?? null) : null, selectedComponent: null, selectedLight: null });
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    const resize = () => resizeStage(stage, host.clientWidth, host.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let raf = 0;
    let frame = 0;
    let lastFrame = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // Draw Calls der Szene ohne die Hilfselemente des Editors messen.
      if (frame++ % 30 === 0) {
        const visible = gizmoHelper.visible;
        gizmoHelper.visible = false;
        lightHelpers.current.visible = false;
        renderStage(stage);
        const calls = stage.renderer.info.render.calls;
        if (calls !== useEditor.getState().drawCalls) useEditor.setState({ drawCalls: calls });
        gizmoHelper.visible = visible;
        lightHelpers.current.visible = true;
      }
      // Animationen des Modells laufen wie auf der Seite: pro Abschnitt in Schleife, einmal oder mit dem Scrollen.
      const state = useEditor.getState();
      const now = performance.now();
      updateClips(stage, state.project, state.pos, Math.min(0.1, (now - lastFrame) / 1000));
      lastFrame = now;
      for (const helper of lightHelpers.current.children) (helper as unknown as { update?: () => void }).update?.();
      renderStage(stage);
      // Hotspot-Punkte und daran verankerte Komponenten folgen ihrem Bauteil.
      if (frameRef.current && state.project.hotspots.length > 0) {
        positionHotspots(stage, state.project, frameRef.current.querySelectorAll<HTMLElement>('[data-hotspot]'), {
          pos: state.pos,
          activeId: state.selectedHotspot,
          editor: true,
        });
      }
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
    // Gruppen und umgehängte Bauteile zuerst aufbauen (nach Laden, Undo oder Redo).
    if (syncHierarchy(project, modelVersion)) useEditor.setState({ treeVersion: useEditor.getState().treeVersion + 1 });
    applyEnvironment(stage, project.settings);
    applyFraming(stage, resolveFraming(project, breakpoint));
    syncLights(stage, project);
    applyState(stage, currentState(project, pos, draft));

    // Varianten, Materialien und Sichtbarkeit so zeigen, wie die Timeline sie an dieser Stelle wählt.
    applyOptions(stage, project, timelineWeights(stage, project), levelTints(project, resolveFields(project, testData(project))));
    orbit.target.copy(stage.target);
    orbit.update();
  }, [project, pos, draft, modelVersion, breakpoint, environmentVersion]);

  // HDRI oder Panorama laden, sobald sich die Datei der Umgebung ändert (auch nach Undo oder Öffnen).
  const environmentFile = project.settings.environment.file;
  const environmentUrl = useEditor((s) => (environmentFile ? s.assets[environmentFile]?.url : undefined));
  useEffect(() => {
    const stage = editor.stage;
    if (!stage) return;
    let cancelled = false;
    loadEnvironment(stage, environmentUrl ?? null, environmentFile ?? '')
      .catch(() => notify('Die Umgebung konnte nicht gelesen werden. Unterstützt werden .hdr sowie Panoramen als JPG, PNG oder WebP.'))
      .finally(() => !cancelled && setEnvironmentVersion((n) => n + 1));
    return () => {
      cancelled = true;
    };
  }, [environmentFile, environmentUrl]);

  // Hilfsfiguren für die Lichter: zeigen Ort, Richtung und Kegel bzw. Fläche. Nur im Editor.
  const lightIds = project.lights.map((light) => light.id + light.type).join(' ');
  const targetProxy = useRef(new THREE.Object3D());
  useEffect(() => {
    const stage = editor.stage;
    if (!stage) return;
    syncLights(stage, project);
    const group = lightHelpers.current;
    for (const helper of [...group.children]) {
      group.remove(helper);
      (helper as unknown as { dispose?: () => void }).dispose?.();
    }
    const size = stage.bounds.radius * 0.12;
    for (const [id, light] of stage.lights) {
      const active = id === selectedLight;
      const color = active ? 0xf5a623 : 0x8b9099;
      group.add(lightHelper(light, color, size));
      if (light.userData.type === 'area') {
        const helper = new RectAreaLightHelper(light, color);
        // Der Helfer von Three.js erwartet, am Licht zu hängen; hier liegt er in der Gruppe und folgt dessen Matrix.
        helper.matrix = light.matrixWorld;
        helper.matrixAutoUpdate = false;
        group.add(helper);
      }
    }
    if (selectedLight === 'keyLight') group.add(new THREE.DirectionalLightHelper(stage.keyLight, size * 2, 0xf5a623));
    applyState(stage, currentState(project, pos, draft));
  }, [lightIds, selectedLight, modelVersion]);

  // Anfasser an das ausgewählte Bauteil oder Licht hängen.
  useEffect(() => {
    const { stage, gizmo } = editor;
    if (!stage || !gizmo) return;
    modeRef.current = mode;
    gizmoProp.current = null;
    if (selectedLight) {
      const light = selectedLight === 'keyLight' ? stage.keyLight : stage.lights.get(selectedLight);
      const prefix = selectedLight === 'keyLight' ? 'keyLight' : `light:${selectedLight}`;
      if (!light) {
        gizmo.detach();
        return;
      }
      gizmo.setMode('translate');
      if (lightHandle === 'target' && selectedLight !== 'keyLight' && light.userData.type !== 'point') {
        // Das Blickziel hat kein eigenes Objekt in der Szene; ein unsichtbarer Stellvertreter nimmt den Anfasser auf.
        const proxy = targetProxy.current;
        if (!proxy.parent) stage.scene.add(proxy);
        proxy.position.copy(light.userData.target);
        gizmo.attach(proxy);
        gizmoProp.current = `${prefix}.target`;
      } else {
        gizmo.attach(light);
        gizmoProp.current = `${prefix}.position`;
      }
      return;
    }
    gizmo.setMode(mode);
    const object = selectedNode ? stage.nodes.get(selectedNode) : undefined;
    if (object) gizmo.attach(object);
    else gizmo.detach();
  }, [selectedNode, selectedLight, lightHandle, lightIds, mode, modelVersion, treeVersion]);

  // ---------- Seite über dem Canvas ----------

  const { index } = splitPos(project, pos);
  const section = project.sections[index];

  const css = useMemo(
    () => `${renderFontFaces(project, (file: string) => assets[file]?.url ?? '')}@scope (.page-frame) {\n${editorCss(renderCss(project))}\n}`,
    [project, assets],
  );
  const html = useMemo(() => {
    // Bei festen Texten auch den nächsten Abschnitt ausgeben: Sein Text gleitet am Ende des aktuellen herein.
    const only = project.settings.textMode !== 'flow' ? [index, index + 1] : index;
    const options = { only, editor: true, indent: '', assetUrl: (name: string) => assets[name]?.url ?? '' };
    return `<main class="page">${renderSections(project, options)}</main>${renderFreeLayer(project, options)}${renderHotspotLayer(project, options)}`;
  }, [project, index, assets]);

  // Scroll-Animationen der Komponenten: dieselbe Funktion wie in Vorschau und Export.
  useLayoutEffect(() => {
    const update = bindComponents(
      frameRef.current!,
      project.sections.map((s) => s.id),
      { pinned: project.settings.textMode !== 'flow' },
    );
    update(pos);
  }, [html, pos, project.sections, project.settings.textMode]);

  // Aktive Variante in Buttons, Karten, Auswahllisten und Slidern anzeigen.
  useLayoutEffect(() => {
    const state = currentState(project, pos, draft);
    const selection: Record<string, string> = {};
    for (const group of project.variantGroups) {
      const choice = dominant(state[optionProp(group.id)] as string | Record<string, number> | undefined) ?? group.options[0]?.id;
      if (choice) selection[group.id] = choice;
    }
    syncOptionElements(frameRef.current!, project, selection);
    // Digitaler Zwilling: Testwerte in Messwerten, Statusanzeigen, Karten und Hotspots zeigen.
    syncDataElements(frameRef.current!, project, resolveFields(project, testData(project)), { status: 'test', lastUpdate: null });
  }, [html, project, pos, draft]);

  /** Komponente anklicken (auswählen) oder, wenn sie frei platziert ist, ziehen. */
  const onFramePointerDown = (event: React.PointerEvent) => {
    const marker = (event.target as HTMLElement).closest<HTMLElement>('.hotspot');
    if (marker) {
      useEditor.setState({ selectedHotspot: marker.dataset.hotspot!, selectedComponent: null });
      return;
    }
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-c]');
    if (!element || event.button !== 0) return;
    event.preventDefault();
    const frame = frameRef.current!;
    const root = element.closest<HTMLElement>('.free-layer > .c:not(.anchored)');
    const additive = event.shiftKey;
    const start = { x: event.clientX, y: event.clientY };
    let delta: { x: number; y: number } | null = null;
    // Gezogen werden alle ausgewählten frei platzierten Komponenten, wenn die angeklickte dazugehört.
    const before = selectedComponents();
    const ids = root && before.includes(root.dataset.c!) ? before : root ? [root.dataset.c!] : [];
    const moving = ids
      .map((id) => frame.querySelector<HTMLElement>(`.free-layer > .c:not(.anchored)[data-c="${CSS.escape(id)}"]`))
      .filter((el): el is HTMLElement => el !== null);

    const onMove = (e: PointerEvent) => {
      if (!delta && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      if (moving.length === 0 || additive) return;
      // Abstände sind px der Seite; die Darstellung im Editor kann verkleinert sein.
      delta = { x: Math.round((e.clientX - start.x) / scale), y: Math.round((e.clientY - start.y) / scale) };
      for (const el of moving) {
        el.style.setProperty('--dx', delta.x + 'px');
        el.style.setProperty('--dy', delta.y + 'px');
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      for (const el of moving) {
        el.style.removeProperty('--dx');
        el.style.removeProperty('--dy');
      }
      if (delta && moving.length > 0) {
        const { project, breakpoint } = useEditor.getState();
        const moved = delta;
        setStyles(
          moving.map((el) => {
            const style = effectiveStyle(locate(project, el.dataset.c!)!.node, breakpoint);
            return { id: el.dataset.c!, patch: { x: (style.x ?? 0) + moved.x, y: (style.y ?? 0) + moved.y } };
          }),
          breakpoint,
        );
        if (!before.includes(root!.dataset.c!)) selectComponent(root!.dataset.c!);
      } else {
        selectComponent(element.dataset.c!, additive);
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

    let inner: { left: number; right: number; top: number; bottom: number } | undefined = frame
      .querySelector('.section-inner')
      ?.getBoundingClientRect();
    if (inner && project.settings.textMode !== 'flow') {
      // Feste Texte füllen das ganze Bild. Als Textspalte gilt der Bereich um die vorhandenen Elemente,
      // ohne Elemente das Drittel auf der Seite der Textspalte.
      const frameRect = frame.getBoundingClientRect();
      const children = [...frame.querySelector('.section-inner')!.children].map((el) => el.getBoundingClientRect());
      const right = section.align === 'right';
      const margin = 0.04 * frameRect.width;
      inner = children.length
        ? {
            left: Math.min(...children.map((r) => r.left)) - margin,
            right: Math.max(...children.map((r) => r.right)) + margin,
            top: Math.min(...children.map((r) => r.top)) - margin,
            bottom: Math.max(...children.map((r) => r.bottom)) + margin,
          }
        : {
            left: right ? frameRect.right - frameRect.width / 3 : frameRect.left,
            right: right ? frameRect.right : frameRect.left + frameRect.width / 3,
            top: frameRect.top,
            bottom: frameRect.bottom,
          };
    }
    const inFlow =
      inner && event.clientX >= inner.left && event.clientX <= inner.right && event.clientY >= inner.top && event.clientY <= inner.bottom;
    if (inFlow) {
      addComponent(spec, { sectionId: section.id });
      return;
    }
    // Frei ablegen: Der Anker richtet sich nach dem Drittel des Bildes, der Abstand ist in px der Seite.
    const rect = frame.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale;
    const y = (event.clientY - rect.top) / scale;
    const width = rect.width / scale;
    const height = rect.height / scale;
    const { innerWidth, padding } = project.settings.layout;
    const wrap = Math.max(padding, (width - innerWidth) / 2);
    const anchorX = x < width / 3 ? 'left' : x > (width * 2) / 3 ? 'right' : 'center';
    addComponent(spec, {
      sectionId: section.id,
      free: {
        anchorX,
        anchorY: 'center',
        x: Math.round(anchorX === 'left' ? x - wrap : anchorX === 'center' ? x - width / 2 : x - (width - wrap)),
        y: Math.round(y - height / 2),
      },
    });
  };

  return (
    <div
      className={`viewport ${placingHotspot ? 'placing' : ''}`}
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
        {guides && (
          <div
            className="layout-guides"
            style={{
              ['--guide' as string]: `${Math.max(project.settings.layout.padding, (logicalWidth - project.settings.layout.innerWidth) / 2) * scale}px`,
            }}
            aria-hidden
          />
        )}
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
        {(Object.keys(MODE_LABEL) as GizmoMode[]).map((m) => {
          const Icon = MODE_ICON[m];
          return (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)} title={MODE_LABEL[m]} aria-label={MODE_LABEL[m]}>
              <Icon size={16} aria-hidden />
            </button>
          );
        })}
        <span className="tool-sep" />
        <button onClick={() => useEditor.setState({ selectedNode: 'model', selectedComponent: null })} disabled={!hasModel}>
          <Box size={15} aria-hidden />
          Modell wählen
        </button>
        <button
          className={placingHotspot ? 'active' : ''}
          disabled={!hasModel}
          onClick={() => useEditor.setState({ placingHotspot: !placingHotspot })}
          title="Danach auf das Modell klicken"
        >
          <MapPin size={15} aria-hidden />
          Hotspot setzen
        </button>
        <span className="tool-gap" />
        <button
          className={guides ? 'active' : ''}
          onClick={() => useEditor.setState({ guides: !guides })}
          title="Hilfslinien des Inhaltsbereichs (Inner-Wrapper) zeigen"
          aria-label="Hilfslinien"
          aria-pressed={guides}
        >
          <Ruler size={16} aria-hidden />
        </button>
        {(Object.keys(DEVICE_LABEL) as Breakpoint[]).map((b) => (
          <button
            key={b}
            className={breakpoint === b ? 'active' : ''}
            onClick={() => useEditor.setState({ breakpoint: b })}
            title={`Vorschau und Gestaltung für ${DEVICE_LABEL[b]}`}
            aria-label={DEVICE_LABEL[b]}
          >
            {(() => {
              const Icon = DEVICE_ICON[b];
              return <Icon size={16} aria-hidden />;
            })()}
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
  const also = useEditor((s) => s.alsoSelected);
  const boxRef = useRef<HTMLDivElement>(null);

  // Weitere ausgewählte Komponenten bekommen einen gestrichelten Rahmen.
  useEffect(() => {
    const frame = props.frameRef.current;
    if (!frame) return;
    const elements = also.map((id) => frame.querySelector<HTMLElement>(`[data-c="${CSS.escape(id)}"]`)).filter((el) => el !== null);
    elements.forEach((el) => el.classList.add('is-also-selected'));
    return () => elements.forEach((el) => el.classList.remove('is-also-selected'));
  }, [also, props.html, props.frameRef]);
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
      selectedComponents().forEach(removeComponent);
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
