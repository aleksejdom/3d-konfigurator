// Vorschau-Link fürs lokale WLAN. Die Desktop-App startet dafür einen kleinen Webserver (src-tauri/src/lib.rs),
// der die Webvorschau und die Dateien des Projekts im Heimnetz bereitstellt.

import { usedImages } from '../export/page.js';
import { isTauri, writeFiles, type FileMap } from './platform';
import { useEditor } from './store';

export const lanAvailable = isTauri;

export interface LanReport {
  ms: number;
  userAgent: string;
  width: number;
  connection: string | null;
}

/** Legt die Dateien des Projekts bereit und startet den Server. Liefert die Adresse für das Smartphone. */
export async function startLanPreview(): Promise<string> {
  const { project, modelBuffer, modelResources, assets } = useEditor.getState();
  const files: FileMap = { 'project.json': JSON.stringify(project) };
  if (project.model.file && modelBuffer) files['model/' + project.model.file] = new Uint8Array(modelBuffer);
  for (const [name, data] of Object.entries(modelResources)) files['model/' + name] = new Uint8Array(data);
  for (const name of usedImages(project) as string[]) {
    if (assets[name]) files['images/' + name] = new Uint8Array(assets[name].data);
  }
  const environment = project.settings.environment.file;
  if (environment && assets[environment]) files['env/' + environment] = new Uint8Array(assets[environment].data);

  const { appCacheDir, join } = await import('@tauri-apps/api/path');
  const { invoke } = await import('@tauri-apps/api/core');
  const fs = await import('@tauri-apps/plugin-fs');
  const dir = await join(await appCacheDir(), 'lan-preview');
  await fs.mkdir(dir, { recursive: true });
  await writeFiles({ kind: 'tauri', path: dir }, files);
  return invoke<string>('lan_preview_start', { dir });
}

/** Messungen, die Geräte über den Vorschau-Link gemeldet haben. */
export async function lanReports(): Promise<LanReport[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  const reports = await invoke<string[]>('lan_preview_reports');
  return reports.flatMap((text) => {
    try {
      return [JSON.parse(text) as LanReport];
    } catch {
      return [];
    }
  });
}

export async function stopLanPreview(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('lan_preview_stop');
}

/** Kurzer Gerätename aus dem User-Agent, z. B. "iPhone" oder "Android". */
export function deviceName(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  const android = /Android[^;)]*;\s*([^;)]+)/.exec(userAgent);
  if (android) return android[1].trim();
  if (/Android/.test(userAgent)) return 'Android-Gerät';
  if (/Windows/.test(userAgent)) return 'Windows-Rechner';
  if (/Mac OS X/.test(userAgent)) return 'Mac';
  return 'Gerät';
}
