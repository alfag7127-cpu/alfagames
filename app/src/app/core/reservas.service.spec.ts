import { describe, expect, it } from 'vitest';
import { Reserva, enlaceWhatsapp, finReserva, reservaVigente } from './reservas.service';

const base: Reserva = {
  id: 1,
  puesto_id: 1,
  cliente_nombre: 'Ana',
  cliente_telefono: '3001234567',
  inicio: '2026-11-11T23:00:00.000Z',
  minutos: 90,
  precio: 9000,
  estado: 'pendiente',
  sesion_id: null,
  confirmada_por: null,
  confirmada_en: null,
  created_at: '2026-11-11T20:00:00.000Z',
  origen: 'web',
};

describe('reservas', () => {
  it('una pendiente aparta la consola solo dentro del tiempo para pagar', () => {
    const creada = new Date(base.created_at).getTime();
    expect(reservaVigente(base, 30, creada + 29 * 60_000)).toBe(true);
    expect(reservaVigente(base, 30, creada + 31 * 60_000)).toBe(false);
  });

  it('una confirmada siempre aparta; cancelada y usada no', () => {
    const tarde = Date.parse('2026-12-01T00:00:00Z');
    expect(reservaVigente({ ...base, estado: 'confirmada' }, 30, tarde)).toBe(true);
    expect(reservaVigente({ ...base, estado: 'cancelada' }, 30)).toBe(false);
    expect(reservaVigente({ ...base, estado: 'usada' }, 30)).toBe(false);
  });

  it('el fin es el inicio más los minutos', () => {
    expect(finReserva(base)).toBe('2026-11-12T00:30:00.000Z');
  });

  it('el enlace de WhatsApp antepone 57 a un celular de 10 dígitos', () => {
    expect(enlaceWhatsapp('300 123 4567', 'Hola')).toBe('https://wa.me/573001234567?text=Hola');
    expect(enlaceWhatsapp('123')).toBeNull();
  });
});
