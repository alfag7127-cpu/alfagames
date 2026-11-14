import { ZONA_HORARIA } from '../../core/zona-horaria';
import { PlanGta6, Rango } from '../../core/gta6.service';

/** "YYYY-MM-DDTHH:mm" en hora de Colombia, para un input datetime-local. */
export function aHoraLocal(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: ZONA_HORARIA }).slice(0, 16).replace(' ', 'T');
}

/** "YYYY-MM-DDTHH:mm" (hora de Colombia) → ms. */
export function deHoraLocal(valor: string): number {
  return new Date(`${valor}:00-05:00`).getTime();
}

export function hora(iso: string | number): string {
  return new Date(iso).toLocaleTimeString('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' });
}

/** "jue 20 nov 3:00 p. m." */
export function diaYHora(iso: string | number): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, weekday: 'short', day: 'numeric', month: 'short' })} ${hora(iso)}`;
}

/**
 * Fin de un plan de alquiler (igual que private.fin_alquiler): por horas, o "La noche"
 * hasta la próxima `nocheHasta` ("HH:MM:SS", hora de Colombia).
 */
export function finPlan(inicioMs: number, plan: Pick<PlanGta6, 'horas' | 'es_noche'>, nocheHasta: string): number {
  if (!plan.es_noche) return inicioMs + (plan.horas ?? 0) * 3_600_000;
  const dia = new Date(inicioMs).toLocaleDateString('sv-SE', { timeZone: ZONA_HORARIA });
  let fin = new Date(`${dia}T${(nocheHasta || '09:00:00').slice(0, 8).padEnd(8, ':00')}-05:00`).getTime();
  if (fin <= inicioMs) fin += 86_400_000;
  return fin;
}

/** Cuántas consolas no tienen nada ocupado que se cruce con [inicio, fin). */
export function consolasLibres(consolas: { ocupado: Rango[] }[], inicioMs: number, finMs: number): number {
  return consolas.filter(
    (c) => !c.ocupado.some((r) => new Date(r.inicio).getTime() < finMs && new Date(r.fin).getTime() > inicioMs),
  ).length;
}

/** Días, horas, minutos y segundos que faltan para el lanzamiento (null si ya salió). */
export function cuentaRegresiva(
  lanzamiento: string,
  ahora: number,
): { dias: number; horas: number; minutos: number; segundos: number } | null {
  const ms = new Date(lanzamiento).getTime() - ahora;
  if (ms <= 0) return null;
  const seg = Math.floor(ms / 1000);
  return {
    dias: Math.floor(seg / 86_400),
    horas: Math.floor((seg % 86_400) / 3600),
    minutos: Math.floor((seg % 3600) / 60),
    segundos: seg % 60,
  };
}

export function mensajeError(e: unknown, porDefecto = 'No se pudo completar. Intenta de nuevo.'): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : porDefecto;
}
