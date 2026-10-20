import { DecimalPipe } from '@angular/common';
import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Llave = cuenta Daviplata ("Pote Llave"); Efectivo = dinero físico ("Pote Efectivo"). */
export type Pote = 'llave' | 'efectivo';
export type ModoPago = Pote | 'mixto';

export interface Reparto {
  llave: number;
  efectivo: number;
}

/** Reparte un cobro entre los potes. null = falta elegir o el mixto no cuadra. */
export function repartirPago(total: number, modo: ModoPago | null, montoLlave: number | null): Reparto | null {
  if (!modo) return null;
  if (modo === 'llave') return { llave: total, efectivo: 0 };
  if (modo === 'efectivo') return { llave: 0, efectivo: total };
  if (montoLlave == null || montoLlave < 0 || montoLlave > total) return null;
  return { llave: montoLlave, efectivo: total - montoLlave };
}

export const NOMBRE_POTE: Record<Pote, string> = { llave: 'Pote Llave', efectivo: 'Pote Efectivo' };

/** Selector "¿cómo pagó?": todo Llave, todo Efectivo, o una parte por cada pote. */
@Component({
  selector: 'app-pago-potes',
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="space-y-2">
      <span class="block text-xs font-medium text-slate-500">¿Cómo pagó? ({{ total() | number: '1.0-0' }} COP)</span>
      <div class="grid grid-cols-3 gap-1.5 text-xs font-semibold">
        <button type="button" (click)="elegir('llave')"
          class="rounded-lg border py-1.5 transition-colors"
          [class.bg-fuchsia-600]="modo() === 'llave'" [class.border-fuchsia-600]="modo() === 'llave'" [class.text-white]="modo() === 'llave'"
          [class.border-slate-300]="modo() !== 'llave'" [class.text-slate-700]="modo() !== 'llave'" [class.bg-white]="modo() !== 'llave'">
          🔑 Llave
        </button>
        <button type="button" (click)="elegir('efectivo')"
          class="rounded-lg border py-1.5 transition-colors"
          [class.bg-emerald-600]="modo() === 'efectivo'" [class.border-emerald-600]="modo() === 'efectivo'" [class.text-white]="modo() === 'efectivo'"
          [class.border-slate-300]="modo() !== 'efectivo'" [class.text-slate-700]="modo() !== 'efectivo'" [class.bg-white]="modo() !== 'efectivo'">
          💵 Efectivo
        </button>
        <button type="button" (click)="elegir('mixto')"
          class="rounded-lg border py-1.5 transition-colors"
          [class.bg-slate-800]="modo() === 'mixto'" [class.border-slate-800]="modo() === 'mixto'" [class.text-white]="modo() === 'mixto'"
          [class.border-slate-300]="modo() !== 'mixto'" [class.text-slate-700]="modo() !== 'mixto'" [class.bg-white]="modo() !== 'mixto'">
          Mixto
        </button>
      </div>
      @if (modo() === 'mixto') {
        <div class="grid grid-cols-2 gap-2 items-end">
          <label class="text-xs text-fuchsia-700 font-medium">
            🔑 Llave
            <input type="number" min="0" step="1000" [ngModel]="montoLlave()" (ngModelChange)="montoLlave.set($event)"
              [name]="'llave-' + nombre()"
              class="block w-full rounded-lg border border-fuchsia-300 px-2 py-1 text-sm font-semibold text-slate-800" />
          </label>
          <div class="text-xs text-emerald-700 font-medium">
            💵 Efectivo
            <p class="rounded-lg bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-800 tabular-nums">
              {{ efectivoMixto() | number: '1.0-0' }}
            </p>
          </div>
        </div>
        @if (efectivoMixto() < 0) {
          <p class="text-xs text-red-600">Lo de Llave no puede pasar del total.</p>
        }
      }
    </div>
  `,
})
export class PagoPotes {
  readonly total = input.required<number>();
  /** Sufijo para los name de los inputs (evita choques entre tarjetas). */
  readonly nombre = input('pago');
  readonly modo = model<ModoPago | null>(null);
  readonly montoLlave = model<number | null>(null);

  elegir(modo: ModoPago): void {
    this.modo.set(modo);
    if (modo === 'mixto' && this.montoLlave() == null) this.montoLlave.set(Math.round(this.total() / 2));
  }

  efectivoMixto(): number {
    return this.total() - (this.montoLlave() ?? 0);
  }
}
