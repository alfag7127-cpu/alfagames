import { describe, expect, it } from 'vitest';
import { ReservaAlquiler } from '../../core/gta6.service';
import { Alquiler } from '../../core/models';
import { eventosCalendario } from './calendario-alquiler';

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
