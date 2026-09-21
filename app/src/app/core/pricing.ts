/**
 * Reglas de cobro de la sala (COP). Ver docs/PLAN.md en la raíz del repo.
 *
 * - 30 min: 3.000
 * - 1 hora: 6.000
 * - 2 horas: 10.000
 * - 3+ horas: 10.000 + 5.000 por cada hora completa adicional a partir de la 2ª
 * - Control adicional: 2.000 POR HORA cobrada de la sesión (no es plano por sesión).
 * - Tiempo parcial (fuera de los tramos exactos) se redondea siempre hacia arriba.
 *
 * IMPORTANTE: estas funciones son solo para la VISTA PREVIA en pantalla mientras
 * la sesión sigue activa (el empleado necesita ver "cuánto va" antes de cobrar).
 * El valor que realmente se cobra y se guarda lo calcula `private.calcular_tarifa`
 * en el servidor (misma fórmula, hora del servidor) — esa es la fuente de verdad
 * financiera, no este archivo. Si cambias la tarifa, cambia ambos lados: este
 * archivo Y la función en Supabase.
 */

export const PRECIO_CONTROL_POR_HORA = 2000;

export interface Tarifa {
  /** Horas cobradas — puede ser fraccionaria (0.5 en el tramo de media hora). */
  horas: number;
  precioBase: number;
}

/** Minutos jugados (o pactados) -> horas cobradas + precio base, sin controles ni manual. */
export function calcularTarifa(minutos: number): Tarifa {
  if (minutos <= 0) return { horas: 0, precioBase: 0 };
  if (minutos <= 30) return { horas: 0.5, precioBase: 3000 };
  if (minutos <= 60) return { horas: 1, precioBase: 6000 };
  if (minutos <= 120) return { horas: 2, precioBase: 10000 };
  const horasExtra = Math.ceil((minutos - 120) / 60);
  return { horas: 2 + horasExtra, precioBase: 10000 + horasExtra * 5000 };
}

export interface CalculoPrecioInput {
  minutos: number;
  controlesAdicionales?: number;
  /** Si el empleado pactó un precio especial, reemplaza el precio base (los controles se suman igual). */
  precioManual?: number | null;
}

export interface ResultadoPrecio extends Tarifa {
  precioTotal: number;
}

/** Precio final de una sesión: base (automático o manual) + controles adicionales por hora. */
export function calcularPrecioTotal({
  minutos,
  controlesAdicionales = 0,
  precioManual = null,
}: CalculoPrecioInput): ResultadoPrecio {
  const tarifa = calcularTarifa(minutos);
  const precioBase = precioManual != null ? precioManual : tarifa.precioBase;
  const precioControles = controlesAdicionales * PRECIO_CONTROL_POR_HORA * tarifa.horas;
  return { horas: tarifa.horas, precioBase, precioTotal: precioBase + precioControles };
}
