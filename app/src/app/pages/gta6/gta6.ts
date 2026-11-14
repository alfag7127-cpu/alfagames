import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { Gta6Config, Gta6Service, ReservaAlquiler } from '../../core/gta6.service';
import { AlquilerTarifa } from '../../core/models';
import { Reserva, ReservasService, enlaceWhatsapp, finReserva, reservaVigente } from '../../core/reservas.service';
import { ToastService } from '../../core/toast.service';
import { formatearDuracion } from '../../shared/duracion.pipe';
import { ModoPago, PagoPotes, repartirPago } from '../../shared/pago-potes';
import { PesosDirective } from '../../shared/pesos.directive';
import { aHoraLocal, cuentaRegresiva, deHoraLocal, diaYHora, hora, mensajeError } from './gta6-util';

type Pestana = 'sala' | 'domicilio' | 'config';
type Filtro = 'proximas' | 'todas';

/**
 * Módulo GTA 6: reservas para jugar en la sala (admin y trabajador) y para alquilar la PS5 con
 * el juego a domicilio (admin y socio del alquiler), con sus enlaces públicos y su configuración.
 */
@Component({
  selector: 'app-gta6',
  imports: [FormsModule, DecimalPipe, PagoPotes, PesosDirective],
  template: `
    <section class="mb-4 rounded-2xl bg-gradient-to-br from-fuchsia-700 via-pink-600 to-orange-500 p-5 text-white shadow-lg">
      <h1 class="text-2xl font-black tracking-tight">🔥 Reservas GTA 6</h1>
      <p class="text-sm text-pink-50">
        @if (falta(); as f) {
          Faltan <b>{{ f.dias }} días {{ f.horas }} h</b> para el lanzamiento ({{ diaYHora(config()?.lanzamiento ?? '') }}).
        } @else {
          ¡Ya salió! Las reservas siguen abiertas.
        }
      </p>
      <div class="mt-3 grid grid-cols-2 gap-2 text-center" [class.sm:grid-cols-2]="true">
        @if (auth.puedeSala()) {
          <div class="rounded-xl bg-black/20 p-2">
            <p class="text-[11px] uppercase tracking-wide text-pink-100">Recaudado sala</p>
            <p class="text-xl font-black tabular-nums">{{ recaudadoSala() | number: '1.0-0' }}</p>
            <p class="text-[11px] text-pink-100">{{ confirmadasSala() }} reservas pagadas</p>
          </div>
        }
        @if (auth.puedeAlquiler()) {
          <div class="rounded-xl bg-black/20 p-2">
            <p class="text-[11px] uppercase tracking-wide text-pink-100">Recaudado domicilio</p>
            <p class="text-xl font-black tabular-nums">{{ recaudadoDomicilio() | number: '1.0-0' }}</p>
            <p class="text-[11px] text-pink-100">{{ confirmadasDomicilio() }} reservas pagadas</p>
          </div>
        }
      </div>
    </section>

    <nav class="mb-4 flex gap-2 overflow-x-auto">
      @for (p of pestanasVisibles(); track p.id) {
        <button type="button" (click)="pestana.set(p.id)"
          class="shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ring-1"
          [class.bg-slate-900]="pestana() === p.id" [class.text-white]="pestana() === p.id" [class.ring-slate-900]="pestana() === p.id"
          [class.bg-white]="pestana() !== p.id" [class.text-slate-700]="pestana() !== p.id" [class.ring-slate-200]="pestana() !== p.id">
          {{ p.texto }}
        </button>
      }
    </nav>

    @if (pestana() !== 'config') {
      <div class="mb-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <p class="text-xs font-medium text-slate-500">Enlace para compartir (WhatsApp, redes)</p>
        <div class="mt-1 flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-sm text-slate-800">{{ enlace(pestana()) }}</code>
          <button type="button" (click)="copiar(enlace(pestana()))" class="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Copiar</button>
        </div>
      </div>
      <div class="mb-3 flex gap-2 text-xs">
        @for (f of filtros; track f.id) {
          <button type="button" (click)="filtro.set(f.id)" class="rounded-full px-3 py-1 ring-1"
            [class.bg-pink-600]="filtro() === f.id" [class.text-white]="filtro() === f.id" [class.ring-pink-600]="filtro() === f.id"
            [class.bg-white]="filtro() !== f.id" [class.text-slate-600]="filtro() !== f.id" [class.ring-slate-200]="filtro() !== f.id">{{ f.texto }}</button>
        }
      </div>
    }

    <!-- ═══ SALA ═══ -->
    @if (pestana() === 'sala') {
      <div class="space-y-2">
        @for (r of listaSala(); track r.id) {
          <article class="rounded-xl bg-white p-3 shadow-sm ring-1"
            [class.ring-amber-300]="r.estado === 'pendiente'" [class.ring-emerald-300]="r.estado === 'confirmada'" [class.ring-slate-200]="r.estado !== 'pendiente' && r.estado !== 'confirmada'"
            [class.opacity-60]="r.estado === 'cancelada' || vencida(r)">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="font-semibold text-slate-900">#{{ r.id }} · {{ nombrePuesto(r.puesto_id) }} · {{ diaYHora(r.inicio) }} – {{ hora(finReserva(r)) }}</p>
                <p class="text-sm text-slate-600">{{ r.cliente_nombre }} · {{ r.cliente_telefono }} · {{ duracion(r.minutos) }}</p>
              </div>
              <div class="text-right">
                <p class="font-bold tabular-nums text-slate-900">{{ r.precio | number: '1.0-0' }}</p>
                <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" [class]="claseEstado(vencida(r) ? 'vencida' : r.estado)">{{ vencida(r) ? 'vencida sin pagar' : textoEstadoSala(r.estado) }}</span>
              </div>
            </div>
            @if (r.estado === 'pendiente' || r.estado === 'confirmada') {
              <div class="mt-2 flex flex-wrap gap-1.5">
                @if (r.estado === 'pendiente') {
                  <button type="button" (click)="confirmarSala(r)" [disabled]="ocupado()" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">✅ Confirmar pago</button>
                }
                @if (whatsapp(r.cliente_telefono, r.cliente_nombre); as w) {
                  <a [href]="w" target="_blank" rel="noopener" class="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">WhatsApp</a>
                }
                <button type="button" (click)="cancelarSala(r)" [disabled]="ocupado()" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
              </div>
              @if (r.estado === 'confirmada') {
                <p class="mt-1 text-xs text-slate-500">El día de la reserva se inicia desde Reservas o la Sala, como cualquier reserva.</p>
              }
            }
          </article>
        } @empty {
          <p class="rounded-xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">Todavía no hay reservas GTA 6 en la sala.</p>
        }
      </div>
    }

    <!-- ═══ DOMICILIO ═══ -->
    @if (pestana() === 'domicilio') {
      <div class="space-y-2">
        @for (r of listaDomicilio(); track r.id) {
          <article class="rounded-xl bg-white p-3 shadow-sm ring-1"
            [class.ring-amber-300]="r.estado === 'pendiente'" [class.ring-emerald-300]="r.estado === 'confirmada'" [class.ring-slate-200]="r.estado !== 'pendiente' && r.estado !== 'confirmada'"
            [class.opacity-60]="r.estado === 'cancelada' || vencidaDomicilio(r)">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-semibold text-slate-900">#{{ r.id }} · {{ r.plan_nombre }} · {{ r.alquiler_consolas?.nombre }}</p>
                <p class="text-sm text-slate-700">Entrega {{ diaYHora(r.inicio) }} · recoge {{ diaYHora(r.fin) }}</p>
                <p class="text-sm text-slate-600">{{ r.cliente_nombre }} · {{ r.cliente_telefono }}</p>
                <p class="text-sm text-slate-600">📍 {{ r.cliente_direccion }}</p>
              </div>
              <div class="text-right">
                <p class="font-bold tabular-nums text-slate-900">{{ r.precio | number: '1.0-0' }}</p>
                <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" [class]="claseEstado(vencidaDomicilio(r) ? 'vencida' : r.estado)">{{ vencidaDomicilio(r) ? 'vencida sin pagar' : r.estado }}</span>
              </div>
            </div>

            @if (r.estado === 'pendiente') {
              @if (confirmando() === r.id) {
                <div class="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
                  <app-pago-potes [total]="r.precio" [nombre]="'gta6-' + r.id" [(modo)]="modoPago" [(montoLlave)]="montoLlave" />
                  <div class="flex gap-2">
                    <button type="button" (click)="confirmarDomicilio(r)" [disabled]="ocupado()" class="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Confirmar pago</button>
                    <button type="button" (click)="confirmando.set(null)" class="rounded-lg bg-slate-200 px-3 text-xs">Cancelar</button>
                  </div>
                </div>
              } @else {
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" (click)="abrirConfirmar(r)" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">✅ Confirmar pago</button>
                  @if (whatsapp(r.cliente_telefono, r.cliente_nombre); as w) {
                    <a [href]="w" target="_blank" rel="noopener" class="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">WhatsApp</a>
                  }
                  <button type="button" (click)="cancelarDomicilio(r, true)" [disabled]="ocupado()" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                </div>
              }
            }

            @if (r.estado === 'confirmada') {
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <select [ngModel]="consolaEntrega()[r.id] ?? r.consola_id" (ngModelChange)="elegirConsola(r.id, $event)" [name]="'consola-' + r.id"
                  class="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  @for (c of consolasGta6(); track c.id) {
                    <option [ngValue]="c.id">{{ c.nombre }}</option>
                  }
                </select>
                <button type="button" (click)="entregar(r)" [disabled]="ocupado()" class="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50">🚚 Entregar ahora</button>
                @if (whatsapp(r.cliente_telefono, r.cliente_nombre); as w) {
                  <a [href]="w" target="_blank" rel="noopener" class="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">WhatsApp</a>
                }
                <button type="button" (click)="cancelarDomicilio(r, true)" [disabled]="ocupado()" class="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50">Cancelar y devolver</button>
                <button type="button" (click)="cancelarDomicilio(r, false)" [disabled]="ocupado()" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">No la usó (sin devolución)</button>
              </div>
              <p class="mt-1 text-xs text-slate-500">Al entregar pasa a Alquiler → Consolas como alquiler activo (el pago ya está en los potes).</p>
            }
          </article>
        } @empty {
          <p class="rounded-xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">Todavía no hay reservas de PS5 con GTA 6 a domicilio.</p>
        }
      </div>
    }

    <!-- ═══ CONFIGURACIÓN ═══ -->
    @if (pestana() === 'config') {
      <div class="space-y-4">
        @if (auth.isAdmin()) {
          <section class="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 class="font-bold text-slate-900">General</h2>
            <label class="block text-sm text-slate-700">Lanzamiento (desde cuándo se puede jugar / entregar)
              <input type="datetime-local" [(ngModel)]="cfgLanzamiento" name="cfg-lanz" class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5" />
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="block text-sm text-slate-700">Días para reservar
                <input type="number" min="1" max="120" [(ngModel)]="cfgDias" name="cfg-dias" class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5" />
              </label>
              <label class="block text-sm text-slate-700">Minutos entre alquileres
                <input type="number" min="0" max="720" [(ngModel)]="cfgMargen" name="cfg-margen" class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5" />
              </label>
            </div>
            <p class="text-xs text-slate-500">"Minutos entre alquileres": tiempo para llevar y recoger entre un cliente y otro en la misma PS5. El QR y el WhatsApp son los de Reservas → Configuración.</p>
            <button type="button" (click)="guardarGeneral()" [disabled]="ocupado()" class="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Guardar</button>
          </section>

          <section class="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 class="font-bold text-slate-900">Sala: precios GTA 6</h2>
            @for (p of preciosSala(); track p.minutos) {
              <div class="flex items-center gap-2">
                <span class="w-20 text-sm font-medium text-slate-700">{{ duracion(p.minutos) }}</span>
                <input appPesos [(ngModel)]="p.precio" [name]="'ps-' + p.minutos" class="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                <button type="button" (click)="guardarPrecioSala(p.minutos, p.precio)" class="rounded-lg bg-slate-900 px-3 py-1 text-xs text-white">Guardar</button>
                <button type="button" (click)="borrarPrecioSala(p.minutos)" class="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600">Quitar</button>
              </div>
            }
            <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
              <select [(ngModel)]="nuevoMinutos" name="nuevo-min" class="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                @for (m of opcionesMinutos; track m) { <option [ngValue]="m">{{ duracion(m) }}</option> }
              </select>
              <input appPesos [(ngModel)]="nuevoPrecio" name="nuevo-precio" placeholder="Precio" class="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              <button type="button" (click)="agregarPrecioSala()" class="rounded-lg bg-pink-600 px-3 py-1 text-xs font-semibold text-white">Agregar tiempo</button>
            </div>
          </section>

          <section class="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 class="font-bold text-slate-900">Sala: consolas con GTA 6</h2>
            @for (p of puestos(); track p.id) {
              <label class="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" [checked]="p.gta6" (change)="marcarPuesto(p.id, !p.gta6)" class="rounded" /> {{ p.nombre }}
              </label>
            }
          </section>
        }

        @if (auth.puedeAlquiler()) {
          <section class="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 class="font-bold text-slate-900">Domicilio: planes GTA 6 (PS5)</h2>
            @for (t of planes(); track t.id) {
              <div class="flex flex-wrap items-center gap-2" [class.opacity-50]="!t.activo">
                <input [(ngModel)]="t.nombre" [name]="'pn-' + t.id" class="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                <input appPesos [(ngModel)]="t.precio" [name]="'pp-' + t.id" class="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                <button type="button" (click)="guardarPlan(t)" class="rounded-lg bg-slate-900 px-3 py-1 text-xs text-white">Guardar</button>
                <button type="button" (click)="activarPlan(t, !t.activo)" class="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600">{{ t.activo ? 'Ocultar' : 'Mostrar' }}</button>
              </div>
            }
            <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
              <label class="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" [(ngModel)]="planNoche" name="plan-noche" class="rounded" /> La noche</label>
              @if (!planNoche) {
                <input type="number" min="1" [(ngModel)]="planHoras" name="plan-horas" placeholder="Horas" class="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              }
              <input appPesos [(ngModel)]="planPrecio" name="plan-precio" placeholder="Precio" class="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              <button type="button" (click)="agregarPlan()" class="rounded-lg bg-pink-600 px-3 py-1 text-xs font-semibold text-white">Agregar plan</button>
            </div>
          </section>

          <section class="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 class="font-bold text-slate-900">Domicilio: PS5 con GTA 6</h2>
            @for (c of consolasAlquiler(); track c.id) {
              <label class="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" [checked]="c.gta6" (change)="marcarConsola(c.id, !c.gta6)" class="rounded" /> {{ c.nombre }}
              </label>
            } @empty {
              <p class="text-sm text-slate-500">No hay PS5 en el inventario del alquiler.</p>
            }
            <p class="text-xs text-slate-500">Cuantas más marques, más reservas a la misma hora puedes recibir.</p>
          </section>
        }
      </div>
    }
  `,
})
export class Gta6Page implements OnInit, OnDestroy {
  readonly pestana = signal<Pestana>('sala');
  readonly filtro = signal<Filtro>('proximas');
  readonly filtros: { id: Filtro; texto: string }[] = [
    { id: 'proximas', texto: 'Por atender' },
    { id: 'todas', texto: 'Todas' },
  ];
  readonly config = signal<Gta6Config | null>(null);
  readonly reservasSala = signal<Reserva[]>([]);
  readonly reservasDomicilio = signal<ReservaAlquiler[]>([]);
  readonly puestos = signal<{ id: number; nombre: string; gta6: boolean }[]>([]);
  readonly consolasAlquiler = signal<{ id: number; nombre: string; tipo: string; gta6: boolean }[]>([]);
  readonly planes = signal<AlquilerTarifa[]>([]);
  readonly preciosSala = signal<{ minutos: number; precio: number }[]>([]);
  readonly ocupado = signal(false);
  readonly confirmando = signal<number | null>(null);
  readonly consolaEntrega = signal<Record<number, number>>({});
  private readonly ahora = signal(Date.now());
  private minutosParaPagar = 30;
  private timer?: ReturnType<typeof setInterval>;
  private desuscribir?: () => void;

