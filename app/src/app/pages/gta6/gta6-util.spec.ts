import { describe, expect, it } from 'vitest';
import { consolasLibres, cuentaRegresiva, finPlan } from './gta6-util';

const ms = (iso: string) => new Date(iso).getTime();

describe('finPlan', () => {
  it('suma las horas del plan', () => {
    expect(finPlan(ms('2026-11-19T10:00:00-05:00'), { horas: 6, es_noche: false }, '09:00:00')).toBe(ms('2026-11-19T16:00:00-05:00'));
  });

  it('La noche termina en la próxima hora de recogida (Colombia)', () => {
    expect(finPlan(ms('2026-11-19T20:00:00-05:00'), { horas: null, es_noche: true }, '09:00:00')).toBe(ms('2026-11-20T09:00:00-05:00'));
    expect(finPlan(ms('2026-11-20T01:00:00-05:00'), { horas: null, es_noche: true }, '09:00:00')).toBe(ms('2026-11-20T09:00:00-05:00'));
  });
});

describe('consolasLibres', () => {
  const ocupada = { ocupado: [{ inicio: '2026-11-19T09:00:00-05:00', fin: '2026-11-19T17:00:00-05:00' }] };
  const libre = { ocupado: [] };

  it('cuenta solo las que no se cruzan con el horario pedido', () => {
    expect(consolasLibres([ocupada, libre], ms('2026-11-19T12:00:00-05:00'), ms('2026-11-19T18:00:00-05:00'))).toBe(1);
    expect(consolasLibres([ocupada, libre], ms('2026-11-19T17:00:00-05:00'), ms('2026-11-19T23:00:00-05:00'))).toBe(2);
  });
});

describe('cuentaRegresiva', () => {
  it('días, horas y minutos hasta el lanzamiento; null si ya salió', () => {
    expect(cuentaRegresiva('2026-11-19T00:00:00-05:00', ms('2026-11-17T22:30:00-05:00'))).toEqual({ dias: 1, horas: 1, minutos: 30 });
    expect(cuentaRegresiva('2026-11-19T00:00:00-05:00', ms('2026-11-19T00:00:01-05:00'))).toBeNull();
  });
});
