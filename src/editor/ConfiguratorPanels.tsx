import { useMemo } from 'react';
import { actionToString, dominant, optionProp, parseAction } from '../core/actions.js';
import type { ComponentAction, VariantGroup, VariantOption } from '../core/types';
import { addGroup, addOption, removeGroup, removeOption, setMeshAction, showOption, updateGroup, updateOption } from './configurator';
import { Field, NumberInput } from './fields';
import { nodeName } from './labels';
import { currentState } from './stage';
import { useEditor } from './store';

const KIND_LABELS: Record<VariantGroup['kind'], string> = { mesh: 'Bauteile', material: 'Material' };

/** Auswahl einer Aktion: Kamerafahrt, Variante, Material, Sichtbarkeit, Reset, Animationsclip. */
export function ActionSelect(props: { value: ComponentAction | null | undefined; emptyLabel: string; label: string; onChange: (action: ComponentAction | null) => void }) {
  const project = useEditor((s) => s.project);
  const clips = project.model.stats?.clips ?? [];
  return (
    <select aria-label={props.label} value={actionToString(props.value)} onChange={(e) => props.onChange(parseAction(e.target.value))}>
      <option value="">{props.emptyLabel}</option>
      {project.hotspots.length > 0 && (
        <optgroup label="Kamera">
          {project.hotspots.map((hotspot) => (
            <option key={hotspot.id} value={'hotspot:' + hotspot.id}>
              Kamera zu „{hotspot.name}“ fahren
            </option>
          ))}
          <option value="close">Detailansicht schließen</option>
        </optgroup>
      )}
      {project.variantGroups.map((group) => (
        <optgroup key={group.id} label={`${KIND_LABELS[group.kind]} · ${group.name}`}>
          {group.options.map((option) => (
            <option key={option.id} value={`select:${group.id}:${option.id}`}>
              „{option.name}“ wählen
            </option>
          ))}
          <option value={'next:' + group.id}>Nächste Variante</option>
          <option value={'prev:' + group.id}>Vorherige Variante</option>
          <option value={'reset:' + group.id}>Auswahl zurücksetzen (Timeline übernimmt)</option>
        </optgroup>
      ))}
      {project.variantGroups.length > 1 && <option value="reset:*">Alle Auswahlen zurücksetzen</option>}
      {clips.length > 0 && (
        <optgroup label="Animation">
          {clips.flatMap((clip) => [
            <option key={'t' + clip} value={'clip:toggle:' + clip}>
              „{clip}“ starten / stoppen
            </option>,
            <option key={'p' + clip} value={'clip:play:' + clip}>
              „{clip}“ starten
            </option>,
            <option key={'s' + clip} value={'clip:stop:' + clip}>
              „{clip}“ stoppen
            </option>,
          ])}
        </optgroup>
      )}
    </select>
  );
}

/** Aktion bei Klick oder Tap auf das ausgewählte Bauteil. */
export function MeshActionField({ nodeId }: { nodeId: string }) {
  const meshActions = useEditor((s) => s.project.meshActions);
  const current = meshActions.find((item) => item.nodeId === nodeId)?.action ?? null;
  return (
    <Field label="Aktion bei Klick auf dieses Bauteil">
      <ActionSelect label="Aktion bei Klick auf dieses Bauteil" value={current} emptyLabel="Keine" onChange={(action) => setMeshAction(nodeId, action)} />
    </Field>
  );
}

export function NodeChips(props: { ids: string[]; onRemove: (id: string) => void; onAdd: (id: string) => void; empty: string }) {
  const selectedNode = useEditor((s) => s.selectedNode);
  const canAdd = Boolean(selectedNode) && selectedNode !== 'model' && !props.ids.includes(selectedNode!);
  return (
    <div className="chips">
      {props.ids.length === 0 && <span className="hint">{props.empty}</span>}
      {props.ids.map((id) => (
        <span className="chip" key={id} title={id}>
          {nodeName(id)}
          <button aria-label={`${nodeName(id)} entfernen`} onClick={() => props.onRemove(id)}>
            ×
          </button>
        </span>
      ))}
      <button disabled={!canAdd} onClick={() => props.onAdd(selectedNode!)} title="Bauteil im Viewport oder im Szenenbaum auswählen, dann hier hinzufügen">
        {canAdd ? `+ ${nodeName(selectedNode!)}` : '+ ausgewähltes Bauteil'}
      </button>
    </div>
  );
}

