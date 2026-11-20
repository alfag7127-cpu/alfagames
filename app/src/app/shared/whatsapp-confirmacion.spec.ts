import { ReservaAlquiler } from '../core/gta6.service';
import { whatsappReservaDomicilioConfirmada, whatsappReservaSalaConfirmada } from './whatsapp-confirmacion';

function texto(url: string | null): string {
  return decodeURIComponent((url ?? '').split('?text=')[1] ?? '');
}

describe('mensajes de WhatsApp de reserva confirmada', () => {
  it('sala: va al celular del cliente con número, consola y tiempo', () => {
    const url = whatsappReservaSalaConfirmada({
      cliente_nombre: 'Juan',
      cliente_telefono: '300 123 4567',
      inicio: '2026-11-19T00:00:00Z',
      minutos: 120,
      numero: 3,
      consola: 'PS5-2',
    });
    expect(url?.startsWith('https://wa.me/573001234567?text=')).toBe(true);
    const t = texto(url);
    expect(t).toContain('¡Hola Juan!');
    expect(t).toContain('Tu reserva #3 en Alfa Games quedó *confirmada*');
    expect(t).toContain('PS5-2');
    expect(t).not.toContain('GTA 6');
  });

  it('sala GTA 6: lo dice en el mensaje', () => {
    const t = texto(
      whatsappReservaSalaConfirmada({
        cliente_nombre: 'Ana',
        cliente_telefono: '3001234567',
        inicio: '2026-11-19T05:00:00Z',
        minutos: 60,
        juego: 'gta6',
        numero: 7,
        consola: 'PS5-3',
      }),
    );
    expect(t).toContain('Tu reserva #7 de GTA 6');
    expect(t).toContain('Vice City');
  });

  it('domicilio: plan, dirección y aviso de efectivo solo si paga al recibir', () => {
    const r = {
      id: 12,
      plan_nombre: '10 horas',
      inicio: '2026-11-19T15:00:00Z',
      fin: '2026-11-20T01:00:00Z',
      precio: 50000,
      cliente_nombre: 'Luis',
      cliente_telefono: '3109876543',
      cliente_direccion: 'Calle 1 # 2-3',
      juego: null,
      forma_pago: 'qr',
    } as ReservaAlquiler;
    const t = texto(whatsappReservaDomicilioConfirmada(r, 'PS4'));
    expect(t).toContain('Tu reserva #12 de PS4 a domicilio');
    expect(t).toContain('Calle 1 # 2-3');
    expect(t).not.toContain('efectivo');
    expect(texto(whatsappReservaDomicilioConfirmada({ ...r, forma_pago: 'efectivo' }, 'PS4'))).toContain('en efectivo al recibir');
    expect(t).not.toContain('Firma tu contrato');
    const conContrato = texto(whatsappReservaDomicilioConfirmada(r, 'PS4', 'https://x.app/contrato/abc'));
    expect(conContrato).toContain('Firma tu contrato');
    expect(conContrato).toContain('https://x.app/contrato/abc');
  });

  it('sin celular válido no hay enlace', () => {
    expect(
      whatsappReservaSalaConfirmada({ cliente_nombre: 'X', cliente_telefono: null, inicio: '2026-11-19T00:00:00Z', minutos: 30, numero: 1, consola: 'PS5-1' }),
    ).toBeNull();
  });
});
