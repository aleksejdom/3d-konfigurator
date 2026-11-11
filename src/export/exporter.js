// Baut aus einem Projekt die Dateien für einen Export.
// Die Dateien unter src/core werden unverändert mitgegeben: Der Export rechnet deshalb
// mit genau dem Code, mit dem auch die Editor-Vorschau rechnet.

import { escapeHtml, renderCss, renderSections } from './page.js';

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
- \`scene/player.js\` verbindet alles über GSAP ScrollTrigger mit der Seite.

Texte und Buttons stehen als normales HTML in der Seite und lassen sich dort direkt ändern.
Ein Abschnitt wird über \`data-section="<ID>"\` mit der Timeline verbunden.
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
 * @returns {{ files: Record<string, string>, modelPath: string | null }}
 *   files: Pfad -> Textinhalt. modelPath: Pfad, unter dem die Modelldatei abzulegen ist.
 */
export function buildExport(project, target, coreSources) {
  const modelFile = project.model.file;
  const modelAttr = modelFile ? ` data-model="model/${escapeHtml(encodeURI(modelFile))}"` : '';
  const title = escapeHtml(project.name);
  const files = {};
  const sceneDir = 'src/scene/';

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
  <body>
    <canvas id="stage"${modelAttr} aria-hidden="true"></canvas>
    <main class="page">
${renderSections(project, '      ')}
    </main>
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

${sceneNote().replace(/`project\.json`/, '`src/project.json`').replace(/`scene\//g, '`src/scene/')}
Die Seite selbst liegt in \`index.html\`, die Gestaltung in \`styles.css\`, das Modell in \`public/model\`.
`;
    return { files, modelPath: modelFile ? `public/model/${modelFile}` : null };
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
  <body>
    <canvas id="stage"${modelAttr} aria-hidden="true"></canvas>
    <main class="page">
${renderSections(project, '      ')}
    </main>
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

${sceneNote().replace(/`project\.json`/, '`src/project.json`').replace(/`scene\//g, '`src/scene/')}
Die Seite selbst liegt in \`src/pages/index.astro\`, die Gestaltung in \`src/styles/page.css\`,
das Modell in \`public/model\`.
`;
  return { files, modelPath: modelFile ? `public/model/${modelFile}` : null };
}
