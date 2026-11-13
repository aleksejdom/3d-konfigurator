// Baut aus einem Projekt die Dateien für einen Export.
// Die Dateien unter src/core werden unverändert mitgegeben: Der Export rechnet deshalb
// mit genau dem Code, mit dem auch die Editor-Vorschau rechnet.

import { escapeHtml, renderCss, renderFreeLayer, renderHotspotLayer, renderSections, usedImages } from './page.js';

const VERSIONS = { three: '^0.187.0', gsap: '^3.15.1', vite: '^8.3.8', astro: '^7.4.11' };

/** Dateien des Draco-Decoders (aus three/examples/jsm/libs/draco/gltf). */
export const DRACO_FILES = ['draco_decoder.wasm', 'draco_wasm_wrapper.js'];

const MAIN_JS = `import project from './project.json';
import { startPlayer } from './scene/player.js';

const canvas = document.querySelector('#stage');

startPlayer({
  project,
  canvas,
  modelUrl: canvas.dataset.model || undefined,
  envUrl: canvas.dataset.env || undefined,
});
`;

function sceneNote() {
  return `## Aufbau

- \`project.json\` enthält Abschnitte, gespeicherte Punkte und Ausgangswerte der Szene.
- \`scene/timeline.js\` berechnet aus der Scrollposition den Zustand der Szene.
- \`scene/scroll.js\` ordnet die Scrollposition einem Abschnitt und seiner relativen Position zu.
- \`scene/stage.js\` baut die Three.js-Szene auf und überträgt den Zustand.
- \`scene/components.js\` steuert die scrollgesteuerten Animationen der HTML-Komponenten.
- \`scene/interaction.js\` enthält Hotspots, Kamerafahrten, Look At und Follow.
- \`scene/configurator.js\` und \`scene/actions.js\` enthalten Varianten, Materialien, Regeln und Aktionen.
- \`scene/data.js\` liest die Datenquelle und überträgt Werte auf Modell und Oberfläche.
- \`scene/player.js\` verbindet alles über GSAP ScrollTrigger mit der Seite.

Texte, Karten und Buttons stehen als normales HTML in der Seite und lassen sich dort direkt ändern.
Ein Abschnitt wird über \`data-section="<ID>"\` mit der Timeline verbunden. Animierte Komponenten
tragen \`data-anim\` sowie \`data-in\` und \`data-out\` (Bereich im Abschnitt, 0 bis 1).
Breakpoints sind Container Queries im Stylesheet (Tablet bis 1024 px, Mobile bis 640 px).
`;
}

/** Abschnitt der Startanleitung zur Datenquelle. Leer, wenn das Projekt keine Datenfelder hat. */
function dataNote(project, projectFile = 'src/project.json', sceneDir = 'src/scene') {
  const data = project.data;
  if (!data || data.fields.length === 0) return '';
  const source = data.source;
  const kinds = { test: 'Testdaten (keine Verbindung)', rest: 'REST, JSON wird regelmäßig abgefragt', sse: 'Server-Sent Events', websocket: 'WebSocket' };
  const example = {};
  for (const field of data.fields) {
    const parts = field.key.split('.');
    let target = example;
    parts.slice(0, -1).forEach((part) => (target = target[part] ??= {}));
    target[parts[parts.length - 1]] = field.test;
  }
  const rows = data.fields.map((field) => `| ${field.label} | \`${field.key}\` | ${field.type}${field.unit ? ' (' + field.unit + ')' : ''} |`).join('\n');
  return `## Datenquelle

Die Seite liest Daten und zeigt sie am Modell und in der Oberfläche. Sie schreibt nichts zurück.

Aktuelle Einstellung in \`${projectFile}\` unter \`data.source\`:

- \`mode\`: \`${source.mode}\` (${kinds[source.mode]}). Möglich sind \`test\`, \`rest\`, \`sse\`, \`websocket\`.
- \`url\`: \`${source.url || '(leer)'}\`
- \`interval\`: ${source.interval} s zwischen zwei Abfragen (nur REST)
- \`staleAfter\`: Nach ${source.staleAfter} s ohne neue Daten gilt der Stand als veraltet (0 = nie)

Die Quelle liefert JSON in dieser Form. Live-Kanäle dürfen auch nur die geänderten Teile schicken:

\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`

| Datenfeld | Pfad | Typ |
|---|---|---|
${rows}

Bei REST antwortet die Adresse auf GET mit dem JSON. Bei SSE und WebSocket ist jede Nachricht ein JSON-Text.
Fällt die Verbindung aus, bleibt der letzte Stand sichtbar und wird als „Offline“ oder „Daten veraltet“ gekennzeichnet.

### Zugangsdaten und Backend

Im Browser-Code stehen keine Zugangsdaten, und dort dürfen auch keine eingetragen werden: Jeder Besucher
könnte sie lesen. Braucht die eigentliche Quelle (SPS, MQTT-Broker, Hersteller-API) Zugangsdaten, stellt ein
eigener kleiner Dienst auf dem Server die Verbindung her:

1. Der Dienst hält die Zugangsdaten in seiner Umgebung (z. B. Umgebungsvariablen), fragt die Quelle ab
   und gibt nur die Felder aus der Tabelle oben weiter.
2. \`data.source.url\` zeigt auf diesen Dienst, z. B. \`/api/daten\` auf derselben Domain. Liegt er auf
   einer anderen Domain, muss er den Zugriff per CORS erlauben.
3. Die Verarbeitung der Daten steht in \`${sceneDir}/data.js\`.
`;
}

