import { agruparProducido, inicioPeriodo, lunesDe } from './producido';

const pago = (pote: 'llave' | 'efectivo', monto: number, created_at: string, estado = 'devuelto') => ({
  pote,
  monto,
  created_at,
  alquileres: { estado },
});

describe('producido del alquiler', () => {
  // 2026-10-19 es lunes.
  const hoy = '2026-10-21';

  it('lunes de la semana', () => {
    expect(lunesDe('2026-10-21')).toBe('2026-10-19');
    expect(lunesDe('2026-10-19')).toBe('2026-10-19');
    expect(lunesDe('2026-10-25')).toBe('2026-10-19'); // domingo
  });

  it('diario: 30 barras, separa potes y cuenta en hora de Colombia', () => {
    const barras = agruparProducido(
      [
        pago('llave', 20000, '2026-10-21T15:00:00Z'),
        pago('efectivo', 10000, '2026-10-21T15:00:00Z'),
        // 8 PM en Colombia del 20 = 01:00 UTC del 21: cuenta el 20
        pago('efectivo', 5000, '2026-10-21T01:00:00Z'),
      ],
      'diario',
      hoy,
    );
    expect(barras.length).toBe(30);
    expect(barras.at(-1)).toMatchObject({ clave: '2026-10-21', llave: 20000, efectivo: 10000, total: 30000 });
    expect(barras.at(-2)).toMatchObject({ clave: '2026-10-20', efectivo: 5000, total: 5000 });
  });

  it('semanal y mensual agrupan; los anulados no cuentan', () => {
    const pagos = [
      pago('llave', 30000, '2026-10-19T15:00:00Z'),
      pago('efectivo', 20000, '2026-10-21T15:00:00Z'),
      pago('efectivo', 99999, '2026-10-21T16:00:00Z', 'cancelado'),
      pago('llave', 40000, '2026-09-10T15:00:00Z'),
    ];
    const semanas = agruparProducido(pagos, 'semanal', hoy);
    expect(semanas.length).toBe(12);
    expect(semanas.at(-1)).toMatchObject({ clave: '2026-10-19', total: 50000 });

    const meses = agruparProducido(pagos, 'mensual', hoy);
    expect(meses.length).toBe(12);
    expect(meses.at(-1)).toMatchObject({ clave: '2026-10', llave: 30000, efectivo: 20000 });
    expect(meses.at(-2)).toMatchObject({ clave: '2026-09', llave: 40000 });
    expect(meses[0].clave).toBe('2025-11');
  });

  it('inicio del período para pedir datos', () => {
    expect(inicioPeriodo(hoy, 'mensual')).toBe('2025-11-01');
    expect(inicioPeriodo(hoy, 'semanal')).toBe('2026-08-03');
  });
});
