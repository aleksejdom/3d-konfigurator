import { setComponentField } from './data';
import { ActionSelect } from './ConfiguratorPanels';
import { setComponentGroup } from './configurator';
import { useState } from 'react';
import type { AnimationType, ComponentStyle } from '../core/types';
import {
  COMPONENT_LABELS,
  contentOf,
  detachInstance,
  isContainer,
  locate,
  removeComponent,
  saveAsTemplate,
  setAnchor,
  setAnimation,
  setContent,
  setPlacement,
  setStyle,
  shiftComponent,
  styleInfo,
} from './components';
import { BREAKPOINT_LABELS, Field, InheritRow, NumberInput, OptionalNumber } from './fields';
import { importImage, useEditor } from './store';

const ANIMATION_LABELS: Record<AnimationType, string> = {
  none: 'Keine',
  fade: 'Einblenden',
  'slide-up': 'Verschieben von unten',
  'slide-down': 'Verschieben von oben',
  'slide-left': 'Verschieben von rechts',
  'slide-right': 'Verschieben von links',
  reveal: 'Text-Reveal (Wort für Wort)',
};

/** Eigenschaften der ausgewählten Komponente: Inhalt, Platzierung, Gestaltung pro Breakpoint, Animation, Vorlage. */
export function ComponentInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  const breakpoint = useEditor((s) => s.breakpoint);
  const [templateName, setTemplateName] = useState('');
  const located = locate(project, id);
  if (!located) return null;

  const { node, template } = located;
  const isInstance = node.type === 'instance';
  const inTemplate = isInstance || located.instance !== null;
  /** Art des dargestellten Elements; bei einer Instanz die Art ihrer Vorlage. */
  const type = isInstance ? (template?.root.type ?? 'card') : node.type;
  const container = isContainer(type);
  const topLevel = located.depth === 0 && !located.slotId;
  const free = topLevel && node.placement === 'free';
  const anchored = topLevel && node.placement === 'hotspot';
  const content = contentOf(located);
  const animation = node.animation;
  const isText = type === 'headline' || type === 'text' || type === 'button';

  const style = <K extends keyof ComponentStyle>(key: K, label: string, render: (value: ComponentStyle[K] | undefined, own: boolean, set: (value: ComponentStyle[K] | undefined) => void) => React.ReactNode) => {
    const info = styleInfo(located, key, breakpoint);
    const set = (value: ComponentStyle[K] | undefined) => setStyle(id, { [key]: value } as ComponentStyle, breakpoint, `style-${id}-${key}`);
    return (
      <InheritRow key={key} label={label} breakpoint={breakpoint} source={info.source} onReset={() => set(undefined)}>
        {render(info.value, info.source === 'own', set)}
      </InheritRow>
    );
  };
  const number = (key: 'x' | 'y' | 'width' | 'fontSize' | 'padding' | 'radius' | 'gap', label: string, min?: number) =>
    style(key, label, (value, own, set) => (
      <OptionalNumber label={label} value={own ? value : undefined} placeholder={value === undefined ? 'Standard' : String(value)} min={min} onChange={set} />
    ));
  const color = (key: 'color' | 'background', label: string) =>
    style(key, label, (value, _own, set) => (
      <input type="color" aria-label={label} value={value ?? '#888888'} onChange={(e) => set(e.target.value)} />
    ));

  const range = (which: 'in' | 'out', label: string) => {
    const value = animation[which];
    if (!value) return null;
    const set = (i: 0 | 1, percent: number) => {
      const next: [number, number] = [...value];
      next[i] = percent / 100;
      setAnimation(id, { [which]: next }, `anim-${id}-${which}`);
    };
    return (
      <div className="field">
        <span>{label} (% des Abschnitts)</span>
        <div className="vector two">
          <NumberInput label={`${label} von`} value={value[0] * 100} step={5} min={0} max={100} onChange={(n) => set(0, n)} />
          <NumberInput label={`${label} bis`} value={value[1] * 100} step={5} min={0} max={100} onChange={(n) => set(1, n)} />
        </div>
      </div>
    );
  };

  return (
    <section className="panel-block highlight">
      <header>
        <h3>
          {COMPONENT_LABELS[type]}
          {isInstance && ' · Instanz'}
        </h3>
        <span className="row tight">
          <button onClick={() => shiftComponent(id, -1)} disabled={located.index === 0} aria-label="Nach oben" title="Nach oben">
            ↑
          </button>
          <button
            onClick={() => shiftComponent(id, 1)}
            disabled={located.index === located.list.length - 1}
            aria-label="Nach unten"
            title="Nach unten"
          >
            ↓
          </button>
          <button onClick={() => removeComponent(id)} aria-label="Komponente löschen" title="Löschen (Entf)">
            ×
          </button>
        </span>
      </header>

      {inTemplate && template && (
        <p className="template-note">
          Gehört zur Vorlage „{template.name}“. Aufbau und Gestaltung gelten für alle Instanzen,
          {isInstance ? ' Position, Sichtbarkeit und Animation nur für diese.' : ' der Inhalt nur für diese Instanz.'}
        </p>
      )}

      {isText && (
        <Field label="Text">
          <textarea
            rows={type === 'text' ? 3 : 1}
            value={content.text ?? ''}
            onChange={(e) => setContent(id, { text: e.target.value }, 'text-' + id)}
          />
        </Field>
      )}
      {type === 'button' && (
        <Field label="Linkziel">
          <input placeholder="z. B. #kontakt" value={content.href ?? ''} onChange={(e) => setContent(id, { href: e.target.value }, 'href-' + id)} />
        </Field>
      )}
      {type === 'image' && (
        <>
          <div className="field">
            <span>Bild</span>
            <div className="row">
              <button
                onClick={async () => {
                  const name = await importImage();
                  if (name) setContent(id, { src: name });
                }}
              >
                {content.src ? 'Bild austauschen' : 'Bild wählen'}
              </button>
              <small title={content.src}>{content.src ?? 'noch kein Bild'}</small>
            </div>
          </div>
          <Field label="Alternativtext">
            <input value={content.alt ?? ''} onChange={(e) => setContent(id, { alt: e.target.value }, 'alt-' + id)} />
          </Field>
        </>
      )}

      {topLevel && (
        <div className="field">
          <span>Platzierung</span>
          <div className="segmented">
            <button className={!free && !anchored ? 'active' : ''} onClick={() => setPlacement(id, 'flow')}>
              Im Seitenlayout
            </button>
            <button className={free ? 'active' : ''} onClick={() => setPlacement(id, 'free')}>
              Frei
            </button>
            <button
              className={anchored ? 'active' : ''}
              disabled={project.hotspots.length === 0}
              title={project.hotspots.length === 0 ? 'Setze zuerst einen Hotspot auf das Modell' : 'Folgt dem Hotspot am Bauteil'}
              onClick={() => setPlacement(id, 'hotspot')}
            >
              Am Hotspot
            </button>
          </div>
        </div>
      )}
      {anchored && (
        <>
          <Field label="Hotspot">
            <select value={node.hotspotId ?? ''} onChange={(e) => setAnchor(id, { hotspotId: e.target.value })}>
              {project.hotspots.map((hotspot) => (
                <option key={hotspot.id} value={hotspot.id}>
                  {hotspot.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Anzeigen">
            <select value={node.anchorMode ?? 'always'} onChange={(e) => setAnchor(id, { anchorMode: e.target.value as 'always' | 'open' })}>
              <option value="always">Immer, solange der Hotspot zu sehen ist</option>
              <option value="open">Nur, wenn der Hotspot geöffnet ist</option>
            </select>
          </Field>
        </>
      )}

      {(type === 'value' || type === 'status' || container) && project.data.fields.length + (type === 'value' || type === 'status' ? 1 : 0) > 0 && (
        <Field label={container ? 'Datenfeld (färbt den Rand nach Stufe)' : 'Datenfeld'}>
          <select value={node.fieldId ?? ''} onChange={(e) => setComponentField(id, e.target.value)}>
            <option value="">Keines</option>
            {project.data.fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {(type === 'value' || type === 'status') && project.data.fields.length === 0 && (
        <p className="hint">Lege links unter „Daten“ zuerst ein Datenfeld an.</p>
      )}
      {type === 'connection' && <p className="hint">Zeigt „Verbunden“, „Daten veraltet“ oder „Offline“ und den Zeitpunkt der letzten Aktualisierung.</p>}

      {(type === 'select' || type === 'slider') && (
        <Field label="Variantengruppe">
          <select value={node.groupId ?? ''} onChange={(e) => setComponentGroup(id, e.target.value)}>
            <option value="">Keine</option>
            {project.variantGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {(type === 'button' || container) && (
        <Field label="Aktion bei Klick">
          <ActionSelect
            label="Aktion bei Klick"
            value={content.action}
            emptyLabel={type === 'button' ? 'Link öffnen' : 'Keine'}
            onChange={(action) => setContent(id, { action })}
          />
        </Field>
      )}

      <h4>Gestaltung · {BREAKPOINT_LABELS[breakpoint]}</h4>
      {free && number('x', 'Position von links (%)')}
      {free && number('y', 'Position von oben (%)')}
      {style('visible', 'Sichtbar', (value, _own, set) => (
        <input type="checkbox" aria-label="Sichtbar" checked={value ?? true} onChange={(e) => set(e.target.checked)} />
      ))}
      {number('width', 'Breite (px)', 20)}
      {type !== 'image' && number('fontSize', 'Schriftgröße (px)', 6)}
      {type !== 'image' && color('color', 'Textfarbe')}
      {(container || type === 'button') && color('background', 'Hintergrund')}
      {(container || type === 'button') && number('padding', 'Innenabstand (px)', 0)}
      {type !== 'headline' && type !== 'text' && number('radius', 'Eckenradius (px)', 0)}
      {container && number('gap', 'Abstand der Elemente (px)', 0)}
      {type !== 'image' &&
        style('align', 'Ausrichtung', (value, _own, set) => (
          <select aria-label="Ausrichtung" value={value ?? ''} onChange={(e) => set((e.target.value || undefined) as ComponentStyle['align'])}>
            <option value="">Standard</option>
            <option value="left">Links</option>
            <option value="center">Mitte</option>
            <option value="right">Rechts</option>
          </select>
        ))}

      <h4>Animation beim Scrollen</h4>
      <Field label="Art">
        <select
          value={animation.type}
          onChange={(e) => setAnimation(id, { type: e.target.value as AnimationType })}
        >
          {(Object.keys(ANIMATION_LABELS) as AnimationType[])
            .filter((name) => name !== 'reveal' || type === 'headline' || type === 'text')
            .map((name) => (
              <option key={name} value={name}>
                {ANIMATION_LABELS[name]}
              </option>
            ))}
        </select>
      </Field>
      {animation.type !== 'none' && (
        <>
          {range('in', 'Erscheinen')}
          <label className="check">
            <input
              type="checkbox"
              checked={animation.out !== null}
              onChange={(e) => setAnimation(id, { out: e.target.checked ? [0.8, 1] : null })}
            />
            Wieder ausblenden
          </label>
          {range('out', 'Ausblenden')}
          <p className="hint">Die Animation folgt der Scrollposition und läuft beim Zurückscrollen rückwärts.</p>
        </>
      )}

      {container && !inTemplate && (
        <>
          <h4>Vorlage</h4>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              saveAsTemplate(id, templateName.trim() || `Vorlage ${project.templates.length + 1}`);
              setTemplateName('');
            }}
          >
            <input aria-label="Name der Vorlage" placeholder="Name der Vorlage" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
            <button>Als Vorlage speichern</button>
          </form>
          <p className="hint">Die Vorlage erscheint in der Bibliothek. Diese Karte wird ihre erste Instanz.</p>
        </>
      )}
      {isInstance && (
        <>
          <h4>Vorlage</h4>
          <button onClick={() => detachInstance(id)}>Von Vorlage lösen</button>
        </>
      )}
    </section>
  );
}
