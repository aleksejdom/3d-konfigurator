# Stand und Etappen

Grundlage ist `docs/anforderungen.md`. Der Editor entsteht in Etappen; jede endet mit einem lauffähigen Stand.

## Etappe 1: Kern-Durchstich (erledigt, Stand 12.11.2026)

Deckt die Abnahmekriterien 1, 2 und 6 ab.

- GLB-Import (auch glTF mit eingebetteten Daten, Meshopt-Kompression) mit Dateigröße, Dreiecken, Meshes, Materialien, Texturgrößen; Draw Calls der gerenderten Szene
- Performance-Budgets für Desktop und Mobile mit Warnungen, die Wert und Asset nennen
- Webvorschau als eigene Seite mit Messung „Zeit bis zum ersten sichtbaren Render“ und Testprofil (simuliert)
- Modellaustausch mit Wiederzuordnung über Bauteilnamen; fehlende Zuordnungen werden angezeigt
- Viewport mit Kamerasteuerung, Auswahl per Klick, Verschieben/Drehen/Skalieren, Szenenbaum
- Abschnitte mit Headline, Text, Button (als echtes HTML exportiert)
- Abschnittsgebundene Scroll-Timeline mit „Merken“, beiden Geltungsbereichen, Easing, Übergangslänge und Ausblendbereich pro Eigenschaft
- Speichern/Öffnen als Projektordner, Undo/Redo, benannte Projektstände, versioniertes Projektformat
- Exporte „Astro“ und „HTML/CSS/JavaScript“, beide mit Three.js und GSAP ScrollTrigger

## Etappe 2: Komponenten und Breakpoints (erledigt, Stand 12.11.2026)

Deckt den Teil von Abnahmekriterium 3 ab, der ohne Hotspots und Look At auskommt.

- Komponentenbibliothek: Headline, Text, Bild, Button, Karte, Infobox; per Klick oder Drag-and-drop in die Textspalte, in eine Karte oder frei über den 3D-Canvas
- Verschachtelung: Karten und Infoboxen nehmen Elemente auf; jedes Element einzeln auswählbar, bearbeitbar und umsortierbar; Ebenenbaum pro Abschnitt
- Vorlagen und Instanzen: Eine Karte wird zur Vorlage. Instanzen haben eigene Inhalte, eigene Position und Animation; Aufbau und Gestaltung kommen aus der Vorlage
- Frei platzierte Komponenten lassen sich im Viewport mit der Maus verschieben und sind nur in ihrem Abschnitt sichtbar
- Scrollgesteuerte Animationen: Einblenden, Verschieben aus vier Richtungen, Text-Reveal Wort für Wort, jeweils mit Bereich für Erscheinen und Ausblenden
- Breakpoints Desktop, Tablet, Mobile im Viewport: Position, Breite, Schriftgröße, Sichtbarkeit, Farben, Abstände und Kameraausschnitt pro Breakpoint; Anzeige „gesetzt“, „überschrieben“ oder „geerbt von …“ mit Zurücksetzen
- Bilder liegen im Projektordner unter `assets/` und im Export unter `public/images/`
- Projektformat Version 2; Projekte der Version 1 werden beim Öffnen umgestellt

## Etappe 3: Hotspots, Look At und Follow (erledigt, Stand 12.11.2026)

Schließt Abnahmekriterium 3 ab.

- Hotspots per Klick auf ein Mesh („Hotspot setzen“). Sie hängen am Bauteil, folgen seiner Bewegung und verschwinden auf der abgewandten Seite. Optional nur in einem Abschnitt sichtbar, mit Beschriftung
- „Kameraansicht merken“ pro Hotspot: Kameraposition, Blickziel, Abstand, Dauer und Easing. Pro Breakpoint eine eigene Ansicht möglich, sonst geerbt
- Kamerafahrt per Klick, Tap oder Tastatur (Enter, Leertaste, Escape schließt). Pro Hotspot einstellbar: Scrollen führt weich zur aktuellen Scroll-Kamera zurück, oder die Ansicht bleibt bis zum Schließen
- Buttons und Karten können als Aktion die Kamera zu einem Hotspot fahren oder die Detailansicht schließen
- Komponenten lassen sich an einem Hotspot verankern, dauerhaft oder nur bei geöffnetem Hotspot
- Look At pro Modell, Mesh oder Kamera: Ziel Mauszeiger, Objekt, Mesh, Hotspot, freier 3D-Punkt oder Kamera; Drehachsen, Winkelgrenzen, Stärke, Dämpfung. Ziel und Stärke lassen sich mit „Merken“ pro Abschnitt speichern, der Wechsel zwischen zwei Zielen verläuft weich und umkehrbar
- Follow pro Modell, Mesh oder Kamera: Achsen, Distanz, Dämpfung, Rückkehrverhalten
- Look At und Follow wirken zusätzlich zur Timeline; eigenes Verhalten für Touch-Geräte
- Projektformat Version 3; ältere Projekte werden beim Öffnen umgestellt

## Noch offen

| Etappe | Inhalt | Abnahmekriterium |
|---|---|---|
| 4 | Konfigurator: Aktionen an Meshes und HTML-Elementen, Materialwechsel, Mesh-Slider, Variantenregeln, Vorrang der Besucherauswahl, Überblenden von Sichtbarkeit und Varianten | 4 |
| 5 | Digitaler Zwilling: typisierte Datenbindungen, Testdaten, REST/JSON, WebSocket/SSE, Verbindungszustände | 5 |
| 6 | HDRI/Skybox, Animationsclips aus dem Modell, Draco-Kompression, glTF mit Begleitdateien, Posterbild, reduzierte Bewegung, Vorschau-Link und QR-Code fürs WLAN, Messung auf echtem Gerät | 1 (Rest) |
