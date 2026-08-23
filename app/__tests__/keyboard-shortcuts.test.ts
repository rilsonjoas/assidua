import { describe, it, expect, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts hook', () => {
  it('não dispara erros em ambientes não-web', () => {
    const onEscape = jest.fn();
    renderHook(() => useKeyboardShortcuts({ onEscape }));

    expect(onEscape).not.toHaveBeenCalled();
  });
});
