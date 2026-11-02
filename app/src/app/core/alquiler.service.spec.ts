import { describe, expect, it } from 'vitest';
import { normalizarTelefono } from './alquiler.service';

describe('normalizarTelefono (igual que private.normalizar_telefono)', () => {
  it('deja solo dígitos y quita el 57 de Colombia', () => {
    expect(normalizarTelefono('+57 300 999 8877')).toBe('3009998877');
    expect(normalizarTelefono('300-999-8877')).toBe('3009998877');
    expect(normalizarTelefono('573009998877')).toBe('3009998877');
  });

  it('vacío o nulo queda vacío', () => {
    expect(normalizarTelefono(null)).toBe('');
    expect(normalizarTelefono('  ')).toBe('');
  });
});
