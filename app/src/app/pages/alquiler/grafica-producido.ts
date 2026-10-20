import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { AlquilerService } from '../../core/alquiler.service';
import { ToastService } from '../../core/toast.service';
import { fechaColombia, inicioDiaColombia } from '../../core/zona-horaria';
import { BarraProducido, PagoProducido, Periodo, agruparProducido, inicioPeriodo, lunesDe } from './producido';

/**
 * Producido del alquiler (dinero recibido) por día, semana o mes, apilado por pote:
 * Efectivo abajo, Llave arriba. Cuenta el día en que entró el dinero.
 */
@Component({
  selector: 'app-grafica-producido',
  imports: [DecimalPipe],
  template: `
    <!-- Resumen: hoy, esta semana, este mes -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      @for (k of resumen(); track k.titulo) {
        <div class="rounded-xl bg-white ring-1 ring-slate-100 p-4 shadow-sm">
          <p class="text-[11px] uppercase tracking-wide text-slate-500">{{ k.titulo }}</p>
          <p class="text-2xl font-bold text-slate-900 tabular-nums">{{ k.total | number: '1.0-0' }}</p>
          <p class="text-xs text-slate-500 tabular-nums">
            <span class="inline-block h-2 w-2 rounded-sm bg-[#c026d3] mr-1"></span>Llave {{ k.llave | number: '1.0-0' }}
            · <span class="inline-block h-2 w-2 rounded-sm bg-[#059669] mx-1"></span>Efectivo {{ k.efectivo | number: '1.0-0' }}
          </p>
        </div>
      }
    </div>

    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 class="font-semibold text-slate-900">Producido del alquiler</h2>
          <p class="text-xs text-slate-500">
            {{ periodo() === 'diario' ? 'Últimos 30 días' : periodo() === 'semanal' ? 'Últimas 12 semanas (lunes a domingo)' : 'Últimos 12 meses' }}
            · total {{ totalPeriodo() | number: '1.0-0' }} COP
          </p>
        </div>
        <div class="flex rounded-xl bg-slate-100 p-1 text-sm font-medium">
          @for (p of periodos; track p.id) {
            <button
              type="button"
              (click)="periodo.set(p.id); hover.set(null)"
              class="rounded-lg px-3 py-1.5 transition-colors"
              [class.bg-white]="periodo() === p.id"
              [class.shadow-sm]="periodo() === p.id"
              [class.text-indigo-700]="periodo() === p.id"
              [class.text-slate-600]="periodo() !== p.id"
            >
              {{ p.texto }}
            </button>
          }
        </div>
      </div>

      <!-- Leyenda -->
      <div class="flex items-center gap-4 text-xs text-slate-600 mb-2">
        <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-[#c026d3]"></span>🔑 Pote Llave</span>
        <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-[#059669]"></span>💵 Pote Efectivo</span>
      </div>

      @if (cargando()) {
        <p class="py-16 text-center text-sm text-slate-400">Cargando…</p>
      } @else {
        <div class="relative">
          <!-- Líneas guía -->
          <div class="pointer-events-none absolute inset-x-0 top-0 h-56">
            @for (g of guias(); track g.valor) {
              <div class="absolute inset-x-0 border-t border-dashed border-slate-200" [style.bottom.%]="g.pct">
                <span class="absolute -top-2.5 left-0 bg-white pr-1 text-[10px] text-slate-400 tabular-nums">{{ g.valor | number: '1.0-0' }}</span>
              </div>
            }
          </div>

          <!-- Barras -->
          <div class="relative flex h-56 items-end pl-12 border-b border-slate-300" [class.gap-0.5]="barras().length > 20" [class.gap-2]="barras().length <= 20">
            @for (b of barras(); track b.clave; let i = $index) {
              <div
                class="group relative flex h-full flex-1 cursor-default flex-col justify-end"
                (mouseenter)="hover.set(i)"
                (mouseleave)="hover.set(null)"
                (click)="hover.set(hover() === i ? null : i)"
                [attr.aria-label]="b.detalle + ': ' + b.total + ' pesos'"
              >
                @if (b.llave > 0) {
                  <div
                    class="w-full bg-[#c026d3] transition-opacity"
                    [class.rounded-t]="true"
                    [class.opacity-60]="hover() !== null && hover() !== i"
                    [style.height.%]="pct(b.llave)"
                  ></div>
                }
                @if (b.llave > 0 && b.efectivo > 0) {
                  <div class="h-[2px] w-full bg-white"></div>
                }
                @if (b.efectivo > 0) {
                  <div
                    class="w-full bg-[#059669] transition-opacity"
                    [class.rounded-t]="b.llave === 0"
                    [class.opacity-60]="hover() !== null && hover() !== i"
                    [style.height.%]="pct(b.efectivo)"
                  ></div>
                }

                @if (hover() === i) {
                  <div
                    class="absolute bottom-full z-10 mb-2 w-44 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
                    [class.left-1/2]="i > 2 && i < barras().length - 3"
                    [class.-translate-x-1/2]="i > 2 && i < barras().length - 3"
                    [class.left-0]="i <= 2"
                    [class.right-0]="i >= barras().length - 3"
                  >
                    <p class="font-semibold capitalize mb-1">{{ b.detalle }}</p>
                    <p class="flex justify-between tabular-nums"><span>🔑 Llave</span><span>{{ b.llave | number: '1.0-0' }}</span></p>
                    <p class="flex justify-between tabular-nums"><span>💵 Efectivo</span><span>{{ b.efectivo | number: '1.0-0' }}</span></p>
                    <p class="mt-1 flex justify-between border-t border-white/20 pt-1 font-semibold tabular-nums"><span>Total</span><span>{{ b.total | number: '1.0-0' }}</span></p>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Eje X -->
          <div class="flex pl-12 pt-1" [class.gap-0.5]="barras().length > 20" [class.gap-2]="barras().length <= 20">
            @for (b of barras(); track b.clave; let i = $index) {
              <span class="flex-1 text-center text-[10px] text-slate-500 truncate capitalize">
                {{ periodo() !== 'diario' || i % 5 === barras().length % 5 || i === barras().length - 1 ? b.etiqueta : '' }}
              </span>
            }
          </div>
        </div>

        @if (totalPeriodo() === 0) {
          <p class="mt-3 text-center text-sm text-slate-400">Todavía no hay pagos registrados en este período.</p>
        }

        <button type="button" (click)="verTabla.set(!verTabla())" class="mt-4 text-xs text-indigo-600 hover:underline">
          {{ verTabla() ? 'Ocultar tabla' : 'Ver como tabla' }}
        </button>
        @if (verTabla()) {
          <div class="mt-2 overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th class="py-1.5 pr-3 font-medium">{{ periodo() === 'diario' ? 'Día' : periodo() === 'semanal' ? 'Semana' : 'Mes' }}</th>
                  <th class="py-1.5 pr-3 font-medium text-right">Llave</th>
                  <th class="py-1.5 pr-3 font-medium text-right">Efectivo</th>
                  <th class="py-1.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 tabular-nums">
                @for (b of barrasInvertidas(); track b.clave) {
                  <tr>
                    <td class="py-1.5 pr-3 capitalize text-slate-700">{{ b.detalle }}</td>
                    <td class="py-1.5 pr-3 text-right text-slate-600">{{ b.llave | number: '1.0-0' }}</td>
                    <td class="py-1.5 pr-3 text-right text-slate-600">{{ b.efectivo | number: '1.0-0' }}</td>
                    <td class="py-1.5 text-right font-semibold text-slate-900">{{ b.total | number: '1.0-0' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </section>
  `,
})
export class GraficaProducido implements OnInit {
  readonly periodos: { id: Periodo; texto: string }[] = [
    { id: 'diario', texto: 'Diario' },
    { id: 'semanal', texto: 'Semanal' },
    { id: 'mensual', texto: 'Mensual' },
  ];
  readonly periodo = signal<Periodo>('diario');
  readonly hover = signal<number | null>(null);
  readonly verTabla = signal(false);
  readonly cargando = signal(true);
  private readonly pagos = signal<PagoProducido[]>([]);
  private readonly hoy = fechaColombia();

