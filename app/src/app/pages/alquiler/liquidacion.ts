import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlquilerService } from '../../core/alquiler.service';
import { AuthService } from '../../core/auth.service';
import { Liquidacion, SaldoPote, Socio } from '../../core/models';
import { PotesService } from '../../core/potes.service';
import { ToastService } from '../../core/toast.service';
import { OFFSET_COLOMBIA, ZONA_HORARIA, fechaColombia } from '../../core/zona-horaria';

export interface ParteSocio {
  socio: string;
  porcentaje: number;
  llave: number;
  efectivo: number;
  total: number;
}

/**
 * Reparto del saldo de los potes entre socios. Igual que `liquidar_potes` en la base:
 * pesos enteros, cada socio recibe su porcentaje de cada pote (redondeado hacia abajo)
 * y el último socio se queda con el peso que sobre.
 */
export function repartir(llave: number, efectivo: number, socios: Pick<Socio, 'nombre' | 'porcentaje'>[]): ParteSocio[] {
  let restoLlave = llave;
  let restoEfectivo = efectivo;
  return socios.map((s, i) => {
    const ultimo = i === socios.length - 1;
    const parteLlave = ultimo ? restoLlave : Math.floor((llave * s.porcentaje) / 100);
    const parteEfectivo = ultimo ? restoEfectivo : Math.floor((efectivo * s.porcentaje) / 100);
    restoLlave -= parteLlave;
    restoEfectivo -= parteEfectivo;
    return { socio: s.nombre, porcentaje: s.porcentaje, llave: parteLlave, efectivo: parteEfectivo, total: parteLlave + parteEfectivo };
  });
}

/** "2026-10" → "octubre de 2026". */
export function nombrePeriodo(periodo: string): string {
  return new Date(`${periodo}-15T12:00:00${OFFSET_COLOMBIA}`).toLocaleDateString('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: ZONA_HORARIA,
  });
}

/**
 * Liquidación mensual del alquiler: vacía los potes (Llave y Efectivo) y reparte el total
 * entre los socios según su porcentaje. Todos los del alquiler la ven; solo el admin liquida
 * o anula.
 */