  modoPago: ModoPago | null = null;
  montoLlave: number | null = null;
  cfgLanzamiento = '';
  cfgDias = 30;
  cfgMargen = 60;
  nuevoMinutos = 60;
  nuevoPrecio: number | null = null;
  readonly opcionesMinutos = [30, 60, 90, 120, 150, 180, 240, 300, 360];
  planNoche = false;
  planHoras: number | null = null;
  planPrecio: number | null = null;

  readonly hora = hora;
  readonly diaYHora = diaYHora;
  readonly finReserva = finReserva;

  readonly pestanasVisibles = computed(() =>
    [
      { id: 'sala' as Pestana, texto: '🎮 En la sala', ver: this.auth.puedeSala() },
      { id: 'domicilio' as Pestana, texto: '🏠 A domicilio', ver: this.auth.puedeAlquiler() },
      { id: 'config' as Pestana, texto: '⚙️ Configuración', ver: this.auth.isAdmin() || this.auth.puedeAlquiler() },
    ].filter((p) => p.ver),
  );
  readonly falta = computed(() => {
    const l = this.config()?.lanzamiento;
    return l ? cuentaRegresiva(l, this.ahora()) : null;
  });
  readonly pagadasSala = computed(() => this.reservasSala().filter((r) => r.estado === 'confirmada' || r.estado === 'usada'));
  readonly recaudadoSala = computed(() => this.pagadasSala().reduce((s, r) => s + r.precio, 0));
  readonly confirmadasSala = computed(() => this.pagadasSala().length);
  readonly pagadasDomicilio = computed(() => this.reservasDomicilio().filter((r) => r.estado === 'confirmada' || r.estado === 'entregada'));
  readonly recaudadoDomicilio = computed(() => this.pagadasDomicilio().reduce((s, r) => s + r.precio, 0));
  readonly confirmadasDomicilio = computed(() => this.pagadasDomicilio().length);
  readonly consolasGta6 = computed(() => this.consolasAlquiler().filter((c) => c.gta6));