function OptionBlock({ group, option, active }: { group: VariantGroup; option: VariantOption; active: boolean }) {
  const project = useEditor((s) => s.project);
  const set = (recipe: (o: VariantOption) => void, key?: string) => updateOption(group.id, option.id, recipe, key);
  const materialNames = project.model.stats?.materialNames ?? [];
  const rule = option.requires?.[0];
  const others = project.variantGroups.filter((g) => g.id !== group.id);

  return (
    <div className={`keyvalue option ${active ? 'is-current' : ''}`}>
      <div className="keyvalue-head">
        <input aria-label="Name der Wahlmöglichkeit" value={option.name} onChange={(e) => set((o) => void (o.name = e.target.value), 'opt-name-' + option.id)} />
        <span>
          <button className={active ? 'active' : ''} onClick={() => showOption(group.id, option.id)} title="Im Viewport anzeigen">
            {active ? 'Angezeigt' : 'Anzeigen'}
          </button>
          <button disabled={group.options.length <= 1} aria-label={`${option.name} löschen`} onClick={() => removeOption(group.id, option.id)}>
            ×
          </button>
        </span>
      </div>

      {group.kind === 'mesh' && (
        <Field label="Sichtbare Bauteile bei dieser Wahl">
          <NodeChips
            ids={option.nodeIds ?? []}
            empty="Keine: Bei dieser Wahl ist nichts zu sehen."
            onAdd={(id) => set((o) => void (o.nodeIds = [...(o.nodeIds ?? []), id]))}
            onRemove={(id) => set((o) => void (o.nodeIds = (o.nodeIds ?? []).filter((n) => n !== id)))}
          />
        </Field>
      )}

      {group.kind === 'material' && (
        <>
          <Field label="Farbe">
            <div className="row">
              <input
                type="checkbox"
                aria-label="Eigene Farbe verwenden"
                checked={Boolean(option.color)}
                onChange={(e) => set((o) => void (o.color = e.target.checked ? '#2f6fed' : null))}
              />
              <input
                type="color"
                aria-label="Farbe"
                disabled={!option.color}
                value={option.color ?? '#888888'}
                onChange={(e) => set((o) => void (o.color = e.target.value), 'opt-color-' + option.id)}
              />
            </div>
          </Field>
          {materialNames.length > 0 && (
            <Field label="Material aus dem Modell">
              <select value={option.material ?? ''} onChange={(e) => set((o) => void (o.material = e.target.value || null))}>
                <option value="">Material des Bauteils behalten</option>
                {materialNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}

      {others.length > 0 && (
        <Field label="Nur verfügbar mit">
          <select
            value={rule ? `${rule.groupId}:${rule.optionId}` : ''}
            onChange={(e) => {
              const [groupId, optionId] = e.target.value.split(':');
              set((o) => void (o.requires = e.target.value ? [{ groupId, optionId }] : []));
            }}
          >
            <option value="">Immer verfügbar</option>
            {others.map((other) => (
              <optgroup key={other.id} label={other.name}>
                {other.options.map((o) => (
                  <option key={o.id} value={`${other.id}:${o.id}`}>
                    {other.name}: {o.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

/** Eigenschaften der ausgewählten Variantengruppe. */
export function GroupInspector({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  const pos = useEditor((s) => s.pos);
  const draft = useEditor((s) => s.draft);
  const group = project.variantGroups.find((g) => g.id === id);
  const state = useMemo(() => currentState(project, pos, draft), [project, pos, draft]);
  if (!group) return null;
  const current = dominant(state[optionProp(id)] as string | Record<string, number> | undefined) ?? group.options[0]?.id;

  return (
    <section className="panel-block highlight">
      <header>
        <h3>Variantengruppe · {KIND_LABELS[group.kind]}</h3>
        <button onClick={() => removeGroup(id)}>Löschen</button>
      </header>
      <Field label="Name">
        <input value={group.name} onChange={(e) => updateGroup(id, (g) => void (g.name = e.target.value), 'vg-name')} />
      </Field>

      {group.kind === 'material' && (
        <Field label="Bauteile, deren Material wechselt">
          <NodeChips
            ids={group.targets ?? []}
            empty="Noch kein Bauteil gewählt."
            onAdd={(node) => updateGroup(id, (g) => void (g.targets = [...(g.targets ?? []), node]))}
            onRemove={(node) => updateGroup(id, (g) => void (g.targets = (g.targets ?? []).filter((n) => n !== node)))}
          />
        </Field>
      )}

      <h4>Wahlmöglichkeiten</h4>
      {group.options.map((option) => (
        <OptionBlock key={option.id} group={group} option={option} active={option.id === current} />
      ))}
      <div className="row">
        <button onClick={() => addOption(id)}>+ Wahlmöglichkeit</button>
      </div>
      <p className="hint">
        „Anzeigen“ legt fest, was die Timeline an dieser Stelle zeigt. Mit „Merken“ speicherst du die Wahl pro Abschnitt.
        Der Wechsel passiert an der gemerkten Stelle; mit einer Übergangslänge am Punkt wird beim Scrollen überblendet.
      </p>

      <h4>Wahl des Besuchers</h4>
      <Field label="Überblenden (s)">
        <NumberInput value={group.fade} step={0.05} min={0} max={5} onChange={(n) => updateGroup(id, (g) => void (g.fade = n), 'vg-fade')} />
      </Field>
      <div className="field">
        <span>Übergabe an die Timeline, sobald dieser Abschnitt erreicht wird</span>
        {project.sections.map((section) => (
          <label className="check" key={section.id}>
            <input
              type="checkbox"
              checked={group.resetSections.includes(section.id)}
              onChange={(e) =>
                updateGroup(id, (g) => {
                  g.resetSections = e.target.checked ? [...g.resetSections, section.id] : g.resetSections.filter((s) => s !== section.id);
                })
              }
            />
            {section.name}
          </label>
        ))}
      </div>
      <p className="hint">
        Wählt der Besucher selbst, hat seine Wahl Vorrang vor der Timeline und bleibt beim Scrollen erhalten. Sie endet
        in den hier angehakten Abschnitten oder durch die Aktion „Auswahl zurücksetzen“.
      </p>
    </section>
  );
}

/** Liste der Variantengruppen in der linken Leiste. */
export function ConfiguratorList() {
  const groups = useEditor((s) => s.project.variantGroups);
  const selected = useEditor((s) => s.selectedGroup);
  const hasModel = useEditor((s) => s.project.model.file !== null);
  return (
    <section className="panel-block">
      <header>
        <h3>Konfigurator</h3>
        <span className="row">
          <button disabled={!hasModel} onClick={() => addGroup('mesh')} title="Alternative Bauteile oder Ein-/Ausblenden">
            + Variante
          </button>
          <button disabled={!hasModel} onClick={() => addGroup('material')} title="Farbe oder Material wechseln">
            + Material
          </button>
        </span>
      </header>
      {groups.length === 0 && (
        <p className="hint">Eine Gruppe fasst Wahlmöglichkeiten zusammen: alternative Bauteile, Ein- und Ausblenden oder Materialien.</p>
      )}
      <ul className="list">
        {groups.map((group) => (
          <li key={group.id} className={group.id === selected ? 'selected' : ''}>
            <button className="list-main" onClick={() => useEditor.setState({ selectedGroup: group.id, selectedComponent: null, selectedHotspot: null })}>
              <span className="kind">{group.kind === 'mesh' ? '◧' : '◍'}</span> {group.name}
              <small>{group.options.length} Wahlmöglichkeiten</small>
            </button>
            <button onClick={() => removeGroup(group.id)} aria-label={`${group.name} löschen`} title="Gruppe löschen">
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
