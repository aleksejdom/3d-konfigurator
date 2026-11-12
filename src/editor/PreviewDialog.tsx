import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { testData } from '../core/data.js';
import type { DataField, Project } from '../core/types';
import { TestValueInput } from './DataPanels';
import { deviceName, lanAvailable, lanReports, startLanPreview, stopLanPreview, type LanReport } from './lan';
import { useEditor } from './store';

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

export function PreviewDialog({ onClose }: { onClose: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const project = useEditor((s) => s.project);
  const fields = project.data.fields;
  const [profileId, setProfileId] = useState('4g');
  const [device, setDevice] = useState<string>(() => useEditor.getState().breakpoint);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [dataMode, setDataMode] = useState<'test' | 'live'>('test');
  /** Testwerte nur für diese Vorschau; das Projekt bleibt unverändert. */
  const [testValues, setTestValues] = useState<Record<string, DataField['test']>>(() => Object.fromEntries(fields.map((f) => [f.id, f.test])));
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lanUrl, setLanUrl] = useState<string | null>(null);
  const [lanError, setLanError] = useState<string | null>(null);
  const [reports, setReports] = useState<LanReport[]>([]);
  const profile = PROFILES.find((p) => p.id === profileId)!;

  // Vorschau-Link im WLAN: Messungen der Geräte abholen; beim Schließen endet der Link.
  useEffect(() => {
    if (!lanUrl) return;
    const timer = setInterval(async () => {
      const next = await lanReports().catch(() => []);
      setReports(next);
      const last = next[next.length - 1];
      if (last) {
        const label = `Messung auf echtem Gerät (${deviceName(last.userAgent)}) · WLAN · kalter Cache`;
        useEditor.setState({ measurement: { ms: last.ms, profile: label, simulated: false } });
      }
    }, 2000);
    return () => {
      clearInterval(timer);
      stopLanPreview().catch(() => {});
    };
  }, [lanUrl]);

  const startLan = async () => {
    setLanError(null);
    try {
      setReports([]);
      setLanUrl(await startLanPreview());
    } catch (error) {
      setLanError(String((error as Error).message ?? error));
    }
  };

  const qr = useMemo(() => {
    if (!lanUrl) return '';
    const code = qrcode(0, 'M');
    code.addData(lanUrl);
    code.make();
    return code.createSvgTag({ cellSize: 3, margin: 0, scalable: false });
  }, [lanUrl]);
  const hasLiveSource = project.data.source.mode !== 'test';

  const withTestValues = (values: typeof testValues) =>
    ({ data: { fields: fields.map((field) => ({ ...field, test: values[field.id] ?? field.test })) } }) as unknown as Project;

  useEffect(() => {
    setResult(null);
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      if (event.data?.type === 'ready') {
        const { project, modelBuffer, modelResources, assets } = useEditor.getState();
        // Bilder, Posterbild und Umgebung
        const images = Object.fromEntries(Object.entries(assets).map(([name, asset]) => [name, asset.data]));
        frame.contentWindow!.postMessage(
          {
            type: 'load',
            project,
            model: modelBuffer,
            resources: modelResources,
            images,
            throttle: profile.throttle,
            dataMode,
            testData: testData(withTestValues(testValues)),
            // undefined = Einstellung des Geräts gilt
            reducedMotion: reducedMotion || undefined,
          },
          '*',
        );
      }
      if (event.data?.type === 'first-render') {
        setResult(`${seconds.format(event.data.ms / 1000)} s bis zum ersten sichtbaren Render · ${profile.label}`);
        useEditor.setState({ measurement: { ms: event.data.ms, profile: profile.label, simulated: true } });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, profile, dataMode, reducedMotion]);

  const setTestValue = (id: string, value: DataField['test']) => {
    const next = { ...testValues, [id]: value };
    setTestValues(next);
    frameRef.current?.contentWindow?.postMessage({ type: 'test-data', data: testData(withTestValues(next)) }, '*');
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Vorschau">
      <div className="dialog preview-dialog">
        <div>
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
            <label className="check inline" title="Zeigt die Seite so, wie sie Besucher mit der Geräteeinstellung „Bewegung reduzieren“ sehen.">
              <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
              Reduzierte Bewegung
            </label>
            <button
              className={lanUrl ? 'active' : ''}
              disabled={!lanAvailable}
              title={lanAvailable ? 'Vorschau-Link und QR-Code fürs lokale WLAN' : 'Der Vorschau-Link fürs WLAN steht nur in der Desktop-App zur Verfügung.'}
              onClick={() => (lanUrl ? setLanUrl(null) : startLan())}
            >
              Smartphone
            </button>
            <span className="measure">
              {result ?? 'Messung läuft …'}
              {result && <em> Simulation auf diesem Rechner, keine Messung auf einem echten Gerät.</em>}
            </span>
            <button onClick={onClose}>Schließen</button>
          </div>

          {lanError && <div className="lan">{lanError}</div>}
          {lanUrl && (
            <div className="lan">
              <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
              <div>
                <strong>QR-Code scannen oder Adresse öffnen:</strong> <code>{lanUrl}</code>
                <p className="hint">
                  Smartphone und Rechner müssen im selben WLAN sein. Fragt die Windows-Firewall nach, den Zugriff für private Netze
                  erlauben. Der Link zeigt den Stand beim Öffnen dieses Bereichs und gilt, bis du ihn hier oder die Vorschau schließt.
                </p>
                {reports.length === 0 && <span className="hint">Noch keine Messung von einem Gerät.</span>}
                <ul>
                  {reports.map((report, i) => (
                    <li key={i}>
                      {seconds.format(report.ms / 1000)} s bis zum ersten sichtbaren Render · Messung auf echtem Gerät ({deviceName(report.userAgent)},{' '}
                      {report.width} px breit) · WLAN · kalter Cache
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {fields.length > 0 && (
            <div className="test-values">
              <div className="segmented" role="group" aria-label="Daten in der Vorschau">
                <button className={dataMode === 'test' ? 'active' : ''} onClick={() => setDataMode('test')}>
                  Testdaten
                </button>
                <button
                  className={dataMode === 'live' ? 'active' : ''}
                  disabled={!hasLiveSource}
                  title={hasLiveSource ? project.data.source.url : 'Unter „Daten“ ist noch keine Live-Quelle eingestellt.'}
                  onClick={() => setDataMode('live')}
                >
                  Live-Quelle
                </button>
              </div>
              {dataMode === 'test' &&
                fields.map((field) => (
                  <label key={field.id}>
                    {field.label}
                    <TestValueInput field={{ ...field, test: testValues[field.id] ?? field.test }} onChange={(value) => setTestValue(field.id, value)} />
                  </label>
                ))}
              {dataMode === 'live' && <span className="hint">Liest {project.data.source.url || 'keine Adresse'}.</span>}
            </div>
          )}
        </div>
        <div className="preview-stage">
          <iframe
            key={`${run}-${profileId}-${dataMode}-${reducedMotion}`}
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
