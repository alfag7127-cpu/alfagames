import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlquilerService } from '../../core/alquiler.service';
import { AuthService } from '../../core/auth.service';
import { Liquidacion, RangoPote, Socio } from '../../core/models';
import { PotesService } from '../../core/potes.service';
import { ToastService } from '../../core/toast.service';
import { OFFSET_COLOMBIA, ZONA_HORARIA, fechaColombia, sumarDias } from '../../core/zona-horaria';

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
 * Liquidación mensual del alquiler por corte de mes (hora de Colombia): reparte entre los
 * socios lo que había en los potes al terminar el último día del mes elegido. Lo que entró
 * después queda para el mes siguiente. Los socios del alquiler (admin y rol alquiler) liquidan
 * y anulan (solo la última).
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
            <p class="text-xs text-slate-500">Corte al terminar el {{ etiquetaCorte() }} (hora de Colombia). Lo de después queda para el mes siguiente.</p>
          </div>
          <label class="text-xs font-medium text-slate-500">
            Mes que se liquida
            <input type="month" [(ngModel)]="periodo" (ngModelChange)="cargarMes()" name="periodo" class="block rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
          </label>
        </div>

        @if (bloqueo(); as b) {
          <p class="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{{ b }}</p>
        }

        <!-- La cuenta, pote por pote -->
        <div class="overflow-x-auto rounded-xl bg-slate-50 p-3">
          <table class="w-full text-sm tabular-nums">
            <thead class="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th class="py-1 pr-2 font-medium"></th>
                <th class="py-1 pr-2 text-right font-medium">🔑 Llave</th>
                <th class="py-1 pr-2 text-right font-medium">💵 Efectivo</th>
                <th class="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (f of filasCuenta(); track f.texto) {
                <tr [class.text-slate-400]="!f.llave && !f.efectivo">
                  <td class="py-0.5 pr-2">{{ f.texto }}</td>
                  <td class="py-0.5 pr-2 text-right">{{ f.llave | number: '1.0-0' }}</td>
                  <td class="py-0.5 pr-2 text-right">{{ f.efectivo | number: '1.0-0' }}</td>
                  <td class="py-0.5 text-right">{{ f.llave + f.efectivo | number: '1.0-0' }}</td>
                </tr>
              }
              <tr class="border-t border-slate-300 text-base font-bold text-slate-900">
                <td class="pt-1 pr-2">Total a repartir</td>
                <td class="pt-1 pr-2 text-right">{{ llave() | number: '1.0-0' }}</td>
                <td class="pt-1 pr-2 text-right">{{ efectivo() | number: '1.0-0' }}</td>
                <td class="pt-1 text-right">{{ total() | number: '1.0-0' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        @if (saldoHoy() !== total()) {
          <p class="mt-2 text-xs text-slate-500 tabular-nums">Hoy hay {{ saldoHoy() | number: '1.0-0' }} en los potes: lo que entró después del {{ etiquetaCorte() }} queda para la siguiente liquidación.</p>
        }

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

        @if (auth.puedeAlquiler()) {
          <label class="mt-3 block text-xs font-medium text-slate-500">
            Notas (opcional)
            <input [(ngModel)]="notas" name="notas" placeholder="Ej. pagado por Nequi el 1 de noviembre"
              class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800" />
          </label>
          <button type="button" (click)="liquidar()" [disabled]="guardando() || total() <= 0 || !!bloqueo()"
            class="mt-3 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {{ guardando() ? 'Liquidando…' : 'Liquidar ' + nombrePeriodo(periodo) + ' y vaciar potes' }}
          </button>
        } @else {
          <p class="mt-3 text-xs text-slate-500">Solo los socios del alquiler pueden hacer la liquidación.</p>
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
                  <p class="text-xs text-slate-500">Corte {{ l.corte ? (l.corte + 'T12:00:00-05:00' | date: 'd MMM y') : '—' }} · liquidada el {{ l.created_at | date: 'd MMM y, h:mm a' }}</p>
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
              @if (auth.puedeAlquiler() && $first) {
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
  /** Los potes en el mes elegido: lo que venía, lo que pasó en el mes y el saldo al corte. */
  readonly mes = signal<RangoPote[]>([]);
  readonly saldoHoy = signal(0);
  readonly socios = signal<Socio[]>([]);
  readonly liquidaciones = signal<Liquidacion[]>([]);
  readonly prestado = signal(0);
  readonly guardando = signal(false);
  readonly nombrePeriodo = nombrePeriodo;
  /** Por defecto el mes anterior: la liquidación se hace al empezar el mes. */
  periodo = mesAnterior(fechaColombia());
  notas = '';
  private unsubscribe?: () => void;

  readonly llave = computed(() => Math.max(0, this.mes().find((s) => s.pote === 'llave')?.saldo_final ?? 0));
  readonly efectivo = computed(() => Math.max(0, this.mes().find((s) => s.pote === 'efectivo')?.saldo_final ?? 0));
  readonly etiquetaCorte = computed(() => {
    const corte = finDeMes(this.periodoCargado());
    return new Date(`${corte}T12:00:00${OFFSET_COLOMBIA}`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA_HORARIA });
  });
  private readonly periodoCargado = signal(mesAnterior(fechaColombia()));
  /** Por qué no se puede liquidar el mes elegido (null si se puede). */
  readonly bloqueo = computed(() => {
    const p = this.periodoCargado();
    if (p > fechaColombia().slice(0, 7)) return 'Ese mes todavía no ha empezado.';
    const ultimo = this.liquidaciones()[0]?.periodo;
    if (ultimo && p <= ultimo) return `Ya está liquidado hasta ${nombrePeriodo(ultimo)}. Elige un mes posterior.`;
    return null;
  });
  /** Renglones de la cuenta del mes (por pote). */
  readonly filasCuenta = computed(() => {
    const v = (pote: 'llave' | 'efectivo') => this.mes().find((r) => r.pote === pote);
    const fila = (texto: string, f: (r: RangoPote) => number) => ({ texto, llave: f(v('llave')!) || 0, efectivo: f(v('efectivo')!) || 0 });
    if (!v('llave') || !v('efectivo')) return [];
    return [
      fila('Venía sin liquidar', (r) => r.saldo_anterior),
      fila('+ Inicio de potes', (r) => r.inicio_potes),
      fila('+ Cobros de alquiler', (r) => r.cobros),
      fila('+ Otras entradas', (r) => r.entradas),
      fila('− Salidas (préstamos, inversiones…)', (r) => -r.salidas),
      fila('⇄ Traslados', (r) => r.traslados),
      fila('− Ya liquidado', (r) => -r.liquidado),
    ].filter((f) => f.llave || f.efectivo || f.texto.startsWith('+ Cobros'));
  });
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
      this.saldoHoy.set(saldos.reduce((t, s) => t + s.saldo, 0));
      // Se ordena por mes: la primera es la última liquidada.
      liquidaciones.sort((a, b) => b.periodo.localeCompare(a.periodo));
      await this.cargarMes();
      this.socios.set(socios);
      this.liquidaciones.set(liquidaciones);
      this.prestado.set(prestamos.reduce((t, p) => t + Math.max(0, p.pendiente), 0));
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  /** Cuenta del mes elegido: del día 1 al último día (hora de Colombia). */
  async cargarMes(): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(this.periodo)) return;
    const periodo = this.periodo;
    try {
      const mes = await this.potes.rango(`${periodo}-01`, finDeMes(periodo));
      if (periodo !== this.periodo) return; // cambió de mes mientras cargaba
      this.mes.set(mes);
      this.periodoCargado.set(periodo);
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
      `¿Liquidar ${nombrePeriodo(this.periodo)} (corte ${this.etiquetaCorte()})?\n\nTotal: ${this.total().toLocaleString('es-CO')}\n${detalle}\n\nSale de los potes; lo que entró después del corte se queda.`,
    );
    if (!ok) return;
    this.guardando.set(true);
    try {
      await this.potes.liquidar(this.periodo, this.notas.trim() || null);
      this.toast.exito(`Liquidación de ${nombrePeriodo(this.periodo)} guardada.`);
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

/** "2026-10" → "2026-10-31" (último día del mes). */
function finDeMes(periodo: string): string {
  const [a, m] = periodo.split('-').map(Number);
  const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  return sumarDias(siguiente, -1);
}
