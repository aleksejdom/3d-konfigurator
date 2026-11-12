// Dateizugriff. In der Desktop-App über Tauri, im Browser (Entwicklung) über die
// File System Access API oder als ZIP-Download.

import { zipSync, strToU8 } from 'fflate';

export type DirRef = { kind: 'tauri'; path: string } | { kind: 'fsa'; handle: FileSystemDirectoryHandle };
export type FileMap = Record<string, string | Uint8Array>;

export const isTauri = '__TAURI_INTERNALS__' in window;
export const canPickDirectory = isTauri || 'showDirectoryPicker' in window;

export function dirLabel(dir: DirRef): string {
  return dir.kind === 'tauri' ? dir.path : dir.handle.name;
}

export async function pickDirectory(title: string): Promise<DirRef | null> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ directory: true, title });
    return typeof path === 'string' ? { kind: 'tauri', path } : null;
  }
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    return { kind: 'fsa', handle };
  } catch {
    return null; // Auswahl abgebrochen
  }
}

async function fsaFile(dir: FileSystemDirectoryHandle, path: string, create: boolean) {
  const parts = path.split('/');
  const name = parts.pop()!;
  let folder = dir;
  for (const part of parts) folder = await folder.getDirectoryHandle(part, { create });
  return folder.getFileHandle(name, { create });
}

export async function writeFiles(dir: DirRef, files: FileMap): Promise<void> {
  if (dir.kind === 'tauri') {
    const fs = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/');
      if (parts.length > 1) await fs.mkdir(await join(dir.path, ...parts.slice(0, -1)), { recursive: true });
      const target = await join(dir.path, ...parts);
      if (typeof content === 'string') await fs.writeTextFile(target, content);
      else await fs.writeFile(target, content);
    }
    return;
  }
  for (const [path, content] of Object.entries(files)) {
    const file = await fsaFile(dir.handle, path, true);
    const writable = await file.createWritable();
    await writable.write(content as FileSystemWriteChunkType);
    await writable.close();
  }
}

export async function readBinary(dir: DirRef, path: string): Promise<ArrayBuffer | null> {
  try {
    if (dir.kind === 'tauri') {
      const fs = await import('@tauri-apps/plugin-fs');
      const { join } = await import('@tauri-apps/api/path');
      const bytes = await fs.readFile(await join(dir.path, ...path.split('/')));
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }
    const file = await fsaFile(dir.handle, path, false);
    return await (await file.getFile()).arrayBuffer();
  } catch {
    return null; // Datei fehlt
  }
}

export async function readText(dir: DirRef, path: string): Promise<string | null> {
  const buffer = await readBinary(dir, path);
  return buffer ? new TextDecoder().decode(buffer) : null;
}

/** Datei auswählen und einlesen. */
export async function pickFile(extensions: string[], label = 'Datei'): Promise<{ name: string; data: ArrayBuffer } | null> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, filters: [{ name: label, extensions }] });
    if (typeof path !== 'string') return null;
    const fs = await import('@tauri-apps/plugin-fs');
    const bytes = await fs.readFile(path);
    return {
      name: path.split(/[\\/]/).pop() || 'datei',
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = extensions.map((e) => '.' + e).join(',');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, data: await file.arrayBuffer() } : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export interface PickedModel {
  name: string;
  data: ArrayBuffer;
  /** Liest eine Begleitdatei eines .gltf (Puffer, Textur), relativ zur Modelldatei. */
  readSibling: (uri: string) => Promise<ArrayBuffer | null>;
}

/**
 * Modell auswählen. Ein .gltf verweist auf Begleitdateien: In der Desktop-App werden sie aus demselben
 * Ordner gelesen, im Browser wählt man sie zusammen mit dem .gltf aus.
 */
export async function pickModel(): Promise<PickedModel | null> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, filters: [{ name: '3D-Modell', extensions: ['glb', 'gltf'] }] });
    if (typeof path !== 'string') return null;
    const fs = await import('@tauri-apps/plugin-fs');
    const { dirname, join } = await import('@tauri-apps/api/path');
    const toBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const folder = await dirname(path);
    return {
      name: path.split(/[\\/]/).pop() || 'modell.glb',
      data: toBuffer(await fs.readFile(path)),
      readSibling: async (uri) => {
        try {
          return toBuffer(await fs.readFile(await join(folder, ...uri.split('/'))));
        } catch {
          return null;
        }
      },
    };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2';
    input.addEventListener('change', async () => {
      const files = [...(input.files ?? [])];
      const main = files.find((file) => /\.(glb|gltf)$/i.test(file.name));
      if (!main) return resolve(null);
      resolve({
        name: main.name,
        data: await main.arrayBuffer(),
        readSibling: async (uri) => {
          const file = files.find((f) => f.name === uri.split('/').pop());
          return file ? file.arrayBuffer() : null;
        },
      });
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Ersatzweg ohne Ordnerzugriff: alle Dateien als ZIP herunterladen. */
export function downloadZip(name: string, files: FileMap): void {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = typeof content === 'string' ? strToU8(content) : content;
  }
  const blob = new Blob([zipSync(entries) as BlobPart], { type: 'application/zip' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name + '.zip';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