@Component({
  selector: 'app-liquidacion',
  imports: [FormsModule, DecimalPipe, DatePipe],
  template: `
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <!-- Liquidación del mes -->
      <section class="lg:col-span-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 h-fit">
        <div class="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 class="font-semibold text-slate-900">Liquidación del mes</h2>
            <p class="text-xs text-slate-500">Se vacían los potes y el total se divide entre los socios.</p>
          </div>
          <label class="text-xs font-medium text-slate-500">
            Mes que se liquida
            <input type="month" [(ngModel)]="periodo" name="periodo" class="block rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
          </label>
        </div>

        <!-- La cuenta -->
        <div class="rounded-xl bg-slate-50 p-3 text-sm tabular-nums space-y-1">
          <p class="flex justify-between"><span>🔑 Pote Llave (Daviplata)</span><b>{{ llave() | number: '1.0-0' }}</b></p>
          <p class="flex justify-between"><span>💵 Pote Efectivo</span><b>{{ efectivo() | number: '1.0-0' }}</b></p>
          <p class="flex justify-between border-t border-slate-200 pt-1 text-base"><span class="font-semibold">Total a repartir</span><b class="text-slate-900">{{ total() | number: '1.0-0' }} COP</b></p>
        </div>

        <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          @for (p of reparto(); track p.socio) {
            <div class="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-4 text-white shadow-sm">
              <p class="text-xs uppercase tracking-wide opacity-80">Le toca a</p>
              <p class="text-lg font-bold">{{ p.socio }}</p>
              <p class="text-3xl font-black tabular-nums">{{ p.total | number: '1.0-0' }}</p>
              <p class="text-xs opacity-90 tabular-nums">{{ total() | number: '1.0-0' }} × {{ p.porcentaje }} % = {{ p.total | number: '1.0-0' }}</p>
              <p class="mt-1 text-xs opacity-90 tabular-nums">De Llave {{ p.llave | number: '1.0-0' }} · De Efectivo {{ p.efectivo | number: '1.0-0' }}</p>
            </div>
          }
        </div>
        @if (sobrante()) {
          <p class="mt-2 text-xs text-slate-500">El total no se divide exacto: el peso que sobra queda para {{ reparto().at(-1)?.socio }}.</p>
        }
        @if (prestado() > 0) {
          <p class="mt-2 text-xs text-amber-700">Hay {{ prestado() | number: '1.0-0' }} prestados por cobrar: no están en los potes, así que no entran en esta liquidación.</p>
        }

        @if (auth.isAdmin()) {
          <label class="mt-3 block text-xs font-medium text-slate-500">
            Notas (opcional)
            <input [(ngModel)]="notas" name="notas" placeholder="Ej. pagado por Nequi el 1 de noviembre"
              class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800" />
          </label>
          <button type="button" (click)="liquidar()" [disabled]="guardando() || total() <= 0"
            class="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {{ guardando() ? 'Liquidando…' : 'Liquidar ' + nombrePeriodo(periodo) + ' y vaciar potes' }}
          </button>
        } @else {
          <p class="mt-3 text-xs text-slate-500">Solo el admin puede hacer la liquidación.</p>
        }
      </section>

      <!-- Liquidaciones anteriores -->
      <section class="lg:col-span-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 h-fit">
        <h2 class="font-semibold text-slate-900 mb-3">Liquidaciones anteriores</h2>
        <ul class="space-y-3">
          @for (l of liquidaciones(); track l.id) {
            <li class="rounded-xl ring-1 ring-slate-200 p-3 text-sm">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="font-bold text-slate-900 capitalize">{{ nombrePeriodo(l.periodo) }}</p>
                  <p class="text-xs text-slate-500">Liquidada el {{ l.created_at | date: 'd MMM y, h:mm a' }}</p>
                </div>
                <p class="text-right font-bold tabular-nums">{{ l.total | number: '1.0-0' }}</p>
              </div>
              <p class="mt-1 text-xs text-slate-500 tabular-nums">Llave {{ l.saldo_llave | number: '1.0-0' }} + Efectivo {{ l.saldo_efectivo | number: '1.0-0' }}</p>
              <ul class="mt-2 space-y-0.5">
                @for (s of l.liquidacion_socios; track s.id) {
                  <li class="flex justify-between tabular-nums">
                    <span>{{ s.socio }} <span class="text-xs text-slate-400">{{ s.porcentaje }} %</span></span>
                    <b>{{ s.monto | number: '1.0-0' }}</b>
                  </li>
                }
              </ul>
              @if (l.notas) {
                <p class="mt-1 text-xs text-slate-500">{{ l.notas }}</p>
              }
              @if (auth.isAdmin()) {
                <button type="button" (click)="anular(l)" class="mt-2 text-xs text-red-600 hover:underline">Anular (el dinero vuelve a los potes)</button>
              }
            </li>
          } @empty {
            <li class="text-sm text-slate-400">Todavía no hay liquidaciones.</li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class LiquidacionPage implements OnInit, OnDestroy {
  readonly saldos = signal<SaldoPote[]>([]);
  readonly socios = signal<Socio[]>([]);
  readonly liquidaciones = signal<Liquidacion[]>([]);
  readonly prestado = signal(0);
  readonly guardando = signal(false);
  readonly nombrePeriodo = nombrePeriodo;
  /** Por defecto el mes anterior: la liquidación se hace al empezar el mes. */
  periodo = mesAnterior(fechaColombia());
  notas = '';
  private unsubscribe?: () => void;

  readonly llave = computed(() => Math.max(0, this.saldos().find((s) => s.pote === 'llave')?.saldo ?? 0));
  readonly efectivo = computed(() => Math.max(0, this.saldos().find((s) => s.pote === 'efectivo')?.saldo ?? 0));
  readonly total = computed(() => this.llave() + this.efectivo());
  readonly reparto = computed(() => repartir(this.llave(), this.efectivo(), this.socios()));
  /** True si el reparto no es exacto (al último socio le queda algún peso de más). */
  readonly sobrante = computed(() => {
    const r = this.reparto();
    return r.length > 1 && new Set(r.map((p) => p.total)).size > 1 && new Set(r.map((p) => p.porcentaje)).size === 1;
  });

  constructor(
    private readonly potes: PotesService,
    private readonly alquiler: AlquilerService,
    readonly auth: AuthService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    // Un cobro de alquiler cambia el saldo de los potes.
    this.unsubscribe = this.alquiler.onCambios(() => this.cargar());
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  async cargar(): Promise<void> {
    try {
      const [saldos, socios, liquidaciones, prestamos] = await Promise.all([
        this.potes.saldos(),
        this.potes.socios(),
        this.potes.liquidaciones(),
        this.potes.prestamosPendientes(),
      ]);
      this.saldos.set(saldos);
      this.socios.set(socios);
      this.liquidaciones.set(liquidaciones);
      this.prestado.set(prestamos.reduce((t, p) => t + Math.max(0, p.pendiente), 0));
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async liquidar(): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(this.periodo)) return this.toast.error('Elige el mes que se liquida.');
    const detalle = this.reparto()
      .map((p) => `${p.socio}: ${p.total.toLocaleString('es-CO')} (${p.porcentaje} %)`)
      .join('\n');
    const ok = confirm(
      `¿Liquidar ${nombrePeriodo(this.periodo)}?\n\nTotal: ${this.total().toLocaleString('es-CO')}\n${detalle}\n\nLos dos potes quedan en 0.`,
    );
    if (!ok) return;
    this.guardando.set(true);
    try {
      await this.potes.liquidar(this.periodo, this.notas.trim() || null);
      this.toast.exito(`Liquidación de ${nombrePeriodo(this.periodo)} guardada. Potes en 0.`);
      this.notas = '';
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.guardando.set(false);
    }
  }

  async anular(l: Liquidacion): Promise<void> {
    if (!confirm(`¿Anular la liquidación de ${nombrePeriodo(l.periodo)}? Los ${l.total.toLocaleString('es-CO')} vuelven a los potes.`)) return;
    try {
      await this.potes.anularLiquidacion(l.id);
      this.toast.exito('Liquidación anulada. El dinero volvió a los potes.');
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  private mensaje(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'Ocurrió un error inesperado.';
  }
}

/** "2026-11-01" → "2026-10". */
function mesAnterior(fechaISO: string): string {
  const [a, m] = fechaISO.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
