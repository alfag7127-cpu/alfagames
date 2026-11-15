import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlquilerService } from '../core/alquiler.service';
import { ReservasService } from '../core/reservas.service';
import { ToastService } from '../core/toast.service';
import { ZONA_HORARIA, fechaColombia, finDiaColombia, inicioDiaColombia, inicioMes, rangoMesAnterior, sumarDias } from '../core/zona-horaria';

type Rango = 'hoy' | 'ayer' | '7' | 'mes' | 'mesAnterior';

/** Fila común de la lista (sala o domicilio). */
interface Fila {
  id: number;
  inicio: string;
  cliente: string;
  telefono: string | null;
  cedula: string | null;
  consola: string;
  detalle: string;
  precio: number;
  estado: string;
  gta6: boolean;
}

/**
 * Lista numerada: en la sala, las reservas confirmadas o usadas; a domicilio, todos los alquileres
 * llevados al cliente (activos o devueltos, del formulario interno o de una reserva). Por el
 * día de inicio. Siempre abre en Hoy; filtros Ayer, Semana, Este mes, un día,
 * Mes anterior y Desde–Hasta. Sala y domicilio son negocios aparte: cada uno ve solo lo suyo.
 */
@Component({
  selector: 'app-reservas-realizadas',
  imports: [DecimalPipe, FormsModule],
  template: `
    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold text-slate-900">{{ titulo() }}</h2>
        <div class="flex flex-wrap rounded-xl bg-slate-200/70 p-1 text-sm font-medium">
          @for (r of rangos; track r.id) {
            <button type="button" (click)="elegirRango(r.id)" class="rounded-lg px-3 py-1 transition-colors"
              [class.bg-white]="rango() === r.id" [class.shadow-sm]="rango() === r.id"
              [class.text-blue-700]="rango() === r.id" [class.text-slate-600]="rango() !== r.id">{{ r.txt }}</button>
          }
        </div>
      </div>
      <div class="mb-3 flex flex-wrap items-end gap-3">
        <label class="text-xs font-medium text-slate-500">Un día
          <input type="date" [ngModel]="unDia()" (ngModelChange)="elegirDia($event)" class="block rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
        </label>
        <span class="pb-1.5 text-xs text-slate-400">o</span>
        <label class="text-xs font-medium text-slate-500">Desde
          <input type="date" [(ngModel)]="desde" class="block rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
        </label>
        <label class="text-xs font-medium text-slate-500">Hasta
          <input type="date" [(ngModel)]="hasta" class="block rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800" />
        </label>
        <button type="button" (click)="filtrarFechas()" class="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-700">Filtrar</button>
        <span class="ml-auto text-sm text-slate-500">
          {{ filas().length }} {{ negocio() === 'sala' ? 'reserva' : 'alquiler' }}{{ filas().length === 1 ? '' : negocio() === 'sala' ? 's' : 'es' }} ·
          <span class="font-bold tabular-nums text-slate-900">{{ total() | number: '1.0-0' }} COP</span>
        </span>
      </div>

      @if (cargando()) {
        <p class="py-6 text-center text-sm text-slate-400">Cargando…</p>
      } @else {
        <ol class="divide-y divide-slate-100 text-sm">
          @for (f of filas(); track f.id; let i = $index) {
            <li class="flex items-start gap-3 py-2">
              <span class="w-7 shrink-0 text-right font-black tabular-nums text-slate-400">{{ i + 1 }}.</span>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-slate-900">
                  @if (f.gta6) {
                    <span class="mr-1 rounded bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-black text-white">GTA 6</span>
                  }
                  {{ fecha(f.inicio) }} · {{ f.consola }} · {{ f.detalle }}
                </p>
                <p class="text-slate-600">
                  {{ f.cliente }}{{ f.cedula ? ' · C.C. ' + f.cedula : '' }}{{ f.telefono ? ' · ' + f.telefono : '' }}
                  <span class="text-xs text-slate-400">· #{{ f.id }}</span>
                </p>
              </div>
              <div class="shrink-0 text-right">
                <p class="font-bold tabular-nums text-slate-900">{{ f.precio | number: '1.0-0' }}</p>
                <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  [class.bg-emerald-100]="f.estado === 'confirmada' || f.estado === 'activo'" [class.text-emerald-800]="f.estado === 'confirmada' || f.estado === 'activo'"
                  [class.bg-sky-100]="f.estado === 'usada' || f.estado === 'devuelto'" [class.text-sky-800]="f.estado === 'usada' || f.estado === 'devuelto'">{{ f.estado === 'activo' ? 'donde el cliente' : f.estado }}</span>
              </div>
            </li>
          } @empty {
            <li class="py-6 text-center text-slate-400">{{ negocio() === 'sala' ? 'No hay reservas confirmadas' : 'No hay alquileres entregados' }} {{ rango() === 'hoy' ? 'hoy.' : 'en estas fechas.' }}</li>
          }
        </ol>
      }
    </section>
  `,
})
export class ReservasRealizadas implements OnInit, OnDestroy {
  /** 'sala' = reservas para jugar en el local; 'domicilio' = alquiler a domicilio. */
  readonly negocio = input.required<'sala' | 'domicilio'>();

