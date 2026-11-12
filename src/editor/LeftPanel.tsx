import { DataList } from './DataPanels';
import { ConfiguratorList } from './ConfiguratorPanels';
import { useMemo } from 'react';
import type { Budget, ModelStats, Project } from '../core/types';
import { splitPos } from '../core/timeline.js';
import type { ComponentType } from '../core/types';
import {
  COMPONENT_LABELS,
  addComponent,
  deleteTemplate,
  effectiveStyle,
  isContainer,
  locate,
  moveComponent,
  resolvedTree,
  type ResolvedNode,
} from './components';
import { removeHotspot } from './interactions';
import { nodeName } from './labels';
import { createSection } from './project';
import { editor } from './stage';
import { importModel, setPos, update, useEditor } from './store';
import { DRAG_TYPE } from './Viewport';

const number = new Intl.NumberFormat('de-DE');
const megabytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(bytes / 1024) + ' KB'
    : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(bytes / 1024 / 1024) + ' MB';

/** Vergleicht das Modell mit den Budgets und nennt den überschrittenen Wert und das betroffene Asset. */
export function budgetWarnings(stats: ModelStats, file: string, drawCalls: number, budgets: Project['budgets']): string[] {
  const warnings: string[] = [];
  const check = (label: string, budget: Budget) => {
    if (stats.fileSize > budget.fileSizeMB * 1024 * 1024) {
      warnings.push(`${label}: ${file} hat ${megabytes(stats.fileSize)}, Budget ${budget.fileSizeMB} MB`);
    }
    if (stats.triangles > budget.triangles) {
      warnings.push(`${label}: ${number.format(stats.triangles)} Dreiecke, Budget ${number.format(budget.triangles)}`);
    }
    for (const texture of stats.textures) {
      const size = Math.max(texture.width, texture.height);
      if (size > budget.textureSize) {
        warnings.push(`${label}: Textur „${texture.name}“ hat ${texture.width} × ${texture.height} px, Budget ${budget.textureSize} px`);
      }
    }
    if (drawCalls > budget.drawCalls) {
      warnings.push(`${label}: ${drawCalls} Draw Calls, Budget ${budget.drawCalls}`);
    }
  };
  check('Desktop', budgets.desktop);
  check('Mobile', budgets.mobile);
  return warnings;
}

