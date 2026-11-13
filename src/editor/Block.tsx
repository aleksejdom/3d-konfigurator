import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

// Nur für automatische Prüfungen: zeigt alle Bereiche gleichzeitig und aufgeklappt.
export const SHOW_ALL = typeof localStorage !== 'undefined' && localStorage.getItem('ui.test') === 'all';

function read(key: string, fallback: boolean): boolean {
  if (SHOW_ALL) return true;
  try {
    const stored = localStorage.getItem(`ui.open.${key}`);
    return stored === null ? fallback : stored === '1';
  } catch {
    return fallback;
  }
}

/** Merkt sich pro Bereich, ob er auf- oder zugeklappt ist. */
export function useOpen(key: string, fallback: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => read(key, fallback));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(`ui.open.${key}`, next ? '1' : '0');
    } catch {
      // Ohne Speicher gilt die Wahl bis zum Schließen der App.
    }
  };
  return [open, toggle];
}

interface BlockProps {
  id: string;
  icon: LucideIcon;
  title: ReactNode;
  actions?: ReactNode;
  highlight?: boolean;
  closed?: boolean;
  children: ReactNode;
}

/** Ein Bereich einer Seitenleiste: Symbol, Titel, Aktionen und ein Inhalt, der sich zuklappen lässt. */
export function Block({ id, icon: Icon, title, actions, highlight, closed, children }: BlockProps) {
  const [open, toggle] = useOpen(id, !closed);
  return (
    <section className={`panel-block${highlight ? ' highlight' : ''}${open ? '' : ' closed'}`} data-block={id}>
      <header>
        <button className="block-toggle" onClick={toggle} aria-expanded={open}>
          <ChevronRight className="chevron" size={14} aria-hidden />
          <Icon size={15} aria-hidden />
          <h3>{title}</h3>
        </button>
        {actions}
      </header>
      {open && <div className="block-body">{children}</div>}
    </section>
  );
}

/** Eine Untergruppe innerhalb eines Bereichs. */
export function Fold({ id, title, closed, children }: { id: string; title: ReactNode; closed?: boolean; children: ReactNode }) {
  const [open, toggle] = useOpen(id, !closed);
  return (
    <div className={`fold${open ? '' : ' closed'}`} data-fold={id}>
      <button className="fold-toggle" onClick={toggle} aria-expanded={open}>
        <ChevronRight className="chevron" size={13} aria-hidden />
        <h4>{title}</h4>
      </button>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
}
