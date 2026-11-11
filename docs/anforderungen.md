Entwickle einen **lokalen, visuellen 3D-Web-Editor** als installierbare Desktop-App. Ich möchte vorhandene 3D-Modelle importieren, Szenen und Weboberflächen gestalten, Animationen und Interaktionen visuell konfigurieren und daraus **lauffähigen, editierbaren Web-Quellcode** exportieren.

Mit demselben Editor möchte ich drei Arten von Projekten erstellen und miteinander kombinieren können:

| Anwendung | Beispiel |
|---|---|
| **Scroll-Landingpage** | Ein Produkt dreht sich beim Scrollen, die Kamera fährt an Details heran und Texte erscheinen passend zur Bewegung. |
| **Interaktiver 3D-Konfigurator** | Besucher wechseln Bauteile, Farben und Materialien, wählen Varianten per Karte oder Slider und betrachten Details über Hotspots. |
| **Digitaler Zwilling** | Eine Maschine zeigt den Zustand ihrer Komponenten im 3D-Modell. Messwerte, Animationen und Statusanzeigen reagieren auf Daten einer angeschlossenen Quelle. |

Eine Landingpage soll beispielsweise in einen Konfigurator übergehen können. Dabei möchte ich dieselbe Szene, dieselben Meshes und dieselben Komponenten weiterverwenden.

### 1. Technische Grundlage und Projektverwaltung

- Setze den Editor für den ersten Desktop-Release auf **Tauri 2, React, TypeScript und Vite** um. Nutze **Three.js** für die 3D-Szene und **GSAP ScrollTrigger** für scrollgesteuerte Übergänge.
- Speichere Projekte und Assets lokal. Ein Projekt enthält Szenen, Abschnitte, Komponenten, Keyframes, Breakpoints, Interaktionen und Datenbindungen. Unterstütze Wiederöffnen, Undo/Redo und benannte Projektstände.
- Verwende ein versioniertes Projektformat und gemeinsame Logik für Editor-Vorschau und Export. Dieselbe Scrollposition und dieselben Eingaben sollen in beiden zu denselben Ergebnissen führen.

### 2. Modellimport und Performance

- Unterstütze **GLB und glTF**. Übernimm Mesh-Hierarchie, Bauteilnamen, Materialien, Texturen und vorhandene Animationsclips.
- Zeige nach dem Import Dateigröße, Dreiecke, Meshes, Materialien und Texturgrößen an. Zeige die Draw Calls der gerenderten Szene in der Vorschau.
- Biete konfigurierbare **Performance-Budgets für Desktop und Mobile**. Warnungen nennen den überschrittenen Wert und möglichst das betroffene Asset.
- Miss in einer separat ladbaren Webvorschau die Zeit vom Seitenstart bis zum ersten sichtbaren Render des Modells. Zeige das Testprofil an, beispielsweise **„1,2 s bis zum ersten sichtbaren Render · simuliertes 4G · kalter Cache“**. Kennzeichne simulierte Tests und Messungen auf einem echten Gerät entsprechend.
- Ermögliche den Austausch gegen eine optimierte Modellversion. Ordne bestehende Hotspots, Animationen und Aktionen über stabile Mesh-IDs oder eindeutige Bauteilnamen wieder zu. Zeige fehlende Zuordnungen an.

### 3. Szeneneditor und Komponenten

- Nutze einen zentralen **3D-Viewport**, einen Szenen- und Ebenenbaum, eine Komponentenbibliothek, ein Eigenschaftenpanel und eine Scroll-Timeline am unteren Rand. Platziere **„Merken“** gut sichtbar am Viewport.
- Modell, Meshes, Kamera, Lichter und Materialien lassen sich im Viewport und über das Eigenschaftenpanel bearbeiten. Unterstütze **HDRI/Skyboxen** für Umgebungslicht und Reflexionen. Hintergrund, Intensität und Ausrichtung der Beleuchtung sind getrennt einstellbar.
- Headlines, Texte, Bilder, Buttons, Karten, Infoboxen und Statusanzeigen lassen sich per Drag-and-drop in einen Abschnitt oder frei über den 3D-Canvas ziehen. Ich möchte sie positionieren, skalieren, gestalten und animieren können.
- **Komponenten sind verschachtelbar.** Ich kann beispielsweise eine Karte platzieren, danach Headline, Text, Bild und Button hineinziehen und jedes Element einzeln bearbeiten oder umsortieren. Eine bearbeitete Karte lässt sich als Vorlage speichern. Ihre Instanzen können eigene Inhalte und Aktionen haben und gemeinsame Layoutänderungen von der Vorlage übernehmen.
- Komponenten können im normalen Seitenlayout liegen, frei über dem Canvas platziert oder an einem **Hotspot am Modell** verankert werden. Biete Animationen wie Text-Reveal, Einblenden und Verschieben an.
- Biete **Desktop-, Tablet- und Mobile-Vorschauen**. Position, Schriftgröße, Sichtbarkeit und Kameraausschnitt lassen sich pro Breakpoint anpassen. Zeige geerbte und überschriebene Werte an. Texte, Karten und Buttons werden als echte HTML-Elemente exportiert.

