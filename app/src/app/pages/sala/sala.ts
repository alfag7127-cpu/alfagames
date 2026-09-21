import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { Modalidad, PuestoConEstado } from '../../core/models';
import { PRECIO_CONTROL_POR_HORA, calcularPrecioTotal, calcularTarifa } from '../../core/pricing';
import { SesionesService } from '../../core/sesiones.service';

/** Umbral de aviso para conteo regresivo: a partir de acá cambia el color / suena aviso. */
const SEGUNDOS_AVISO = 5 * 60; // 5 minutos
const SEGUNDOS_CRITICO = 60; // 1 minuto

type NivelAlerta = 'normal' | 'aviso' | 'critico' | 'vencido';
type UmbralAvisado = 'aviso' | 'critico' | 'vencido';

interface PuestoVM extends PuestoConEstado {
  formAbierto: boolean;
  // Formulario de apertura
  modoSeleccionado: Modalidad;
  clienteInput: string;
  minutosInput: number;
  // Compartido entre apertura (conteo regresivo) y cierre (cronometrado)
  controlesInput: number;
  usarPrecioManual: boolean;
  precioManualInput: number | null;
  procesando: boolean;
}

function segundosATexto(totalSegundosAbs: number, negativo: boolean): string {
  const h = Math.floor(totalSegundosAbs / 3600);
  const m = Math.floor((totalSegundosAbs % 3600) / 60);
  const s = totalSegundosAbs % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  const texto = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  return negativo ? `+${texto}` : texto;
}

