import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Producto, VentaProducto } from '../../core/models';
import { ProductosService } from '../../core/productos.service';
import { ToastService } from '../../core/toast.service';
import { fechaColombia, finDiaColombia, inicioDiaColombia, sumarDias } from '../../core/zona-horaria';
import { VentaProductos } from '../../shared/venta-productos';

type Rango = 'hoy' | 'ayer' | '7';

/** Venta de productos en el mostrador (admin y trabajador) y lo vendido por fechas (hoy por defecto). */
@Component({
  selector: 'app-ventas',
  imports: [DecimalPipe, DatePipe, FormsModule, VentaProductos],
  template: `
    <div class="mb-4">
      <app-venta-productos [ancho]="true" />
    </div>

    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-sky-100">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 class="font-semibold text-slate-900">{{ titulo() }}</h2>
        <div class="flex rounded-xl bg-slate-200/70 p-1 text-sm font-medium">
          @for (r of rangos; track r.id) {
            <button type="button" (click)="elegirRango(r.id)" class="rounded-lg px-3 py-1 transition-colors"
              [class.bg-white]="rango() === r.id" [class.shadow-sm]="rango() === r.id"
              [class.text-blue-700]="rango() === r.id" [class.text-slate-600]="rango() !== r.id">
              {{ r.txt }}
            </button>
          }
        </div>
      </div>
      <div class="flex flex-wrap items-end gap-3 mb-3">
        <label class="text-xs font-medium text-slate-500">
          Desde
          <input type="date" [(ngModel)]="desde" class="block rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
        </label>
        <label class="text-xs font-medium text-slate-500">
          Hasta
          <input type="date" [(ngModel)]="hasta" class="block rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
        </label>
        <button type="button" (click)="filtrarFechas()" class="rounded-lg bg-indigo-600 text-white text-sm px-4 py-1.5 hover:bg-indigo-700">Filtrar</button>
        <span class="ml-auto text-sm text-slate-500">
          {{ unidadesHoy() }} unidad{{ unidadesHoy() === 1 ? '' : 'es' }} ·
          <span class="font-bold text-slate-900 tabular-nums">{{ totalHoy() | number: '1.0-0' }} COP</span>
        </span>
      </div>
      <ul class="divide-y divide-slate-100 text-sm">
        @for (v of ventas(); track v.id) {
          <li class="flex items-center justify-between py-2" [class.opacity-40]="v.estado === 'anulada'">
            <span class="text-slate-800">
              {{ v.cantidad }} × {{ nombre(v.producto_id) }}
              <span class="text-xs text-slate-400">{{ v.created_at | date: (variosDias() ? 'd MMM, h:mm a' : 'h:mm a') }}{{ v.estado === 'anulada' ? ' · anulada' : '' }}</span>
            </span>
            <span class="font-semibold tabular-nums">{{ v.total | number: '1.0-0' }}</span>
          </li>
        } @empty {
          <li class="py-6 text-center text-slate-400">{{ rango() === 'hoy' ? 'Todavía no hay ventas hoy.' : 'Sin ventas en estas fechas.' }}</li>
        }
      </ul>
    </section>
  `,
})
export class Ventas implements OnInit, OnDestroy {
  readonly ventas = signal<VentaProducto[]>([]);
  private readonly productos = signal<Producto[]>([]);
  readonly rango = signal<Rango | null>('hoy');
  readonly rangos: { id: Rango; txt: string }[] = [
    { id: 'hoy', txt: 'Hoy' },
    { id: 'ayer', txt: 'Ayer' },
    { id: '7', txt: '7 días' },
  ];
  desde = fechaColombia();
  hasta = fechaColombia();
  /** Fechas que se están mostrando (las del último filtro aplicado). */
  private readonly filtro = signal({ desde: this.desde, hasta: this.hasta });
  readonly variosDias = computed(() => this.filtro().desde !== this.filtro().hasta);
  readonly titulo = computed(() => {
    const r = this.rango();
    if (r === 'hoy') return 'Vendido hoy';
    if (r === 'ayer') return 'Vendido ayer';
    const { desde, hasta } = this.filtro();
    return desde === hasta ? `Vendido el ${desde}` : `Vendido del ${desde} al ${hasta}`;
  });
  private unsubscribe?: () => void;

  private readonly vendidas = computed(() => this.ventas().filter((v) => v.estado === 'vendida'));
  readonly totalHoy = computed(() => this.vendidas().reduce((s, v) => s + v.total, 0));
  readonly unidadesHoy = computed(() => this.vendidas().reduce((s, v) => s + v.cantidad, 0));

  constructor(
    private readonly servicio: ProductosService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.unsubscribe = this.servicio.onCambios(() => this.cargar());
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  elegirRango(r: Rango): void {
    const hoy = fechaColombia();
    this.rango.set(r);
    this.hasta = r === 'ayer' ? sumarDias(hoy, -1) : hoy;
    this.desde = r === '7' ? sumarDias(hoy, -6) : this.hasta;
    this.cargar();
  }

  filtrarFechas(): void {
    if (!this.desde || !this.hasta) return this.toast.error('Elige las dos fechas.');
    if (this.desde > this.hasta) [this.desde, this.hasta] = [this.hasta, this.desde];
    this.rango.set(null);
    this.cargar();
  }

  async cargar(): Promise<void> {
    // Al cambiar de día con la pantalla abierta, "Hoy" sigue siendo hoy.
    if (this.rango() === 'hoy') this.desde = this.hasta = fechaColombia();
    this.filtro.set({ desde: this.desde, hasta: this.hasta });
    try {
      const [productos, ventas] = await Promise.all([
        this.servicio.listar(),
        // Días completos en hora de Colombia.
        this.servicio.ventas(inicioDiaColombia(this.desde), finDiaColombia(this.hasta)),
      ]);
      this.productos.set(productos);
      this.ventas.set(ventas);
    } catch (e) {
      this.toast.error(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se pudieron cargar las ventas.');
    }
  }

  nombre(id: number): string {
    return this.productos().find((p) => p.id === id)?.nombre ?? `Producto #${id}`;
  }
}
