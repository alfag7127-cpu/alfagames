/**
 * Estándar de cobro de la sala (COP). Ver "Estándar de cobro" en docs/PLAN.md.
 *
 * - El tiempo se redondea a la media hora MÁS CERCANA (1h14 → 1h, 1h15 → 1h30), mínimo 30 min.
 * - Sin controles adicionales, precio por paquete: 30m 3.000 · 1h 6.000 · 1h30 9.000 · 2h 10.000
 *   · +2.500 por cada media hora después de 2h.
 * - Con controles adicionales se pierde el paquete: 6.000 × hora
 *   + 2.000 × (cada control adicional × horas que estuvo en uso).
 * - Cada control adicional se cobra solo desde que entra. Máximo 2 adicionales.
 *
 * IMPORTANTE: esto es solo la VISTA PREVIA en pantalla. El valor que se cobra y se
 * guarda lo calcula `private.calcular_cobro` en Supabase (misma fórmula, reloj del
 * servidor). Si cambias la tarifa, cambia ambos lados.
 */

export const MAX_CONTROLES_ADICIONALES = 2;
export const PRECIO_HORA_SIN_PAQUETE = 6000;
export const PRECIO_CONTROL_ADICIONAL_POR_HORA = 2000;

export interface Cobro {
  /** Horas cobradas (múltiplos de 0.5). */
  horas: number;
  /** Suma de horas de todos los controles adicionales, ya redondeadas. */
  horasControles: number;
  precioBase: number;
  precioTotal: number;
}

/** Minutos → horas, redondeado a la media hora más cercana (en empate sube). */
export function redondearHoras(minutos: number): number {
  return Math.floor(Math.max(minutos, 0) / 30 + 0.5) * 0.5;
}

function precioPaquete(horas: number): number {
  return horas <= 1.5 ? PRECIO_HORA_SIN_PAQUETE * horas : 10000 + (horas - 2) * 5000;
}

/**
 * @param minutos tiempo total de la sesión.
 * @param minutosControles minutos que estuvo en uso cada control adicional.
 * @param precioManual si se pactó un precio especial, reemplaza el precio base.
 */
export function calcularCobro(
  minutos: number,
  minutosControles: number[] = [],
  precioManual: number | null = null,
): Cobro {
  const horas = Math.max(0.5, redondearHoras(minutos));
  const horasControles = minutosControles.reduce(
    (acc, m) => acc + Math.min(redondearHoras(m), horas),
    0,
  );
  const base = horasControles === 0 ? precioPaquete(horas) : PRECIO_HORA_SIN_PAQUETE * horas;
  const precioBase = precioManual ?? base;
  return {
    horas,
    horasControles,
    precioBase,
    precioTotal: precioBase + PRECIO_CONTROL_ADICIONAL_POR_HORA * horasControles,
  };
}
