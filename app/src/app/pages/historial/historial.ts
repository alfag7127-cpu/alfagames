import { DuracionPipe } from '../../shared/duracion.pipe';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Sesion } from '../../core/models';
import { SesionesService } from '../../core/sesiones.service';
import { finDiaColombia, inicioDiaColombia } from '../../core/zona-horaria';

@Component({
  selector: 'app-historial',
  imports: [DuracionPipe, FormsModule, DecimalPipe, DatePipe],
  templateUrl: './historial.html',
})
export class Historial implements OnInit {
  readonly sesiones = signal<Sesion[]>([]);
  readonly nombresPuestos = signal<Record<number, string>>({});
  desde = '';
  hasta = '';

  constructor(private readonly sesionesService: SesionesService) {}

  ngOnInit(): void {
    this.sesionesService.listarNombresPuestos().then((m) => this.nombresPuestos.set(m));
    this.cargar();
  }

  async cargar(): Promise<void> {
    const data = await this.sesionesService.listarHistorial({
      // Días completos en hora de Colombia (no en UTC del servidor ni del dispositivo).
      desde: this.desde ? inicioDiaColombia(this.desde) : undefined,
      hasta: this.hasta ? finDiaColombia(this.hasta) : undefined,
    });
    this.sesiones.set(data);
  }

  nombrePuesto(puestoId: number): string {
    return this.nombresPuestos()[puestoId] ?? `Puesto #${puestoId}`;
  }

  totalPeriodo(): number {
    return this.sesiones()
      .filter((s) => s.estado === 'finalizada')
      .reduce((sum, s) => sum + (s.precio_total ?? 0), 0);
  }
}
