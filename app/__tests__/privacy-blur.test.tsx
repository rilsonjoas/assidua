import React from 'react';
import { AppState } from 'react-native';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, act } from '@testing-library/react-native';
import { PrivacyBlur } from '../components/PrivacyBlur';

describe('PrivacyBlur', () => {
  it('não renderiza nada quando o app está ativo (active)', () => {
    render(<PrivacyBlur />);
    expect(screen.queryByTestId('privacy-blur-overlay')).toBeNull();
  });

  it('exibe o overlay de privacidade quando o app vai para background ou inactive', () => {
    let listener: (state: string) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => {
      listener = handler as any;
      return { remove: jest.fn() } as any;
    });

    render(<PrivacyBlur />);

    act(() => {
      listener('background');
    });

    expect(screen.getByTestId('privacy-blur-overlay', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Assídua', { includeHiddenElements: true })).toBeTruthy();
  });
});
