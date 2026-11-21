import { duracionContrato, fechaHoraContrato, planContrato } from './contrato-pdf';

describe('contrato: plan y tiempos', () => {
  it('4 horas exactas', () => {
    expect(planContrato('4 horas', '2026-11-20T21:09:29Z', '2026-11-21T01:09:29Z', 0)).toBe('4 horas · total 4 horas');
  });

  it('plan noche con minutos', () => {
    expect(duracionContrato('2026-11-20T01:05:40Z', '2026-11-20T14:00:00Z')).toBe('12 h 54 min');
  });

  it('con extensiones', () => {
    expect(planContrato('GTA 6 · 6 horas', '2026-11-19T19:00:00Z', '2026-11-21T14:00:00Z', 2)).toBe(
      'GTA 6 · 6 horas + 2 extensiones de tiempo · total 43 horas',
    );
  });

  it('hora de Colombia en 12 horas', () => {
    expect(fechaHoraContrato('2026-11-21T01:09:29Z')).toBe('20 / 11 / 2026  --  08:09 PM');
  });
});
