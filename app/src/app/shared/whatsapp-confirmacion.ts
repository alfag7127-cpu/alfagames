import { ReservaAlquiler } from '../core/gta6.service';
import { enlaceWhatsapp } from '../core/reservas.service';
import { diaYHora } from '../pages/gta6/gta6-util';
import { formatearDuracion } from './duracion.pipe';

/**
 * Mensajes de WhatsApp que se le mandan al cliente cuando el personal confirma su reserva
 * (pedido del dueño: avisarle que quedó confirmada, con un mensaje bonito).
 */

/** Reserva en la sala (normal o GTA 6). */
export function whatsappReservaSalaConfirmada(r: {
  cliente_nombre: string;
  cliente_telefono: string | null;
  inicio: string;
  minutos: number;
  juego?: 'gta6' | null;
  numero: number | string;
  consola: string;
}): string | null {
  const gta = r.juego === 'gta6';
  const lineas = [
    `¡Hola ${r.cliente_nombre}! 🎮`,
    '',
    `Tu reserva #${r.numero}${gta ? ' de GTA 6' : ''} en Alfa Games quedó *confirmada* ✅`,
    '',
    `🕹️ Consola: ${r.consola}`,
    `📅 ${diaYHora(r.inicio)}`,
    `⏱️ Tiempo: ${formatearDuracion(r.minutos)}`,
    '',
    'Te recomendamos llegar 5 minutos antes, porque el tiempo empieza a correr a la hora reservada.',
    '',
    gta ? '¡Prepárate para Vice City! 🌴 Te esperamos para que la pases increíble 🔥' : '¡Gracias por elegirnos! Te esperamos para que la pases increíble 🔥',
  ];
  return enlaceWhatsapp(r.cliente_telefono, lineas.join('\n'));
}

/** Reserva de alquiler a domicilio (PS4, PS5 o GTA 6). */
export function whatsappReservaDomicilioConfirmada(r: ReservaAlquiler, tipo: string | null, enlaceContrato?: string): string | null {
  const gta = r.juego === 'gta6';
  const que = gta ? 'GTA 6' : (tipo ?? 'consola');
  const lineas = [
    `¡Hola ${r.cliente_nombre}! 🎮`,
    '',
    `Tu reserva #${r.id} de ${que} a domicilio en Alfa Games quedó *confirmada* ✅`,
    '',
    `📦 Plan: ${r.plan_nombre}`,
    `🚚 Entrega: ${diaYHora(r.inicio)}`,
    `🔁 Recogida: ${diaYHora(r.fin)}`,
    `📍 Dirección: ${r.cliente_direccion}`,
    ...(r.forma_pago === 'efectivo' ? [`💵 Pagas ${r.precio.toLocaleString('es-CO')} en efectivo al recibir.`] : []),
    ...(enlaceContrato ? ['', `✍️ *Firma tu contrato de alquiler* desde el celular, antes de recibir la consola:`, enlaceContrato] : []),
    '',
    'Ten a mano tu cédula al recibir la consola.',
    '',
    gta ? '¡Prepárate para Vice City! 🌴 Gracias por confiar en nosotros 🔥' : '¡Gracias por confiar en nosotros! A disfrutar 🔥',
  ];
  return enlaceWhatsapp(r.cliente_telefono, lineas.join('\n'));
}

/**
 * Enlace secreto para que el cliente firme su contrato desde el celular (/contrato/<token>).
 * El token se crea aquí para ponerlo en el mensaje; se registra con crear_enlace_contrato.
 */
export function nuevoEnlaceContrato(): { token: string; url: string } {
  const token = crypto.randomUUID();
  return { token, url: `${location.origin}/contrato/${token}` };
}

/**
 * Corre la acción y, si sale bien, abre WhatsApp con el mensaje. La pestaña se abre en el mismo clic
 * (antes de esperar al servidor) porque el navegador bloquea las ventanas que se abren después;
 * si la acción falla, la pestaña se cierra.
 */
export async function conWhatsappAlTerminar(url: string | null, accion: () => Promise<boolean>): Promise<boolean> {
  const ventana = url ? window.open('', '_blank') : null;
  if (ventana) ventana.opener = null;
  const ok = await accion();
  if (ventana) {
    if (ok && url) ventana.location.href = url;
    else ventana.close();
  } else if (ok && url) {
    window.open(url, '_blank', 'noopener');
  }
  return ok;
}