  readonly rango = signal<Rango | null>('hoy');
  readonly rangos: { id: Rango; txt: string }[] = [
    { id: 'hoy', txt: 'Hoy' },
    { id: 'ayer', txt: 'Ayer' },
    { id: '7', txt: 'Semana' },
    { id: 'mes', txt: 'Este mes' },
    { id: 'mesAnterior', txt: 'Mes anterior' },
  ];
  desde = fechaColombia();
  hasta = fechaColombia();
  private readonly filtro = signal({ desde: this.desde, hasta: this.hasta });
  readonly filas = signal<Fila[]>([]);
  readonly cargando = signal(true);
  readonly total = computed(() => this.filas().reduce((s, f) => s + f.precio, 0));
  readonly titulo = computed(() => {
    const base = this.negocio() === 'sala' ? 'Reservas confirmadas' : 'Alquileres entregados';
    const r = this.rango();
    if (r === 'hoy') return `${base} de hoy`;
    if (r === 'ayer') return `${base} de ayer`;
    if (r === '7') return `${base} de la semana`;
    if (r === 'mes') return `${base} de este mes`;
    if (r === 'mesAnterior') return `${base} del mes anterior`;
    const { desde, hasta } = this.filtro();
    return desde === hasta ? `${base} del ${desde}` : `${base} del ${desde} al ${hasta}`;
  });
  private desuscribir?: () => void;

  constructor(
    private readonly sala: ReservasService,
    private readonly domicilio: AlquilerService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.desuscribir = this.negocio() === 'sala' ? this.sala.onCambios(() => this.cargar()) : this.domicilio.onCambios(() => this.cargar());
  }

  ngOnDestroy(): void {
    this.desuscribir?.();
  }

  elegirRango(r: Rango): void {
    const hoy = fechaColombia();
    this.rango.set(r);
    if (r === 'mesAnterior') {
      ({ desde: this.desde, hasta: this.hasta } = rangoMesAnterior(hoy));
    } else {
      this.hasta = r === 'ayer' ? sumarDias(hoy, -1) : hoy;
      this.desde = r === 'mes' ? inicioMes(hoy) : r === '7' ? sumarDias(hoy, -6) : this.hasta;
    }
    this.cargar();
  }

  /** Fecha del campo "Un día": solo cuando el filtro es un único día. */
  readonly unDia = computed(() => {
    const { desde, hasta } = this.filtro();
    return desde === hasta ? desde : '';
  });

  elegirDia(dia: string): void {
    if (!dia) return;
    this.desde = this.hasta = dia;
    this.rango.set(dia === fechaColombia() ? 'hoy' : dia === sumarDias(fechaColombia(), -1) ? 'ayer' : null);
    this.cargar();
  }

  filtrarFechas(): void {
    if (!this.desde || !this.hasta) return this.toast.error('Elige las dos fechas.');
    if (this.desde > this.hasta) [this.desde, this.hasta] = [this.hasta, this.desde];
    this.rango.set(null);
    this.cargar();
  }

  fecha(iso: string): string {
    const d = new Date(iso);
    const dia = d.toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, weekday: 'short', day: 'numeric', month: 'short' });
    return `${dia} ${d.toLocaleTimeString('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' })}`;
  }

  async cargar(): Promise<void> {
    // Al cambiar de día con la pantalla abierta, "Hoy" sigue siendo hoy.
    const hoy = fechaColombia();
    if (this.rango() === 'hoy') this.desde = this.hasta = hoy;
    if (this.rango() === 'mes') {
      this.hasta = hoy;
      this.desde = inicioMes(hoy);
    }
    this.filtro.set({ desde: this.desde, hasta: this.hasta });
    const desde = inicioDiaColombia(this.desde);
    const hasta = finDiaColombia(this.hasta);
    try {
      if (this.negocio() === 'sala') {
        const lista = await this.sala.realizadas(desde, hasta);
        this.filas.set(
          lista.map((r) => ({
            id: r.id,
            inicio: r.inicio,
            cliente: r.cliente_nombre,
            telefono: r.cliente_telefono,
            cedula: r.cliente_cedula ?? null,
            consola: r.puestos?.nombre ?? `Consola ${r.puesto_id}`,
            detalle: duracion(r.minutos) + (r.origen === 'local' ? ' · hecha en el local' : ''),
            precio: r.precio,
            estado: r.estado,
            gta6: r.juego === 'gta6',
          })),
        );
      } else {
        const lista = await this.domicilio.entregados(desde, hasta);
        this.filas.set(
          lista.map((a) => {
            const ext = a.alquiler_extensiones ?? [];
            return {
              id: a.id,
              inicio: a.inicio,
              cliente: a.cliente_nombre,
              telefono: a.cliente_telefono,
              cedula: a.cliente_cedula ?? null,
              consola: a.alquiler_consolas ? `${a.alquiler_consolas.tipo} ${a.alquiler_consolas.nombre}` : 'Consola',
              detalle: a.plan_nombre + (ext.length ? ` · +${ext.length} extensión${ext.length === 1 ? '' : 'es'}` : ''),
              // Lo cobrado: la entrega más el tiempo extra pagado después.
              precio: Number(a.precio_total) + ext.reduce((s, e) => s + Number(e.precio), 0),
              estado: a.estado,
              gta6: !!a.alquiler_tarifas?.gta6,
            };
          }),
        );
      }
    } catch (e) {
      this.toast.error(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se pudieron cargar las reservas.');
    } finally {
      this.cargando.set(false);
    }
  }
}

function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}
