import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { GastosService } from '../../core/gastos.service';
import { SesionesService } from '../../core/sesiones.service';
import { ProductosService } from '../../core/productos.service';
import { OFFSET_COLOMBIA, ZONA_HORARIA, fechaColombia, inicioDiaColombia, sumarDias } from '../../core/zona-horaria';

interface DiaResumen {
  fecha: string; // YYYY-MM-DD, hora de Colombia
  etiqueta: string; // "lun 15"
  ventas: number; // sala + productos (el alquiler es otro negocio: va en su módulo)
  ventasSala: number;
  ventasProductos: number;
  gastos: number;
}

function etiquetaCorta(fechaISO: string): string {
  const d = new Date(fechaISO + 'T12:00:00' + OFFSET_COLOMBIA);
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', timeZone: ZONA_HORARIA });
}

@Component({
  selector: 'app-dashboard',
  imports: [DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  readonly dias = signal<DiaResumen[]>([]);
  readonly cargando = signal(true);

  readonly maxValor = computed(() =>
    Math.max(1, ...this.dias().flatMap((d) => [d.ventas, d.gastos])),
  );

  readonly hoy = computed(() => this.dias().at(-1));
  readonly gananciaHoy = computed(() => (this.hoy()?.ventas ?? 0) - (this.hoy()?.gastos ?? 0));

  readonly totalPeriodo = computed(() => {
    const dias = this.dias();
    const ventas = dias.reduce((s, d) => s + d.ventas, 0);
    const sala = dias.reduce((s, d) => s + d.ventasSala, 0);
    const productos = dias.reduce((s, d) => s + d.ventasProductos, 0);
    const gastos = dias.reduce((s, d) => s + d.gastos, 0);
    return { sala, productos, ventas, gastos, ganancia: ventas - gastos };
  });

  constructor(
    private readonly sesionesService: SesionesService,
    private readonly gastosService: GastosService,
    private readonly productosService: ProductosService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);

    // Los 7 días se cuentan en hora de Colombia, no en la del dispositivo.
    const desde = sumarDias(fechaColombia(), -6);

    const [sesiones, gastos, ventasProductos] = await Promise.all([
      this.sesionesService.listarHistorial({ desde: inicioDiaColombia(desde) }),
      this.gastosService.listar(desde),
      this.productosService.ventas(inicioDiaColombia(desde)),
    ]);

    const porFecha = new Map<string, { ventasSala: number; ventasProductos: number; gastos: number }>();
    for (let i = 0; i < 7; i++) {
      porFecha.set(sumarDias(desde, i), { ventasSala: 0, ventasProductos: 0, gastos: 0 });
    }

    for (const v of ventasProductos) {
      if (v.estado !== 'vendida') continue;
      const acc = porFecha.get(fechaColombia(v.created_at));
      if (acc) acc.ventasProductos += v.total;
    }

    for (const s of sesiones) {
      if (s.estado !== 'finalizada' || s.precio_total == null) continue;
      const acc = porFecha.get(fechaColombia(s.hora_inicio));
      if (acc) acc.ventasSala += s.precio_total;
    }

    for (const g of gastos) {
      const acc = porFecha.get(g.fecha);
      if (acc) acc.gastos += g.monto;
    }

    this.dias.set(
      Array.from(porFecha.entries()).map(([fecha, v]) => ({
        fecha,
        etiqueta: etiquetaCorta(fecha),
        ventas: v.ventasSala + v.ventasProductos,
        ventasSala: v.ventasSala,
        ventasProductos: v.ventasProductos,
        gastos: v.gastos,
      })),
    );
    this.cargando.set(false);
  }

  alturaPorcentaje(valor: number): number {
    return (valor / this.maxValor()) * 100;
  }
}
