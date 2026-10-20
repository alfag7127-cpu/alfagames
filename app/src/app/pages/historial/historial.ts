import { DuracionPipe } from '../../shared/duracion.pipe';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Sesion, VentaProducto } from '../../core/models';
import { ProductosService } from '../../core/productos.service';
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
  ventas: VentaProducto[];
  totalSesiones: number;
  totalProductos: number;
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
  readonly ventas = signal<VentaProducto[]>([]);
  readonly nombresProductos = signal<Record<number, string>>({});
  readonly nombresUsuarios = signal<Record<string, string>>({});
  readonly cargando = signal(false);
  readonly rango = signal<Rango | null>('7');
  desde = sumarDias(fechaColombia(), -6);
  hasta = fechaColombia();

  private readonly finalizadas = computed(() => this.sesiones().filter((s) => s.estado === 'finalizada'));
  readonly totalSala = computed(() => this.finalizadas().reduce((sum, s) => sum + (s.precio_total ?? 0), 0));
  readonly totalProductos = computed(() =>
    this.ventas().filter((v) => v.estado === 'vendida').reduce((sum, v) => sum + v.total, 0),
  );
  readonly totalPeriodo = computed(() => this.totalSala() + this.totalProductos());
  readonly horasPeriodo = computed(() => this.finalizadas().reduce((sum, s) => sum + (s.horas_cobradas ?? 0), 0));
  /** Minutos jugados de más (no cobrados) en el período, por cierres con desfase. */
  readonly minutosSinCobrar = computed(() =>
    this.finalizadas().reduce((t, s) => t + Math.max(0, this.desfase(s) ?? 0), 0),
  );
  readonly ticketPromedio = computed(() =>
    this.finalizadas().length ? Math.round(this.totalSala() / this.finalizadas().length) : 0,
  );

  /** Sesiones agrupadas por día (hora de Colombia), del más reciente al más antiguo. */
  readonly grupos = computed<GrupoDia[]>(() => {
    const porDia = new Map<string, { sesiones: Sesion[]; ventas: VentaProducto[] }>();
    const dia = (fecha: string) => {
      if (!porDia.has(fecha)) porDia.set(fecha, { sesiones: [], ventas: [] });
      return porDia.get(fecha)!;
    };
    for (const s of this.sesiones()) dia(fechaColombia(s.hora_inicio)).sesiones.push(s);
    for (const v of this.ventas()) dia(fechaColombia(v.created_at)).ventas.push(v);
    return Array.from(porDia.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([fecha, { sesiones, ventas }]) => {
        const totalSesiones = sesiones.filter((s) => s.estado === 'finalizada').reduce((t, s) => t + (s.precio_total ?? 0), 0);
        const totalProductos = ventas.filter((v) => v.estado === 'vendida').reduce((t, v) => t + v.total, 0);
        return {
      fecha,
      etiqueta: new Date(`${fecha}T12:00:00${OFFSET_COLOMBIA}`).toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: ZONA_HORARIA,
      }),
          sesiones,
          ventas,
          totalSesiones,
          totalProductos,
          total: totalSesiones + totalProductos,
        };
      });
  });

  constructor(
    private readonly sesionesService: SesionesService,
    private readonly productosService: ProductosService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.sesionesService.listarNombresPuestos().then((m) => this.nombresPuestos.set(m));
    this.sesionesService.listarNombresUsuarios().then((m) => this.nombresUsuarios.set(m)).catch(() => undefined);
    this.productosService
      .listar()
      .then((ps) => this.nombresProductos.set(Object.fromEntries(ps.map((p) => [p.id, p.nombre]))));
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
      // Días completos en hora de Colombia (no en UTC del servidor ni del dispositivo).
      const desde = this.desde ? inicioDiaColombia(this.desde) : undefined;
      const hasta = this.hasta ? finDiaColombia(this.hasta) : undefined;
      const [sesiones, ventas] = await Promise.all([
        this.sesionesService.listarHistorial({ desde, hasta }),
        this.productosService.ventas(desde, hasta),
      ]);
      this.sesiones.set(sesiones);
      this.ventas.set(ventas);
    } catch (e) {
      this.toast.error(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se pudo cargar el historial.');
    } finally {
      this.cargando.set(false);
    }
  }

  /** Ventas de productos de un día, resumidas: "3 × Gaseosa, 2 × Pan". */
  resumenProductos(ventas: VentaProducto[]): { texto: string; unidades: number }[] {
    const porProducto = new Map<number, number>();
    for (const v of ventas) {
      if (v.estado !== 'vendida') continue;
      porProducto.set(v.producto_id, (porProducto.get(v.producto_id) ?? 0) + v.cantidad);
    }
    return Array.from(porProducto.entries()).map(([id, unidades]) => ({
      texto: this.nombresProductos()[id] ?? `Producto #${id}`,
      unidades,
    }));
  }

  /**
   * Desfase = minutos jugados de verdad − minutos cobrados (los pactados en regresivo,
   * las horas cobradas en cronometrado). Positivo: jugó más de lo cobrado.
   * null si la sesión es anterior a este registro o no se cerró.
   */
  desfase(s: Sesion): number | null {
    if (s.minutos_reales == null || s.estado !== 'finalizada') return null;
    const cobrados = s.modalidad === 'conteo_regresivo' ? (s.minutos_asignados ?? 0) : (s.horas_cobradas ?? 0) * 60;
    return Math.round(s.minutos_reales - cobrados);
  }

  /** Solo se avisa desde 10 minutos (en cronometrado el redondeo da hasta ±15 min normales). */
  desfaseNotable(s: Sesion): boolean {
    const d = this.desfase(s);
    if (d == null) return false;
    return s.modalidad === 'conteo_regresivo' ? Math.abs(d) >= 10 : Math.abs(d) > 15;
  }

  nombreUsuario(id: string | null): string {
    return id ? (this.nombresUsuarios()[id] ?? 'Otro usuario') : '—';
  }

  nombrePuesto(puestoId: number): string {
    return this.nombresPuestos()[puestoId] ?? `Puesto #${puestoId}`;
  }
}
