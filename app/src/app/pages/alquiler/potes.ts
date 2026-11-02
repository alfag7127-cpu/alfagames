import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { PoteMovimiento, PrestamoPendiente, RangoPote, TipoMovimiento } from '../../core/models';
import { NOMBRE_TIPO, PotesService, TIPOS_MANUALES, TIPOS_SALIDA } from '../../core/potes.service';
import { ToastService } from '../../core/toast.service';
import { OFFSET_COLOMBIA, ZONA_HORARIA, fechaColombia, sumarDias } from '../../core/zona-horaria';
import { NOMBRE_POTE, Pote } from '../../shared/pago-potes';

interface DiaMovimientos {
  fecha: string;
  etiqueta: string;
  movimientos: PoteMovimiento[];
}

/**
 * Saldos de los potes y sus movimientos: préstamos, abonos, inversiones (compras de
 * consolas o controles), otros egresos/ingresos y traslados. Cada movimiento queda en
 * su fecha y cambia el saldo del pote ese día.
 */
@Component({
  selector: 'app-potes',
  imports: [FormsModule, DecimalPipe],
  template: `
    <!-- Filtro de fechas: cambia los saldos y los movimientos -->
    <div class="mb-3 flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <label class="text-xs font-medium text-slate-500">
        Desde
        <input type="date" [(ngModel)]="desde" name="m-desde" class="block rounded-lg border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label class="text-xs font-medium text-slate-500">
        Hasta
        <input type="date" [(ngModel)]="hasta" name="m-hasta" class="block rounded-lg border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <button type="button" (click)="filtrar()" class="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900">Filtrar</button>
      @if (inicio()) {
        <button type="button" (click)="desdeElInicio()" class="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200">Desde el inicio de los potes</button>
      }
      <span class="ml-auto text-xs text-slate-500">Saldo de cada pote al terminar el {{ etiquetaHasta() }} (hora de Colombia)</span>
    </div>

    <!-- Saldos del rango -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
      @for (s of rango(); track s.pote) {
        <div
          class="rounded-xl text-white p-4 shadow-sm"
          [class.bg-gradient-to-br]="true"
          [class.from-fuchsia-600]="s.pote === 'llave'"
          [class.to-fuchsia-800]="s.pote === 'llave'"
          [class.from-emerald-600]="s.pote === 'efectivo'"
          [class.to-emerald-800]="s.pote === 'efectivo'"
        >
          <p class="text-[11px] uppercase tracking-wide opacity-80">{{ s.pote === 'llave' ? '🔑' : '💵' }} {{ nombrePote[s.pote] }} · saldo al {{ etiquetaHasta() }}</p>
          <p class="text-3xl font-bold tabular-nums">{{ s.saldo_final | number: '1.0-0' }}</p>
          <div class="mt-1 space-y-0.5 text-xs opacity-90 tabular-nums">
            <p class="flex justify-between"><span>Venía (antes del {{ etiquetaDesde() }})</span><span>{{ s.saldo_anterior | number: '1.0-0' }}</span></p>
            @if (s.inicio_potes) {
              <p class="flex justify-between"><span>+ Inicio de potes</span><span>{{ s.inicio_potes | number: '1.0-0' }}</span></p>
            }
            <p class="flex justify-between"><span>+ Cobros de alquiler</span><span>{{ s.cobros | number: '1.0-0' }}</span></p>
            @if (s.entradas) {
              <p class="flex justify-between"><span>+ Otras entradas</span><span>{{ s.entradas | number: '1.0-0' }}</span></p>
            }
            @if (s.salidas) {
              <p class="flex justify-between"><span>− Salidas</span><span>{{ s.salidas | number: '1.0-0' }}</span></p>
            }
            @if (s.traslados) {
              <p class="flex justify-between"><span>⇄ Traslados</span><span>{{ s.traslados > 0 ? '+' : '' }}{{ s.traslados | number: '1.0-0' }}</span></p>
            }
            @if (s.liquidado) {
              <p class="flex justify-between"><span>− Liquidado a socios</span><span>{{ s.liquidado | number: '1.0-0' }}</span></p>
            }
          </div>
        </div>
      }
      <div class="rounded-xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
        <p class="text-[11px] uppercase tracking-wide text-slate-500">Total en potes al {{ etiquetaHasta() }}</p>
        <p class="text-3xl font-bold text-slate-900 tabular-nums">{{ totalSaldo() | number: '1.0-0' }}</p>
        <p class="text-xs text-slate-500 tabular-nums">Entró en el rango: {{ entroRango() | number: '1.0-0' }}</p>
        <p class="text-xs text-slate-500">Préstamos por cobrar hoy: <span class="font-semibold text-amber-700 tabular-nums">{{ totalPrestado() | number: '1.0-0' }}</span></p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Registrar movimiento (admin y rol alquiler) -->
      @if (auth.puedeAlquiler()) {
        <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 space-y-3 h-fit">
          <h2 class="font-semibold text-slate-900">Registrar movimiento</h2>

          <label class="block text-xs font-medium text-slate-500">
            Tipo
            <select [(ngModel)]="tipo" name="tipo" class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800">
              @for (t of tipos; track t) {
                <option [ngValue]="t">{{ nombreTipo[t] }}</option>
              }
            </select>
          </label>

          <div class="grid grid-cols-2 gap-2">
            <label class="block text-xs font-medium text-slate-500">
              {{ tipo === 'traslado' ? 'Sale de' : esSalida() ? 'Sale de' : 'Entra a' }}
              <select [(ngModel)]="pote" name="pote" class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800">
                <option ngValue="llave">🔑 Llave</option>
                <option ngValue="efectivo">💵 Efectivo</option>
              </select>
            </label>
            @if (tipo === 'traslado') {
              <p class="text-xs font-medium text-slate-500">
                Entra a
                <span class="mt-1 block rounded-lg bg-slate-50 px-2 py-1.5 text-sm text-slate-800">
                  {{ pote === 'llave' ? '💵 Efectivo' : '🔑 Llave' }}
                </span>
              </p>
            } @else {
              <label class="block text-xs font-medium text-slate-500">
                Fecha
                <input type="date" [(ngModel)]="fecha" name="fecha" class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
              </label>
            }
          </div>
          @if (tipo === 'traslado') {
            <label class="block text-xs font-medium text-slate-500">
              Fecha
              <input type="date" [(ngModel)]="fecha" name="fecha-t" class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
            </label>
          }

          <label class="block text-xs font-medium text-slate-500">
            Monto (COP)
            <input type="number" min="0" step="1000" [(ngModel)]="monto" name="monto"
              class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-semibold text-slate-800" />
          </label>

          @if (tipo === 'prestamo' || tipo === 'abono_prestamo') {
            <label class="block text-xs font-medium text-slate-500">
              Persona *
              <input [(ngModel)]="persona" name="persona" list="personas-prestamo" placeholder="¿A quién?"
                class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800" />
              <datalist id="personas-prestamo">
                @for (p of prestamos(); track p.persona) {
                  <option [value]="p.persona"></option>
                }
              </datalist>
            </label>
          }

          <label class="block text-xs font-medium text-slate-500">
            Descripción
            <input [(ngModel)]="descripcion" name="descripcion"
              [placeholder]="tipo === 'inversion' ? 'Ej. 2 controles PS4, PS4 Slim usada…' : 'Opcional'"
              class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800" />
          </label>

          <button type="button" (click)="registrar()" [disabled]="guardando()"
            class="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {{ guardando() ? 'Guardando…' : 'Registrar' }}
          </button>
        </section>
      }

      <div class="space-y-4" [class.lg:col-span-2]="auth.puedeAlquiler()" [class.lg:col-span-3]="!auth.puedeAlquiler()">
        <!-- Préstamos pendientes -->
        <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <h2 class="font-semibold text-slate-900 mb-2">Préstamos pendientes</h2>
          @for (p of pendientes(); track p.persona) {
            <div class="flex items-center justify-between border-t border-slate-100 py-2 text-sm first:border-0">
              <span class="font-medium text-slate-800">{{ p.persona }}</span>
              <span class="text-xs text-slate-500 tabular-nums">
                prestado {{ p.prestado | number: '1.0-0' }} · abonado {{ p.abonado | number: '1.0-0' }} ·
                <span class="font-bold text-amber-700">debe {{ p.pendiente | number: '1.0-0' }}</span>
              </span>
            </div>
          } @empty {
            <p class="text-sm text-slate-400">Nadie debe dinero a los potes.</p>
          }
        </section>

        <!-- Movimientos por día -->
        <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div class="flex flex-wrap items-end justify-between gap-3 mb-3">
            <h2 class="font-semibold text-slate-900">Movimientos</h2>
            <span class="text-xs text-slate-500">del {{ etiquetaDesde() }} al {{ etiquetaHasta() }}</span>
          </div>

          @for (d of dias(); track d.fecha) {
            <h3 class="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 capitalize">{{ d.etiqueta }}</h3>
            <ul class="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
              @for (m of d.movimientos; track m.id) {
                <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div class="min-w-0">
                    <p class="font-medium text-slate-800">
                      {{ nombreTipo[m.tipo] }}
                      @if (m.persona) {
                        <span class="font-normal text-slate-500">· {{ m.persona }}</span>
                      }
                    </p>
                    <p class="text-xs text-slate-500 truncate">
                      @if (m.tipo === 'traslado') {
                        {{ nombrePote[m.pote] }} → {{ nombrePote[m.pote_destino!] }}
                      } @else {
                        {{ nombrePote[m.pote] }}
                      }
                      {{ m.descripcion ? '· ' + m.descripcion : '' }}
                    </p>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <span class="font-bold tabular-nums"
                      [class.text-red-600]="signo(m) < 0" [class.text-emerald-700]="signo(m) > 0" [class.text-slate-600]="signo(m) === 0">
                      {{ signo(m) < 0 ? '−' : signo(m) > 0 ? '+' : '⇄' }}{{ m.monto | number: '1.0-0' }}
                    </span>
                    @if (auth.puedeAlquiler() && m.tipo !== 'liquidacion') {
                      <button type="button" (click)="eliminar(m)" class="text-xs text-slate-400 hover:text-red-600" title="Eliminar">✕</button>
                    }
                  </div>
                </li>
              }
            </ul>
          } @empty {
            <p class="text-sm text-slate-400">Sin movimientos en este período.</p>
          }
        </section>
      </div>
    </div>
  `,
})
export class Potes implements OnInit {
  readonly rango = signal<RangoPote[]>([]);
  readonly inicio = signal<string | null>(null);
  /** Fechas del último filtro aplicado (las que se están mostrando). */
  private readonly filtro = signal({ desde: '', hasta: fechaColombia() });
  readonly prestamos = signal<PrestamoPendiente[]>([]);
  readonly movimientos = signal<PoteMovimiento[]>([]);
  readonly guardando = signal(false);
  readonly nombrePote = NOMBRE_POTE;
  readonly nombreTipo = NOMBRE_TIPO;
  readonly tipos: TipoMovimiento[] = TIPOS_MANUALES;

