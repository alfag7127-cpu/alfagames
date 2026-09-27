import { DuracionPipe, formatearDuracion } from './duracion.pipe';

describe('formatearDuracion', () => {
  it('resume minutos en horas y minutos', () => {
    expect(formatearDuracion(30)).toBe('30m');
    expect(formatearDuracion(60)).toBe('1h');
    expect(formatearDuracion(90)).toBe('1h 30m');
    expect(formatearDuracion(150)).toBe('2h 30m');
    expect(formatearDuracion(360)).toBe('6h');
    expect(formatearDuracion(0)).toBe('—');
    expect(formatearDuracion(null)).toBe('—');
  });

  it('acepta valores en horas', () => {
    expect(new DuracionPipe().transform(1.5, 'horas')).toBe('1h 30m');
    expect(new DuracionPipe().transform(0.5, 'horas')).toBe('30m');
  });
});
