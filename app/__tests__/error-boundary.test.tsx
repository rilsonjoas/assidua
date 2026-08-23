import React from 'react';
import { Text } from 'react-native';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ErrorBoundary } from '../components/ErrorBoundary';

const ProblemChild = ({ shouldThrow }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test Error');
  }
  return <Text>Tudo funcionando</Text>;
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renderiza os componentes filhos normalmente quando não há erro', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Tudo funcionando')).toBeTruthy();
  });

  it('captura exceções no render e exibe a tela de fallback', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Ops! Algo deu errado')).toBeTruthy();
    expect(screen.getByText('Tentar novamente')).toBeTruthy();
  });

  it('permite resetar o estado de erro ao clicar em tentar novamente', () => {
    let throwError = true;

    const DynamicChild = () => {
      if (throwError) {
        throw new Error('Dynamic Error');
      }
      return <Text>Recuperado com sucesso</Text>;
    };

    const { rerender } = render(
      <ErrorBoundary>
        <DynamicChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Ops! Algo deu errado')).toBeTruthy();

    throwError = false;
    fireEvent.press(screen.getByText('Tentar novamente'));

    rerender(
      <ErrorBoundary>
        <DynamicChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Recuperado com sucesso')).toBeTruthy();
  });
});
