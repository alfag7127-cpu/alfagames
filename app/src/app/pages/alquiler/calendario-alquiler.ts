import { DecimalPipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, computed, effect, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlquilerService } from '../../core/alquiler.service';
import { ReservaAlquiler } from '../../core/gta6.service';
import { Alquiler, ConsolaConEstado } from '../../core/models';
import { ZONA_HORARIA, fechaColombia, finDiaColombia, inicioDiaColombia, sumarDias } from '../../core/zona-horaria';
import { enlaceWhatsapp } from '../../core/reservas.service';

/** Alto de una hora en el calendario (px). */
const PX_HORA = 56;

type TipoEvento = 'activo' | 'devuelto' | 'confirmada' | 'pendiente';

/** Un bloque del calendario: un alquiler o una reserva a domicilio en una consola. */
export interface EventoCalendario {
  clave: string;
  consolaId: number;
  tipo: TipoEvento;
  gta6: boolean;
  inicio: number;
  fin: number;
  cliente: string;
  telefono: string | null;
  direccion: string | null;
  plan: string;
  precio: number | null;
}

/** Bloque ya ubicado dentro del día (top y alto en px). */
interface Bloque extends EventoCalendario {
  top: number;
  alto: number;
  empiezaAntes: boolean;
  terminaDespues: boolean;
}

function hora(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' });
}

/** Junta alquileres (activos y devueltos) y reservas (pendientes y confirmadas sin entregar). */
export function eventosCalendario(alquileres: Alquiler[], reservas: ReservaAlquiler[]): EventoCalendario[] {
  const eventos: EventoCalendario[] = [];
  for (const a of alquileres) {
    if (a.estado !== 'activo' && a.estado !== 'devuelto') continue;
    const fin = a.estado === 'devuelto' && a.devuelto_en ? a.devuelto_en : a.fin_pactado;
    eventos.push({
      clave: `a-${a.id}`,
      consolaId: a.consola_id,
      tipo: a.estado,
      gta6: false,
      inicio: new Date(a.inicio).getTime(),
      fin: new Date(fin).getTime(),
      cliente: a.cliente_nombre,
      telefono: a.cliente_telefono,
      direccion: a.cliente_direccion,
      plan: a.plan_nombre,
      precio: a.precio_total,
    });
  }
  for (const r of reservas) {
    if (r.estado !== 'pendiente' && r.estado !== 'confirmada') continue;
    eventos.push({
      clave: `r-${r.id}`,
      consolaId: r.consola_id,
      tipo: r.estado,
      gta6: r.juego === 'gta6',
      inicio: new Date(r.inicio).getTime(),
      fin: new Date(r.fin).getTime(),
      cliente: r.cliente_nombre,
      telefono: r.cliente_telefono,
      direccion: r.cliente_direccion,
      plan: r.plan_nombre,
      precio: r.precio,
    });
  }
  return eventos;
}

/**
 * Calendario del día tipo Teams/Meet: una columna por consola y las horas hacia abajo.
 * Cada alquiler o reserva a domicilio es un bloque desde la entrega hasta la recogida.
 */
