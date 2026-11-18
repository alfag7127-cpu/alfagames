import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, computed, effect, input, signal, viewChild } from '@angular/core';
import { AlquilerService } from '../../core/alquiler.service';
import { ReservaAlquiler } from '../../core/gta6.service';
import { Alquiler, ConsolaConEstado } from '../../core/models';
import { ZONA_HORARIA, fechaColombia, finDiaColombia, inicioDiaColombia, sumarDias } from '../../core/zona-horaria';
import { enlaceWhatsapp } from '../../core/reservas.service';

/** Alto de una hora en el calendario (px). */
const PX_HORA = 48;
const MS_HORA = 3_600_000;

type TipoEvento = 'activo' | 'devuelto' | 'confirmada' | 'pendiente';

/** Un alquiler o una reserva a domicilio en una consola, de la entrega a la recogida. */
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

/** Pedazo de un evento dentro de un día, ya ubicado (top, alto y carril si se cruza con otros). */
export interface Bloque extends EventoCalendario {
  top: number;
  alto: number;
  carril: number;
  carriles: number;
  empiezaAntes: boolean;
  terminaDespues: boolean;
}

/** Hora compacta para los bloques angostos: "7p", "1:30p", "9a". */
export function horaCompacta(ms: number): string {
  const [h, m] = new Date(ms).toLocaleTimeString('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}`;
}

function hora(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' });
}

/** Lunes de la semana de una fecha YYYY-MM-DD. */
export function lunesDe(fecha: string): string {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((dia + 6) % 7));
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
 * Ubica los eventos de un día: los que se cruzan en el tiempo van lado a lado (carriles),
 * como en Teams. `desde` es la medianoche del día (ms).
 */
export function bloquesDelDia(eventos: EventoCalendario[], desde: number): Bloque[] {
  const hasta = desde + 24 * MS_HORA;
  const del = eventos
    .filter((e) => e.inicio < hasta && e.fin > desde)
    .map((e) => ({ e, ini: Math.max(e.inicio, desde), fin: Math.min(e.fin, hasta) }))
    .sort((a, b) => a.ini - b.ini || b.fin - a.fin);

  const bloques: Bloque[] = [];
  let grupo: { b: Bloque; fin: number }[] = [];
  let finGrupo = -Infinity;
  const cerrarGrupo = () => {
    const carriles = Math.max(1, ...grupo.map((g) => g.b.carril + 1));
    for (const g of grupo) g.b.carriles = carriles;
    grupo = [];
  };
  for (const { e, ini, fin } of del) {
    if (ini >= finGrupo) {
      cerrarGrupo();
      finGrupo = -Infinity;
    }
    // Primer carril libre del grupo.
    const ocupados = new Set(grupo.filter((g) => g.fin > ini).map((g) => g.b.carril));
    let carril = 0;
    while (ocupados.has(carril)) carril++;
    const b: Bloque = {
      ...e,
      top: ((ini - desde) / MS_HORA) * PX_HORA,
      alto: Math.max(22, ((fin - ini) / MS_HORA) * PX_HORA - 2),
      carril,
      carriles: 1,
      empiezaAntes: e.inicio < desde,
      terminaDespues: e.fin > hasta,
    };
    grupo.push({ b, fin });
    bloques.push(b);
    finGrupo = Math.max(finGrupo, fin);
  }
  cerrarGrupo();
  return bloques;
}

interface DiaSemana {
  fecha: string;
  numero: number;
  nombre: string;
  esHoy: boolean;
  desde: number;
  bloques: Bloque[];
}

/**
 * Calendario semanal tipo Teams (lunes a domingo): arriba el día de la semana y su número,
 * las horas hacia abajo y cada alquiler o reserva como un bloque con el nombre de la consola.
 * Si varias consolas están alquiladas a la misma hora, los bloques van lado a lado.
 */
@Component({
  selector: 'app-calendario-alquiler',
  imports: [DecimalPipe, NgTemplateOutlet],
  template: `
    <div class="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <!-- Barra: semana -->
      <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <button type="button" (click)="irAHoy()" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Hoy</button>
        <button type="button" (click)="mover(-7)" class="rounded-lg px-2 py-1 text-xl leading-none text-slate-600 hover:bg-slate-100" aria-label="Semana anterior">‹</button>
        <button type="button" (click)="mover(7)" class="rounded-lg px-2 py-1 text-xl leading-none text-slate-600 hover:bg-slate-100" aria-label="Semana siguiente">›</button>
        <h3 class="text-base font-bold text-slate-900">{{ tituloSemana() }}</h3>
      </div>

      <!-- Leyenda -->
      <div class="flex flex-wrap gap-3 px-3 pt-2 text-[11px] text-slate-600">
        <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-sky-500"></span>Alquilada ahora</span>
        <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>Reserva confirmada</span>
        <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-amber-400"></span>Reserva por confirmar</span>
        <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-slate-400"></span>Ya devuelta</span>
        <span class="flex items-center gap-1"><span class="rounded bg-fuchsia-600 px-1 text-[9px] font-black text-white">GTA 6</span>con GTA 6</span>
      </div>

      <!-- Detalle del bloque tocado (celular) -->
      @if (elegido(); as e) {
        <div class="mx-3 mt-2 rounded-xl p-3 text-sm ring-1" [class]="claseDetalle(e)">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <ng-container *ngTemplateOutlet="ficha; context: { $implicit: e }" />
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

      <!-- Semana: días arriba, horas hacia abajo -->
      <div #scroll class="mt-2 max-h-[72vh] overflow-auto">
        <div class="relative min-w-[760px]">
          <div class="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
            <div class="w-14 shrink-0"></div>
            @for (d of dias(); track d.fecha) {
              <div class="flex-1 border-l border-slate-200 px-1 py-2 text-center">
                <p class="text-[11px] font-semibold uppercase tracking-wide" [class.text-indigo-600]="d.esHoy" [class.text-slate-500]="!d.esHoy">{{ d.nombre }}</p>
                <p class="mx-auto mt-0.5 flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold"
                  [class.bg-indigo-600]="d.esHoy" [class.text-white]="d.esHoy" [class.text-slate-900]="!d.esHoy">{{ d.numero }}</p>
              </div>
            }
          </div>

          <div class="relative flex" [style.height.px]="24 * pxHora">
            <div class="w-14 shrink-0">
              @for (h of horas; track h) {
                <div class="relative" [style.height.px]="pxHora">
                  <span class="absolute -top-2 right-1.5 text-[10px] text-slate-400">{{ etiquetaHora(h) }}</span>
                </div>
              }
            </div>
            @for (d of dias(); track d.fecha) {
              <div class="relative flex-1 border-l border-slate-200" [class.bg-indigo-50/40]="d.esHoy">
                @for (h of horas; track h) {
                  <div class="border-t border-slate-100" [style.height.px]="pxHora"></div>
                }
                @for (b of d.bloques; track b.clave) {
                  <button type="button" (click)="elegido.set(b)"
                    (mouseenter)="mostrarTooltip(b, $event)" (mousemove)="moverTooltip($event)" (mouseleave)="tooltip.set(null)"
                    [class]="claseBloque(b)"
                    [style.top.px]="b.top" [style.height.px]="b.alto"
                    [style.left]="'calc(' + (b.carril * 100) / b.carriles + '% + 2px)'"
                    [style.width]="'calc(' + 100 / b.carriles + '% - 4px)'">
                    <p class="truncate font-bold">
                      {{ nombreConsola(b.consolaId) }}
                      @if (b.gta6) { <span class="rounded bg-fuchsia-600 px-1 text-[9px] font-black text-white">GTA 6</span> }
                    </p>
                    @if (b.alto > 30) {
                      <p class="truncate opacity-80">{{ b.empiezaAntes ? '↑' : '' }}{{ horaCompacta(b.inicio) }}–{{ horaCompacta(b.fin) }}{{ b.terminaDespues ? '↓' : '' }}</p>
                    }
                    @if (b.alto > 46) { <p class="truncate opacity-70">{{ b.cliente }}</p> }
                  </button>
                }
                @if (d.esHoy && lineaAhora() !== null) {
                  <div class="pointer-events-none absolute inset-x-0 z-10" [style.top.px]="lineaAhora()">
                    <div class="relative h-0.5 bg-red-500"><span class="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500"></span></div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>

      @if (!totalBloques()) {
        <p class="border-t border-slate-100 p-3 text-center text-sm text-slate-500">Sin alquileres ni reservas esta semana.</p>
      }
    </div>

    <!-- Tooltip al pasar el mouse -->
    @if (tooltip(); as t) {
      <div class="pointer-events-none fixed z-50 w-64 rounded-xl bg-slate-900 p-3 text-xs text-white shadow-2xl"
        [style.left.px]="t.x" [style.top.px]="t.y">
        <ng-container *ngTemplateOutlet="ficha; context: { $implicit: t.evento, oscuro: true }" />
      </div>
    }

    <ng-template #ficha let-e let-oscuro="oscuro">
      <p class="font-bold" [class.text-slate-900]="!oscuro">
        @if (e.gta6) { <span class="mr-1 rounded bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-black text-white">GTA 6</span> }
        🎮 {{ nombreConsola(e.consolaId) }}
      </p>
      <p [class.text-slate-700]="!oscuro">{{ textoTipo(e.tipo) }} · {{ e.plan }}</p>
      <p [class.text-slate-700]="!oscuro">👤 {{ e.cliente }}{{ e.telefono ? ' · ' + e.telefono : '' }}</p>
      <p [class.text-slate-700]="!oscuro">🚚 {{ diaHora(e.inicio) }} → {{ diaHora(e.fin) }}</p>
      @if (e.direccion) { <p [class.text-slate-600]="!oscuro">📍 {{ e.direccion }}</p> }
      @if (e.precio != null) { <p class="font-semibold" [class.text-slate-900]="!oscuro">{{ e.precio | number: '1.0-0' }} COP</p> }
    </ng-template>
  `,
})
export class CalendarioAlquiler implements OnInit, AfterViewInit, OnDestroy {
  readonly consolas = input.required<ConsolaConEstado[]>();
  readonly reservas = input.required<ReservaAlquiler[]>();

  readonly pxHora = PX_HORA;
  readonly horas = Array.from({ length: 24 }, (_, i) => i);
  /** Lunes de la semana que se ve. */
  readonly lunes = signal(lunesDe(fechaColombia()));
  readonly alquileres = signal<Alquiler[]>([]);
  readonly elegido = signal<EventoCalendario | null>(null);
  readonly tooltip = signal<{ evento: EventoCalendario; x: number; y: number } | null>(null);
  private readonly ahora = signal(Date.now());
  private readonly scroll = viewChild<ElementRef<HTMLDivElement>>('scroll');
  private timer?: ReturnType<typeof setInterval>;
  readonly hora = hora;
  readonly horaCompacta = horaCompacta;

  private readonly eventos = computed(() => eventosCalendario(this.alquileres(), this.reservas()));

  readonly dias = computed<DiaSemana[]>(() => {
    const hoy = fechaColombia(new Date(this.ahora()));
    const eventos = this.eventos();
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = sumarDias(this.lunes(), i);
      const desde = new Date(inicioDiaColombia(fecha)).getTime();
      const nombre = new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, weekday: 'short' });
      return { fecha, numero: Number(fecha.slice(8, 10)), nombre: nombre.replace('.', ''), esHoy: fecha === hoy, desde, bloques: bloquesDelDia(eventos, desde) };
    });
  });

  readonly totalBloques = computed(() => this.dias().reduce((t, d) => t + d.bloques.length, 0));

  readonly tituloSemana = computed(() => {
    const ini = new Date(`${this.lunes()}T12:00:00-05:00`);
    const fin = new Date(`${sumarDias(this.lunes(), 6)}T12:00:00-05:00`);
    const mes = (d: Date) => d.toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, month: 'long' });
    const anio = fin.toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, year: 'numeric' });
    return mes(ini) === mes(fin)
      ? `${ini.getUTCDate()} – ${fin.getUTCDate()} de ${mes(fin)} de ${anio}`
      : `${ini.getUTCDate()} de ${mes(ini)} – ${fin.getUTCDate()} de ${mes(fin)} de ${anio}`;
  });

  /** Posición de la línea roja de "ahora" en la columna de hoy. */
  readonly lineaAhora = computed(() => {
    const hoy = this.dias().find((d) => d.esHoy);
    return hoy ? ((this.ahora() - hoy.desde) / MS_HORA) * PX_HORA : null;
  });

  constructor(private readonly alquiler: AlquilerService) {
    // Recarga los alquileres al cambiar de semana.
    effect(() => {
      this.lunes();
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

  /** Alquileres que tocan la semana: los que empezaron hasta 3 días antes del lunes. */
  async cargar(): Promise<void> {
    const lunes = this.lunes();
    try {
      const lista = await this.alquiler.historial(inicioDiaColombia(sumarDias(lunes, -3)), finDiaColombia(sumarDias(lunes, 6)));
      if (lunes === this.lunes()) this.alquileres.set(lista);
    } catch {
      /* sin conexión: se intenta en la próxima actualización */
    }
  }

  irAHoy(): void {
    this.elegido.set(null);
    this.lunes.set(lunesDe(fechaColombia()));
    setTimeout(() => this.irAHoraActual());
  }

  mover(dias: number): void {
    this.elegido.set(null);
    this.lunes.set(sumarDias(this.lunes(), dias));
  }

  /** Deja a la vista una hora antes de la actual. */
  private irAHoraActual(): void {
    const el = this.scroll()?.nativeElement;
    const linea = this.lineaAhora();
    if (el && linea !== null) el.scrollTop = Math.max(0, linea - PX_HORA);
  }

  mostrarTooltip(e: EventoCalendario, ev: MouseEvent): void {
    this.tooltip.set({ evento: e, ...this.posicion(ev) });
  }

  moverTooltip(ev: MouseEvent): void {
    const t = this.tooltip();
    if (t) this.tooltip.set({ ...t, ...this.posicion(ev) });
  }

  /** Al lado del puntero, sin salirse de la pantalla. */
  private posicion(ev: MouseEvent): { x: number; y: number } {
    const x = ev.clientX + 16 + 256 > window.innerWidth ? ev.clientX - 16 - 256 : ev.clientX + 16;
    const y = Math.min(ev.clientY + 12, window.innerHeight - 170);
    return { x: Math.max(8, x), y: Math.max(8, y) };
  }

  nombreConsola(id: number): string {
    return this.consolas().find((c) => c.id === id)?.nombre ?? `Consola #${id}`;
  }

  etiquetaHora(h: number): string {
    if (h === 0) return '';
    return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'a. m.' : 'p. m.'}`;
  }

  diaHora(ms: number): string {
    const fecha = new Date(ms).toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, weekday: 'short', day: 'numeric', month: 'short' });
    return `${fecha} ${hora(ms)}`;
  }

  textoTipo(t: TipoEvento): string {
    return { activo: 'Alquilada ahora', devuelto: 'Ya devuelta', confirmada: 'Reserva confirmada', pendiente: 'Reserva por confirmar' }[t];
  }

  claseBloque(b: Bloque): string {
    const base = 'absolute flex flex-col justify-start overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md ';
    return (
      base +
      {
        activo: 'border-sky-600 bg-sky-100 text-sky-950',
        devuelto: 'border-slate-400 bg-slate-100 text-slate-600',
        confirmada: 'border-emerald-600 bg-emerald-100 text-emerald-950',
        pendiente: 'border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-300',
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
