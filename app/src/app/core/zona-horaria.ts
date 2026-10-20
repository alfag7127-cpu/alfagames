/**
 * Toda la app trabaja en hora de Colombia, sin importar la zona horaria del
 * dispositivo ni la del servidor (Supabase guarda en UTC). Colombia no tiene
 * horario de verano: siempre UTC-5.
 */
export const ZONA_HORARIA = 'America/Bogota';
export const OFFSET_COLOMBIA = '-05:00';

/** Fecha en Colombia como YYYY-MM-DD. */
export function fechaColombia(fecha: Date | string = new Date()): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  return d.toLocaleDateString('sv-SE', { timeZone: ZONA_HORARIA });
}

/** Inicio del día (00:00 en Colombia) de una fecha YYYY-MM-DD, como ISO para filtrar en la base. */
export function inicioDiaColombia(fechaISO: string): string {
  return new Date(`${fechaISO}T00:00:00${OFFSET_COLOMBIA}`).toISOString();
}

/** Fin del día (23:59:59.999 en Colombia) de una fecha YYYY-MM-DD. */
export function finDiaColombia(fechaISO: string): string {
  return new Date(`${fechaISO}T23:59:59.999${OFFSET_COLOMBIA}`).toISOString();
}

/** Suma días a una fecha YYYY-MM-DD (aritmética de calendario, sin zona horaria). */
export function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