function slug(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'projekt'
  );
}

/**
 * Fasst Binärdateien als JavaScript-Datei zusammen (Pfad -> Base64). Die Seite lädt sie nur, wenn sie
 * per Doppelklick geöffnet wurde (file://): Dort verbietet der Browser das Nachladen von Dateien.
 * @param {Record<string, Uint8Array>} entries Pfad relativ zur index.html -> Inhalt
 */
export function buildOfflineAssets(entries) {
  const lines = Object.entries(entries).map(([path, bytes]) => {
    let binary = '';
    // In Stücken umwandeln, damit auch große Modelle nicht den Aufrufstapel sprengen.
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `  ${JSON.stringify(path)}: "${btoa(binary)}"`;
  });
  return `// Modell und weitere Dateien als Text, nur für das Öffnen per Doppelklick (file://).
// Auf einem Webserver wird diese Datei nicht geladen; dort kann sie gelöscht werden.
window.SCENE_FILES = {
${lines.join(',\n')}
};
`;
}

/**
 * @param {import('../core/types').Project} project
 * @param {'vanilla' | 'astro'} target
 * @param {Record<string, string>} coreSources Dateiname -> Quelltext der Dateien aus src/core
 * @returns {{ files: Record<string, string>, binaries: { path: string, kind: 'model' | 'resource' | 'image' | 'env' | 'draco' | 'runtime', name: string, offline?: boolean }[] }}
 *   files: Pfad -> Textinhalt.
 *   binaries: Dateien, die der Aufrufer an ihren Platz kopiert (Modell, Begleitdateien, Bilder, Umgebung,
 *   Draco-Decoder, fertig gebaute Laufzeit). offline = gehört zusätzlich in offline-assets.js.
 */
