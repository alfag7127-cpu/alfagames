import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { GastosService } from '../../core/gastos.service';
import { SesionesService } from '../../core/sesiones.service';

interface DiaResumen {
  fecha: string; // YYYY-MM-DD, hora local
  etiqueta: string; // "lun 15"
  ventas: number;
  gastos: number;
}

/** Fecha local (America/Bogota corre en UTC-5 sin horario de verano) en formato YYYY-MM-DD. */
function fechaLocalISO(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  return d.toLocaleDateString('sv-SE');
}

function etiquetaCorta(fechaISO: string): string {
  const d = new Date(fechaISO + 'T00:00:00');
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' });
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
    const gastos = dias.reduce((s, d) => s + d.gastos, 0);
    return { ventas, gastos, ganancia: ventas - gastos };
  });

  constructor(
    private readonly sesionesService: SesionesService,
    private readonly gastosService: GastosService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);

    const hoy = new Date();
    const hace6dias = new Date(hoy);
    hace6dias.setDate(hoy.getDate() - 6);
    hace6dias.setHours(0, 0, 0, 0);

    const [sesiones, gastos] = await Promise.all([
      this.sesionesService.listarHistorial({ desde: hace6dias.toISOString() }),
      this.gastosService.listar(fechaLocalISO(hace6dias)),
    ]);

    const porFecha = new Map<string, { ventas: number; gastos: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(hace6dias);
      d.setDate(hace6dias.getDate() + i);
      porFecha.set(fechaLocalISO(d), { ventas: 0, gastos: 0 });
    }

    for (const s of sesiones) {
      if (s.estado !== 'finalizada' || s.precio_total == null) continue;
      const key = fechaLocalISO(s.hora_inicio);
      const acc = porFecha.get(key);
      if (acc) acc.ventas += s.precio_total;
    }

    for (const g of gastos) {
      const acc = porFecha.get(g.fecha);
      if (acc) acc.gastos += g.monto;
    }

    this.dias.set(
      Array.from(porFecha.entries()).map(([fecha, v]) => ({
        fecha,
        etiqueta: etiquetaCorta(fecha),
        ventas: v.ventas,
        gastos: v.gastos,
      })),
    );
    this.cargando.set(false);
  }

  alturaPorcentaje(valor: number): number {
    return (valor / this.maxValor()) * 100;
  }
}
