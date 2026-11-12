// Baut aus einem Projekt die Dateien für einen Export.
// Die Dateien unter src/core werden unverändert mitgegeben: Der Export rechnet deshalb
// mit genau dem Code, mit dem auch die Editor-Vorschau rechnet.

import { escapeHtml, renderCss, renderFreeLayer, renderHotspotLayer, renderSections, usedImages } from './page.js';

const VERSIONS = { three: '^0.187.0', gsap: '^3.15.1', vite: '^8.3.8', astro: '^7.4.11' };

const MAIN_JS = `import project from './project.json';
import { startPlayer } from './scene/player.js';

const canvas = document.querySelector('#stage');

startPlayer({
  project,
  canvas,
  modelUrl: canvas.dataset.model || undefined,
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
function dataNote(project) {
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

Aktuelle Einstellung in \`src/project.json\` unter \`data.source\`:

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
3. Die Verarbeitung der Daten steht in \`src/scene/data.js\`.
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
 * @param {import('../core/types').Project} project
 * @param {'vanilla' | 'astro'} target
 * @param {Record<string, string>} coreSources Dateiname -> Quelltext der Dateien aus src/core
 * @returns {{ files: Record<string, string>, modelPath: string | null, imagePaths: Record<string, string> }}
 *   files: Pfad -> Textinhalt. modelPath: Pfad, unter dem die Modelldatei abzulegen ist.
 *   imagePaths: Bildname -> Pfad, unter dem das Bild abzulegen ist.
 */
export function buildExport(project, target, coreSources) {
  const modelFile = project.model.file;
  const modelAttr = modelFile ? ` data-model="model/${escapeHtml(encodeURI(modelFile))}"` : '';
  const title = escapeHtml(project.name);
  const files = {};
  const sceneDir = 'src/scene/';
  const imagePaths = Object.fromEntries(usedImages(project).map((name) => [name, `public/images/${name}`]));
  const freeLayer = renderFreeLayer(project, { indent: '    ' });
  const hotspotLayer = renderHotspotLayer(project, { indent: '    ' });
  const body = `    <canvas id="stage"${modelAttr} aria-hidden="true"></canvas>
    <main class="page">
${renderSections(project, { indent: '      ' })}
    </main>${freeLayer ? '\n' + freeLayer : ''}${hotspotLayer ? '\n' + hotspotLayer : ''}`;

  for (const [name, source] of Object.entries(coreSources)) files[sceneDir + name] = source;
  files['src/project.json'] = JSON.stringify(project, null, 2) + '\n';

  if (target === 'vanilla') {
    files['index.html'] = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <link rel="icon" href="data:,">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body class="site">
${body}
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
`;
    files['styles.css'] = renderCss(project);
    files['src/main.js'] = MAIN_JS;
    files['vite.config.js'] = `import { defineConfig } from 'vite';

// base './' erlaubt das Hosting in einem Unterordner.
export default defineConfig({ base: './' });
`;
    files['package.json'] =
      JSON.stringify(
        {
          name: slug(project.name),
          private: true,
          version: '1.0.0',
          type: 'module',
          scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
          dependencies: { gsap: VERSIONS.gsap, three: VERSIONS.three },
          devDependencies: { vite: VERSIONS.vite },
        },
        null,
        2,
      ) + '\n';
    files['README.md'] = `# ${project.name}

Export aus dem 3D-Web-Editor: HTML, CSS und JavaScript mit Three.js und GSAP ScrollTrigger.

## Starten

\`\`\`
npm install
npm run dev
\`\`\`

## Für das eigene Hosting bauen

\`\`\`
npm run build
\`\`\`

Den Inhalt des Ordners \`dist\` auf den Webserver laden. Es wird kein Editor und kein Tauri benötigt.

${dataNote(project)}
${sceneNote().replace(/`project\.json`/, '`src/project.json`').replace(/`scene\//g, '`src/scene/')}
Die Seite selbst liegt in \`index.html\`, die Gestaltung in \`styles.css\`, das Modell in \`public/model\`, Bilder in \`public/images\`.
`;
    return { files, modelPath: modelFile ? `public/model/${modelFile}` : null, imagePaths };
  }

  // ---------- Astro ----------
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

## Starten

\`\`\`
npm install
npm run dev
\`\`\`

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
  return { files, modelPath: modelFile ? `public/model/${modelFile}` : null, imagePaths };
}
