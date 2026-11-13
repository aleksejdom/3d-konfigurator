import { Block, Fold } from './Block';
import {
  Activity,
  Box,
  CreditCard,
  Database,
  GalleryHorizontal,
  Gauge,
  Heading,
  Image as ImageIcon,
  Info,
  Layers as LayersIcon,
  Lightbulb,
  Pencil,
  Ruler,
  Type,
  LayoutList,
  ListTree,
  type LucideIcon,
  MapPin,
  MousePointerClick,
  PanelTop,
  Shapes,
  SlidersHorizontal,
  SquareChevronDown,
  Text,
  Wifi,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { LightList } from './LightPanels';
import { FONT_LABELS } from './fonts';
import { Field, NumberInput } from './fields';
import { SHOW_ALL } from './Block';
import { clipProp } from '../core/stage.js';
import { currentState } from './stage';
import { releaseClip, setClipTime } from './store';
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
import { importFont, importModel, selectComponent, setPos, update, useEditor } from './store';
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
  const [renaming, setRenaming] = useState<string | null>(null);
  const rename = (id: string, name: string) => {
    setRenaming(null);
    const next = name.trim();
    if (!next) return;
    update((p) => {
      const section = p.sections.find((s) => s.id === id);
      if (section && section.name !== next) section.name = next;
    });
  };

  const move = (index: number, by: number) =>
    update((p) => {
      const [section] = p.sections.splice(index, 1);
      p.sections.splice(index + by, 0, section);
    });

  return (
    <Block id="sections" icon={LayoutList} title="Abschnitte" actions={<><button
          onClick={() => {
            const section = createSection(`Abschnitt ${project.sections.length + 1}`);
            update((p) => void p.sections.push(section));
            setPos(project.sections.length);
          }}
        >
          + Abschnitt
        </button></>}>
      <ul className="list">
        {project.sections.map((section, i) => (
          <li key={section.id} className={section.id === selected ? 'selected' : ''}>
            {renaming === section.id ? (
              <input
                className="list-rename"
                aria-label="Name des Abschnitts"
                autoFocus
                defaultValue={section.name}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => rename(section.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') rename(section.id, e.currentTarget.value);
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <button className="list-main" onClick={() => setPos(i)} onDoubleClick={() => setRenaming(section.id)} title="Doppelklick zum Umbenennen">
                <span className="index">{i + 1}</span> {section.name}
                <small>{section.height} vh</small>
              </button>
            )}
            <button onClick={() => setRenaming(section.id)} aria-label={`${section.name} umbenennen`} title="Umbenennen">
              <Pencil size={13} aria-hidden />
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
    </Block>
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
    <Block id="tree" icon={ListTree} title="Szene" closed>
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
    </Block>
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
  const pos = useEditor((s) => s.pos);
  const draft = useEditor((s) => s.draft);
  const state = useMemo(() => currentState(project, pos, draft), [project, pos, draft]);
  const missing = useMemo(() => missingNodes(project), [project, modelVersion]);
  const warnings = stats && file ? budgetWarnings(stats, file, drawCalls, project.budgets) : [];

  return (
    <Block id="model" icon={Box} title="Modell" actions={<><button onClick={importModel}>{file ? 'Austauschen' : 'Importieren'}</button></>}>
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
          {(stats.clips ?? []).length > 0 && (
            <div className="clips">
              <Fold id="clips-timeline" title="Animationsclips in der Timeline" closed>
              {(stats.clips ?? []).map((clip) => {
                const time = state[clipProp(clip)] as number | undefined;
                return (
                  <div className="clip-row" key={clip}>
                    <span title={clip}>{clip}</span>
                    <input
                      type="range"
                      aria-label={`Position von ${clip}`}
                      min={0}
                      max={1}
                      step={0.01}
                      value={time ?? 0}
                      onChange={(e) => setClipTime(clip, parseFloat(e.target.value))}
                    />
                    <small>{time === undefined ? 'frei' : Math.round(time * 100) + ' %'}</small>
                    <button disabled={time === undefined} onClick={() => releaseClip(clip)} aria-label={`${clip} von der Timeline lösen`} title="Von der Timeline lösen">
                      ×
                    </button>
                  </div>
                );
              })}
              <p className="hint">Regler bewegen und „Merken“: Der Clip läuft dann mit dem Scrollen vor und zurück.</p>
              </Fold>
            </div>
          )}
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
    </Block>
  );
}

// ---------- Komponentenbibliothek ----------

const LIBRARY: { type: Exclude<ComponentType, 'instance'>; hint: string; icon: LucideIcon }[] = [
  { type: 'headline', hint: 'Überschrift', icon: Heading },
  { type: 'text', hint: 'Absatz', icon: Text },
  { type: 'image', hint: 'PNG, JPG, SVG …', icon: ImageIcon },
  { type: 'button', hint: 'Link als Schaltfläche', icon: MousePointerClick },
  { type: 'card', hint: 'Behälter für Elemente', icon: CreditCard },
  { type: 'infobox', hint: 'Kompakter Hinweis', icon: Info },
  { type: 'select', hint: 'Variante aus einer Liste', icon: SquareChevronDown },
  { type: 'slider', hint: 'Wischen, Pfeile, Tastatur', icon: GalleryHorizontal },
  { type: 'value', hint: 'Zahl mit Einheit', icon: Gauge },
  { type: 'status', hint: 'Zustand als Text', icon: Activity },
  { type: 'connection', hint: 'Verbunden, veraltet, offline', icon: Wifi },
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
    <Block id="library" icon={Shapes} title="Komponenten">
      <div className="library">
        {LIBRARY.map((item) => (
          <button key={item.type} {...drag({ type: item.type })} onClick={() => add({ type: item.type })} title={item.hint}>
            <item.icon size={16} aria-hidden />
            <strong>{COMPONENT_LABELS[item.type]}</strong>
          </button>
        ))}
      </div>
      <p className="hint">In den Viewport ziehen: auf eine Karte, in die Textspalte oder frei über das Modell.</p>
      {project.templates.length > 0 && (
        <>
          <Fold id="templates" title="Vorlagen">
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
          </Fold>
        </>
      )}
    </Block>
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
    <Block id="layers" icon={LayersIcon} title={<>Ebenen · {section.name}</>}>
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
                onClick={(event) => selectComponent(node.id, event.shiftKey)}
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
    </Block>
  );
}

function Hotspots() {
  const hotspots = useEditor((s) => s.project.hotspots);
  const selected = useEditor((s) => s.selectedHotspot);
  const placing = useEditor((s) => s.placingHotspot);
  const hasModel = useEditor((s) => s.project.model.file !== null);

  return (
    <Block id="hotspots" icon={MapPin} title="Hotspots" actions={<><button
          className={placing ? 'active' : ''}
          disabled={!hasModel}
          onClick={() => useEditor.setState({ placingHotspot: !placing })}
        >
          {placing ? 'Abbrechen' : '+ Hotspot'}
        </button></>}>
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
    </Block>
  );
}

/** Seitenbreite und Inhaltsbereich. Texte und frei platzierte Elemente richten sich am Inhaltsbereich aus. */
function PageLayoutBlock() {
  const layout = useEditor((s) => s.project.settings.layout);
  const guides = useEditor((s) => s.guides);
  const set = (key: keyof typeof layout) => (value: number) => update((p) => void (p.settings.layout[key] = Math.max(0, Math.round(value))), 'layout-' + key);
  return (
    <Block id="layout" icon={Ruler} title="Seitenbreite und Inhaltsbereich">
      <Field label="Inhaltsbereich / Inner-Wrapper (px)">
        <NumberInput label="Breite des Inhaltsbereichs" value={layout.innerWidth} min={320} step={10} onChange={set('innerWidth')} />
      </Field>
      <Field label="Mindestabstand zum Seitenrand (px)">
        <NumberInput label="Mindestabstand zum Seitenrand" value={layout.padding} min={0} step={4} onChange={set('padding')} />
      </Field>
      <Field label="Größte Seitenbreite (px, 0 = volle Fensterbreite)">
        <NumberInput label="Größte Seitenbreite" value={layout.pageWidth} min={0} step={20} onChange={set('pageWidth')} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={guides} onChange={(e) => useEditor.setState({ guides: e.target.checked })} />
        Hilfslinien im Viewport zeigen
      </label>
      <p className="hint">
        Die Textspalte und links oder rechts verankerte Elemente liegen am Rand des Inhaltsbereichs. Ist das Fenster schmaler,
        gilt der Mindestabstand.
      </p>
    </Block>
  );
}

/** Schrift der Seite und eigene Schriftdateien. */
function FontsBlock() {
  const font = useEditor((s) => s.project.settings.font);
  const fonts = useEditor((s) => s.project.fonts);
  return (
    <Block id="fonts" icon={Type} title="Schriften" closed>
      <Field label="Schrift der Seite">
        <select value={font} onChange={(e) => update((p) => void (p.settings.font = e.target.value))}>
          {Object.entries(FONT_LABELS).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
          {fonts.map((f) => (
            <option key={f.id} value={'font:' + f.id}>
              {f.name} (Datei)
            </option>
          ))}
        </select>
      </Field>
      {fonts.length > 0 && (
        <ul className="list">
          {fonts.map((f) => (
            <li key={f.id}>
              <input
                aria-label="Name der Schrift"
                value={f.name}
                onChange={(e) => update((p) => void (p.fonts.find((x) => x.id === f.id)!.name = e.target.value), 'font-name-' + f.id)}
              />
              <button
                aria-label={`${f.name} entfernen`}
                title="Schrift entfernen"
                onClick={() =>
                  update((p) => {
                    p.fonts = p.fonts.filter((x) => x.id !== f.id);
                    if (p.settings.font === 'font:' + f.id) p.settings.font = 'system';
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => void importFont()}>Schriftdatei hinzufügen (woff2, ttf, otf)</button>
      <p className="hint">Einzelne Texte bekommen ihre Schrift rechts unter „Text“. Schriftdateien wandern mit in den Export.</p>
    </Block>
  );
}

type Tab = 'page' | 'elements' | 'model' | 'lights' | 'hotspots' | 'configurator' | 'data';

const TABS: { id: Tab; label: string; icon: LucideIcon; hint: string }[] = [
  { id: 'page', label: 'Seite', icon: PanelTop, hint: 'Abschnitte der Seite' },
  { id: 'elements', label: 'Elemente', icon: Shapes, hint: 'Texte, Bilder, Karten und ihre Ebenen' },
  { id: 'model', label: 'Modell', icon: Box, hint: '3D-Modell und seine Bauteile' },
  { id: 'lights', label: 'Licht', icon: Lightbulb, hint: 'Hauptlicht, Spot- und Flächenlichter' },
  { id: 'hotspots', label: 'Hotspots', icon: MapPin, hint: 'Klickbare Punkte am Modell' },
  { id: 'configurator', label: 'Varianten', icon: SlidersHorizontal, hint: 'Konfigurator: Varianten und Materialien' },
  { id: 'data', label: 'Daten', icon: Database, hint: 'Live-Daten und Testwerte' },
];

function storedTab(): Tab {
  try {
    const stored = localStorage.getItem('ui.tab') as Tab | null;
    if (stored && TABS.some((t) => t.id === stored)) return stored;
  } catch {
    // Ohne Speicher beginnt die Leiste beim ersten Bereich.
  }
  return 'page';
}

export function LeftPanel() {
  const [tab, setTabState] = useState<Tab>(storedTab);
  const counts: Record<Tab, number> = {
    page: 0,
    elements: 0,
    model: 0,
    lights: useEditor((s) => s.project.lights.length),
    hotspots: useEditor((s) => s.project.hotspots.length),
    configurator: useEditor((s) => s.project.variantGroups.length),
    data: useEditor((s) => s.project.data.fields.length),
  };
  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      localStorage.setItem('ui.tab', next);
    } catch {
      // Die Wahl gilt dann bis zum Schließen der App.
    }
  };

  // Was im Viewport ausgewählt wird, zeigt die Leiste von selbst im passenden Bereich.
  const selectedHotspot = useEditor((s) => s.selectedHotspot);
  const selectedComponent = useEditor((s) => s.selectedComponent);
  const selectedGroup = useEditor((s) => s.selectedGroup);
  const selectedField = useEditor((s) => s.selectedField);
  const placing = useEditor((s) => s.placingHotspot);
  const selectedLight = useEditor((s) => s.selectedLight);
  useEffect(() => void (selectedLight && setTab('lights')), [selectedLight]);
  useEffect(() => void ((selectedHotspot || placing) && setTab('hotspots')), [selectedHotspot, placing]);
  useEffect(() => void (selectedComponent && setTab('elements')), [selectedComponent]);
  useEffect(() => void (selectedGroup && setTab('configurator')), [selectedGroup]);
  useEffect(() => void (selectedField && setTab('data')), [selectedField]);

  const show = (id: Tab) => SHOW_ALL || tab === id;
  return (
    <aside className="panel left">
      <nav className="rail" aria-label="Bereiche">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} title={t.hint} aria-pressed={tab === t.id}>
            <t.icon size={18} aria-hidden />
            <span>{t.label}</span>
            {counts[t.id] > 0 && <em>{counts[t.id]}</em>}
          </button>
        ))}
      </nav>
      <div className="rail-content">
        {show('page') && (
          <>
            <Sections />
            <PageLayoutBlock />
            <FontsBlock />
          </>
        )}
        {show('lights') && <LightList />}
        {show('elements') && (
          <>
            <Library />
            <Layers />
          </>
        )}
        {show('hotspots') && <Hotspots />}
        {show('configurator') && <ConfiguratorList />}
        {show('data') && <DataList />}
        {show('model') && (
          <>
            <Model />
            <SceneTree />
          </>
        )}
      </div>
    </aside>
  );
}
