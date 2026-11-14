import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlquilerService } from '../../core/alquiler.service';
import { ReservaAlquiler } from '../../core/gta6.service';
import { ConsolaConEstado } from '../../core/models';
import { ReservasAlquilerService } from '../../core/reservas-alquiler.service';
import { ReservasService, enlaceWhatsapp } from '../../core/reservas.service';
import { ToastService } from '../../core/toast.service';
import { ModoPago, PagoPotes, repartirPago } from '../../shared/pago-potes';
import { diaYHora, mensajeError } from '../gta6/gta6-util';

type Filtro = 'atender' | 'todas';

/**
 * Pestaña Reservas del alquiler: reservas de PS4/PS5 a domicilio hechas desde /alquilar.
 * QR: se confirma el pago (entra a los potes) y luego se entrega.
 * Efectivo: se confirma la reserva y se cobra al entregar.
 */
@Component({
  selector: 'app-reservas-alquiler',
  imports: [FormsModule, DecimalPipe, PagoPotes],
  template: `
    <div class="mb-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p class="text-xs font-medium text-slate-500">Enlace para que los clientes reserven su PS4 o PS5 (WhatsApp, redes)</p>
      <div class="mt-1 flex items-center gap-2">
        <code class="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-sm text-slate-800">{{ enlace }}</code>
        <button type="button" (click)="copiar()" class="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Copiar</button>
      </div>
    </div>

    <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
      @for (f of filtros; track f.id) {
        <button type="button" (click)="filtro.set(f.id)" class="rounded-full px-3 py-1 ring-1"
          [class.bg-lime-600]="filtro() === f.id" [class.text-white]="filtro() === f.id" [class.ring-lime-600]="filtro() === f.id"
          [class.bg-white]="filtro() !== f.id" [class.text-slate-600]="filtro() !== f.id" [class.ring-slate-200]="filtro() !== f.id">{{ f.texto }}</button>
      }
      @if (porConfirmar() > 0) {
        <span class="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">{{ porConfirmar() }} por confirmar</span>
      }
    </div>

    <div class="space-y-2">
      @for (r of lista(); track r.id) {
        <article class="rounded-xl bg-white p-3 shadow-sm ring-1"
          [class.ring-amber-300]="r.estado === 'pendiente'" [class.ring-emerald-300]="r.estado === 'confirmada'" [class.ring-slate-200]="r.estado !== 'pendiente' && r.estado !== 'confirmada'"
          [class.opacity-60]="r.estado === 'cancelada' || vencida(r)">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="font-semibold text-slate-900">#{{ r.id }} · {{ r.alquiler_consolas?.tipo }} · {{ r.plan_nombre }} · {{ r.alquiler_consolas?.nombre }}</p>
              <p class="text-sm text-slate-700">Entrega {{ diaYHora(r.inicio) }} · recoge {{ diaYHora(r.fin) }}</p>
              <p class="text-sm text-slate-600">{{ r.cliente_nombre }} · {{ r.cliente_telefono }}</p>
              <p class="text-sm text-slate-600">📍 {{ r.cliente_direccion }}</p>
            </div>
            <div class="text-right">
              <p class="font-bold tabular-nums text-slate-900">{{ r.precio | number: '1.0-0' }}</p>
              <p class="text-[11px] font-semibold" [class.text-fuchsia-700]="r.forma_pago === 'qr'" [class.text-emerald-700]="r.forma_pago === 'efectivo'">
                {{ r.forma_pago === 'qr' ? '📱 Paga con QR' : '💵 Efectivo al recibir' }}
              </p>
              <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" [class]="claseEstado(r)">{{ textoEstado(r) }}</span>
            </div>
          </div>

          @if (r.estado === 'pendiente') {
            @if (abierta() === r.id && r.forma_pago === 'qr') {
              <div class="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
                <app-pago-potes [total]="r.precio" [nombre]="'res-' + r.id" [(modo)]="modoPago" [(montoLlave)]="montoLlave" />
                <div class="flex gap-2">
                  <button type="button" (click)="confirmar(r)" [disabled]="ocupado()" class="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Confirmar pago</button>
                  <button type="button" (click)="abierta.set(null)" class="rounded-lg bg-slate-200 px-3 text-xs">Cancelar</button>
                </div>
              </div>
            } @else {
              <div class="mt-2 flex flex-wrap gap-1.5">
                <button type="button" (click)="r.forma_pago === 'qr' ? abrir(r) : confirmar(r)" [disabled]="ocupado()"
                  class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  ✅ {{ r.forma_pago === 'qr' ? 'Confirmar pago' : 'Confirmar reserva' }}
                </button>
                @if (whatsapp(r); as w) {
                  <a [href]="w" target="_blank" rel="noopener" class="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">WhatsApp</a>
                }
                <button type="button" (click)="cancelar(r, true)" [disabled]="ocupado()" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
              </div>
            }
          }

          @if (r.estado === 'confirmada') {
            @if (abierta() === r.id) {
              <div class="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
                <label class="block text-xs text-slate-600">Consola que se entrega
                  <select [ngModel]="consolaEntrega()[r.id] ?? r.consola_id" (ngModelChange)="elegirConsola(r.id, $event)" [name]="'consola-' + r.id"
                    class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    @for (c of consolasTipo(r); track c.id) {
                      <option [ngValue]="c.id" [disabled]="!!c.alquiler_id">{{ c.nombre }}{{ c.alquiler_id ? ' (alquilada)' : '' }}</option>
                    }
                  </select>
                </label>
                @if (!r.alquiler_id) {
                  <app-pago-potes [total]="r.precio" [nombre]="'ent-' + r.id" [(modo)]="modoPago" [(montoLlave)]="montoLlave" />
                } @else {
                  <p class="text-xs text-emerald-700">Ya pagó con QR: no se cobra al entregar.</p>
                }
                <div class="flex gap-2">
                  <button type="button" (click)="entregar(r)" [disabled]="ocupado()" class="flex-1 rounded-lg bg-sky-600 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50">🚚 Entregar ahora</button>
                  <button type="button" (click)="abierta.set(null)" class="rounded-lg bg-slate-200 px-3 text-xs">Cancelar</button>
                </div>
              </div>
            } @else {
              <div class="mt-2 flex flex-wrap gap-1.5">
                <button type="button" (click)="abrir(r, 'efectivo')" class="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">🚚 Entregar</button>
                @if (whatsapp(r); as w) {
                  <a [href]="w" target="_blank" rel="noopener" class="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">WhatsApp</a>
                }
                @if (r.alquiler_id) {
                  <button type="button" (click)="cancelar(r, true)" [disabled]="ocupado()" class="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50">Cancelar y devolver</button>
                  <button type="button" (click)="cancelar(r, false)" [disabled]="ocupado()" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">No la usó (sin devolución)</button>
                } @else {
                  <button type="button" (click)="cancelar(r, true)" [disabled]="ocupado()" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                }
              </div>
            }
          }
        </article>
      } @empty {
        <p class="rounded-xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">
          {{ filtro() === 'atender' ? 'No hay reservas por atender.' : 'Todavía no hay reservas.' }}
        </p>
      }
    </div>
  `,
})
export class ReservasAlquilerTab implements OnInit, OnDestroy {
  readonly reservas = signal<ReservaAlquiler[]>([]);
  readonly consolas = signal<ConsolaConEstado[]>([]);
  readonly filtro = signal<Filtro>('atender');
  readonly filtros: { id: Filtro; texto: string }[] = [
    { id: 'atender', texto: 'Por atender' },
    { id: 'todas', texto: 'Todas' },
  ];
  readonly abierta = signal<number | null>(null);
  readonly consolaEntrega = signal<Record<number, number>>({});
  readonly ocupado = signal(false);
  private readonly ahora = signal(Date.now());
  private minutosParaPagar = 30;
  private timer?: ReturnType<typeof setInterval>;
  private desuscribir?: () => void;
  modoPago: ModoPago | null = null;
  montoLlave: number | null = null;
  readonly enlace = `${location.origin}/alquilar`;
  readonly diaYHora = diaYHora;