  readonly listaSala = computed(() =>
    this.filtro() === 'todas'
      ? [...this.reservasSala()].reverse()
      : this.reservasSala().filter((r) => r.estado === 'confirmada' || (r.estado === 'pendiente' && !this.vencida(r))),
  );
  readonly listaDomicilio = computed(() =>
    this.filtro() === 'todas'
      ? [...this.reservasDomicilio()].reverse()
      : this.reservasDomicilio().filter((r) => r.estado === 'confirmada' || (r.estado === 'pendiente' && !this.vencidaDomicilio(r))),
  );

  constructor(
    readonly auth: AuthService,
    private readonly gta6: Gta6Service,
    private readonly reservas: ReservasService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    if (!this.auth.puedeSala()) this.pestana.set('domicilio');
    this.cargar();
    this.cargarConfig();
    this.desuscribir = this.gta6.onCambios(() => this.cargar());
    this.timer = setInterval(() => this.ahora.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    this.desuscribir?.();
    clearInterval(this.timer);
  }

  async cargar(): Promise<void> {
    try {
      const [sala, domicilio, rc] = await Promise.all([
        this.auth.puedeSala() ? this.gta6.reservasSala() : Promise.resolve([]),
        this.auth.puedeAlquiler() ? this.gta6.reservasDomicilio() : Promise.resolve([]),
        this.reservas.config(),
      ]);
      this.minutosParaPagar = rc.minutos_para_pagar;
      this.reservasSala.set(sala);
      this.reservasDomicilio.set(domicilio);
    } catch (e) {
      this.toast.error(mensajeError(e));
    }
  }

  async cargarConfig(): Promise<void> {
    try {
      const c = await this.gta6.config();
      this.config.set(c);
      this.cfgLanzamiento = aHoraLocal(new Date(c.lanzamiento).getTime());
      this.cfgDias = c.dias_maximos;
      this.cfgMargen = c.margen_minutos;
      const [puestos, precios, consolas, planes] = await Promise.all([
        this.auth.puedeSala() ? this.gta6.puestos() : Promise.resolve([]),
        this.gta6.preciosSala(),
        this.auth.puedeAlquiler() ? this.gta6.consolasAlquiler() : Promise.resolve([]),
        this.auth.puedeAlquiler() ? this.gta6.planes() : Promise.resolve([]),
      ]);
      this.puestos.set(puestos);
      this.preciosSala.set(precios);
      this.consolasAlquiler.set(consolas);
      this.planes.set(planes);
    } catch (e) {
      this.toast.error(mensajeError(e));
    }
  }

  enlace(p: Pestana): string {
    return `${location.origin}/${p === 'domicilio' ? 'gta6-domicilio' : 'gta6-sala'}`;
  }

  async copiar(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.toast.exito('Enlace copiado.');
    } catch {
      this.toast.info(texto);
    }
  }

