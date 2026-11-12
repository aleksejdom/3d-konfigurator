import { useEffect, useRef, useState } from 'react';
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

const PROFILES = [
  { id: '4g', label: 'simuliertes 4G · kalter Cache', detail: '9 Mbit/s, 170 ms Latenz', throttle: { mbps: 9, latencyMs: 170 } },
  {
    id: 'slow4g',
    label: 'simuliertes langsames 4G · kalter Cache',
    detail: '1,6 Mbit/s, 560 ms Latenz',
    throttle: { mbps: 1.6, latencyMs: 560 },
  },
  { id: 'none', label: 'ohne Drosselung · dieser Rechner', detail: 'Modell aus dem Arbeitsspeicher', throttle: null },
];

const DEVICES = [
  { id: 'desktop', label: 'Desktop', width: '100%' },
  { id: 'tablet', label: 'Tablet', width: '820px' },
  { id: 'mobile', label: 'Mobile', width: '390px' },
];

const seconds = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function PreviewDialog({ onClose }: { onClose: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [profileId, setProfileId] = useState('4g');
  const [device, setDevice] = useState<string>(() => useEditor.getState().breakpoint);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const profile = PROFILES.find((p) => p.id === profileId)!;

  useEffect(() => {
    setResult(null);
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      if (event.data?.type === 'ready') {
        const { project, modelBuffer, assets } = useEditor.getState();
        const images = Object.fromEntries(Object.entries(assets).map(([name, asset]) => [name, asset.data]));
        frame.contentWindow!.postMessage({ type: 'load', project, model: modelBuffer, images, throttle: profile.throttle }, '*');
      }
      if (event.data?.type === 'first-render') {
        setResult(`${seconds.format(event.data.ms / 1000)} s bis zum ersten sichtbaren Render · ${profile.label}`);
        useEditor.setState({ measurement: { ms: event.data.ms, profile: profile.label, simulated: true } });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [run, profile]);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Vorschau">
      <div className="dialog preview-dialog">
        <div className="dialog-bar">
          <strong>Vorschau</strong>
          <div className="segmented">
            {DEVICES.map((d) => (
              <button key={d.id} className={device === d.id ? 'active' : ''} onClick={() => setDevice(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Testprofil">
            {PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.detail})
              </option>
            ))}
          </select>
          <button onClick={() => setRun(run + 1)}>Neu laden und messen</button>
          <span className="measure">
            {result ?? 'Messung läuft …'}
            {result && <em> Simulation auf diesem Rechner, keine Messung auf einem echten Gerät.</em>}
          </span>
          <button onClick={onClose}>Schließen</button>
        </div>
        <div className="preview-stage">
          <iframe
            key={`${run}-${profileId}`}
            ref={frameRef}
            src="./preview.html"
            title="Webvorschau"
            style={{ width: DEVICES.find((d) => d.id === device)!.width }}
          />
        </div>
      </div>
    </div>
  );
}

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