### 4. Abschnittsgebundene Scroll-Timeline und „Merken“

Die Timeline wächst mit den Seitenabschnitten. Ein gespeicherter Punkt hängt an einem **Abschnitt und seiner relativen Scrollposition**, etwa **„Produktdetails · 60 %“**. Ändert sich die Abschnittshöhe durch mehr Inhalt oder einen anderen Breakpoint, bleibt der Punkt an dieser relativen Position.

**Gewünschter Ablauf**

1. Ich stelle am Start das Modell, die Kamera, das Licht und die Webelemente ein.
2. Mit **„Merken“** speichere ich die ganze Szene oder ausgewählte Eigenschaften.
3. Ich scrolle zur nächsten Stelle, bearbeite den dort sichtbaren Zustand und klicke erneut auf **„Merken“**.
4. Beim Vor- und Zurückscrollen sehe ich die Übergänge direkt. Gespeicherte Punkte kann ich auswählen, verschieben und bearbeiten.

Jede gespeicherte Eigenschaft bekommt einen eigenen Geltungsbereich:

| Geltungsbereich | Verhalten |
|---|---|
| **Nur in diesem Abschnitt** | Die Änderung gilt lokal. Über einen einstellbaren Scrollbereich geht sie weich in den Zustand des nächsten Abschnitts über. Hat dieser keinen eigenen Wert, kehrt die Eigenschaft zum zuvor vererbten Wert zurück. |
| **In Folgeabschnitte übernehmen** | Der erreichte Wert gilt in den Folgeabschnitten weiter. Ein lokaler Zustand kann ihn vorübergehend überschreiben. Ein neuer vererbbarer Wert ersetzt ihn. |

**Fließende Bewegung ist eine Kernanforderung.** Berechne den scrollgesteuerten Zustand aus der aktuellen Scrollposition. Wenn ich anhalte, bleibt das Modell in der erreichten Pose. Beim Zurückscrollen laufen Übergänge rückwärts. Auch schnelle Scrollsprünge, direkte Sprünge zu einem Abschnitt und Breakpoint-Wechsel führen zum passenden Zustand.

Interpoliere Position, Drehung, Skalierung, Kamera und Licht kontinuierlich. Übergangslänge und Easing sollen pro Eigenschaft einstellbar sein. Für Mesh-Sichtbarkeit und Variantenwechsel möchte ich bei Bedarf einen Überblendbereich definieren. Beispiel: Die Kamera fährt im Abschnitt „Details“ näher heran und danach weich heraus, während das dort eingestellte warme Licht in den Folgeabschnitten erhalten bleibt.

### 5. Look At, Follow und Hotspots

- **Look At** ist eine Einstellung pro Modell, Mesh oder Kamera. Als Ziel kann ich den Mauszeiger, ein Objekt, ein Mesh, einen Hotspot, einen freien 3D-Punkt oder die Kamera wählen. Einstellbar sind Drehachsen, Winkelgrenzen, Stärke und Dämpfung.
- **Follow** ist eine eigene Einstellung für Positionsänderungen. Für Maus-Follow kann ich Achsen, Distanz und Rückkehrverhalten einstellen. Mausinteraktionen ergänzen die von der Timeline berechnete Grundposition oder Grundrotation. Auf Touch-Geräten kann ich dafür ein eigenes Verhalten festlegen.
- Look-At-Ziel und Stärke lassen sich mit **„Merken“** pro Abschnitt speichern. Ein Wechsel zwischen zwei Blickzielen soll weich und beim Zurückscrollen umkehrbar sein.
- **Hotspots** setze ich per Klick direkt auf ein Mesh. Sie bleiben am gewählten Bauteil verankert und folgen seiner Bewegung. Ich kann sie mit einem Label, einer Karte, einem Button oder einer Aktion verbinden.
- Über **„Kameraansicht merken“** speichere ich pro Hotspot eine Detailansicht mit Kameraposition, Blickziel, Abstand, Dauer und Easing. Beim Klick, Tap oder Tastendruck fährt die Kamera weich dorthin. Ich möchte pro Hotspot festlegen, ob erneutes Scrollen weich zur **aktuellen** Scroll-Kamera zurückführt oder die Detailansicht bis zum Schließen aktiv bleibt. Detailansichten lassen sich pro Breakpoint anpassen.

### 6. 3D-Konfigurator

