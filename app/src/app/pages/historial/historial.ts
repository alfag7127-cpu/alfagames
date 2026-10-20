import { DuracionPipe } from '../../shared/duracion.pipe';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Sesion } from '../../core/models';
import { SesionesService } from '../../core/sesiones.service';
import { ToastService } from '../../core/toast.service';
import {
  OFFSET_COLOMBIA,
  ZONA_HORARIA,
  fechaColombia,
  finDiaColombia,
  inicioDiaColombia,
  sumarDias,
} from '../../core/zona-horaria';

interface GrupoDia {
  fecha: string;
  etiqueta: string;
  sesiones: Sesion[];
  total: number;
}

type Rango = 'hoy' | '7' | '30';

@Component({
  selector: 'app-historial',
  imports: [DuracionPipe, FormsModule, DecimalPipe, DatePipe],
  templateUrl: './historial.html',
})
export class Historial implements OnInit {
  readonly sesiones = signal<Sesion[]>([]);
  readonly nombresPuestos = signal<Record<number, string>>({});
  readonly cargando = signal(false);
  readonly rango = signal<Rango | null>('7');
  desde = sumarDias(fechaColombia(), -6);
  hasta = fechaColombia();

  private readonly finalizadas = computed(() => this.sesiones().filter((s) => s.estado === 'finalizada'));
  readonly totalPeriodo = computed(() => this.finalizadas().reduce((sum, s) => sum + (s.precio_total ?? 0), 0));
  readonly horasPeriodo = computed(() => this.finalizadas().reduce((sum, s) => sum + (s.horas_cobradas ?? 0), 0));
  readonly ticketPromedio = computed(() =>
    this.finalizadas().length ? Math.round(this.totalPeriodo() / this.finalizadas().length) : 0,
  );

  /** Sesiones agrupadas por día (hora de Colombia), del más reciente al más antiguo. */
  readonly grupos = computed<GrupoDia[]>(() => {
    const porDia = new Map<string, Sesion[]>();
    for (const s of this.sesiones()) {
      const dia = fechaColombia(s.hora_inicio);
      porDia.set(dia, [...(porDia.get(dia) ?? []), s]);
    }
    return Array.from(porDia.entries()).map(([fecha, sesiones]) => ({
      fecha,
      etiqueta: new Date(`${fecha}T12:00:00${OFFSET_COLOMBIA}`).toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: ZONA_HORARIA,
      }),
      sesiones,
      total: sesiones.filter((s) => s.estado === 'finalizada').reduce((t, s) => t + (s.precio_total ?? 0), 0),
    }));
  });

  constructor(
    private readonly sesionesService: SesionesService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.sesionesService.listarNombresPuestos().then((m) => this.nombresPuestos.set(m));
    this.cargar();
  }

  elegirRango(r: Rango): void {
    this.rango.set(r);
    this.hasta = fechaColombia();
    this.desde = r === 'hoy' ? this.hasta : sumarDias(this.hasta, r === '7' ? -6 : -29);
    this.cargar();
  }

  filtrarFechas(): void {
    this.rango.set(null);
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.sesiones.set(
        await this.sesionesService.listarHistorial({
          // Días completos en hora de Colombia (no en UTC del servidor ni del dispositivo).
          desde: this.desde ? inicioDiaColombia(this.desde) : undefined,
          hasta: this.hasta ? finDiaColombia(this.hasta) : undefined,
        }),
      );
    } catch (e) {
      this.toast.error(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se pudo cargar el historial.');
    } finally {
      this.cargando.set(false);
    }
  }

  nombrePuesto(puestoId: number): string {
    return this.nombresPuestos()[puestoId] ?? `Puesto #${puestoId}`;
  }
}
