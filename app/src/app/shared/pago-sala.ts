import { DecimalPipe } from '@angular/common';
import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PesosDirective } from './pesos.directive';

/** Cómo pagó el cliente de la sala. */
export type FormaPagoSala = 'efectivo' | 'transferencia' | 'mixto';

/**
 * Montos que se mandan a `cerrar_sesion`. El que va en null es "el resto": el total
 * exacto lo calcula el servidor al cerrar (en cronometrado puede variar frente a la vista previa).
 * null = falta elegir o el mixto no cuadra.
 */
export function pagoSala(
  total: number,
  forma: FormaPagoSala | null,
  transferencia: number | null,
): { efectivo: number | null; transferencia: number | null } | null {
  if (forma === 'efectivo') return { efectivo: null, transferencia: 0 };
  if (forma === 'transferencia') return { efectivo: 0, transferencia: null };
  if (forma === 'mixto') {
    if (transferencia == null || transferencia < 0 || transferencia > total) return null;
    return { efectivo: null, transferencia };
  }
  return null;
}

/** Selector "¿cómo pagó?" del cobro de la sala: efectivo, transferencia o mixto. */
@Component({
  selector: 'app-pago-sala',
  imports: [FormsModule, DecimalPipe, PesosDirective],
  template: `
    <div class="space-y-2">
      <span class="block text-xs font-medium text-slate-500">¿Cómo pagó? ({{ total() | number: '1.0-0' }} COP)</span>
      <div class="grid grid-cols-3 gap-1.5 text-xs font-semibold">
        <button type="button" (click)="elegir('efectivo')"
          class="rounded-lg border py-2 transition-colors"
          [class.bg-emerald-600]="forma() === 'efectivo'" [class.border-emerald-600]="forma() === 'efectivo'" [class.text-white]="forma() === 'efectivo'"
          [class.border-slate-300]="forma() !== 'efectivo'" [class.text-slate-700]="forma() !== 'efectivo'" [class.bg-white]="forma() !== 'efectivo'">
          💵 Efectivo
        </button>
        <button type="button" (click)="elegir('transferencia')"
          class="rounded-lg border py-2 transition-colors"
          [class.bg-sky-600]="forma() === 'transferencia'" [class.border-sky-600]="forma() === 'transferencia'" [class.text-white]="forma() === 'transferencia'"
          [class.border-slate-300]="forma() !== 'transferencia'" [class.text-slate-700]="forma() !== 'transferencia'" [class.bg-white]="forma() !== 'transferencia'">
          📲 Transferencia
        </button>
        <button type="button" (click)="elegir('mixto')"
          class="rounded-lg border py-2 transition-colors"
          [class.bg-slate-800]="forma() === 'mixto'" [class.border-slate-800]="forma() === 'mixto'" [class.text-white]="forma() === 'mixto'"
          [class.border-slate-300]="forma() !== 'mixto'" [class.text-slate-700]="forma() !== 'mixto'" [class.bg-white]="forma() !== 'mixto'">
          Mixto
        </button>
      </div>
      @if (forma() === 'mixto') {
        <div class="grid grid-cols-2 gap-2 items-end">
          <label class="text-xs text-sky-700 font-medium">
            📲 Transferencia
            <input appPesos [ngModel]="transferencia()" (ngModelChange)="transferencia.set($event)"
              [name]="'transf-' + nombre()"
              class="block w-full rounded-lg border border-sky-300 px-2 py-1 text-sm font-semibold text-slate-800" />
          </label>
          <div class="text-xs text-emerald-700 font-medium">
            💵 Efectivo
            <p class="rounded-lg bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-800 tabular-nums">
              {{ efectivoMixto() | number: '1.0-0' }}
            </p>
          </div>
        </div>
        @if (efectivoMixto() < 0) {
          <p class="text-xs text-red-600">La transferencia no puede pasar del total.</p>
        }
      }
    </div>
  `,
})
export class PagoSala {
  readonly total = input.required<number>();
  /** Sufijo para los name de los inputs (evita choques entre tarjetas). */
  readonly nombre = input('pago');
  readonly forma = model<FormaPagoSala | null>(null);
  readonly transferencia = model<number | null>(null);

  elegir(forma: FormaPagoSala): void {
    this.forma.set(forma);
    if (forma === 'mixto' && this.transferencia() == null) this.transferencia.set(Math.round(this.total() / 2));
  }

  efectivoMixto(): number {
    return this.total() - (this.transferencia() ?? 0);
  }
}
