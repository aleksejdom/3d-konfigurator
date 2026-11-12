import { useState } from 'react';
import type { Breakpoint, Vec3 } from '../core/types';

export const BREAKPOINT_LABELS: Record<Breakpoint, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };

export function NumberInput(props: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label?: string;
}) {
  // Während des Tippens gilt der eingegebene Text; Grenzen greifen erst beim Verlassen des Felds.
  const [text, setText] = useState<string | null>(null);
  const shown = Number.isFinite(props.value) ? String(Math.round(props.value * 1000) / 1000) : '0';
  const clamp = (n: number) => Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, n));
  return (
    <input
      type="number"
      aria-label={props.label}
      value={text ?? shown}
      step={props.step ?? 0.1}
      min={props.min}
      max={props.max}
      onChange={(e) => {
        setText(e.target.value);
        const value = parseFloat(e.target.value);
        if (Number.isFinite(value) && value === clamp(value)) props.onChange(value);
      }}
      onBlur={() => {
        const value = parseFloat(text ?? '');
        if (Number.isFinite(value) && value !== clamp(value)) props.onChange(clamp(value));
        setText(null);
      }}
    />
  );
}

/** Zahlenfeld, das auch leer sein darf (leer = Standard bzw. geerbter Wert). */
export function OptionalNumber(props: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  step?: number;
  min?: number;
  label?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      aria-label={props.label}
      placeholder={props.placeholder ?? 'Standard'}
      value={text ?? (props.value === undefined ? '' : String(Math.round(props.value * 100) / 100))}
      step={props.step ?? 1}
      min={props.min}
      onChange={(e) => {
        setText(e.target.value);
        const value = parseFloat(e.target.value);
        if (e.target.value === '') props.onChange(undefined);
        else if (Number.isFinite(value) && value >= (props.min ?? -Infinity)) props.onChange(value);
      }}
      onBlur={() => setText(null)}
    />
  );
}

export function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function VectorField(props: { label: string; value: Vec3; onChange: (value: Vec3) => void; scale?: number; step?: number }) {
  const scale = props.scale ?? 1;
  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="vector">
        {['X', 'Y', 'Z'].map((axis, i) => (
          <NumberInput
            key={axis}
            label={`${props.label} ${axis}`}
            value={props.value[i] * scale}
            step={props.step}
            onChange={(n) => {
              const next = [...props.value] as Vec3;
              next[i] = n / scale;
              props.onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Zeile für einen Wert, der pro Breakpoint überschrieben werden kann.
 * Zeigt, ob der Wert hier gesetzt, geerbt oder Standard ist, und bietet das Zurücksetzen an.
 */
export function InheritRow(props: {
  label: string;
  breakpoint: Breakpoint;
  source: 'own' | Breakpoint | null;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const { source, breakpoint } = props;
  const status =
    source === 'own'
      ? breakpoint === 'desktop'
        ? 'gesetzt'
        : 'überschrieben'
      : source
        ? `geerbt von ${BREAKPOINT_LABELS[source]}`
        : 'Standard';
  return (
    <div className="field">
      <span className="inherit-label">
        {props.label}
        <em className={source === 'own' ? 'own' : ''}>{status}</em>
        {source === 'own' && (
          <button
            onClick={props.onReset}
            aria-label={`${props.label} zurücksetzen`}
            title={breakpoint === 'desktop' ? 'Auf Standard zurücksetzen' : 'Überschreibung entfernen'}
          >
            ↺
          </button>
        )}
      </span>
      {props.children}
    </div>
  );
}
