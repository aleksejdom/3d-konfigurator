// Bereinigt eine SVG-Datei für die Verwendung als Komponente auf der Seite.

const FORBIDDEN = 'script, foreignObject, iframe, object, embed, audio, video';

/**
 * Liefert sicheres SVG-Markup oder null, wenn die Datei kein SVG ist.
 * Entfernt Skripte, Ereignis-Attribute und Verweise nach außen. Feste Maße fallen weg, damit sich die
 * Grafik über die Breite der Komponente skalieren lässt; fehlt die viewBox, entsteht sie aus den Maßen.
 */
export function sanitizeSvg(source: string): string | null {
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror')) return null;

  svg.querySelectorAll(FORBIDDEN).forEach((element) => element.remove());
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      const external = (name === 'href' || name === 'xlink:href') && !value.startsWith('#');
      if (name.startsWith('on') || external || /^javascript:/i.test(value)) element.removeAttribute(attribute.name);
    }
  }
  // Stile dürfen nichts von außen laden.
  svg.querySelectorAll('style').forEach((style) => {
    if (/@import|url\(\s*['"]?(?!#)/i.test(style.textContent ?? '')) style.remove();
  });

  if (!svg.getAttribute('viewBox')) {
    const width = parseFloat(svg.getAttribute('width') ?? '');
    const height = parseFloat(svg.getAttribute('height') ?? '');
    if (width > 0 && height > 0) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  for (const name of ['width', 'height', 'id', 'class', 'style', 'xml:space']) svg.removeAttribute(name);
  return new XMLSerializer().serializeToString(svg);
}
