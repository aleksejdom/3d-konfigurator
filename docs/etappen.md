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

## Etappe 4: 3D-Konfigurator (erledigt, Stand 12.11.2026)

Deckt Abnahmekriterium 4 ab.

- Variantengruppen aus Bauteilen: alternative Meshes pro Wahl, auch „nichts“ für Ein- und Ausblenden
- Materialgruppen: Farbe oder ein Material aus dem Modell für gewählte Bauteile
- Aktionen an Buttons, Karten und direkt an Bauteilen (Klick oder Tap auf das Mesh): Variante oder Material wählen, nächste/vorherige Variante, Auswahl zurücksetzen, Animationsclip starten/stoppen, Kamera zu einem Hotspot fahren
- Neue Komponenten: Auswahlliste und Varianten-Slider (Wischen, Pfeil-Schaltflächen, Punkte, Pfeiltasten). Modell, Buttons, Karten, Liste und Slider zeigen dieselbe aktive Wahl
- Variantenregeln „nur verfügbar mit …“: gesperrte Varianten sind in der Oberfläche deaktiviert; fällt die Voraussetzung weg, rückt die erste verfügbare Wahl nach
- Die Wahl des Besuchers hat Vorrang vor der Timeline und bleibt beim Scrollen erhalten. Sie endet durch die Aktion „Auswahl zurücksetzen“ oder beim Erreichen eines Abschnitts, der die Gruppe an die Timeline übergibt
- Varianten in der Timeline: Wahl mit „Merken“ pro Abschnitt speichern; Wechsel hart an der Stelle oder mit einstellbarem Überblendbereich
- Animationsclips aus dem Modell werden erkannt und lassen sich per Aktion abspielen
- Projektformat Version 4; ältere Projekte werden beim Öffnen umgestellt

## Etappe 5: Digitaler Zwilling (erledigt, Stand 12.11.2026)

Deckt Abnahmekriterium 5 ab.

- Typisierte Datenfelder: Zahl (Einheit, Nachkommastellen, Grenzwerte für Warnung und Alarm), Status (Zustände mit Anzeigetext und Stufe), Ja/Nein, Text. Jedes Feld liest seinen Wert über einen Pfad wie `motor.rpm`
- Reaktionen am Modell: Bauteile in der Farbe der Stufe einfärben, Bauteil mit dem Messwert drehen, Tempo eines Animationsclips steuern
- Neue Komponenten: Messwert, Statusanzeige, Verbindungsstatus. Karten, Infoboxen und Hotspots zeigen die Stufe eines Felds als Farbe
- Testdaten: Testwert pro Feld; Viewport und Vorschau reagieren sofort. In der Vorschau lassen sich Testwerte ändern, ohne das Projekt zu ändern
- Live-Quellen (nur lesend): REST/JSON mit Abfrageintervall, Server-Sent Events, WebSocket. Zustände „Verbunden“, „Daten veraltet“, „Offline“ mit Zeitpunkt der letzten Aktualisierung; der letzte Stand bleibt sichtbar und wird gekennzeichnet
- Zugangsdaten stehen nie im Projekt oder Export. Die Startanleitung des Exports beschreibt Datenquelle, erwartetes JSON und den Weg über ein eigenes Backend
- `npm run demo:data` startet eine Beispiel-Datenquelle mit REST, SSE und WebSocket
- Projektformat Version 5

## Etappe 6: Umgebung, Ladephase, Vorschau auf dem Gerät (erledigt, Stand 12.11.2026)

Schließt Abnahmekriterium 1 ab.

- HDRI (.hdr) oder Panoramabild als Umgebung für Licht und Reflexionen. Hintergrund (Farbe oder Umgebung, Helligkeit, Unschärfe), Stärke der Beleuchtung und Ausrichtung sind getrennt einstellbar
- Animationsclips des Modells lassen sich an die Scroll-Timeline binden und laufen mit dem Scrollen vor und zurück
- Draco-komprimierte Modelle; der Decoder wird nur bei Bedarf in den Export gelegt
- glTF mit Begleitdateien (Puffer, Texturen): In der Desktop-App werden sie aus demselben Ordner gelesen, im Browser zusammen mit der .gltf-Datei ausgewählt
- Posterbild für die Ladephase, aus der aktuellen Ansicht erzeugt oder als Bilddatei
- Reduzierte Bewegung: Wünscht das Gerät des Besuchers weniger Bewegung, entfallen Dämpfung, Einblendungen, Look At, Follow und Kamerafahrten. In der Vorschau zuschaltbar
- Vorschau-Link und QR-Code fürs lokale WLAN (nur in der installierten Desktop-App): Die App liefert die Vorschau über einen eigenen kleinen Webserver aus. Das Smartphone meldet die Zeit bis zum ersten sichtbaren Render zurück; sie wird als Messung auf echtem Gerät gekennzeichnet
- Projektformat Version 6

## Nachbesserung nach erstem Praxistest (erledigt, Stand 13.11.2026)

