import { useEffect } from 'react';
import { LeftPanel } from './editor/LeftPanel';
import { RightPanel } from './editor/RightPanel';
import { Timeline } from './editor/Timeline';
import { TopBar } from './editor/TopBar';
import { Viewport } from './editor/Viewport';
import { redo, saveProject, undo, useEditor } from './editor/store';

export function App() {
  const message = useEditor((s) => s.message);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        saveProject();
        return;
      }
      // In Textfeldern behält der Browser sein eigenes Rückgängig.
      if ((event.target as HTMLElement).closest('input, textarea')) return;
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <LeftPanel />
      <Viewport />
      <RightPanel />
      <Timeline />
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
