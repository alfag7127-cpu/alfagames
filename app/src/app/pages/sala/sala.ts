import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { PuestoConEstado } from '../../core/models';
import { calcularHorasCobradas, calcularPrecioTotal } from '../../core/pricing';
import { SesionesService } from '../../core/sesiones.service';

interface PuestoVM extends PuestoConEstado {
  formAbierto: boolean;
  clienteInput: string;
  controlesInput: number;
  usarPrecioManual: boolean;
  precioManualInput: number | null;
}

@Component({
  selector: 'app-sala',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './sala.html',
})
export class Sala implements OnInit, OnDestroy {
  readonly puestos = signal<PuestoVM[]>([]);
  private readonly ahora = signal(Date.now());
  private timerHandle?: ReturnType<typeof setInterval>;
  private unsubscribeRealtime?: () => void;

  constructor(
    private readonly sesiones: SesionesService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.unsubscribeRealtime = this.sesiones.onCambiosSesiones(() => this.cargar());
    this.timerHandle = setInterval(() => this.ahora.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timerHandle);
    this.unsubscribeRealtime?.();
  }

  async cargar(): Promise<void> {
    const data = await this.sesiones.listarPuestos();
    this.puestos.set(
      data.map((p) => ({
        ...p,
        formAbierto: false,
        clienteInput: '',
        controlesInput: 0,
        usarPrecioManual: false,
        precioManualInput: null,
      })),
    );
  }

  toggleForm(puestoId: number): void {
    this.puestos.update((list) =>
      list.map((p) => (p.id === puestoId ? { ...p, formAbierto: !p.formAbierto } : p)),
    );
  }

  async abrir(p: PuestoVM): Promise<void> {
    const empleadoId = this.auth.currentProfile()?.id;
    if (!empleadoId) return;
    await this.sesiones.abrirSesion(p.id, empleadoId, p.clienteInput.trim() || null);
    await this.cargar();
  }

  async cerrar(p: PuestoVM): Promise<void> {
    if (!p.sesion_id || !p.hora_inicio) return;
    await this.sesiones.cerrarSesion(p.sesion_id, {
      horaInicio: p.hora_inicio,
      controlesAdicionales: p.controlesInput,
      precioManual: p.usarPrecioManual ? p.precioManualInput : null,
    });
    await this.cargar();
  }

  minutosTranscurridos(p: PuestoVM): number {
    if (!p.hora_inicio) return 0;
    return Math.max(0, Math.floor((this.ahora() - new Date(p.hora_inicio).getTime()) / 60_000));
  }

  tiempoFormateado(p: PuestoVM): string {
    const mins = this.minutosTranscurridos(p);
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  previewPrecio(p: PuestoVM): number {
    const horas = calcularHorasCobradas(this.minutosTranscurridos(p));
    return calcularPrecioTotal({
      horas,
      controlesAdicionales: p.controlesInput,
      precioManual: p.usarPrecioManual ? p.precioManualInput : null,
    });
  }
}
