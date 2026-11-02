import { describe, expect, it } from 'vitest';
import { formatearPesos, leerPesos } from './pesos.directive';

describe('pesos con separador de miles', () => {
  it('formatea con punto de miles', () => {
    expect(formatearPesos(30000)).toBe('30.000');
    expect(formatearPesos(1250000)).toBe('1.250.000');
    expect(formatearPesos(null)).toBe('');
  });

  it('lee cualquier forma de escribirlo', () => {
    expect(leerPesos('30.000')).toBe(30000);
    expect(leerPesos('$ 1,250,000')).toBe(1250000);
    expect(leerPesos('')).toBeNull();
  });
});
