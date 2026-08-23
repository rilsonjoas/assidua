import { useEffect } from 'react';
import { Platform } from 'react-native';

export interface ShortcutHandlers {
  onEscape?: () => void;
  onNewMedication?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && handlers.onEscape) {
        handlers.onEscape();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && handlers.onNewMedication) {
        event.preventDefault();
        handlers.onNewMedication();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlers]);
}
