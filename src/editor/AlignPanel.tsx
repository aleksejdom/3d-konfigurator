import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  type LucideIcon,
  SquareDashedMousePointer,
} from 'lucide-react';
import { useState } from 'react';
import type { ComponentStyle } from '../core/types';
import { Block } from './Block';
import { effectiveStyle, locate, setStyles } from './components';
import { OptionalNumber } from './fields';
import { selectedComponents, update, useEditor } from './store';

type Edge = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

const BUTTONS: { edge: Edge; icon: LucideIcon; label: string }[] = [
  { edge: 'left', icon: AlignStartVertical, label: 'Links ausrichten' },
  { edge: 'centerX', icon: AlignCenterVertical, label: 'Horizontal zentrieren' },
  { edge: 'right', icon: AlignEndVertical, label: 'Rechts ausrichten' },
  { edge: 'top', icon: AlignStartHorizontal, label: 'Oben ausrichten' },
  { edge: 'centerY', icon: AlignCenterHorizontal, label: 'Vertikal zentrieren' },
  { edge: 'bottom', icon: AlignEndHorizontal, label: 'Unten ausrichten' },
];

interface Box {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Lage der Komponenten im Viewport, in px der Seite. */
function measure(ids: string[]): Box[] {
  const frame = document.querySelector<HTMLElement>('.page-frame');
  if (!frame) return [];
  const origin = frame.getBoundingClientRect();
  const scale = origin.width / frame.offsetWidth || 1;
  return ids.flatMap((id) => {
    const element = frame.querySelector<HTMLElement>(`[data-c="${CSS.escape(id)}"]`);
    if (!element) return [];
    const rect = element.getBoundingClientRect();
    return [{ id, left: (rect.left - origin.left) / scale, top: (rect.top - origin.top) / scale, width: rect.width / scale, height: rect.height / scale }];
  });
}

/** Verschiebt frei platzierte Komponenten um px; ihr Anker bleibt. */
function shift(moves: { id: string; dx?: number; dy?: number }[]) {
  const { project, breakpoint } = useEditor.getState();
  setStyles(
    moves.map(({ id, dx = 0, dy = 0 }) => {
      const style = effectiveStyle(locate(project, id)!.node, breakpoint);
      return { id, patch: { x: Math.round((style.x ?? 0) + dx), y: Math.round((style.y ?? 0) + dy) } };
    }),
    breakpoint,
  );
}

/** Ausrichten und Verteilen wie in Grafikprogrammen: an der Auswahl oder am Inhaltsbereich (Inner-Wrapper). */
export function AlignPanel() {
  const project = useEditor((s) => s.project);
  const breakpoint = useEditor((s) => s.breakpoint);
  const primary = useEditor((s) => s.selectedComponent);
  const also = useEditor((s) => s.alsoSelected);
  const [reference, setReference] = useState<'selection' | 'wrapper'>('selection');
  const [gap, setGap] = useState<number | undefined>(undefined);
  if (!primary) return null;

  const ids = selectedComponents({ selectedComponent: primary, alsoSelected: also });
  const located = ids.map((id) => locate(project, id)).filter((l) => l !== null);
  const free = located.filter((l) => l.depth === 0 && !l.slotId && l.node.placement === 'free').map((l) => l.node.id);
  const flow = located.find((l) => l.depth === 0 && !l.slotId && l.node.placement === 'flow');
  const toWrapper = free.length < 2 || reference === 'wrapper';
  if (free.length === 0 && !flow) return null;

  const align = (edge: Edge) => {
    // Text im Seitenlayout: Die Textspalte des Abschnitts wandert an den Rand des Inhaltsbereichs oder in die Mitte.
    if (free.length === 0 && flow) {
      const value = edge === 'left' ? 'left' : edge === 'centerX' ? 'center' : edge === 'right' ? 'right' : null;
      if (value) update((p) => void (p.sections.find((s) => s.id === flow.section.id)!.align = value));
      return;
    }
    if (toWrapper) {
      const pad = project.settings.layout.padding;
      const patch: Record<Edge, ComponentStyle> = {
        left: { anchorX: 'left', x: 0 },
        centerX: { anchorX: 'center', x: 0 },
        right: { anchorX: 'right', x: 0 },
        top: { anchorY: 'top', y: pad },
        centerY: { anchorY: 'center', y: 0 },
        bottom: { anchorY: 'bottom', y: -pad },
      };
      setStyles(free.map((id) => ({ id, patch: patch[edge] })), breakpoint);
      return;
    }
    const boxes = measure(free);
    const min = (pick: (b: Box) => number) => Math.min(...boxes.map(pick));
    const max = (pick: (b: Box) => number) => Math.max(...boxes.map(pick));
    const left = min((b) => b.left);
    const right = max((b) => b.left + b.width);
    const top = min((b) => b.top);
    const bottom = max((b) => b.top + b.height);
    shift(
      boxes.map((b) => {
        if (edge === 'left') return { id: b.id, dx: left - b.left };
        if (edge === 'centerX') return { id: b.id, dx: (left + right) / 2 - (b.left + b.width / 2) };
        if (edge === 'right') return { id: b.id, dx: right - (b.left + b.width) };
        if (edge === 'top') return { id: b.id, dy: top - b.top };
        if (edge === 'centerY') return { id: b.id, dy: (top + bottom) / 2 - (b.top + b.height / 2) };
        return { id: b.id, dy: bottom - (b.top + b.height) };
      }),
    );
  };

  /** Gleiche Abstände zwischen den Komponenten. Mit einem Wert in px gilt genau dieser Abstand. */
  const distribute = (axis: 'x' | 'y') => {
    const start = (b: Box) => (axis === 'x' ? b.left : b.top);
    const size = (b: Box) => (axis === 'x' ? b.width : b.height);
    const boxes = measure(free).sort((a, b) => start(a) - start(b));
    if (boxes.length < 2) return;
    const span = Math.max(...boxes.map((b) => start(b) + size(b))) - start(boxes[0]);
    const space = gap ?? (span - boxes.reduce((sum, b) => sum + size(b), 0)) / (boxes.length - 1);
    let cursor = start(boxes[0]);
    shift(
      boxes.map((b) => {
        const move = cursor - start(b);
        cursor += size(b) + space;
        return axis === 'x' ? { id: b.id, dx: move } : { id: b.id, dy: move };
      }),
    );
  };

  const onlyFlow = free.length === 0;
  return (
    <Block id="align" icon={SquareDashedMousePointer} title={ids.length > 1 ? `Ausrichten · ${ids.length} Elemente` : 'Ausrichten'} highlight>
      <div className="align-row" role="group" aria-label="Ausrichten">
        {BUTTONS.map(({ edge, icon: Icon, label }, i) => (
          <button key={edge} onClick={() => align(edge)} title={label} aria-label={label} disabled={onlyFlow && i > 2} className={i === 3 ? 'gap-before' : ''}>
            <Icon size={17} aria-hidden />
          </button>
        ))}
      </div>
      {!onlyFlow && (
        <>
          <div className="align-row" role="group" aria-label="Verteilen">
            <button onClick={() => distribute('x')} disabled={free.length < 2 || (free.length < 3 && gap === undefined)} title="Horizontal verteilen" aria-label="Horizontal verteilen">
              <AlignHorizontalSpaceBetween size={17} aria-hidden />
            </button>
            <button onClick={() => distribute('y')} disabled={free.length < 2 || (free.length < 3 && gap === undefined)} title="Vertikal verteilen" aria-label="Vertikal verteilen">
              <AlignVerticalSpaceBetween size={17} aria-hidden />
            </button>
            <label className="align-gap" title="Leer: gleiche Abstände zwischen dem ersten und letzten Element">
              <span>Abstand (px)</span>
              <OptionalNumber label="Abstand beim Verteilen (px)" value={gap} placeholder="gleich" onChange={setGap} />
            </label>
          </div>
          <label className="field">
            <span>Ausrichten an</span>
            <select value={toWrapper ? 'wrapper' : 'selection'} onChange={(e) => setReference(e.target.value as 'selection' | 'wrapper')}>
              <option value="selection" disabled={free.length < 2}>
                Auswahl
              </option>
              <option value="wrapper">Inhaltsbereich (Inner-Wrapper)</option>
            </select>
          </label>
          <p className="hint">Mehrere Elemente wählst du mit Umschalt-Klick im Viewport oder in den Ebenen.</p>
        </>
      )}
      {onlyFlow && <p className="hint">Das Element steht in der Textspalte. Die Schaltflächen setzen die Spalte links, mittig oder rechts in den Inhaltsbereich. Frei platzierte Elemente lassen sich auch vertikal ausrichten und verteilen.</p>}
    </Block>
  );
}