@Component({
  selector: 'app-calendario-alquiler',
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <!-- Barra: día -->
      <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <button type="button" (click)="irA(fechaColombia())" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Hoy</button>
        <button type="button" (click)="mover(-1)" class="rounded-lg px-2 py-1.5 text-lg leading-none text-slate-600 hover:bg-slate-100" aria-label="Día anterior">‹</button>
        <button type="button" (click)="mover(1)" class="rounded-lg px-2 py-1.5 text-lg leading-none text-slate-600 hover:bg-slate-100" aria-label="Día siguiente">›</button>
        <h3 class="text-base font-bold capitalize text-slate-900">{{ titulo() }}</h3>
        <input type="date" [ngModel]="dia()" (ngModelChange)="irA($event)" name="dia-calendario"
          class="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-700" />
      </div>

      <!-- Leyenda -->
      <div class="flex flex-wrap gap-3 px-3 pt-2 text-[11px] text-slate-600">
        <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-sky-500"></span>Alquilada ahora</span>
        <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>Reserva confirmada</span>
        <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-amber-400"></span>Reserva por confirmar</span>
        <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-slate-400"></span>Ya devuelta</span>
        <span class="flex items-center gap-1"><span class="rounded bg-fuchsia-600 px-1 text-[9px] font-black text-white">GTA 6</span>con GTA 6</span>
      </div>

      <!-- Detalle del bloque elegido -->
      @if (elegido(); as e) {
        <div class="mx-3 mt-2 rounded-xl p-3 text-sm ring-1" [class]="claseDetalle(e)">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="font-bold text-slate-900">
                @if (e.gta6) { <span class="mr-1 rounded bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-black text-white">GTA 6</span> }
                {{ nombreConsola(e.consolaId) }} · {{ e.cliente }}
              </p>
              <p class="text-slate-700">{{ textoTipo(e.tipo) }} · {{ e.plan }}</p>
              <p class="text-slate-700">Entrega {{ diaHora(e.inicio) }} → recoge {{ diaHora(e.fin) }}</p>
              @if (e.direccion) { <p class="text-slate-600">📍 {{ e.direccion }}</p> }
              @if (e.precio != null) { <p class="font-semibold text-slate-900">{{ e.precio | number: '1.0-0' }} COP</p> }
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1">
              <button type="button" (click)="elegido.set(null)" class="rounded-lg px-2 text-lg leading-none text-slate-500 hover:bg-white/60" aria-label="Cerrar">×</button>
              @if (whatsapp(e); as w) {
                <a [href]="w" target="_blank" rel="noopener" class="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">WhatsApp</a>
              }
            </div>
          </div>
        </div>
      }

      <!-- Rejilla: horas x consolas -->
      <div #scroll class="mt-2 max-h-[70vh] overflow-auto">
        <div class="relative" [style.min-width.px]="56 + columnas().length * 132">
          <!-- Encabezado de consolas (fijo arriba) -->
          <div class="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
            <div class="sticky left-0 z-30 w-14 shrink-0 bg-white"></div>
            @for (c of columnas(); track c.id) {
              <div class="min-w-[132px] flex-1 border-l border-slate-200 px-2 py-2 text-center">
                <p class="truncate text-sm font-bold text-slate-900">{{ c.nombre }}</p>
                <p class="text-[11px] text-slate-500">{{ c.tipo }}{{ c.alquiler_id ? ' · alquilada' : '' }}</p>
              </div>
            }
          </div>

          <div class="relative flex" [style.height.px]="24 * pxHora">
            <!-- Horas -->
            <div class="sticky left-0 z-10 w-14 shrink-0 bg-white">
              @for (h of horas; track h) {
                <div class="relative border-t border-transparent text-right" [style.height.px]="pxHora">
                  <span class="absolute -top-2 right-1.5 text-[10px] text-slate-400">{{ etiquetaHora(h) }}</span>
                </div>
              }
            </div>

            <!-- Columnas -->
            @for (c of columnas(); track c.id) {
              <div class="relative min-w-[132px] flex-1 border-l border-slate-200">
                @for (h of horas; track h) {
                  <div class="border-t border-slate-100" [style.height.px]="pxHora"></div>
                }
                @for (b of bloquesDe(c.id); track b.clave) {
                  <button type="button" (click)="elegido.set(b)"
                    class="absolute left-1 right-1 overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md"
                    [class]="claseBloque(b)"
                    [style.top.px]="b.top" [style.height.px]="b.alto"
                    [title]="b.cliente + ' · ' + hora(b.inicio) + ' – ' + hora(b.fin)">
                    <p class="truncate font-bold">
                      @if (b.gta6) { <span class="rounded bg-fuchsia-600 px-1 text-[9px] font-black text-white">GTA 6</span> }
                      {{ b.cliente }}
                    </p>
                    <p class="truncate opacity-80">{{ b.empiezaAntes ? '↑ ' : '' }}{{ hora(b.inicio) }} – {{ hora(b.fin) }}{{ b.terminaDespues ? ' ↓' : '' }}</p>
                    @if (b.alto > 44) { <p class="truncate opacity-70">{{ b.plan }}</p> }
                  </button>
                }
              </div>
            }

            <!-- Línea de "ahora" -->
            @if (lineaAhora() !== null) {
              <div class="pointer-events-none absolute left-14 right-0 z-10" [style.top.px]="lineaAhora()">
                <div class="relative h-0.5 bg-red-500">
                  <span class="absolute -left-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-red-500"></span>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      @if (!columnas().length) {
        <p class="p-4 text-sm text-slate-500">No hay consolas de alquiler activas.</p>
      } @else if (!bloques().length) {
        <p class="border-t border-slate-100 p-3 text-center text-sm text-slate-500">Sin alquileres ni reservas este día.</p>
      }
    </div>
  `,
})
export class CalendarioAlquiler implements OnInit, AfterViewInit, OnDestroy {
  readonly consolas = input.required<ConsolaConEstado[]>();
  readonly reservas = input.required<ReservaAlquiler[]>();

  readonly pxHora = PX_HORA;
  readonly horas = Array.from({ length: 24 }, (_, i) => i);
  readonly dia = signal(fechaColombia());
  readonly alquileres = signal<Alquiler[]>([]);
  readonly elegido = signal<EventoCalendario | null>(null);
  private readonly ahora = signal(Date.now());
  private readonly scroll = viewChild<ElementRef<HTMLDivElement>>('scroll');
  private timer?: ReturnType<typeof setInterval>;
  readonly hora = hora;
  readonly fechaColombia = fechaColombia;

  readonly columnas = computed(() =>
    this.consolas()
      .filter((c) => c.activo)
      .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true })),
  );
  private readonly inicioDia = computed(() => new Date(inicioDiaColombia(this.dia())).getTime());
  private readonly finDia = computed(() => this.inicioDia() + 24 * 3_600_000);

  readonly bloques = computed<Bloque[]>(() => {
    const desde = this.inicioDia();
    const hasta = this.finDia();
    return eventosCalendario(this.alquileres(), this.reservas())
      .filter((e) => e.inicio < hasta && e.fin > desde)
      .map((e) => {
        const ini = Math.max(e.inicio, desde);
        const fin = Math.min(e.fin, hasta);
        return {
          ...e,
          top: ((ini - desde) / 3_600_000) * PX_HORA,
          alto: Math.max(24, ((fin - ini) / 3_600_000) * PX_HORA - 2),
          empiezaAntes: e.inicio < desde,
          terminaDespues: e.fin > hasta,
        };
      });
  });

  readonly titulo = computed(() =>
    new Date(`${this.dia()}T12:00:00-05:00`).toLocaleDateString('es-CO', {
      timeZone: ZONA_HORARIA,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );

  readonly lineaAhora = computed(() => {
    const t = this.ahora();
    return t >= this.inicioDia() && t < this.finDia() ? ((t - this.inicioDia()) / 3_600_000) * PX_HORA : null;
  });

  constructor(private readonly alquiler: AlquilerService) {
    // Recarga los alquileres al cambiar de día.
    effect(() => {
      this.dia();
      this.cargar();
    });
  }

  ngOnInit(): void {
    this.timer = setInterval(() => this.ahora.set(Date.now()), 60_000);
  }

  ngAfterViewInit(): void {
    this.irAHoraActual();
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  /** Alquileres que tocan el día: los que empezaron hasta 3 días antes (cubre 24 h y la noche). */
  async cargar(): Promise<void> {
    const dia = this.dia();
    try {
      const lista = await this.alquiler.historial(inicioDiaColombia(sumarDias(dia, -3)), finDiaColombia(dia));
      if (dia === this.dia()) this.alquileres.set(lista);
    } catch {
      /* sin conexión: se intenta en la próxima actualización */
    }
  }

  irA(fecha: string): void {
    if (!fecha) return;
    this.elegido.set(null);
    this.dia.set(fecha);
    if (fecha === fechaColombia()) setTimeout(() => this.irAHoraActual());
  }

  mover(dias: number): void {
    this.irA(sumarDias(this.dia(), dias));
  }

  /** Deja a la vista una hora antes de la actual. */
  private irAHoraActual(): void {
    const el = this.scroll()?.nativeElement;
    const linea = this.lineaAhora();
    if (el && linea !== null) el.scrollTop = Math.max(0, linea - PX_HORA);
  }

  bloquesDe(consolaId: number): Bloque[] {
    return this.bloques().filter((b) => b.consolaId === consolaId);
  }

  nombreConsola(id: number): string {
    return this.consolas().find((c) => c.id === id)?.nombre ?? `Consola #${id}`;
  }

  etiquetaHora(h: number): string {
    if (h === 0) return '';
    const sufijo = h < 12 ? 'a. m.' : 'p. m.';
    return `${h % 12 === 0 ? 12 : h % 12} ${sufijo}`;
  }

  diaHora(ms: number): string {
    const d = new Date(ms);
    const fecha = d.toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, weekday: 'short', day: 'numeric', month: 'short' });
    return `${fecha} ${hora(ms)}`;
  }

  textoTipo(t: TipoEvento): string {
    return { activo: 'Alquilada ahora', devuelto: 'Ya devuelta', confirmada: 'Reserva confirmada', pendiente: 'Reserva por confirmar' }[t];
  }

  claseBloque(b: Bloque): string {
    const base = 'absolute left-1 right-1 overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md ';
    return (
      base +
      {
        activo: 'border-sky-600 bg-sky-100 text-sky-950',
        devuelto: 'border-slate-400 bg-slate-100 text-slate-600',
        confirmada: 'border-emerald-600 bg-emerald-100 text-emerald-950',
        pendiente: 'border-amber-500 bg-amber-50 text-amber-950 border-dashed ring-1 ring-amber-300',
      }[b.tipo]
    );
  }

  claseDetalle(e: EventoCalendario): string {
    return {
      activo: 'bg-sky-50 ring-sky-200',
      devuelto: 'bg-slate-50 ring-slate-200',
      confirmada: 'bg-emerald-50 ring-emerald-200',
      pendiente: 'bg-amber-50 ring-amber-200',
    }[e.tipo];
  }

  whatsapp(e: EventoCalendario): string | null {
    return enlaceWhatsapp(e.telefono, `Hola ${e.cliente}, te escribimos de Alfa Games por tu alquiler de consola.`);
  }
}
