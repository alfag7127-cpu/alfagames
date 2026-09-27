import { Pipe, PipeTransform } from '@angular/core';

/** Minutos → texto corto: 30 → "30m", 60 → "1h", 90 → "1h 30m", 360 → "6h". */
export function formatearDuracion(minutos: number | null | undefined): string {
  if (minutos == null || minutos <= 0) return '—';
  const total = Math.round(minutos);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Uso: `{{ minutos | duracion }}`, o `{{ horas | duracion: 'horas' }}` cuando el valor
 * viene en horas (ej. horas_cobradas = 1.5 → "1h 30m").
 */
@Pipe({ name: 'duracion' })
export class DuracionPipe implements PipeTransform {
  transform(valor: number | null | undefined, unidad: 'minutos' | 'horas' = 'minutos'): string {
    if (valor == null) return '—';
    return formatearDuracion(unidad === 'horas' ? valor * 60 : valor);
  }
}
