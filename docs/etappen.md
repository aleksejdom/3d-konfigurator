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

## Noch offen

| Etappe | Inhalt | Abnahmekriterium |
|---|---|---|
| 2 | Komponenten: Karten, Bilder, Infoboxen, Verschachtelung, Vorlagen und Instanzen, freie Platzierung über dem Canvas, Animationen (Text-Reveal, Einblenden, Verschieben), Breakpoints mit geerbten und überschriebenen Werten | 3 (Teil) |
| 3 | Hotspots am Mesh, „Kameraansicht merken“, Look At und Follow (Maus, Touch) | 3 |
| 4 | Konfigurator: Aktionen an Meshes und HTML-Elementen, Materialwechsel, Mesh-Slider, Variantenregeln, Vorrang der Besucherauswahl, Überblenden von Sichtbarkeit und Varianten | 4 |
| 5 | Digitaler Zwilling: typisierte Datenbindungen, Testdaten, REST/JSON, WebSocket/SSE, Verbindungszustände | 5 |
| 6 | HDRI/Skybox, Animationsclips aus dem Modell, Draco-Kompression, glTF mit Begleitdateien, Posterbild, reduzierte Bewegung, Vorschau-Link und QR-Code fürs WLAN, Messung auf echtem Gerät | 1 (Rest) |
