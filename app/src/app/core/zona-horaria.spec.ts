import { fechaColombia, finDiaColombia, inicioDiaColombia, sumarDias } from './zona-horaria';

describe('zona horaria Colombia', () => {
  it('a las 8 PM de Colombia sigue siendo el mismo día (en UTC ya es el siguiente)', () => {
    // 2026-10-20 01:00 UTC = 2026-10-19 20:00 en Colombia
    expect(fechaColombia(new Date('2026-10-20T01:00:00Z'))).toBe('2026-10-19');
  });

  it('el día de Colombia empieza y termina a las 05:00 UTC', () => {
    expect(inicioDiaColombia('2026-10-19')).toBe('2026-10-19T05:00:00.000Z');
    expect(finDiaColombia('2026-10-19')).toBe('2026-10-20T04:59:59.999Z');
  });

  it('suma días de calendario', () => {
    expect(sumarDias('2026-10-01', -1)).toBe('2026-09-30');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
});