- Ich möchte ein Mesh im Viewport oder Szenenbaum auswählen und Aktionen zuweisen können. Dazu gehören **Animation starten oder stoppen, Material wechseln, Mesh ein- oder ausblenden, Variante wechseln und Kamera zu einem Hotspot fahren**.
- Erlaube dieselben Aktionen über HTML-Elemente wie Buttons, Karten und Auswahllisten. Die Oberfläche soll den aktiven Zustand anzeigen, etwa das gewählte Material.
- Für einen **Mesh-Slider** wähle ich am betreffenden Bauteil die alternativen Meshes aus. Besucher wechseln per Swipe, Schaltflächen oder Tastatur. Die Auswahl kann im Modell, in der Variantenkarte und im Slider synchron angezeigt werden.
- Unterstütze Variantenregeln, etwa „Anbaugerät B ist nur mit Halterung X verfügbar“. Wenn Scroll-Timeline und Besucherauswahl dasselbe Bauteil steuern, hat die Besucherauswahl standardmäßig Vorrang. Im Editor kann ich einen ausdrücklichen Reset oder eine Übergabe an die Timeline festlegen.

### 7. Digitale Zwillinge

- Ich möchte Meshes, Hotspots und UI-Komponenten an **Datenfelder und Zustände** binden. Beispiel: Ein Sensorwert erscheint in einer Karte, ein Betriebsstatus ändert die Farbe eines Bauteils und ein Drehzahlwert steuert eine Animation.
- Unterstütze typisierte Bindungen für Zahlen, Texte, boolesche Werte und Statuswerte. Im Editor kann ich Datenfelder zuordnen, Einheiten und Grenzwerte festlegen und die Reaktionen in der Vorschau testen.
- Biete **Testdaten** für lokale Arbeit und **Live-Anbindungen** für die veröffentlichte Anwendung. Als erste Schnittstellen eignen sich REST/JSON und ein Live-Kanal per WebSocket oder SSE. Zeige den Zeitpunkt der letzten Aktualisierung und Zustände wie **verbunden**, **Daten veraltet** oder **offline** an.
- Live-Bindungen lesen zunächst Daten. Benötigt eine Quelle Zugangsdaten, soll die Website über einen Backend-Endpunkt oder Proxy darauf zugreifen. Zugangsdaten gehören nicht in den exportierten Browser-Code.

### 8. Vorschau und Export

- Biete eine Browser-Vorschau und einen temporären **Vorschau-Link oder QR-Code fürs lokale WLAN**, damit ich Scrollen, Touch, Hotspots und Ladezeit auf einem echten Smartphone prüfen kann.
- Unterstütze ein Posterbild während der Ladephase sowie eine Einstellung für reduzierte Bewegung. Hotspots und Konfigurator-Bedienelemente sollen per Tastatur bedienbar sein.
- Liefere zwei Exportziele:
  - **Astro + Three.js + GSAP ScrollTrigger**
  - **HTML/CSS/Vanilla JavaScript + Three.js + GSAP ScrollTrigger**
- Beide Exporte enthalten lesbaren Quellcode, Projekt-Assets und eine Startanleitung. Sie laufen auf eigenem Hosting ohne Tauri oder proprietäre Editor-Runtime. Für datenverbundene Projekte dokumentiert der Export die Konfiguration der Datenquelle und gegebenenfalls des Backends.

### Abnahmekriterien

1. Ich importiere ein GLB und sehe Dreiecke, Dateigröße und Texturgrößen. Eine Testmessung zeigt die Zeit bis zum ersten sichtbaren Render samt verwendetem Profil.
2. Ich erstelle drei Scrollabschnitte. Die Kameraänderung gilt nur im mittleren Abschnitt, eine dort gesetzte Lichtänderung wird weitergegeben. Die Übergänge laufen vorwärts und rückwärts fließend. Nach einer Änderung der Abschnittshöhe bleiben die Punkte an den vorgesehenen relativen Positionen.
3. Ich erstelle eine verschachtelte Karte aus Headline, Text und Button, passe ihr Mobile-Layout an und verbinde den Button mit einer Hotspot-Kamerafahrt. Gleichzeitig folgt ein Mesh der Maus über **Look At**, ohne dass die Scrollbewegung springt.
4. Ich wechsle auf einem Smartphone zwischen zwei Bauteilvarianten. Die Auswahl bleibt beim Weiterscrollen bis zum definierten Reset erhalten.
5. Ich binde einen Statuswert an ein Mesh und eine UI-Karte. Beide reagieren auf Testdaten und auf eine angeschlossene Live-Quelle. Bei einem Verbindungsabbruch wird der letzte Stand als veraltet oder offline gekennzeichnet.
6. Ich speichere und öffne das Projekt erneut. Beide Exporte lassen sich separat starten und reproduzieren das Verhalten der Editor-Vorschau.