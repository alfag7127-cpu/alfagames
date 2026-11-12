import { describe, expect, it } from 'vitest';
import { Reserva, enlaceWhatsapp, finReserva, libreDesdeMs, numerarPorDia, reservaVigente } from './reservas.service';

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

describe('libreDesdeMs', () => {
  const ahora = new Date('2026-11-12T20:00:00.000Z').getTime();
  const iso = (min: number) => new Date(ahora + min * 60_000).toISOString();

  it('sin sesión ni reservas: libre ya', () => {
    expect(libreDesdeMs({ libre_en: null, reservas: [] }, ahora)).toBe(ahora);
  });

  it('sesión en curso sin reservas: cuando termina', () => {
    expect(libreDesdeMs({ libre_en: iso(15), reservas: [] }, ahora)).toBe(ahora + 15 * 60_000);
  });

  it('reserva pegada al fin de la sesión: libre al terminar la reserva', () => {
    const c = { libre_en: iso(15), reservas: [{ inicio: iso(15), fin: iso(135) }] };
    expect(libreDesdeMs(c, ahora)).toBe(ahora + 135 * 60_000);
  });

  it('encadena reservas seguidas y huecos cortos', () => {
    const c = {
      libre_en: iso(10),
      reservas: [
        { inicio: iso(140), fin: iso(200) },
        { inicio: iso(20), fin: iso(120) },
      ],
    };
    expect(libreDesdeMs(c, ahora)).toBe(ahora + 200 * 60_000);
  });

  it('hueco de 30 minutos o más: libre desde el fin de la sesión', () => {
    const c = { libre_en: iso(10), reservas: [{ inicio: iso(60), fin: iso(120) }] };
    expect(libreDesdeMs(c, ahora)).toBe(ahora + 10 * 60_000);
  });

  it('consola libre con reserva que empieza ya', () => {
    const c = { libre_en: null, reservas: [{ inicio: iso(10), fin: iso(70) }] };
    expect(libreDesdeMs(c, ahora)).toBe(ahora + 70 * 60_000);
  });
});

describe('numerarPorDia', () => {
  // 2026-11-12 en Colombia: 05:00Z a 04:59Z del día siguiente.
  const r = (id: number, inicio: string, creada: string, estado: Reserva['estado'] = 'confirmada'): Reserva => ({
    ...base,
    id,
    inicio,
    created_at: creada,
    estado,
  });

  it('empieza en 1 cada día según el día de la reserva en Colombia', () => {
    const n = numerarPorDia([
      r(40, '2026-11-12T15:00:00Z', '2026-11-12T10:00:00Z'),
      r(41, '2026-11-13T02:00:00Z', '2026-11-12T11:00:00Z'), // 9 p. m. del 12 en Colombia
      r(42, '2026-11-13T15:00:00Z', '2026-11-12T12:00:00Z'),
    ]);
    expect([n.get(40), n.get(41), n.get(42)]).toEqual([1, 2, 1]);
  });

  it('las canceladas no cuentan y las siguientes bajan un número', () => {
    const n = numerarPorDia([
      r(1, '2026-11-12T15:00:00Z', '2026-11-12T10:00:00Z'),
      r(2, '2026-11-12T16:00:00Z', '2026-11-12T10:05:00Z', 'cancelada'),
      r(3, '2026-11-12T14:00:00Z', '2026-11-12T10:10:00Z', 'pendiente'),
    ]);
    expect(n.get(1)).toBe(1);
    expect(n.has(2)).toBe(false);
    expect(n.get(3)).toBe(2);
  });
});