export function buildExport(project, target, coreSources) {
  const vanilla = target === 'vanilla';
  // Astro legt statische Dateien in public/ ab. Der HTML-Export ist selbst schon die fertige Seite.
  const root = vanilla ? '' : 'public/';
  const modelFile = project.model.file;
  const environment = project.settings.environment;
  const poster = project.settings.poster;
  const modelAttr =
    (modelFile ? ` data-model="model/${escapeHtml(encodeURI(modelFile))}"` : '') +
    (environment.file ? ` data-env="env/${escapeHtml(encodeURI(environment.file))}"` : '');
  const title = escapeHtml(project.name);
  const files = {};
  const freeLayer = renderFreeLayer(project, { indent: '    ' });
  const hotspotLayer = renderHotspotLayer(project, { indent: '    ' });
  // Das Posterbild liegt über der Szene, bis das Modell zum ersten Mal gerendert ist.
  const posterTag = poster ? `\n    <img class="poster" src="images/${escapeHtml(encodeURI(poster))}" alt="">` : '';

  const binaries = [
    ...(modelFile ? [{ path: `${root}model/${modelFile}`, kind: 'model', name: modelFile, offline: true }] : []),
    ...(project.model.resources || []).map((name) => ({ path: `${root}model/${name}`, kind: 'resource', name, offline: true })),
    ...usedImages(project).map((name) => ({ path: `${root}images/${name}`, kind: 'image', name })),
    ...(environment.file ? [{ path: `${root}env/${environment.file}`, kind: 'env', name: environment.file, offline: true }] : []),
    // Der Draco-Decoder wird nur mitgegeben, wenn das Modell ihn braucht.
    ...(project.model.stats && project.model.stats.draco ? DRACO_FILES.map((name) => ({ path: `${root}draco/${name}`, kind: 'draco', name, offline: true })) : []),
  ];

  const body = `    <canvas id="stage"${modelAttr} aria-hidden="true"></canvas>${posterTag}
    <main class="page">
${renderSections(project, { indent: '      ' })}
    </main>${freeLayer ? '\n' + freeLayer : ''}${hotspotLayer ? '\n' + hotspotLayer : ''}`;

  if (vanilla) {
    // ---------- HTML / CSS / JavaScript: läuft ohne Installation ----------
    for (const [name, source] of Object.entries(coreSources)) files['source/src/scene/' + name] = source;
    binaries.push({ path: 'runtime/player.js', kind: 'runtime', name: 'player.js' });

    files['index.html'] = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <link rel="icon" href="data:,">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css">
  </head>
  <body class="site">
${body}
    <!-- Inhalt und Einstellungen der Szene -->
    <script src="project.js"></script>
    <!-- Nur beim Öffnen per Doppelklick: Modell und Umgebung als eingebettete Daten -->
    <script>
      if (location.protocol === 'file:') document.write('<script src="offline-assets.js"><\\/script>');
    </script>
    <!-- Three.js, GSAP ScrollTrigger und die Szenenlogik, fertig gebaut aus source/ -->
    <script src="runtime/player.js"></script>
  </body>
</html>
`;
    files['styles.css'] = renderCss(project);
    files['project.js'] = `// Abschnitte, gespeicherte Punkte, Hotspots, Varianten und Datenfelder der Szene.\nwindow.SCENE_PROJECT = ${JSON.stringify(project, null, 2)};\n`;
    files['source/vite.config.js'] = `import { defineConfig } from 'vite';

// Der DRACOLoader von Three.js verweist auf seine mitgelieferten Decoder-Dateien. In einer einzelnen Datei
// würden sie eingebettet (rund 1,5 MB). Die Seite lädt den Decoder bei Bedarf aus dem Ordner draco/.
const stripDracoDefaults = {
  name: 'strip-draco-defaults',
  transform(code, id) {
    if (!id.replace(/\\\\/g, '/').endsWith('loaders/DRACOLoader.js')) return null;
    return code.replace(/new URL\\(\\s*'[^']+',\\s*import\\.meta\\.url\\s*\\)\\.toString\\(\\)/g, "''");
  },
};

// Baut aus src/scene eine einzelne Datei: ../runtime/player.js
export default defineConfig({
  plugins: [stripDracoDefaults],
  build: {
    outDir: '../runtime',
    emptyOutDir: false,
    lib: { entry: 'src/scene/main.js', formats: ['iife'], name: 'Scene3D', fileName: () => 'player.js' },
  },
});
`;
    files['source/package.json'] =
      JSON.stringify(
        {
          name: slug(project.name) + '-source',
          private: true,
          version: '1.0.0',
          type: 'module',
          scripts: { build: 'vite build' },
          dependencies: { gsap: VERSIONS.gsap, three: VERSIONS.three },
          devDependencies: { vite: VERSIONS.vite },
        },
        null,
        2,
      ) + '\n';
    files['README.md'] = `# ${project.name}

Export aus dem 3D-Web-Editor: HTML, CSS und JavaScript mit Three.js und GSAP ScrollTrigger.

## Starten

Die Seite ist fertig und braucht keine Installation:

- **Ansehen:** \`index.html\` per Doppelklick öffnen.
- **Veröffentlichen:** den ganzen Ordner auf den Webserver laden. Der Ordner \`source\` und die Datei
  \`offline-assets.js\` werden dort nicht gebraucht und können wegbleiben.

Es wird kein Editor und kein Tauri benötigt.

## Aufbau

| Datei | Inhalt |
|---|---|
| \`index.html\` | die Seite: Abschnitte, Texte, Buttons, Karten als normales HTML |
| \`styles.css\` | die Gestaltung |
| \`project.js\` | Abschnitte, gespeicherte Punkte, Hotspots, Varianten, Datenfelder |
| \`runtime/player.js\` | Three.js, GSAP ScrollTrigger und die Szenenlogik in einer Datei, gebaut aus \`source\` |
| \`model\`, \`images\`, \`env\`, \`draco\` | Modell, Bilder, Umgebung, Draco-Decoder |
| \`offline-assets.js\` | Modell und Umgebung als Text. Wird nur beim Öffnen per Doppelklick geladen, weil der Browser dort das Nachladen von Dateien verbietet |
| \`source\` | lesbarer Quellcode der Szenenlogik |

Texte und Buttons änderst du direkt in \`index.html\`. Ein Abschnitt ist über \`data-section="<ID>"\` mit der Timeline verbunden.

## Szenenlogik ändern

Der Quellcode liegt in \`source/src/scene\`. Nach einer Änderung:

\`\`\`
cd source
npm install
npm run build
\`\`\`

Das schreibt \`runtime/player.js\` neu.

${dataNote(project, 'project.js', 'source/src/scene')}
${sceneNote().replace(/`project\.json`/, '`project.js`').replace(/`scene\//g, '`source/src/scene/').replace(/\nTexte und Buttons stehen[\s\S]*$/, '\n')}`;
    return { files, binaries };
  }

  // ---------- Astro ----------
  for (const [name, source] of Object.entries(coreSources)) {
    if (name !== 'main.js') files['src/scene/' + name] = source;
  }
  files['src/project.json'] = JSON.stringify(project, null, 2) + '\n';
  files['src/styles/page.css'] = renderCss(project);
  files['src/pages/index.astro'] = `---
import '../styles/page.css';
---

<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="data:," />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body class="site">
${body}
    <script>
      import '../main.js';
    </script>
  </body>
</html>
`;
  files['src/main.js'] = MAIN_JS;
  files['astro.config.mjs'] = `import { defineConfig } from 'astro/config';

export default defineConfig({});
`;
  files['package.json'] =
    JSON.stringify(
      {
        name: slug(project.name),
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: { dev: 'astro dev', build: 'astro build', preview: 'astro preview' },
        dependencies: { astro: VERSIONS.astro, gsap: VERSIONS.gsap, three: VERSIONS.three },
      },
      null,
      2,
    ) + '\n';
  files['README.md'] = `# ${project.name}

Export aus dem 3D-Web-Editor: Astro mit Three.js und GSAP ScrollTrigger.

Dieser Export ist ein Astro-Projekt für die Weiterentwicklung. Er braucht Node.js und läuft über einen
lokalen Entwicklungsserver. Dateien daraus per Doppelklick zu öffnen funktioniert nicht: Der Browser blockiert
dann das Laden der Skripte (CORS-Fehler). Für eine Seite, die ohne Installation läuft, nimm im Editor den
Export „HTML / CSS / JavaScript“.

## Starten

\`\`\`
npm install
npm run dev
\`\`\`

Danach die angezeigte Adresse öffnen, meist http://localhost:4321.

## Für das eigene Hosting bauen

\`\`\`
npm run build
\`\`\`

Den Inhalt des Ordners \`dist\` auf den Webserver laden. Es wird kein Editor und kein Tauri benötigt.

${dataNote(project)}
${sceneNote().replace(/`project\.json`/, '`src/project.json`').replace(/`scene\//g, '`src/scene/')}
Die Seite selbst liegt in \`src/pages/index.astro\`, die Gestaltung in \`src/styles/page.css\`,
das Modell in \`public/model\`, Bilder in \`public/images\`.
`;
  return { files, binaries };
}
