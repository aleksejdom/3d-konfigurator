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
npm test                # Timeline, Scrollzuordnung, Komponenten, Vorlagen, Breakpoints, Hotspots, Look At, Konfigurator, Daten
npm run verify:exports  # schreibt beide Exporte nach .verify/ und baut sie
```

## Arbeitsablauf im Editor

1. Modell importieren (oder „Beispielmodell laden“).
2. Am Start Kamera, Licht und Modell einstellen, dann **Merken**.
3. In der Timeline zur nächsten Stelle gehen, Szene anpassen, wieder **Merken**. Pro Gruppe wählst du,
   ob der Wert nur in diesem Abschnitt gilt oder in die Folgeabschnitte übernommen wird.
4. Timeline ziehen oder Mausrad über der Timeline: Die Übergänge laufen vor und zurück.
5. Punkte in der Timeline anklicken, verschieben und rechts bearbeiten (Geltungsbereich, Easing, Übergangslänge).
6. Aus der Komponentenbibliothek Headlines, Texte, Bilder, Buttons, Karten und Infoboxen in den Viewport ziehen.
   Über „Desktop / Tablet / Mobile“ am Viewport passt du Gestaltung und Kameraausschnitt pro Breakpoint an.
7. „Hotspot setzen“ und ein Bauteil anklicken. Die Kamera fährt beim Klick von selbst vor den Hotspot; mit
   „Kameraansicht merken“ legst du eine eigene Ansicht fest. Einem Button die Aktion „Kamera zu Hotspot fahren“
   geben. Für ein ausgewähltes Bauteil „+ Look At“ oder „+ Follow“ anlegen.
8. Für den Konfigurator ein Bauteil auswählen und links „+ Variante“ oder „+ Material“ anlegen. Den Besuchern
   gibst du einen Varianten-Slider, eine Auswahlliste oder Buttons mit der passenden Aktion.
9. Für einen Digitalen Zwilling links unter „Daten“ Datenfelder anlegen, Testwerte setzen und Bauteile, Karten,
   Messwerte oder Statusanzeigen daran binden. Die Datenquelle der veröffentlichten Seite stellst du dort ebenfalls ein.
10. Unter „Seite“ rechts: HDRI oder Panorama als Umgebung, Posterbild für die Ladephase, reduzierte Bewegung.
11. **Vorschau** zeigt die echte Seite in Desktop-, Tablet- und Mobile-Breite, misst die Zeit bis zum ersten sichtbaren
    Render, schaltet zwischen Testdaten und Live-Quelle um und zeigt die Seite mit reduzierter Bewegung.
    „Smartphone“ erzeugt in der Desktop-App einen Link mit QR-Code fürs lokale WLAN.
12. **Exportieren** schreibt ein Astro- oder ein HTML/CSS/JavaScript-Projekt in einen Ordner. Der HTML-Export läuft
    ohne Installation: `index.html` doppelklicken oder den Ordner hochladen. Der Astro-Export braucht `npm install`
    und `npm run dev`.

Links wählst du über die Symbolleiste den Bereich (Seite, Elemente, Modell, Hotspots, Varianten, Daten). Bereiche
lassen sich über ihren Titel auf- und zuklappen; die App merkt sich das.

Texte stehen fest im Bild und wechseln an der Abschnittsgrenze. Unter „Seite“ rechts lässt sich das auf mitscrollende
Texte umstellen. Animationen aus Blender stellst du rechts unter „Abschnitt“ ein: in Schleife, einmal oder mit dem
Scrollen.

## Live-Daten ausprobieren

```
npm run demo:data
```

startet eine Beispiel-Datenquelle auf Port 4800: REST unter `http://localhost:4800/data`, Server-Sent Events unter
`/events`, WebSocket unter `ws://localhost:4800/ws`. Die Felder heißen `motor.rpm`, `motor.temperature`,
`motor.status` und `door.open`. Einen Wert setzt du zum Testen mit `http://localhost:4800/set?motor.status=error`.

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
project.json     Abschnitte, Komponenten, Vorlagen, Hotspots, Look At, Follow, Variantengruppen, Datenfelder, gespeicherte Punkte, Budgets (formatVersion 6)
snapshots.json   benannte Projektstände
assets/          Modelldatei mit Begleitdateien, Bilder, Posterbild, HDRI
```
