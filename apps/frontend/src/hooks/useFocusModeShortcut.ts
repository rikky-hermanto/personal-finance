import { useEffect } from 'react';
import { useFocusMode } from '@/lib/focus-mode';

export const useFocusModeShortcut = () => {
  const { toggle } = useFocusMode();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);
};
