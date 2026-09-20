import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Sesion } from '../../core/models';
import { SesionesService } from '../../core/sesiones.service';

@Component({
  selector: 'app-historial',
  imports: [FormsModule, DecimalPipe, DatePipe],
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
      desde: this.desde ? new Date(this.desde).toISOString() : undefined,
      hasta: this.hasta ? new Date(this.hasta + 'T23:59:59').toISOString() : undefined,
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
