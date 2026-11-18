import { describe, expect, it } from 'vitest';
import { ReservaAlquiler } from '../../core/gta6.service';
import { Alquiler } from '../../core/models';
import { bloquesDelDia, eventosCalendario, horaCompacta, lunesDe } from './calendario-alquiler';

const alquiler = (x: Partial<Alquiler>): Alquiler =>
  ({
    id: 1,
    consola_id: 10,
    cliente_nombre: 'Ana',
    cliente_telefono: '3001234567',
    cliente_direccion: 'Calle 1',
    plan_nombre: '6 horas',
    inicio: '2026-11-18T19:00:00-05:00',
    fin_pactado: '2026-11-19T01:00:00-05:00',
    devuelto_en: null,
    precio_total: 40000,
    estado: 'activo',
    ...x,
  }) as Alquiler;

const reserva = (x: Partial<ReservaAlquiler>): ReservaAlquiler =>
  ({
    id: 7,
    consola_id: 11,
    tarifa_id: 1,
    plan_nombre: 'La noche',
    inicio: '2026-11-19T19:00:00-05:00',
    fin: '2026-11-20T09:00:00-05:00',
    precio: 50000,
    cliente_nombre: 'Luis',
    cliente_telefono: '3009998877',
    cliente_direccion: 'Carrera 2',
    estado: 'confirmada',
    juego: 'gta6',
    forma_pago: 'qr',
    alquiler_id: 3,
    confirmada_en: null,
    created_at: '2026-11-17T10:00:00-05:00',
    ...x,
  }) as ReservaAlquiler;

describe('eventosCalendario', () => {
  it('un alquiler devuelto termina cuando se recibió, no en la hora pactada', () => {
    const [e] = eventosCalendario([alquiler({ estado: 'devuelto', devuelto_en: '2026-11-18T23:00:00-05:00' })], []);
    expect(e.tipo).toBe('devuelto');
    expect(e.fin).toBe(Date.parse('2026-11-18T23:00:00-05:00'));
  });

  it('incluye reservas pendientes y confirmadas; no las entregadas ni canceladas', () => {
    const eventos = eventosCalendario(
      [],
      [reserva({}), reserva({ id: 8, estado: 'pendiente' }), reserva({ id: 9, estado: 'entregada' }), reserva({ id: 10, estado: 'cancelada' })],
    );
    expect(eventos.map((e) => e.clave)).toEqual(['r-7', 'r-8']);
    expect(eventos[0].gta6).toBe(true);
  });

  it('no muestra alquileres cancelados', () => {
    expect(eventosCalendario([alquiler({ estado: 'cancelado' })], [])).toEqual([]);
  });
});

describe('vista semanal', () => {
  it('el lunes de la semana (martes 17-nov-2026 → lunes 16)', () => {
    expect(lunesDe('2026-11-17')).toBe('2026-11-16');
    expect(lunesDe('2026-11-22')).toBe('2026-11-16'); // domingo
    expect(lunesDe('2026-11-16')).toBe('2026-11-16');
  });

  it('dos consolas a la misma hora van lado a lado; la que no se cruza usa todo el ancho', () => {
    const desde = Date.parse('2026-11-18T00:00:00-05:00');
    const base = eventosCalendario([], [reserva({ id: 1, consola_id: 1 })])[0];
    const ev = (clave: string, h1: number, h2: number) => ({ ...base, clave, inicio: desde + h1 * 3_600_000, fin: desde + h2 * 3_600_000 });
    const b = bloquesDelDia([ev('a', 10, 14), ev('b', 12, 16), ev('c', 18, 20)], desde);
    const por = Object.fromEntries(b.map((x) => [x.clave, x]));
    expect([por['a'].carril, por['a'].carriles]).toEqual([0, 2]);
    expect([por['b'].carril, por['b'].carriles]).toEqual([1, 2]);
    expect([por['c'].carril, por['c'].carriles]).toEqual([0, 1]);
  });

  it('un alquiler de la noche se parte en dos días', () => {
    const desde = Date.parse('2026-11-18T00:00:00-05:00');
    const [e] = eventosCalendario([], [reserva({ inicio: '2026-11-18T19:00:00-05:00', fin: '2026-11-19T09:00:00-05:00' })]);
    const hoy = bloquesDelDia([e], desde);
    const manana = bloquesDelDia([e], desde + 24 * 3_600_000);
    expect(hoy[0].terminaDespues).toBe(true);
    expect(manana[0].empiezaAntes).toBe(true);
    expect(manana[0].top).toBe(0);
  });
});

describe('horaCompacta', () => {
  it('formato corto para bloques angostos', () => {
    expect(horaCompacta(Date.parse('2026-11-18T19:00:00-05:00'))).toBe('7p');
    expect(horaCompacta(Date.parse('2026-11-18T13:30:00-05:00'))).toBe('1:30p');
    expect(horaCompacta(Date.parse('2026-11-18T00:00:00-05:00'))).toBe('12a');
    expect(horaCompacta(Date.parse('2026-11-18T12:00:00-05:00'))).toBe('12p');
  });
});