  duracion(min: number): string {
    return formatearDuracion(min);
  }

  nombrePuesto(id: number): string {
    return this.puestos().find((p) => p.id === id)?.nombre ?? `Consola ${id}`;
  }

  vencida(r: Reserva): boolean {
    return r.estado === 'pendiente' && !reservaVigente(r, this.minutosParaPagar, this.ahora());
  }

  vencidaDomicilio(r: ReservaAlquiler): boolean {
    return r.estado === 'pendiente' && new Date(r.created_at).getTime() <= this.ahora() - this.minutosParaPagar * 60_000;
  }

  textoEstadoSala(e: string): string {
    return e === 'usada' ? 'ya jugó' : e;
  }

  claseEstado(e: string): string {
    if (e === 'pendiente') return 'bg-amber-100 text-amber-800';
    if (e === 'confirmada') return 'bg-emerald-100 text-emerald-800';
    if (e === 'usada' || e === 'entregada') return 'bg-sky-100 text-sky-800';
    return 'bg-slate-100 text-slate-600';
  }

  whatsapp(tel: string | null, nombre: string): string | null {
    return enlaceWhatsapp(tel, `Hola ${nombre}, te escribimos de Alfa Games por tu reserva de GTA 6.`);
  }

  private async accion(fn: () => Promise<void>, ok: string): Promise<boolean> {
    this.ocupado.set(true);
    try {
      await fn();
      this.toast.exito(ok);
      await this.cargar();
      return true;
    } catch (e) {
      this.toast.error(mensajeError(e));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  // ── Sala ──

  confirmarSala(r: Reserva): void {
    this.accion(() => this.reservas.confirmar(r.id), `Reserva #${r.id} confirmada.`);
  }

  cancelarSala(r: Reserva): void {
    const aviso = r.estado === 'confirmada' ? '\nYa pagó: la devolución del dinero se hace por fuera de la app.' : '';
    if (!confirm(`¿Cancelar la reserva GTA 6 #${r.id} de ${r.cliente_nombre}?${aviso}`)) return;
    this.accion(() => this.reservas.cancelar(r.id), `Reserva #${r.id} cancelada.`);
  }

  // ── Domicilio ──

  abrirConfirmar(r: ReservaAlquiler): void {
    this.modoPago = null;
    this.montoLlave = null;
    this.confirmando.set(r.id);
  }

  async confirmarDomicilio(r: ReservaAlquiler): Promise<void> {
    const reparto = repartirPago(r.precio, this.modoPago, this.montoLlave);
    if (!reparto) {
      this.toast.error('Indica en qué pote entró el dinero (Llave, Efectivo o Mixto).');
      return;
    }
    const ok = await this.accion(
      () => this.gta6.confirmarDomicilio(r.id, reparto.llave, reparto.efectivo),
      `Reserva #${r.id} confirmada: ${r.precio.toLocaleString('es-CO')} entraron a los potes.`,
    );
    if (ok) this.confirmando.set(null);
  }

  elegirConsola(reservaId: number, consolaId: number): void {
    this.consolaEntrega.update((m) => ({ ...m, [reservaId]: consolaId }));
  }

  entregar(r: ReservaAlquiler): void {
    const consola = this.consolaEntrega()[r.id] ?? r.consola_id;
    if (!confirm(`¿Entregar ahora la PS5 a ${r.cliente_nombre}? El tiempo del plan empieza ya.`)) return;
    this.accion(() => this.gta6.entregar(r.id, consola), `Entregada: ya aparece en Alquiler → Consolas.`);
  }

  cancelarDomicilio(r: ReservaAlquiler, devolver: boolean): void {
    const texto =
      r.estado === 'pendiente'
        ? `¿Cancelar la reserva #${r.id} de ${r.cliente_nombre}?`
        : devolver
          ? `¿Cancelar la reserva #${r.id} y DEVOLVER ${r.precio.toLocaleString('es-CO')} a ${r.cliente_nombre}?\nEl dinero sale de los potes.`
          : `¿${r.cliente_nombre} no usó la reserva #${r.id}?\nEl dinero se queda (cuenta como alquiler cobrado) y la PS5 queda libre.`;
    if (!confirm(texto)) return;
    this.accion(() => this.gta6.cancelarDomicilio(r.id, devolver), `Reserva #${r.id} cancelada.`);
  }

  // ── Configuración ──

  private async guardar(fn: () => Promise<void>, ok: string): Promise<void> {
    this.ocupado.set(true);
    try {
      await fn();
      this.toast.exito(ok);
      await this.cargarConfig();
    } catch (e) {
      this.toast.error(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  guardarGeneral(): void {
    if (!this.cfgLanzamiento) return;
    this.guardar(
      () =>
        this.gta6.guardarConfig({
          lanzamiento: new Date(deHoraLocal(this.cfgLanzamiento)).toISOString(),
          dias_maximos: this.cfgDias,
          margen_minutos: this.cfgMargen,
        }),
      'Configuración guardada.',
    );
  }

  guardarPrecioSala(minutos: number, precio: number): void {
    if (!precio || precio <= 0) return this.toast.error('Escribe un precio mayor a 0.');
    this.guardar(() => this.gta6.guardarPrecioSala(minutos, precio), `Precio de ${formatearDuracion(minutos)} guardado.`);
  }

  agregarPrecioSala(): void {
    if (!this.nuevoPrecio || this.nuevoPrecio <= 0) return this.toast.error('Escribe el precio.');
    const precio = this.nuevoPrecio;
    this.nuevoPrecio = null;
    this.guardarPrecioSala(this.nuevoMinutos, precio);
  }

  borrarPrecioSala(minutos: number): void {
    if (!confirm(`¿Quitar ${formatearDuracion(minutos)} de los tiempos GTA 6?`)) return;
    this.guardar(() => this.gta6.borrarPrecioSala(minutos), 'Tiempo quitado.');
  }

  marcarPuesto(id: number, gta6: boolean): void {
    this.guardar(() => this.gta6.marcarPuesto(id, gta6), gta6 ? 'Consola marcada con GTA 6.' : 'Consola sin GTA 6.');
  }

  marcarConsola(id: number, gta6: boolean): void {
    this.guardar(() => this.gta6.marcarConsola(id, gta6), gta6 ? 'PS5 marcada con GTA 6.' : 'PS5 sin GTA 6.');
  }

  guardarPlan(t: AlquilerTarifa): void {
    if (!t.nombre.trim() || !t.precio || t.precio <= 0) return this.toast.error('Escribe nombre y precio.');
    this.guardar(() => this.gta6.actualizarPlan(t.id, { nombre: t.nombre.trim(), precio: t.precio }), 'Plan guardado.');
  }

  activarPlan(t: AlquilerTarifa, activo: boolean): void {
    this.guardar(() => this.gta6.actualizarPlan(t.id, { activo }), activo ? 'Plan visible.' : 'Plan oculto.');
  }

  agregarPlan(): void {
    if (!this.planPrecio || this.planPrecio <= 0) return this.toast.error('Escribe el precio.');
    if (!this.planNoche && (!this.planHoras || this.planHoras <= 0)) return this.toast.error('Escribe las horas del plan.');
    const nombre = this.planNoche ? 'GTA 6 · La noche' : `GTA 6 · ${this.planHoras} horas`;
    const p = { nombre, horas: this.planNoche ? null : this.planHoras, es_noche: this.planNoche, precio: this.planPrecio };
    this.planPrecio = null;
    this.planHoras = null;
    this.guardar(() => this.gta6.crearPlan(p), 'Plan agregado.');
  }
}
