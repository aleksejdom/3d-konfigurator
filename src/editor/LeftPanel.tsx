import { useMemo } from 'react';
import type { Budget, ModelStats, Project } from '../core/types';
import { nodeName } from './labels';
import { createSection } from './project';
import { editor } from './stage';
import { importModel, setPos, update, useEditor } from './store';

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

export function LeftPanel() {
  return (
    <aside className="panel left">
      <Sections />
      <SceneTree />
      <Model />
    </aside>
  );
}