  /** Consolas activas del mismo tipo que la reservada (PS4 o PS5). */
  consolasTipo(r: ReservaAlquiler): ConsolaConEstado[] {
    const tipo = r.alquiler_consolas?.tipo ?? this.consolas().find((c) => c.id === r.consola_id)?.tipo ?? 'PS4';
    return this.consolas().filter((c) => c.tipo === tipo && c.activo);
  }
  readonly porConfirmar = computed(() => this.reservas().filter((r) => r.estado === 'pendiente' && !this.vencida(r)).length);
  readonly lista = computed(() =>
    this.filtro() === 'todas'
      ? [...this.reservas()].reverse()
      : this.reservas().filter((r) => r.estado === 'confirmada' || (r.estado === 'pendiente' && !this.vencida(r))),
  );

  constructor(
    private readonly servicio: ReservasAlquilerService,
    private readonly alquiler: AlquilerService,
    private readonly reservasSala: ReservasService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.desuscribir = this.servicio.onCambios(() => this.cargar());
    this.timer = setInterval(() => this.ahora.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    this.desuscribir?.();
    clearInterval(this.timer);
  }

  async cargar(): Promise<void> {
    try {
      const [lista, consolas, cfg] = await Promise.all([
        this.servicio.listar(),
        this.alquiler.listarConsolasConEstado(),
        this.reservasSala.config(),
      ]);
      this.minutosParaPagar = cfg.minutos_para_pagar;
      this.reservas.set(lista);
      this.consolas.set(consolas);
    } catch (e) {
      this.toast.error(mensajeError(e));
    }
  }

  async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.enlace);
      this.toast.exito('Enlace copiado.');
    } catch {
      this.toast.info(this.enlace);
    }
  }

  vencida(r: ReservaAlquiler): boolean {
    return r.estado === 'pendiente' && new Date(r.created_at).getTime() <= this.ahora() - this.minutosParaPagar * 60_000;
  }

  textoEstado(r: ReservaAlquiler): string {
    if (this.vencida(r)) return r.forma_pago === 'qr' ? 'vencida sin pagar' : 'vencida sin confirmar';
    if (r.estado === 'pendiente') return r.forma_pago === 'qr' ? 'falta verificar pago' : 'falta confirmar';
    if (r.estado === 'confirmada') return r.alquiler_id ? 'pagada · por entregar' : 'confirmada · cobrar al entregar';
    return r.estado;
  }

  claseEstado(r: ReservaAlquiler): string {
    if (r.estado === 'pendiente' && !this.vencida(r)) return 'bg-amber-100 text-amber-800';
    if (r.estado === 'confirmada') return 'bg-emerald-100 text-emerald-800';
    if (r.estado === 'entregada') return 'bg-sky-100 text-sky-800';
    return 'bg-slate-100 text-slate-600';
  }

  whatsapp(r: ReservaAlquiler): string | null {
    return enlaceWhatsapp(r.cliente_telefono, `Hola ${r.cliente_nombre}, te escribimos de Alfa Games por tu reserva #${r.id} de ${r.alquiler_consolas?.tipo ?? 'consola'} a domicilio.`);
  }

  abrir(r: ReservaAlquiler, modo: ModoPago | null = null): void {
    this.modoPago = modo;
    this.montoLlave = null;
    this.abierta.set(r.id);
  }

  elegirConsola(reservaId: number, consolaId: number): void {
    this.consolaEntrega.update((m) => ({ ...m, [reservaId]: consolaId }));
  }

  private async accion(fn: () => Promise<void>, ok: string): Promise<void> {
    this.ocupado.set(true);
    try {
      await fn();
      this.toast.exito(ok);
      this.abierta.set(null);
      await this.cargar();
    } catch (e) {
      this.toast.error(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  confirmar(r: ReservaAlquiler): void {
    if (r.forma_pago === 'efectivo') {
      if (!confirm(`¿Confirmar la reserva #${r.id} de ${r.cliente_nombre}? Paga ${r.precio.toLocaleString('es-CO')} en efectivo al recibir.`)) return;
      this.accion(() => this.servicio.confirmar(r.id, null, null), `Reserva #${r.id} confirmada.`);
      return;
    }
    const reparto = repartirPago(r.precio, this.modoPago, this.montoLlave);
    if (!reparto) {
      this.toast.error('Indica en qué pote entró el dinero (Llave, Efectivo o Mixto).');
      return;
    }
    this.accion(
      () => this.servicio.confirmar(r.id, reparto.llave, reparto.efectivo),
      `Pago de la reserva #${r.id} confirmado: ${r.precio.toLocaleString('es-CO')} entraron a los potes.`,
    );
  }

  entregar(r: ReservaAlquiler): void {
    const consola = this.consolaEntrega()[r.id] ?? r.consola_id;
    let llave: number | null = null;
    let efectivo: number | null = null;
    if (!r.alquiler_id) {
      const reparto = repartirPago(r.precio, this.modoPago, this.montoLlave);
      if (!reparto) {
        this.toast.error('Indica cómo pagó al recibir (Llave, Efectivo o Mixto).');
        return;
      }
      llave = reparto.llave;
      efectivo = reparto.efectivo;
    }
    this.accion(
      () => this.servicio.entregar(r.id, consola, llave, efectivo),
      `Reserva #${r.id} entregada: ya aparece en Consolas como alquiler activo.`,
    );
  }

  cancelar(r: ReservaAlquiler, devolver: boolean): void {
    const texto = !r.alquiler_id
      ? `¿Cancelar la reserva #${r.id} de ${r.cliente_nombre}?`
      : devolver
        ? `¿Cancelar la reserva #${r.id} y DEVOLVER ${r.precio.toLocaleString('es-CO')} a ${r.cliente_nombre}?\nEl dinero sale de los potes.`
        : `¿${r.cliente_nombre} no usó la reserva #${r.id}?\nEl dinero se queda (cuenta como alquiler cobrado) y la consola queda libre.`;
    if (!confirm(texto)) return;
    this.accion(() => this.servicio.cancelar(r.id, devolver), `Reserva #${r.id} cancelada.`);
  }
}
