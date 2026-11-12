import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import {
  ConsolaPublica,
  MINUTOS_RESERVA,
  Reserva,
  ReservasConfig,
  ReservasService,
  enlaceWhatsapp,
  finReserva,
  libreDesdeMs,
  reservaVigente,
} from '../../core/reservas.service';
import { SesionesService } from '../../core/sesiones.service';
import { ToastService } from '../../core/toast.service';
import { ZONA_HORARIA, fechaColombia, inicioDiaColombia, sumarDias } from '../../core/zona-horaria';
import { formatearDuracion } from '../../shared/duracion.pipe';
import { sonarCaja } from '../../shared/sonido-caja';

/** "YYYY-MM-DDTHH:mm" en hora de Colombia, para un input datetime-local. */
function aHoraLocal(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: ZONA_HORARIA }).slice(0, 16).replace(' ', 'T');
}

/** "YYYY-MM-DDTHH:mm" (hora de Colombia) → ms. */
function deHoraLocal(valor: string): number {
  return new Date(`${valor}:00-05:00`).getTime();
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' });
}

function dia(iso: string): string {
  const fecha = fechaColombia(iso);
  if (fecha === fechaColombia()) return 'Hoy';
  if (fecha === sumarDias(fechaColombia(), 1)) return 'Mañana';
  if (fecha === sumarDias(fechaColombia(), -1)) return 'Ayer';
  return new Date(iso).toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Módulo Reservas (admin y trabajador): enlace para compartir por WhatsApp, reservas
 * pendientes de pago (confirmar / cancelar), próximas (iniciar en la Sala) y recientes.
 * El admin sube el QR de pago y el WhatsApp del local.
 */
@Component({
  selector: 'app-reservas',
  imports: [FormsModule, DecimalPipe],
  template: `
    <section class="banner-sala p-5 mb-4">
      <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">📅 Reservas</h1>
      <p class="text-sm text-sky-100/80">Los clientes reservan su consola desde un enlace; tú confirmas el pago y la inicias al llegar.</p>
    </section>

    <!-- Enlace para compartir -->
    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 mb-4">
      <h2 class="font-semibold text-slate-900 mb-2">Enlace para tus clientes</h2>
      <div class="flex flex-wrap items-center gap-2">
        <code class="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{{ enlace }}</code>
        <button type="button" (click)="copiar()" class="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-900">Copiar</button>
        <a [href]="enlaceCompartir" target="_blank" rel="noopener"
          class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">Compartir por WhatsApp</a>
      </div>
      @if (config() && !config()!.qr_path) {
        <p class="mt-2 text-xs text-amber-700">⚠️ Falta subir el QR de pago{{ auth.isAdmin() ? ' (abajo, en Configuración)' : ' (lo sube el admin)' }}.</p>
      }
    </section>

    <!-- Reservar en el local (clientes que llegan sin avisar) -->
    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 mb-4">
      <button type="button" (click)="formLocal.set(!formLocal())" class="flex w-full items-center justify-between font-semibold text-slate-900">
        <span>➕ Reservar en el local</span>
        <span class="text-sm text-indigo-600">{{ formLocal() ? 'Cerrar' : 'Abrir' }}</span>
      </button>
      @if (formLocal()) {
        <p class="mt-1 text-xs text-slate-500">Aparta la consola para un cliente que está aquí. Queda confirmada y paga al cerrar la sesión.</p>
        <div class="mt-3 space-y-3">
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            @for (c of consolas(); track c.id) {
              <button type="button" (click)="elegirLocal(c)" [disabled]="c.fuera_servicio" [class.opacity-40]="c.fuera_servicio"
                class="rounded-lg border px-2 py-1.5 text-xs font-semibold"
                [class.bg-indigo-600]="localPuesto === c.id" [class.text-white]="localPuesto === c.id" [class.border-indigo-600]="localPuesto === c.id"
                [class.border-slate-300]="localPuesto !== c.id"
                [class.text-red-700]="localPuesto !== c.id && c.ocupada" [class.text-emerald-700]="localPuesto !== c.id && !c.ocupada">
                {{ c.nombre }}
                <span class="block text-[10px] font-normal">{{ estadoConsola(c) }}</span>
              </button>
            }
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input [(ngModel)]="localNombre" name="l-nombre" placeholder="Nombre del cliente" maxlength="60"
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <input [(ngModel)]="localTelefono" name="l-tel" type="tel" placeholder="Celular (opcional)"
              class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div class="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            @for (p of precios(); track p.minutos) {
              <button type="button" (click)="localMinutos = p.minutos"
                class="rounded-lg border py-1 text-xs font-medium"
                [class.bg-indigo-600]="localMinutos === p.minutos" [class.text-white]="localMinutos === p.minutos" [class.border-indigo-600]="localMinutos === p.minutos"
                [class.border-slate-300]="localMinutos !== p.minutos">
                {{ duracion(p.minutos) }}
                <span class="block text-[10px] opacity-75">{{ p.precio | number: '1.0-0' }}</span>
              </button>
            }
          </div>
          <label class="block text-xs font-medium text-slate-500">
            Hora de inicio
            <input type="datetime-local" [(ngModel)]="localInicio" name="l-inicio"
              class="mt-1 block w-full sm:w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800" />
          </label>
          <button type="button" (click)="reservarLocal()" [disabled]="guardandoLocal()"
            class="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {{ guardandoLocal() ? 'Reservando…' : 'Apartar consola' }}
          </button>
        </div>
      }
    </section>

    <!-- Pendientes de pago -->
    <section class="mb-4">
      <h2 class="font-semibold text-slate-900 mb-2">💳 Pendientes de pago ({{ pendientes().length }})</h2>
      <div class="space-y-2">
        @for (r of pendientes(); track r.id) {
          <article class="rounded-2xl bg-white p-4 shadow-sm ring-2"
            [class.ring-amber-300]="vigente(r)" [class.ring-slate-200]="!vigente(r)">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="font-semibold text-slate-900">#{{ r.id }} · {{ nombrePuesto(r.puesto_id) }} · {{ dia(r.inicio) }} {{ hora(r.inicio) }} – {{ hora(fin(r)) }}</p>
                <p class="text-sm text-slate-600">{{ r.cliente_nombre }} · {{ r.cliente_telefono }} · {{ duracion(r.minutos) }}</p>
                <p class="text-xs" [class.text-amber-700]="vigente(r)" [class.text-red-600]="!vigente(r)">
                  {{ vigente(r) ? 'Aparta la consola ' + minutosParaVencer(r) + ' min más' : 'Se venció el tiempo para pagar: ya no aparta la consola' }}
                </p>
              </div>
              <p class="text-xl font-bold text-slate-900 tabular-nums">{{ r.precio | number: '1.0-0' }}</p>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" (click)="confirmar(r)" [disabled]="procesando() === r.id"
                class="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">✓ Confirmar pago</button>
              @if (whatsapp(r); as wa) {
                <a [href]="wa" target="_blank" rel="noopener" class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200">WhatsApp</a>
              }
              <button type="button" (click)="abrirMover(r)" [disabled]="procesando() === r.id"
                class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 disabled:opacity-50">⇄ Mover</button>
              <button type="button" (click)="cancelar(r)" [disabled]="procesando() === r.id"
                class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 disabled:opacity-50">Cancelar</button>
            </div>
            @if (moviendo() === r.id) {
              <div class="mt-3 rounded-lg bg-slate-50 p-3 space-y-2">
                <p class="text-xs font-medium text-slate-600">Mover la reserva a (la consola {{ nombrePuesto(r.puesto_id) }} queda libre):</p>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  @for (c of consolas(); track c.id) {
                    @if (c.id !== r.puesto_id) {
                      <button type="button" (click)="elegirDestino(r, c)" [disabled]="c.fuera_servicio" [class.opacity-40]="c.fuera_servicio"
                        class="rounded-lg border px-2 py-1.5 text-xs font-semibold"
                        [class.bg-indigo-600]="destino === c.id" [class.text-white]="destino === c.id" [class.border-indigo-600]="destino === c.id"
                        [class.border-slate-300]="destino !== c.id"
                        [class.text-red-700]="destino !== c.id && c.ocupada" [class.text-emerald-700]="destino !== c.id && !c.ocupada">
                        {{ c.nombre }}
                        <span class="block text-[10px] font-normal">{{ estadoConsola(c) }}</span>
                      </button>
                    }
                  }
                </div>
                @if (r.estado === 'confirmada') {
                  <label class="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" [(ngModel)]="iniciarYa" name="iniciar-ya-{{ r.id }}" class="rounded" />
                    Empezar ahora en esa consola (abre la sesión en la Sala)
                  </label>
                }
                <div class="flex gap-2">
                  <button type="button" (click)="mover(r)" [disabled]="!destino || procesando() === r.id"
                    class="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Mover reserva</button>
                  <button type="button" (click)="moviendo.set(null)" class="rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200">Cerrar</button>
                </div>
              </div>
            }
          </article>
        } @empty {
          <p class="text-sm text-slate-500">No hay reservas esperando pago.</p>
        }
      </div>
    </section>

    <!-- Confirmadas -->
    <section class="mb-4">
      <h2 class="font-semibold text-slate-900 mb-2">✅ Confirmadas ({{ confirmadas().length }})</h2>
      <div class="space-y-2">
        @for (r of confirmadas(); track r.id) {
          <article class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-emerald-200">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="font-semibold text-slate-900">#{{ r.id }} · {{ nombrePuesto(r.puesto_id) }} · {{ dia(r.inicio) }} {{ hora(r.inicio) }} – {{ hora(fin(r)) }}</p>
                <p class="text-sm text-slate-600">
                  {{ r.cliente_nombre }}{{ r.cliente_telefono ? ' · ' + r.cliente_telefono : '' }} · {{ duracion(r.minutos) }}{{ r.origen === 'local' ? ' · 🏪 hecha en el local' : '' }}
                </p>
                @if (yaEmpezo(r)) {
                  <p class="text-xs font-semibold text-red-600">Ya es la hora: su tiempo está corriendo desde las {{ hora(r.inicio) }}.</p>
                }
              </div>
              <p class="text-xl font-bold text-emerald-700 tabular-nums">{{ r.precio | number: '1.0-0' }} <span class="text-xs font-medium">{{ r.origen === 'local' ? 'paga al cerrar' : 'pagado' }}</span></p>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" (click)="iniciar(r)" [disabled]="procesando() === r.id"
                class="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">▶ Iniciar en la Sala</button>
              @if (whatsapp(r); as wa) {
                <a [href]="wa" target="_blank" rel="noopener" class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200">WhatsApp</a>
              }
              <button type="button" (click)="abrirMover(r)" [disabled]="procesando() === r.id"
                class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 disabled:opacity-50">⇄ Mover</button>
              <button type="button" (click)="cancelar(r)" [disabled]="procesando() === r.id"
                class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 disabled:opacity-50">Cancelar</button>
            </div>
            @if (moviendo() === r.id) {
              <div class="mt-3 rounded-lg bg-slate-50 p-3 space-y-2">
                <p class="text-xs font-medium text-slate-600">Mover la reserva a (la consola {{ nombrePuesto(r.puesto_id) }} queda libre):</p>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  @for (c of consolas(); track c.id) {
                    @if (c.id !== r.puesto_id) {
                      <button type="button" (click)="elegirDestino(r, c)" [disabled]="c.fuera_servicio" [class.opacity-40]="c.fuera_servicio"
                        class="rounded-lg border px-2 py-1.5 text-xs font-semibold"
                        [class.bg-indigo-600]="destino === c.id" [class.text-white]="destino === c.id" [class.border-indigo-600]="destino === c.id"
                        [class.border-slate-300]="destino !== c.id"
                        [class.text-red-700]="destino !== c.id && c.ocupada" [class.text-emerald-700]="destino !== c.id && !c.ocupada">
                        {{ c.nombre }}
                        <span class="block text-[10px] font-normal">{{ estadoConsola(c) }}</span>
                      </button>
                    }
                  }
                </div>
                @if (r.estado === 'confirmada') {
                  <label class="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" [(ngModel)]="iniciarYa" name="iniciar-ya-{{ r.id }}" class="rounded" />
                    Empezar ahora en esa consola (abre la sesión en la Sala)
                  </label>
                }
                <div class="flex gap-2">
                  <button type="button" (click)="mover(r)" [disabled]="!destino || procesando() === r.id"
                    class="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Mover reserva</button>
                  <button type="button" (click)="moviendo.set(null)" class="rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200">Cerrar</button>
                </div>
              </div>
            }
          </article>
        } @empty {
          <p class="text-sm text-slate-500">No hay reservas confirmadas por venir.</p>
        }
      </div>
    </section>

    <!-- Recientes -->
    <section class="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <h2 class="font-semibold text-slate-900 mb-2">Últimos 7 días</h2>
      <ul class="divide-y divide-slate-100 text-sm">
        @for (r of recientes(); track r.id) {
          <li class="flex items-center justify-between gap-2 py-2" [class.opacity-60]="r.estado === 'cancelada'">
            <span>#{{ r.id }} · {{ nombrePuesto(r.puesto_id) }} · {{ dia(r.inicio) }} {{ hora(r.inicio) }} · {{ r.cliente_nombre }}</span>
            <span class="shrink-0 text-xs font-medium"
              [class.text-indigo-600]="r.estado === 'usada'" [class.text-slate-500]="r.estado !== 'usada'">
              {{ r.estado === 'usada' ? 'Usada' : r.estado === 'cancelada' ? 'Cancelada' : 'Vencida' }} · {{ r.precio | number: '1.0-0' }}
            </span>
          </li>
        } @empty {
          <li class="py-2 text-slate-500">Sin reservas.</li>
        }
      </ul>
    </section>

    <!-- Configuración (solo admin) -->
    @if (auth.isAdmin() && config()) {
      <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 space-y-3">
        <h2 class="font-semibold text-slate-900">⚙️ Configuración</h2>
        <div class="flex flex-wrap items-start gap-4">
          <div class="space-y-2">
            <p class="text-xs font-medium text-slate-500">QR de pago</p>
            @if (urlQr()) {
              <img [src]="urlQr()" alt="QR de pago" class="w-40 rounded-lg ring-1 ring-slate-200" />
            }
            <label class="inline-block cursor-pointer rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-900">
              {{ urlQr() ? 'Cambiar QR' : 'Subir QR' }}
              <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" (change)="subirQr($event)" />
            </label>
          </div>
          <div class="flex-1 min-w-[220px] space-y-3">
            <label class="block text-xs font-medium text-slate-500">
              WhatsApp del local (donde llegan los comprobantes)
              <input [(ngModel)]="whatsappLocal" name="wa-local" type="tel" placeholder="Ej. 3001234567"
                class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800" />
            </label>
            <label class="block text-xs font-medium text-slate-500">
              Minutos para pagar (después se libera la consola)
              <input [(ngModel)]="minutosPagar" name="min-pagar" type="number" min="5" max="240"
                class="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800" />
            </label>
            <button type="button" (click)="guardarConfig()" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">Guardar</button>
          </div>
        </div>
      </section>
    }
  `,
})
export class ReservasPage implements OnInit, OnDestroy {
  readonly lista = signal<Reserva[]>([]);
  readonly config = signal<ReservasConfig | null>(null);
  readonly nombres = signal<Record<number, string>>({});
  readonly procesando = signal<number | null>(null);
  /** Reserva con el panel "Mover" abierto. */
  readonly moviendo = signal<number | null>(null);
  destino: number | null = null;
  iniciarYa = false;
  private readonly ahora = signal(Date.now());
  readonly enlace = `${location.origin}/reservar`;
  readonly enlaceCompartir = `https://wa.me/?text=${encodeURIComponent(
    `¡Reserva tu consola en Alfa Games! Mira cuáles están libres y aparta la tuya aquí: ${location.origin}/reservar`,
  )}`;
  whatsappLocal = '';
  minutosPagar = 30;
  // Reservar en el local (clientes que llegan sin avisar)
  readonly formLocal = signal(false);
  readonly guardandoLocal = signal(false);
  readonly consolas = signal<ConsolaPublica[]>([]);
  readonly precios = signal(MINUTOS_RESERVA.map((minutos) => ({ minutos, precio: 0 })));
  localPuesto: number | null = null;
  localNombre = '';
  localTelefono = '';
  localMinutos = 120;
  localInicio = aHoraLocal(Date.now());

  readonly hora = hora;
  readonly dia = dia;
  readonly fin = finReserva;

  private readonly minutosParaPagar = computed(() => this.config()?.minutos_para_pagar ?? 30);
  readonly pendientes = computed(() =>
    this.lista().filter((r) => r.estado === 'pendiente' && new Date(finReserva(r)).getTime() > this.ahora()),
  );
  readonly confirmadas = computed(() =>
    this.lista().filter((r) => r.estado === 'confirmada' && new Date(finReserva(r)).getTime() > this.ahora()),
  );
  readonly recientes = computed(() =>
    this.lista()
      .filter((r) => !this.pendientes().includes(r) && !this.confirmadas().includes(r))
      .filter((r) => new Date(r.inicio).getTime() <= this.ahora())
      .reverse(),
  );
  readonly urlQr = computed(() => this.reservas.urlQr(this.config()?.qr_path ?? null));

  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly reservas: ReservasService,
    private readonly sesiones: SesionesService,
    private readonly toast: ToastService,
    readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.sesiones.listarNombresPuestos().then((m) => this.nombres.set(m)).catch(() => undefined);
    this.cargar();
    this.unsubscribe = this.reservas.onCambios(() => this.cargar());
    this.timer = setInterval(() => this.ahora.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    clearInterval(this.timer);
  }

  async cargar(): Promise<void> {
    try {
      const [lista, config, estado] = await Promise.all([
        this.reservas.listar(inicioDiaColombia(sumarDias(fechaColombia(), -7))),
        this.reservas.config(),
        this.reservas.estadoPublico(),
      ]);
      this.consolas.set(estado.consolas);
      this.precios.set(estado.precios);
      this.lista.set(lista);
      if (!this.config()) {
        this.whatsappLocal = config.whatsapp ?? '';
        this.minutosPagar = config.minutos_para_pagar;
      }
      this.config.set(config);
      this.ahora.set(Date.now());
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  nombrePuesto(id: number): string {
    return this.nombres()[id] ?? `Consola #${id}`;
  }

  duracion(min: number): string {
    return formatearDuracion(min);
  }

  vigente(r: Reserva): boolean {
    return reservaVigente(r, this.minutosParaPagar(), this.ahora());
  }

  minutosParaVencer(r: Reserva): number {
    return Math.max(1, Math.ceil((new Date(r.created_at).getTime() + this.minutosParaPagar() * 60_000 - this.ahora()) / 60_000));
  }

  yaEmpezo(r: Reserva): boolean {
    return new Date(r.inicio).getTime() <= this.ahora();
  }

  whatsapp(r: Reserva): string | null {
    return enlaceWhatsapp(r.cliente_telefono, `Hola ${r.cliente_nombre}, te escribimos de Alfa Games por tu reserva #${r.id}.`);
  }

  async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.enlace);
      this.toast.exito('Enlace copiado.');
    } catch {
      this.toast.info(this.enlace);
    }
  }

  async confirmar(r: Reserva): Promise<void> {
    await this.accion(r, () => this.reservas.confirmar(r.id), `Reserva #${r.id} confirmada.`);
  }

  async cancelar(r: Reserva): Promise<void> {
    if (!confirm(`¿Cancelar la reserva #${r.id} de ${r.cliente_nombre}? La consola queda libre en ese horario.`)) return;
    await this.accion(r, () => this.reservas.cancelar(r.id), `Reserva #${r.id} cancelada.`);
  }

  abrirMover(r: Reserva): void {
    this.destino = null;
    this.iniciarYa = false;
    this.moviendo.set(this.moviendo() === r.id ? null : r.id);
  }

  /** Si la consola destino está libre ya y la reserva está confirmada, propone empezar ahora. */
  elegirDestino(r: Reserva, c: ConsolaPublica): void {
    this.destino = c.id;
    this.iniciarYa = r.estado === "confirmada" && !c.ocupada;
  }

  async mover(r: Reserva): Promise<void> {
    const destino = this.destino;
    if (!destino) return;
    const ok = await this.accion(
      r,
      () => this.reservas.transferir(r.id, destino, this.iniciarYa),
      this.iniciarYa
        ? `Reserva #${r.id} movida a ${this.nombrePuesto(destino)} y sesión iniciada. ${this.nombrePuesto(r.puesto_id)} queda libre.`
        : `Reserva #${r.id} movida a ${this.nombrePuesto(destino)}. ${this.nombrePuesto(r.puesto_id)} queda libre.`,
    );
    if (ok) {
      this.moviendo.set(null);
      if (this.iniciarYa) sonarCaja();
    }
  }

  async iniciar(r: Reserva): Promise<void> {
    const ok = await this.accion(r, () => this.reservas.iniciar(r.id), `${this.nombrePuesto(r.puesto_id)}: sesión de ${r.cliente_nombre} iniciada en la Sala.`);
    if (ok) sonarCaja();
  }

  private async accion(r: Reserva, fn: () => Promise<void>, exito: string): Promise<boolean> {
    this.procesando.set(r.id);
    try {
      await fn();
      this.toast.exito(exito);
      await this.cargar();
      return true;
    } catch (e) {
      this.toast.error(this.mensaje(e));
      return false;
    } finally {
      this.procesando.set(null);
    }
  }

  async subirQr(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    try {
      await this.reservas.subirQr(archivo);
      this.toast.exito('QR de pago guardado.');
      this.config.set(await this.reservas.config());
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async guardarConfig(): Promise<void> {
    const minutos = Math.round(Number(this.minutosPagar));
    if (!(minutos >= 5 && minutos <= 240)) return this.toast.error('Los minutos para pagar van de 5 a 240.');
    try {
      await this.reservas.guardarConfig({ whatsapp: this.whatsappLocal.trim() || null, minutos_para_pagar: minutos });
      this.toast.exito('Configuración guardada.');
      this.config.set(await this.reservas.config());
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  /** Estado corto de la consola; la hora "libre" cuenta las reservas pegadas al fin de la sesión. */
  estadoConsola(c: ConsolaPublica): string {
    if (c.fuera_servicio) return 'fuera de servicio';
    if (c.ocupada && !c.libre_en) return 'ocupada';
    const libre = libreDesdeMs(c);
    if (libre <= Date.now() + 60_000) return 'libre';
    return (c.ocupada ? 'libre ' : 'reservada, libre ') + hora(new Date(libre).toISOString());
  }

  /** Si la consola está ocupada o reservada ya, la reserva arranca cuando termina lo último de la cadena. */
  elegirLocal(c: ConsolaPublica): void {
    this.localPuesto = c.id;
    const ahora = Date.now();
    const libre = libreDesdeMs(c, ahora);
    this.localInicio = aHoraLocal(libre > ahora + 60_000 ? Math.ceil(libre / 60_000) * 60_000 : ahora);
  }

  async reservarLocal(): Promise<void> {
    if (!this.localPuesto) return this.toast.error('Elige la consola.');
    if (this.localNombre.trim().length < 2) return this.toast.error('Escribe el nombre del cliente.');
    if (!this.localInicio) return this.toast.error('Elige la hora de inicio.');
    this.guardandoLocal.set(true);
    try {
      const r = await this.reservas.reservarLocal({
        puestoId: this.localPuesto,
        nombre: this.localNombre.trim(),
        telefono: this.localTelefono.trim() || null,
        inicio: new Date(deHoraLocal(this.localInicio)).toISOString(),
        minutos: this.localMinutos,
      });
      this.toast.exito(`${this.nombrePuesto(r.puesto_id)} apartada para ${r.cliente_nombre}: ${dia(r.inicio)} ${hora(r.inicio)} – ${hora(finReserva(r))}.`);
      this.localNombre = '';
      this.localTelefono = '';
      this.localPuesto = null;
      this.localInicio = aHoraLocal(Date.now());
      this.formLocal.set(false);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.guardandoLocal.set(false);
    }
  }

  private mensaje(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}