/** Beep corto sin archivos externos (Web Audio API). */
function reproducirBeep(frecuencia: number, duracionMs: number): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frecuencia;
    osc.type = 'sine';
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duracionMs);
  } catch {
    // Audio bloqueado por el navegador (sin interacción previa) — la alerta visual sigue funcionando.
  }
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
  /** Qué umbrales ya se avisaron para cada sesión, para no repetir el aviso cada segundo. */
  private readonly avisosEnviados = new Map<number, Set<UmbralAvisado>>();

  constructor(
    private readonly sesiones: SesionesService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.unsubscribeRealtime = this.sesiones.onCambiosSesiones(() => this.cargar());
    this.timerHandle = setInterval(() => {
      this.ahora.set(Date.now());
      this.revisarAlertas();
    }, 1000);
    this.pedirPermisoNotificaciones();
  }

  ngOnDestroy(): void {
    clearInterval(this.timerHandle);
    this.unsubscribeRealtime?.();
  }

  private pedirPermisoNotificaciones(): void {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    Notification.requestPermission().catch(() => {
      // Si el usuario ignora o bloquea el permiso, seguimos solo con aviso visual + sonoro.
    });
  }

  async cargar(): Promise<void> {
    try {
      const data = await this.sesiones.listarPuestos();
      const idsVivos = new Set(data.filter((p) => p.sesion_id).map((p) => p.sesion_id as number));
      for (const sesionId of this.avisosEnviados.keys()) {
        if (!idsVivos.has(sesionId)) this.avisosEnviados.delete(sesionId);
      }
      this.puestos.set(
        data.map((p) => ({
          ...p,
          formAbierto: false,
          modoSeleccionado: 'cronometrado',
          clienteInput: '',
          minutosInput: 60,
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

  seleccionarModo(puestoId: number, modo: Modalidad): void {
    this.puestos.update((list) =>
      list.map((p) => (p.id === puestoId ? { ...p, modoSeleccionado: modo } : p)),
    );
  }

  async abrir(p: PuestoVM): Promise<void> {
    const empleadoId = this.auth.currentProfile()?.id;
    if (!empleadoId) return;
    this.error.set(null);
    this.marcarProcesando(p.id, true);
    try {
      if (p.modoSeleccionado === 'conteo_regresivo') {
        if (!p.minutosInput || p.minutosInput <= 0) {
          throw new Error('Indica cuántos minutos de conteo regresivo.');
        }
        await this.sesiones.abrirSesionRegresiva(
          p.id,
          p.clienteInput.trim() || null,
          p.minutosInput,
          p.controlesInput,
          p.usarPrecioManual ? p.precioManualInput : null,
        );
      } else {
        await this.sesiones.abrirSesion(p.id, empleadoId, p.clienteInput.trim() || null);
      }
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

  // ── Tiempo ──────────────────────────────────────────────────────────────

  segundosTranscurridos(p: PuestoVM): number {
    if (!p.hora_inicio) return 0;
    return Math.max(0, Math.floor((this.ahora() - new Date(p.hora_inicio).getTime()) / 1000));
  }

  minutosTranscurridos(p: PuestoVM): number {
    return Math.floor(this.segundosTranscurridos(p) / 60);
  }

  /** Solo válido en modalidad conteo_regresivo. Negativo = tiempo cumplido, en sobretiempo. */
  segundosRestantes(p: PuestoVM): number {
    if (p.modalidad !== 'conteo_regresivo' || !p.minutos_asignados) return 0;
    return p.minutos_asignados * 60 - this.segundosTranscurridos(p);
  }

  tiempoFormateado(p: PuestoVM): string {
    if (p.modalidad === 'conteo_regresivo') {
      const restante = this.segundosRestantes(p);
      return segundosATexto(Math.abs(restante), restante < 0);
    }
    return segundosATexto(this.segundosTranscurridos(p), false);
  }

  nivelAlerta(p: PuestoVM): NivelAlerta {
    if (p.modalidad !== 'conteo_regresivo') return 'normal';
    const restante = this.segundosRestantes(p);
    if (restante < 0) return 'vencido';
    if (restante <= SEGUNDOS_CRITICO) return 'critico';
    if (restante <= SEGUNDOS_AVISO) return 'aviso';
    return 'normal';
  }

  previewPrecio(p: PuestoVM): number {
    const minutos = p.modoSeleccionado === 'conteo_regresivo' && !p.sesion_id
      ? p.minutosInput || 0
      : this.minutosTranscurridos(p);
    return calcularPrecioTotal({
      minutos,
      controlesAdicionales: p.controlesInput,
      precioManual: p.usarPrecioManual ? p.precioManualInput : null,
    }).precioTotal;
  }

  /**
   * Vista previa al CERRAR una sesión de conteo regresivo: el precio base ya quedó
   * fijo al abrir (`p.precio_base`), solo cambia si el empleado ajusta controles
   * adicionales de último momento — cobrados por hora igual que en cronometrado.
   */
  previewCierreRegresivo(p: PuestoVM): number {
    if (!p.minutos_asignados) return p.precio_total ?? 0;
    const { horas } = calcularTarifa(p.minutos_asignados);
    return (p.precio_base ?? 0) + p.controlesInput * PRECIO_CONTROL_POR_HORA * horas;
  }

  // ── Alertas (visual + notificación + sonido) ───────────────────────────

  private revisarAlertas(): void {
    for (const p of this.puestos()) {
      if (!p.sesion_id || p.modalidad !== 'conteo_regresivo') continue;
      const nivel = this.nivelAlerta(p);
      if (nivel === 'normal') continue;

      const umbral: UmbralAvisado = nivel;
      const yaAvisados = this.avisosEnviados.get(p.sesion_id) ?? new Set<UmbralAvisado>();
      if (yaAvisados.has(umbral)) continue;
      yaAvisados.add(umbral);
      this.avisosEnviados.set(p.sesion_id, yaAvisados);

      this.emitirAviso(p, umbral);
    }
  }

  private emitirAviso(p: PuestoVM, umbral: UmbralAvisado): void {
    const mensajes: Record<UmbralAvisado, string> = {
      aviso: `${p.nombre}: quedan 5 minutos.`,
      critico: `${p.nombre}: queda 1 minuto.`,
      vencido: `${p.nombre}: tiempo cumplido.`,
    };
    const texto = mensajes[umbral];

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Alfa Games', { body: texto });
    }

    if (umbral === 'aviso') reproducirBeep(880, 150);
    else if (umbral === 'critico') reproducirBeep(880, 300);
    else reproducirBeep(660, 600);
  }
}
