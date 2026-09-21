/**
 * Reglas de cobro de la sala (COP). Ver docs/PLAN.md en la raíz del repo.
 *
 * - 1 hora: 6.000
 * - 2 horas: 10.000
 * - 3+ horas: 10.000 + 5.000 por cada hora adicional a partir de la 2ª
 * - Control adicional dentro de la misma sesión: 2.000 fijo, cada uno.
 * - Tiempo parcial se redondea siempre hacia arriba a la hora completa.
 *
 * IMPORTANTE: estas funciones son solo para la VISTA PREVIA en pantalla mientras
 * la sesión sigue activa (el empleado necesita ver "cuánto va" antes de cobrar).
 * El valor que realmente se cobra y se guarda lo calcula la función SQL
 * `public.cerrar_sesion` en el servidor (misma fórmula, hora del servidor) —
 * esa es la fuente de verdad financiera, no este archivo. Si cambias la
 * tarifa, cambia ambos lados: este archivo Y la función en Supabase.
 */

export const PRECIO_CONTROL_ADICIONAL = 2000;

/** Precio base calculado a partir de horas completas. No incluye controles adicionales. */
export function calcularPrecioBase(horas: number): number {
  if (horas <= 0) return 0;
  if (horas === 1) return 6000;
  return 10000 + (horas - 2) * 5000;
}

/** Minutos jugados -> horas a cobrar, redondeando siempre hacia arriba. Mínimo 1 hora. */
export function calcularHorasCobradas(minutosJugados: number): number {
  return Math.max(1, Math.ceil(minutosJugados / 60));
}

export interface CalculoPrecioInput {
  horas: number;
  controlesAdicionales?: number;
  /** Si el empleado pactó un precio especial, reemplaza el cálculo automático por horas. */
  precioManual?: number | null;
}

/** Precio final de una sesión: base (automático o manual) + controles adicionales. */
export function calcularPrecioTotal({
  horas,
  controlesAdicionales = 0,
  precioManual = null,
}: CalculoPrecioInput): number {
  const base = precioManual != null ? precioManual : calcularPrecioBase(horas);
  return base + controlesAdicionales * PRECIO_CONTROL_ADICIONAL;
}
