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
  procesando: boolean;
}

function segundosATexto(totalSegundos: number): string {
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = totalSegundos % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

@Component({
  selector: 'app-sala',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './sala.html',
})
export class Sala implements OnInit, OnDestroy {
  readonly puestos = signal<PuestoVM[]>([]);
  readonly error = signal<string | null>(null);
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
    // Cada segundo: cronómetro visible en tiempo real para cada puesto ocupado.
    this.timerHandle = setInterval(() => this.ahora.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timerHandle);
    this.unsubscribeRealtime?.();
  }

  async cargar(): Promise<void> {
    try {
      const data = await this.sesiones.listarPuestos();
      this.puestos.set(
        data.map((p) => ({
          ...p,
          formAbierto: false,
          clienteInput: '',
          controlesInput: 0,
          usarPrecioManual: false,
          precioManualInput: null,
          procesando: false,
        })),
      );
    } catch (e) {
      this.error.set(this.mensajeError(e));
    }
  }

  toggleForm(puestoId: number): void {
    this.puestos.update((list) =>
      list.map((p) => (p.id === puestoId ? { ...p, formAbierto: !p.formAbierto } : p)),
    );
  }

  async abrir(p: PuestoVM): Promise<void> {
    const empleadoId = this.auth.currentProfile()?.id;
    if (!empleadoId) return;
    this.error.set(null);
    this.marcarProcesando(p.id, true);
    try {
      await this.sesiones.abrirSesion(p.id, empleadoId, p.clienteInput.trim() || null);
      await this.cargar();
    } catch (e) {
      this.error.set(this.mensajeError(e));
      this.marcarProcesando(p.id, false);
    }
  }

  async cerrar(p: PuestoVM): Promise<void> {
    if (!p.sesion_id) return;
    this.error.set(null);
    this.marcarProcesando(p.id, true);
    try {
      await this.sesiones.cerrarSesion(p.sesion_id, {
        controlesAdicionales: p.controlesInput,
        precioManual: p.usarPrecioManual ? p.precioManualInput : null,
      });
      await this.cargar();
    } catch (e) {
      // Ej: otro empleado ya cerró esta sesión desde otro puesto — refresca para ver el estado real.
      this.error.set(this.mensajeError(e));
      await this.cargar();
    }
  }

  private marcarProcesando(puestoId: number, valor: boolean): void {
    this.puestos.update((list) =>
      list.map((p) => (p.id === puestoId ? { ...p, procesando: valor } : p)),
    );
  }

  private mensajeError(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }

  segundosTranscurridos(p: PuestoVM): number {
    if (!p.hora_inicio) return 0;
    return Math.max(0, Math.floor((this.ahora() - new Date(p.hora_inicio).getTime()) / 1000));
  }

  minutosTranscurridos(p: PuestoVM): number {
    return Math.floor(this.segundosTranscurridos(p) / 60);
  }

  tiempoFormateado(p: PuestoVM): string {
    return segundosATexto(this.segundosTranscurridos(p));
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
