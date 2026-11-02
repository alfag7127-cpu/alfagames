import { describe, expect, it } from 'vitest';
import { repartir } from './liquidacion';

const socios = [
  { nombre: 'Frank Muñoz', porcentaje: 50 },
  { nombre: 'Steven Oliveros', porcentaje: 50 },
];

describe('repartir (liquidación entre socios)', () => {
  it('divide por mitad cada pote', () => {
    const r = repartir(1_767_000, 423_000, socios);
    expect(r.map((p) => [p.llave, p.efectivo, p.total])).toEqual([
      [883_500, 211_500, 1_095_000],
      [883_500, 211_500, 1_095_000],
    ]);
  });

  it('el peso que sobra queda para el último socio y nada se pierde', () => {
    const r = repartir(1_001, 3, socios);
    expect(r[0].total).toBe(501);
    expect(r[1].total).toBe(503);
    expect(r[0].total + r[1].total).toBe(1_004);
  });
});