- HTML/CSS/JavaScript-Export läuft ohne Installation: `index.html` per Doppelklick öffnen oder den Ordner auf einen Webserver legen. Die Seite lädt ein fertig gebautes Skript (`runtime/player.js`, Three.js und GSAP inklusive) statt ES-Modulen, die Browser bei `file://` blockieren (CORS). Modell und Umgebung liegen für den Doppelklick zusätzlich in `offline-assets.js`. Der lesbare Quellcode liegt in `source/` und baut mit `npm install && npm run build` das Skript neu. Der Astro-Export braucht weiterhin `npm run dev` oder einen Webserver
- Hotspots: Die Kamera fährt immer vor den Hotspot. Ohne gespeicherte Ansicht berechnet der Player eine Ansicht von der Außenseite der angeklickten Fläche
- Texte stehen fest im Bild (Standard): Beim Wechsel des Abschnitts gleitet der Text nach oben hinaus, der nächste von unten herein. In den Seiteneinstellungen auf „Texte scrollen mit der Seite“ umstellbar
- Animationen aus Blender je Abschnitt: pro Clip oder für alle „In Schleife“, „Einmal“ oder „Mit dem Scrollen“. Sie laufen auch im Editor-Viewport
- Editor neu gegliedert: Symbolleiste links mit den Bereichen Seite, Elemente, Modell, Hotspots, Varianten, Daten; klappbare Bereiche mit Symbolen; selten gebrauchte Gruppen (Licht, Seiteneinstellungen, Kameraausschnitt, Animation, Vorlage, Datenquelle …) sind zunächst zugeklappt; die App merkt sich den Zustand
- Projektformat Version 7

## Layout, Ausrichten, Text-Werkzeug, Lichter (erledigt, Stand 13.11.2026)

- Seitenbreite und Inhaltsbereich (Inner-Wrapper) links im Bereich „Seite“: Breite des Inhaltsbereichs, Mindestabstand zum Seitenrand, größte Seitenbreite. Die Textspalte und links oder rechts verankerte Elemente liegen am Rand des Inhaltsbereichs. Hilfslinien im Viewport
- Frei platzierte Elemente hängen an einem Anker (links, Mitte, rechts des Inhaltsbereichs; oben, Mitte, unten im Bild) mit festem Abstand in px. Abstände sind damit in Editor, Vorschau und Export bei jeder Fenstergröße gleich. Schriftgrößen sind je Breakpoint fest statt fließend
- Der Editor rechnet rem wie der Browser (16 px) und nutzt dieselben Seitenvariablen wie Vorschau und Export; vorher wich die Darstellung im Editor ab
- Ausrichten: Mehrfachauswahl mit Umschalt-Klick (Viewport oder Ebenen), gemeinsames Verschieben, Ausrichten an der Auswahl oder am Inhaltsbereich, horizontal und vertikal verteilen (gleichmäßig oder mit festem Abstand in px)
- Text-Werkzeug: Schrift (neun mitgelieferte Familien oder eigene Schriftdatei woff2/ttf/otf), Größe, Stärke, Zeilenabstand, Laufweite, Farbe, Ausrichtung; Padding und Margin je Seite. Schrift der Seite unter „Schriften“
- Lichter im neuen Bereich „Licht“: Hauptlicht und Umgebungslicht, dazu Spot-, Flächen- und Punktlichter mit Farbe, Stärke, Öffnungswinkel, weichem Rand, Größe, Reichweite, Position und Blickziel. Verschieben mit dem Anfasser im Viewport. Jedes Licht lässt sich pro Abschnitt merken
- Ladeanzeige während des Ladens des Modells: Ring oder Balken mit Fortschritt, pulsierende Punkte oder keine; der Hinweis „3D-Modell wird geladen“ und die Prozentzahl stehen darunter
- Abschnitte lassen sich direkt in der Liste umbenennen (Stift oder Doppelklick)
- Timeline: Punkte kopieren und an anderer Stelle einfügen (Strg+C / Strg+V oder Schaltflächen)
- Projektformat Version 8; Positionen in Prozent aus älteren Projekten werden in px umgerechnet (Bezug 1440 × 810 px, Tablet 820 × 1100, Mobile 390 × 780)

## Bekannte Grenzen

- Texturen im Format KTX2/Basis werden nicht geladen
- Zusätzliche Lichter werfen keine Schatten. Flächenlichter wirken nur auf Standard- und Physical-Materialien
- Lichter werden über die Liste ausgewählt, nicht per Klick im Viewport
- Ausrichten an der Auswahl und Verteilen gelten für frei platzierte Elemente; Elemente in der Textspalte folgen der Reihenfolge der Ebenen
- Bauteile mit Klick-Aktion sind nur per Maus oder Tap erreichbar; für die Tastatur braucht es zusätzlich einen Button mit derselben Aktion
- Der Vorschau-Link fürs WLAN funktioniert nur in der gebauten Desktop-App, nicht mit `npm run dev` oder `npm run tauri dev`
- Animationsclips, die per Aktion oder Messwert laufen, spielen in Vorschau und Export, nicht im Editor-Viewport
- Der HTML-Export per Doppelklick lädt Modell und Umgebung aus `offline-assets.js` (rund ein Drittel größer als die Originaldateien); Live-Daten brauchen weiterhin einen Webserver
