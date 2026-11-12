import { useRef } from 'react';
import type { Keyframe, Project } from '../core/types';
import { locate } from './components';
import { posLabel, propLabel } from './labels';
import { keyframePos, moveKeyframe, setPos, useEditor } from './store';

/** Breite der Abschnitte entspricht ihrer Höhe auf der Seite. */
function layout(project: Project) {
  const heights = project.sections.map((s) => Math.max(10, s.height));
  const total = heights.reduce((a, b) => a + b, 0) || 1;
  const starts: number[] = [];
  heights.reduce((sum, h, i) => ((starts[i] = sum), sum + h), 0);
  return { heights, total, starts };
}

function scopeClass(keyframe: Keyframe) {
  const scopes = new Set(Object.values(keyframe.values).map((v) => v.scope));
  return scopes.size > 1 ? 'mixed' : scopes.has('local') ? 'local' : 'inherit';
}

export function Timeline() {
  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const selectedKeyframe = useEditor((s) => s.selectedKeyframe);
  const selectedComponent = useEditor((s) => s.selectedComponent);
  const trackRef = useRef<HTMLDivElement>(null);
  // Animationsbereiche der ausgewählten Komponente in ihrem Abschnitt anzeigen.
  const located = selectedComponent ? locate(project, selectedComponent) : null;
  const animation = located && located.node.animation.type !== 'none' ? located.node.animation : null;
  const { heights, total, starts } = layout(project);
  const count = project.sections.length;

  const fraction = (p: number) => {
    if (count === 0) return 0;
    const index = Math.min(count - 1, Math.floor(p));
    return (starts[index] + (p - index) * heights[index]) / total;
  };

  const posAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * total;
    for (let i = 0; i < count; i++) {
      if (x < starts[i] + heights[i] || i === count - 1) return i + Math.min(1, (x - starts[i]) / heights[i]);
    }
    return 0;
  };

  const scrub = (event: React.PointerEvent) => {
    if (count === 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    useEditor.setState({ selectedKeyframe: null });
    setPos(posAt(event.clientX));
  };

  const dragKeyframe = (event: React.PointerEvent, keyframe: Keyframe) => {
    event.stopPropagation();
    useEditor.setState({ selectedKeyframe: keyframe.id });
    setPos(keyframePos(project, keyframe));
    const startX = event.clientX;
    let moved = false;
    const onMove = (e: PointerEvent) => {
      if (!moved && Math.abs(e.clientX - startX) < 4) return;
      moved = true;
      const p = posAt(e.clientX);
      const index = Math.min(count - 1, Math.floor(p));
      moveKeyframe(keyframe.id, project.sections[index].id, p - index);
      setPos(p);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const sorted = [...project.keyframes].sort((a, b) => keyframePos(project, a) - keyframePos(project, b));
  const jump = (direction: 1 | -1) => {
    const positions = sorted.map((k) => keyframePos(project, k));
    const next =
      direction === 1 ? positions.find((p) => p > pos + 1e-4) : [...positions].reverse().find((p) => p < pos - 1e-4);
    if (next !== undefined) setPos(next);
  };

  return (
    <div className="timeline" onWheel={(e) => setPos(pos + e.deltaY * 0.0015)}>
      <div className="timeline-head">
        <strong>Scroll-Timeline</strong>
        <span className="timeline-pos">{posLabel(project, pos)}</span>
        <button onClick={() => jump(-1)} title="Zum vorherigen Punkt">
          ◀ Punkt
        </button>
        <button onClick={() => jump(1)} title="Zum nächsten Punkt">
          Punkt ▶
        </button>
        <span className="legend">
          <i className="dot inherit" /> wird übernommen
          <i className="dot local" /> nur im Abschnitt
          <i className="dot mixed" /> gemischt
        </span>
      </div>
      <div
        className="timeline-track"
        ref={trackRef}
        onPointerDown={scrub}
        onPointerMove={(e) => e.buttons === 1 && e.currentTarget.hasPointerCapture(e.pointerId) && setPos(posAt(e.clientX))}
      >
        {project.sections.map((section, i) => (
          <div className="timeline-section" key={section.id} style={{ flexGrow: heights[i] }}>
            <span className="timeline-section-name">{section.name}</span>
            {animation && located!.section.id === section.id && (
              <>
                <i
                  className="anim-range"
                  title="Komponente erscheint"
                  style={{ left: `${animation.in[0] * 100}%`, width: `${Math.max(0.5, (animation.in[1] - animation.in[0]) * 100)}%` }}
                />
                {animation.out && (
                  <i
                    className="anim-range out"
                    title="Komponente wird ausgeblendet"
                    style={{ left: `${animation.out[0] * 100}%`, width: `${Math.max(0.5, (animation.out[1] - animation.out[0]) * 100)}%` }}
                  />
                )}
              </>
            )}
            {project.keyframes
              .filter((k) => k.sectionId === section.id)
              .map((keyframe) => (
                <button
                  key={keyframe.id}
                  className={`keyframe ${scopeClass(keyframe)} ${keyframe.id === selectedKeyframe ? 'selected' : ''}`}
                  style={{ left: `${keyframe.t * 100}%` }}
                  title={`${section.name} · ${Math.round(keyframe.t * 100)} %\n${Object.keys(keyframe.values).map(propLabel).join('\n')}`}
                  aria-label={`Punkt ${section.name} ${Math.round(keyframe.t * 100)} %`}
                  onPointerDown={(e) => dragKeyframe(e, keyframe)}
                />
              ))}
          </div>
        ))}
        <div className="playhead" style={{ left: `${fraction(pos) * 100}%` }} />
      </div>
    </div>
  );
}