  // Formulario
  tipo: TipoMovimiento = 'inversion';
  pote: Pote = 'efectivo';
  fecha = fechaColombia();
  monto: number | null = null;
  persona = '';
  descripcion = '';

  // Filtro
  desde = sumarDias(fechaColombia(), -30);
  hasta = fechaColombia();

  readonly totalSaldo = computed(() => this.rango().reduce((s, p) => s + p.saldo_final, 0));
  /** Lo que entró en el rango: inicio de potes + cobros + otras entradas. */
  readonly entroRango = computed(() => this.rango().reduce((s, p) => s + p.inicio_potes + p.cobros + p.entradas, 0));
  readonly etiquetaDesde = computed(() => fechaCorta(this.filtro().desde));
  readonly etiquetaHasta = computed(() => fechaCorta(this.filtro().hasta));
  readonly pendientes = computed(() => this.prestamos().filter((p) => p.pendiente > 0));
  readonly totalPrestado = computed(() => this.pendientes().reduce((s, p) => s + p.pendiente, 0));

  readonly dias = computed<DiaMovimientos[]>(() => {
    const porDia = new Map<string, PoteMovimiento[]>();
    for (const m of this.movimientos()) porDia.set(m.fecha, [...(porDia.get(m.fecha) ?? []), m]);
    return Array.from(porDia.entries()).map(([fecha, movimientos]) => ({
      fecha,
      etiqueta: new Date(`${fecha}T12:00:00${OFFSET_COLOMBIA}`).toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: ZONA_HORARIA,
      }),
      movimientos,
    }));
  });

  constructor(
    private readonly potes: PotesService,
    readonly auth: AuthService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      // La primera vez se arranca desde el día en que empezaron los potes.
      if (!this.inicio()) {
        this.inicio.set(await this.potes.inicio());
        if (this.inicio()) this.desde = this.inicio()!;
      }
      this.prestamos.set(await this.potes.prestamosPendientes());
      await this.filtrar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  desdeElInicio(): void {
    this.desde = this.inicio()!;
    this.hasta = fechaColombia();
    this.filtrar();
  }

  /** Saldos y movimientos del rango elegido (días completos de Colombia). */
  async filtrar(): Promise<void> {
    if (!this.desde || !this.hasta) return this.toast.error('Elige las dos fechas.');
    if (this.desde > this.hasta) [this.desde, this.hasta] = [this.hasta, this.desde];
    try {
      const [rango, movimientos] = await Promise.all([
        this.potes.rango(this.desde, this.hasta),
        this.potes.movimientos(this.desde, this.hasta),
      ]);
      this.rango.set(rango);
      this.movimientos.set(movimientos);
      this.filtro.set({ desde: this.desde, hasta: this.hasta });
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  esSalida(): boolean {
    return TIPOS_SALIDA.includes(this.tipo);
  }

  /** −1 sale del pote, +1 entra, 0 traslado (sale de uno y entra al otro). */
  signo(m: PoteMovimiento): number {
    if (m.tipo === 'traslado') return 0;
    return TIPOS_SALIDA.includes(m.tipo) ? -1 : 1;
  }

  async registrar(): Promise<void> {
    if (!this.monto || this.monto <= 0) return this.toast.error('Escribe el monto.');
    const conPersona = this.tipo === 'prestamo' || this.tipo === 'abono_prestamo';
    if (conPersona && !this.persona.trim()) return this.toast.error('Escribe a quién se prestó o quién abona.');
    this.guardando.set(true);
    try {
      await this.potes.crear({
        fecha: this.fecha,
        tipo: this.tipo,
        pote: this.pote,
        poteDestino: this.tipo === 'traslado' ? (this.pote === 'llave' ? 'efectivo' : 'llave') : null,
        monto: this.monto,
        persona: conPersona ? this.persona.trim() : null,
        descripcion: this.descripcion.trim() || null,
      });
      this.toast.exito(`${NOMBRE_TIPO[this.tipo]} registrado: $${this.monto.toLocaleString('es-CO')}.`);
      this.monto = null;
      this.persona = '';
      this.descripcion = '';
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminar(m: PoteMovimiento): Promise<void> {
    if (!confirm(`¿Eliminar ${NOMBRE_TIPO[m.tipo].toLowerCase()} de $${m.monto.toLocaleString('es-CO')}?`)) return;
    try {
      await this.potes.eliminar(m.id);
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

/** "2026-10-20" → "20 oct 2026". */
function fechaCorta(fecha: string): string {
  if (!fecha) return '…';
  return new Date(`${fecha}T12:00:00${OFFSET_COLOMBIA}`).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: ZONA_HORARIA,
  });
}
