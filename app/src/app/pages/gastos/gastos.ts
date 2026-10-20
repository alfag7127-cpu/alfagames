import { fechaColombia } from '../../core/zona-horaria';
import { DecimalPipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { GastosService } from '../../core/gastos.service';
import { Gasto } from '../../core/models';

/** "Hoy" en hora de Colombia: con UTC, después de las 7 PM ya marcaba el día siguiente. */
function hoyISO(): string {
  return fechaColombia();
}

@Component({
  selector: 'app-gastos',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './gastos.html',
})
export class Gastos implements OnInit {
  readonly gastos = signal<Gasto[]>([]);

  fecha = hoyISO();
  descripcion = '';
  monto: number | null = null;
  categoria = '';

  constructor(
    private readonly gastosService: GastosService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.gastos.set(await this.gastosService.listar());
  }

  async agregar(): Promise<void> {
    const adminId = this.auth.currentProfile()?.id;
    if (!adminId || !this.descripcion.trim() || !this.monto) return;

    await this.gastosService.crear({
      fecha: this.fecha,
      descripcion: this.descripcion.trim(),
      monto: this.monto,
      categoria: this.categoria.trim() || null,
      adminId,
    });

    this.descripcion = '';
    this.monto = null;
    this.categoria = '';
    await this.cargar();
  }

  async eliminar(id: number): Promise<void> {
    await this.gastosService.eliminar(id);
    await this.cargar();
  }

  totalListado(): number {
    return this.gastos().reduce((sum, g) => sum + g.monto, 0);
  }
}