  readonly barras = computed<BarraProducido[]>(() => agruparProducido(this.pagos(), this.periodo(), this.hoy));
  readonly barrasInvertidas = computed(() => [...this.barras()].reverse());
  readonly totalPeriodo = computed(() => this.barras().reduce((s, b) => s + b.total, 0));
  private readonly maximo = computed(() => Math.max(1, ...this.barras().map((b) => b.total)));

  /** 3 líneas guía en valores redondos. */
  readonly guias = computed(() => {
    const max = this.maximo();
    if (max <= 1) return [];
    const paso = Math.pow(10, Math.floor(Math.log10(max / 3)));
    const unidad = [1, 2, 5, 10].map((m) => m * paso).find((u) => max / u <= 4) ?? paso * 10;
    const lineas = [];
    for (let v = unidad; v <= max; v += unidad) lineas.push({ valor: v, pct: (v / max) * 100 });
    return lineas;
  });

  readonly resumen = computed(() => {
    const diario = agruparProducido(this.pagos(), 'diario', this.hoy).at(-1);
    const semanal = agruparProducido(this.pagos(), 'semanal', this.hoy).at(-1);
    const mensual = agruparProducido(this.pagos(), 'mensual', this.hoy).at(-1);
    return [
      { titulo: 'Hoy', ...this.montos(diario) },
      { titulo: `Esta semana (desde el lunes ${Number(lunesDe(this.hoy).slice(8))})`, ...this.montos(semanal) },
      { titulo: 'Este mes', ...this.montos(mensual) },
    ];
  });

  constructor(
    private readonly alquiler: AlquilerService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  /** Un solo pedido: 12 meses cubre también las 12 semanas y los 30 días. */
  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.pagos.set(await this.alquiler.pagosPotes(inicioDiaColombia(inicioPeriodo(this.hoy, 'mensual'))));
    } catch (e) {
      this.toast.error(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se pudo cargar la gráfica.');
    } finally {
      this.cargando.set(false);
    }
  }

  pct(valor: number): number {
    return (valor / this.maximo()) * 100;
  }

  private montos(b: BarraProducido | undefined): { llave: number; efectivo: number; total: number } {
    return { llave: b?.llave ?? 0, efectivo: b?.efectivo ?? 0, total: b?.total ?? 0 };
  }
}
