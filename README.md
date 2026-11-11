# 3D-Web-Editor

Lokaler, visueller Editor für scrollgesteuerte 3D-Webseiten. 3D-Modell importieren, Abschnitte und Szene gestalten,
Zustände mit „Merken“ an Scrollpositionen binden und als lauffähigen, editierbaren Web-Quellcode exportieren.

Desktop-App mit Tauri 2, React, TypeScript und Vite. 3D mit Three.js, Scrollsteuerung mit GSAP ScrollTrigger.

Der Editor entsteht in Etappen. Was fertig ist und was folgt, steht in [docs/etappen.md](docs/etappen.md),
die vollständigen Anforderungen in [docs/anforderungen.md](docs/anforderungen.md).

## Voraussetzungen unter Windows

- Node.js 22 oder neuer
- Rust (über https://rustup.rs)
- Microsoft C++ Build Tools („Desktopentwicklung mit C++“)
- WebView2 (in Windows 10/11 bereits enthalten)

## Starten

```
npm install
npm run tauri dev
```

Ohne Rust läuft der Editor zum Ausprobieren auch im Browser (Chrome oder Edge): `npm run dev`, dann http://localhost:1420.

## Installer bauen

```
npm run tauri build
```

Der Installer liegt danach unter `src-tauri/target/release/bundle`. Alternativ baut ihn GitHub:
unter „Actions“ den Workflow „Windows-Installer“ starten und das Artefakt herunterladen.

## Prüfen

```
npm test                # Timeline- und Scroll-Logik
npm run verify:exports  # schreibt beide Exporte nach .verify/ und baut sie
```

## Arbeitsablauf im Editor

1. Modell importieren (oder „Beispielmodell laden“).
2. Am Start Kamera, Licht und Modell einstellen, dann **Merken**.
3. In der Timeline zur nächsten Stelle gehen, Szene anpassen, wieder **Merken**. Pro Gruppe wählst du,
   ob der Wert nur in diesem Abschnitt gilt oder in die Folgeabschnitte übernommen wird.
4. Timeline ziehen oder Mausrad über der Timeline: Die Übergänge laufen vor und zurück.
5. Punkte in der Timeline anklicken, verschieben und rechts bearbeiten (Geltungsbereich, Easing, Übergangslänge).
6. **Vorschau** zeigt die echte Seite und misst die Zeit bis zum ersten sichtbaren Render.
7. **Exportieren** schreibt ein Astro- oder ein HTML/CSS/JavaScript-Projekt in einen Ordner.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/core` | Gemeinsame Logik in lesbarem JavaScript: Projektformat, Timeline-Auswertung, Scrollzuordnung, Three.js-Bühne, Player. Diese Dateien werden unverändert in jeden Export kopiert. |
| `src/editor` | Oberfläche des Editors (React, TypeScript) |
| `src/export` | Erzeugt HTML, CSS und die Projektdateien der beiden Exporte |
| `src/preview` | Separat ladbare Webvorschau |
| `src-tauri` | Desktop-Hülle |

Editor-Viewport, Vorschau und Export rechnen mit derselben Funktion `evaluate(project, pos)` aus `src/core/timeline.js`.
Sie ist eine reine Funktion der Scrollposition; deshalb ergeben Vorwärtsscrollen, Rückwärtsscrollen und Sprünge
denselben Zustand.

## Projektordner

```
project.json     Abschnitte, gespeicherte Punkte, Ausgangswerte, Budgets (formatVersion 1)
snapshots.json   benannte Projektstände
assets/          Modelldatei
```
