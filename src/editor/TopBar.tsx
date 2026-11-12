import { useState } from 'react';
import { PreviewDialog } from './PreviewDialog';
import { dirLabel } from './platform';
import {
  deleteSnapshot,
  exportProject,
  newProject,
  openProject,
  redo,
  restoreSnapshot,
  saveProject,
  saveSnapshot,
  undo,
  update,
  useEditor,
} from './store';

function Snapshots({ onClose }: { onClose: () => void }) {
  const snapshots = useEditor((s) => s.snapshots);
  const [name, setName] = useState('');
  return (
    <div className="popover snapshots">
      <div className="popover-title">Projektstände</div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          saveSnapshot(name.trim() || `Stand ${snapshots.length + 1}`);
          setName('');
        }}
      >
        <input placeholder="Name des Stands" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name des Stands" />
        <button className="primary">Stand sichern</button>
      </form>
      {snapshots.length === 0 && <p className="hint">Noch kein Stand gesichert.</p>}
      <ul className="list">
        {snapshots.map((snapshot) => (
          <li key={snapshot.date}>
            <span className="list-main">
              {snapshot.name}
              <small>{new Date(snapshot.date).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</small>
            </span>
            <button
              onClick={() => {
                restoreSnapshot(snapshot);
                onClose();
              }}
            >
              Wiederherstellen
            </button>
            <button onClick={() => deleteSnapshot(snapshot)} aria-label={`Stand ${snapshot.name} löschen`}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">Stände werden beim Speichern mit dem Projekt abgelegt.</p>
    </div>
  );
}

export function TopBar() {
  const name = useEditor((s) => s.project.name);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const unsaved = useEditor((s) => s.unsaved);
  const dir = useEditor((s) => s.dir);
  const hasModel = useEditor((s) => s.project.model.file !== null);
  const [menu, setMenu] = useState<'snapshots' | 'export' | null>(null);
  const [preview, setPreview] = useState(false);

  return (
    <header className="topbar">
      <input
        className="project-name"
        aria-label="Projektname"
        value={name}
        onChange={(e) => update((p) => void (p.name = e.target.value), 'name')}
      />
      <span className="save-state" title={dir ? dirLabel(dir) : undefined}>
        {unsaved ? 'Nicht gespeichert' : dir ? 'Gespeichert' : ''}
      </span>
      <div className="row">
        <button
          onClick={() => {
            if (!unsaved || confirm('Ungespeicherte Änderungen verwerfen und ein neues Projekt beginnen?')) newProject();
          }}
        >
          Neu
        </button>
        <button onClick={openProject}>Öffnen</button>
        <button onClick={() => saveProject()} title="Strg+S">
          Speichern
        </button>
        <button onClick={() => saveProject(true)}>Speichern unter</button>
      </div>
      <div className="row">
        <button onClick={undo} disabled={!canUndo} title="Strg+Z">
          Rückgängig
        </button>
        <button onClick={redo} disabled={!canRedo} title="Strg+Umschalt+Z">
          Wiederholen
        </button>
        <div className="menu-anchor">
          <button onClick={() => setMenu(menu === 'snapshots' ? null : 'snapshots')}>Stände</button>
          {menu === 'snapshots' && <Snapshots onClose={() => setMenu(null)} />}
        </div>
      </div>
      <div className="row push">
        <button onClick={() => setPreview(true)} disabled={!hasModel}>
          Vorschau
        </button>
        <div className="menu-anchor">
          <button className="primary" onClick={() => setMenu(menu === 'export' ? null : 'export')}>
            Exportieren
          </button>
          {menu === 'export' && (
            <div className="popover export-menu">
              <button
                onClick={() => {
                  setMenu(null);
                  exportProject('astro');
                }}
              >
                <strong>Astro</strong>
                <small>Astro + Three.js + GSAP ScrollTrigger</small>
              </button>
              <button
                onClick={() => {
                  setMenu(null);
                  exportProject('vanilla');
                }}
              >
                <strong>HTML / CSS / JavaScript</strong>
                <small>Vanilla + Three.js + GSAP ScrollTrigger</small>
              </button>
            </div>
          )}
        </div>
      </div>
      {preview && <PreviewDialog onClose={() => setPreview(false)} />}
    </header>
  );
}