function Sections() {
  const project = useEditor((s) => s.project);
  const selected = useEditor((s) => s.selectedSection);

  const move = (index: number, by: number) =>
    update((p) => {
      const [section] = p.sections.splice(index, 1);
      p.sections.splice(index + by, 0, section);
    });

  return (
    <section className="panel-block">
      <header>
        <h3>Abschnitte</h3>
        <button
          onClick={() => {
            const section = createSection(`Abschnitt ${project.sections.length + 1}`);
            update((p) => void p.sections.push(section));
            setPos(project.sections.length);
          }}
        >
          + Abschnitt
        </button>
      </header>
      <ul className="list">
        {project.sections.map((section, i) => (
          <li key={section.id} className={section.id === selected ? 'selected' : ''}>
            <button className="list-main" onClick={() => setPos(i)}>
              <span className="index">{i + 1}</span> {section.name}
              <small>{section.height} vh</small>
            </button>
            <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Nach oben" title="Nach oben">
              ↑
            </button>
            <button
              disabled={i === project.sections.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Nach unten"
              title="Nach unten"
            >
              ↓
            </button>
            <button
              disabled={project.sections.length === 1}
              onClick={() =>
                update((p) => {
                  p.sections.splice(i, 1);
                  p.keyframes = p.keyframes.filter((k) => k.sectionId !== section.id);
                })
              }
              aria-label="Abschnitt löschen"
              title="Abschnitt und seine Punkte löschen"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TREE_LIMIT = 400;

function SceneTree() {
  const modelVersion = useEditor((s) => s.modelVersion);
  const selected = useEditor((s) => s.selectedNode);
  const nodes = useMemo(() => {
    const stage = editor.stage;
    if (!stage) return [];
    return [...stage.nodes.entries()].map(([id, object]) => ({
      id,
      depth: id === 'model' ? 0 : id.split('/').length,
      isMesh: (object as { isMesh?: boolean }).isMesh === true,
    }));
  }, [modelVersion]);

  return (
    <section className="panel-block">
      <header>
        <h3>Szene</h3>
      </header>
      <ul className="list tree">
        {nodes.slice(0, TREE_LIMIT).map((node) => (
          <li key={node.id} className={node.id === selected ? 'selected' : ''}>
            <button
              className="list-main"
              style={{ paddingLeft: 8 + node.depth * 12 }}
              onClick={() => useEditor.setState({ selectedNode: node.id })}
              title={node.id}
            >
              <span className="kind">{node.id === 'model' ? '◆' : node.isMesh ? '▣' : '▢'}</span> {nodeName(node.id)}
            </button>
          </li>
        ))}
      </ul>
      {nodes.length > TREE_LIMIT && (
        <p className="hint">
          {nodes.length - TREE_LIMIT} weitere Bauteile sind nicht aufgelistet. Sie lassen sich im Viewport anklicken.
        </p>
      )}
    </section>
  );
}

/** Gespeicherte Werte, deren Bauteil im aktuellen Modell nicht mehr vorkommt. */
function missingNodes(project: Project): string[] {
  const stage = editor.stage;
  if (!stage || !project.model.file) return [];
  const missing = new Set<string>();
  const check = (prop: string) => {
    const match = /^node:(.+)\.[a-z]+$/.exec(prop);
    if (match && !stage.nodes.has(match[1])) missing.add(match[1]);
  };
  Object.keys(project.base).forEach(check);
  project.keyframes.forEach((k) => Object.keys(k.values).forEach(check));
  return [...missing];
}

function Model() {
  const project = useEditor((s) => s.project);
  const drawCalls = useEditor((s) => s.drawCalls);
  const modelVersion = useEditor((s) => s.modelVersion);
  const measurement = useEditor((s) => s.measurement);
  const { file, stats } = project.model;
  const missing = useMemo(() => missingNodes(project), [project, modelVersion]);
  const warnings = stats && file ? budgetWarnings(stats, file, drawCalls, project.budgets) : [];

  return (
    <section className="panel-block">
      <header>
        <h3>Modell</h3>
        <button onClick={importModel}>{file ? 'Austauschen' : 'Importieren'}</button>
      </header>
      {!stats && <p className="hint">Noch kein Modell importiert.</p>}
      {stats && (
        <>
          <dl className="stats">
            <dt>Datei</dt>
            <dd title={file ?? ''}>{file}</dd>
            <dt>Dateigröße</dt>
            <dd>{megabytes(stats.fileSize)}</dd>
            <dt>Dreiecke</dt>
            <dd>{number.format(stats.triangles)}</dd>
            <dt>Meshes</dt>
            <dd>{number.format(stats.meshes)}</dd>
            <dt>Materialien</dt>
            <dd>{number.format(stats.materials)}</dd>
            <dt>Draw Calls</dt>
            <dd>{drawCalls} (gerenderte Szene)</dd>
            <dt>Animationsclips</dt>
            <dd title={(stats.clips ?? []).join(', ')}>{(stats.clips ?? []).length === 0 ? 'keine' : (stats.clips ?? []).join(', ')}</dd>
            <dt>Texturen</dt>
            <dd>{stats.textures.length === 0 ? 'keine' : stats.textures.length}</dd>
          </dl>
          {stats.textures.length > 0 && (
            <ul className="textures">
              {stats.textures.map((texture, i) => (
                <li key={i}>
                  <span title={texture.name}>{texture.name}</span>
                  <span>
                    {texture.width} × {texture.height}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">
            {measurement
              ? `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(measurement.ms / 1000)} s bis zum ersten sichtbaren Render · ${measurement.profile}`
              : 'Ladezeit: in der Vorschau messen.'}
          </p>
          {warnings.length > 0 && (
            <ul className="warnings">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {missing.length > 0 && (
            <ul className="warnings">
              {missing.map((id) => (
                <li key={id}>Fehlende Zuordnung: Bauteil „{id}“ gibt es im Modell nicht mehr.</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// ---------- Komponentenbibliothek ----------

const LIBRARY: { type: Exclude<ComponentType, 'instance'>; hint: string }[] = [
  { type: 'headline', hint: 'Überschrift' },
  { type: 'text', hint: 'Absatz' },
  { type: 'image', hint: 'PNG, JPG, SVG …' },
  { type: 'button', hint: 'Link als Schaltfläche' },
  { type: 'card', hint: 'Behälter für Elemente' },
  { type: 'infobox', hint: 'Kompakter Hinweis' },
  { type: 'select', hint: 'Variante aus einer Liste' },
  { type: 'slider', hint: 'Wischen, Pfeile, Tastatur' },
  { type: 'value', hint: 'Zahl mit Einheit' },
  { type: 'status', hint: 'Zustand als Text' },
  { type: 'connection', hint: 'Verbunden, veraltet, offline' },
];

function Library() {
  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const section = project.sections[splitPos(project, pos).index];

  /** Klick: in die ausgewählte Karte legen, sonst ins Seitenlayout des Abschnitts. */
  const add = (spec: { type: Exclude<ComponentType, 'instance'> } | { templateId: string }) => {
    if (!section) return;
    const selected = useEditor.getState().selectedComponent;
    const located = selected ? locate(project, selected) : null;
    const container = located && (isContainer(located.node.type) || located.node.type === 'instance') ? selected! : undefined;
    addComponent(spec, { sectionId: section.id, containerId: container });
  };

  const drag = (spec: object) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(spec));
      event.dataTransfer.effectAllowed = 'copy';
      useEditor.setState({ dragging: true });
    },
    onDragEnd: () => useEditor.setState({ dragging: false }),
  });

  return (
    <section className="panel-block">
      <header>
        <h3>Komponenten</h3>
      </header>
      <div className="library">
        {LIBRARY.map((item) => (
          <button key={item.type} {...drag({ type: item.type })} onClick={() => add({ type: item.type })}>
            <strong>{COMPONENT_LABELS[item.type]}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>
      <p className="hint">In den Viewport ziehen: auf eine Karte, in die Textspalte oder frei über das Modell.</p>
      {project.templates.length > 0 && (
        <>
          <h4>Vorlagen</h4>
          <ul className="list">
            {project.templates.map((template) => (
              <li key={template.id}>
                <button className="list-main" {...drag({ templateId: template.id })} onClick={() => add({ templateId: template.id })}>
                  <span className="kind">❖</span> {template.name}
                </button>
                <button onClick={() => deleteTemplate(template.id)} aria-label={`Vorlage ${template.name} löschen`} title="Vorlage löschen">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------- Ebenen des Abschnitts ----------

const LAYER_DRAG = 'application/x-layer';

function Layers() {
  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const selected = useEditor((s) => s.selectedComponent);
  const breakpoint = useEditor((s) => s.breakpoint);
  const section = project.sections[splitPos(project, pos).index];
  if (!section) return null;

  const rows: { node: ResolvedNode; depth: number }[] = [];
  const visit = (node: ResolvedNode, depth: number) => {
    rows.push({ node, depth });
    node.children.forEach((child) => visit(child, depth + 1));
  };
  resolvedTree(project, section).forEach((node) => visit(node, 0));

  return (
    <section className="panel-block">
      <header>
        <h3>Ebenen · {section.name}</h3>
      </header>
      {rows.length === 0 && <p className="hint">Dieser Abschnitt hat noch keine Komponenten.</p>}
      <ul className="list tree">
        {rows.map(({ node, depth }) => {
          const template = node.templateId ? project.templates.find((t) => t.id === node.templateId) : null;
          const hidden = effectiveStyle(locate(project, node.id)?.node ?? node, breakpoint).visible === false;
          return (
            <li key={node.id} className={node.id === selected ? 'selected' : ''}>
              <button
                className="list-main"
                style={{ paddingLeft: 8 + depth * 14 }}
                draggable={!node.id.includes('--')}
                onDragStart={(event) => event.dataTransfer.setData(LAYER_DRAG, node.id)}
                onDragOver={(event) => event.dataTransfer.types.includes(LAYER_DRAG) && event.preventDefault()}
                onDrop={(event) => {
                  const id = event.dataTransfer.getData(LAYER_DRAG);
                  if (id) moveComponent(id, node.id, isContainer(node.type) ? 'inside' : 'before');
                }}
                onClick={() => useEditor.setState({ selectedComponent: node.id })}
              >
                <span className="kind">{isContainer(node.type) ? '▤' : '·'}</span> {COMPONENT_LABELS[node.type]}
                {node.text && <small>{node.text.slice(0, 22)}</small>}
                {template && <span className="badge">{template.name}</span>}
                {depth === 0 && node.placement === 'free' && <span className="badge quiet">frei</span>}
                {hidden && <span className="badge quiet">ausgeblendet</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length > 1 && <p className="hint">Ziehen sortiert um. Auf eine Karte gezogen, wandert das Element hinein.</p>}
    </section>
  );
}

function Hotspots() {
  const hotspots = useEditor((s) => s.project.hotspots);
  const selected = useEditor((s) => s.selectedHotspot);
  const placing = useEditor((s) => s.placingHotspot);
  const hasModel = useEditor((s) => s.project.model.file !== null);

  return (
    <section className="panel-block">
      <header>
        <h3>Hotspots</h3>
        <button
          className={placing ? 'active' : ''}
          disabled={!hasModel}
          onClick={() => useEditor.setState({ placingHotspot: !placing })}
        >
          {placing ? 'Abbrechen' : '+ Hotspot'}
        </button>
      </header>
      {placing && <p className="hint">Klicke im Viewport auf die Stelle des Modells, an der der Hotspot sitzen soll.</p>}
      {!placing && hotspots.length === 0 && <p className="hint">Hotspots hängen an einem Bauteil und folgen seiner Bewegung.</p>}
      <ul className="list">
        {hotspots.map((hotspot) => (
          <li key={hotspot.id} className={hotspot.id === selected ? 'selected' : ''}>
            <button className="list-main" onClick={() => useEditor.setState({ selectedHotspot: hotspot.id, selectedComponent: null })}>
              <span className="kind">◉</span> {hotspot.name}
              <small>{nodeName(hotspot.nodeId)}</small>
            </button>
            <button onClick={() => removeHotspot(hotspot.id)} aria-label={`${hotspot.name} löschen`} title="Hotspot löschen">
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LeftPanel() {
  return (
    <aside className="panel left">
      <Sections />
      <Library />
      <Layers />
      <Hotspots />
      <ConfiguratorList />
      <DataList />
      <SceneTree />
      <Model />
    </aside>
  );
}
