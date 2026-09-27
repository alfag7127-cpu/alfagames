import { DuracionPipe } from '../../shared/duracion.pipe';
import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { Modalidad, PuestoConEstado } from '../../core/models';
import { MAX_CONTROLES_ADICIONALES, calcularCobro } from '../../core/pricing';
import { SesionesService } from '../../core/sesiones.service';
import { ToastService } from '../../core/toast.service';

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
  controlesInput: number;
  // Precio especial pactado al abrir un conteo regresivo
  usarPrecioManual: boolean;
  precioManualInput: number | null;
  // Al cobrar: cambiar el precio sugerido por otro
  cambiarPrecio: boolean;
  precioFinalInput: number | null;
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
  imports: [DuracionPipe, FormsModule, DecimalPipe],
  templateUrl: './sala.html',
})
export class Sala implements OnInit, OnDestroy {
  readonly puestos = signal<PuestoVM[]>([]);
  private readonly ahora = signal(Date.now());
  private timerHandle?: ReturnType<typeof setInterval>;
  private unsubscribeRealtime?: () => void;
  /** Qué umbrales ya se avisaron para cada sesión, para no repetir el aviso cada segundo. */
  private readonly avisosEnviados = new Map<number, Set<UmbralAvisado>>();

  constructor(
    private readonly sesiones: SesionesService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
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
      // Conserva lo que el empleado ya escribió en un formulario abierto (evita perder
      // el nombre del cliente o los minutos elegidos cuando llega una actualización realtime).
      const previos = new Map(this.puestos().map((p) => [p.id, p]));
      this.puestos.set(
        data.map((p) => {
          const previo = previos.get(p.id);
          if (previo && previo.sesion_id === p.sesion_id) {
            return { ...previo, ...p };
          }
          return {
            ...p,
            formAbierto: false,
            modoSeleccionado: 'cronometrado',
            clienteInput: '',
            minutosInput: 60,
            controlesInput: 0,
            usarPrecioManual: false,
            precioManualInput: null,
            cambiarPrecio: false,
            precioFinalInput: null,
            procesando: false,
          };
        }),
      );
    } catch (e) {
      this.toast.error(this.mensajeError(e));
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

  ajustarControles(puestoId: number, delta: number): void {
    this.puestos.update((list) =>
      list.map((p) =>
        p.id === puestoId
          ? { ...p, controlesInput: Math.min(MAX_CONTROLES_ADICIONALES, Math.max(0, p.controlesInput + delta)) }
          : p,
      ),
    );
  }

  seleccionarMinutosPreset(puestoId: number, minutos: number): void {
    this.puestos.update((list) =>
      list.map((p) => (p.id === puestoId ? { ...p, minutosInput: minutos } : p)),
    );
  }

  async abrir(p: PuestoVM): Promise<void> {
    if (!this.auth.currentProfile()?.id) return;
    this.marcarProcesando(p.id, true);
    try {
      const regresivo = p.modoSeleccionado === 'conteo_regresivo';
      if (regresivo && (!p.minutosInput || p.minutosInput <= 0)) {
        throw new Error('Indica cuántos minutos de conteo regresivo.');
      }
      await this.sesiones.abrirSesion({
        puestoId: p.id,
        clienteNombre: p.clienteInput.trim() || null,
        modalidad: p.modoSeleccionado,
        minutosAsignados: p.minutosInput,
        controlesAdicionales: p.controlesInput,
        precioManual: regresivo && p.usarPrecioManual ? p.precioManualInput : null,
      });
      await this.cargar();
      this.toast.exito(`${p.nombre}: sesión abierta.`);
    } catch (e) {
      this.toast.error(this.mensajeError(e));
      this.marcarProcesando(p.id, false);
    }
  }

  /** Suma un control adicional ahora mismo; se cobra desde este momento. */
  async agregarControl(p: PuestoVM): Promise<void> {
    if (!p.sesion_id) return;
    this.marcarProcesando(p.id, true);
    try {
      await this.sesiones.agregarControl(p.sesion_id);
      await this.cargar();
      this.toast.exito(`${p.nombre}: control adicional agregado.`);
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    } finally {
      this.marcarProcesando(p.id, false);
    }
  }

  /** Quita el control adicional más reciente; deja de cobrarse desde este momento. */
  async quitarControl(p: PuestoVM): Promise<void> {
    if (!p.sesion_id) return;
    this.marcarProcesando(p.id, true);
    try {
      await this.sesiones.quitarControl(p.sesion_id);
      await this.cargar();
      this.toast.exito(`${p.nombre}: control adicional retirado.`);
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    } finally {
      this.marcarProcesando(p.id, false);
    }
  }

  /** Conteo regresivo: el cliente compra más tiempo; el precio se recalcula sobre el total. */
  async extender(p: PuestoVM, minutos: number): Promise<void> {
    if (!p.sesion_id) return;
    this.marcarProcesando(p.id, true);
    try {
      const sesion = await this.sesiones.extenderSesion(p.sesion_id, minutos);
      await this.cargar();
      this.toast.exito(
        `${p.nombre}: +${minutos} min. Nuevo total $${(sesion.precio_total ?? 0).toLocaleString('es-CO')} COP.`,
      );
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    } finally {
      this.marcarProcesando(p.id, false);
    }
  }

  async cerrar(p: PuestoVM): Promise<void> {
    if (!p.sesion_id) return;
    this.marcarProcesando(p.id, true);
    try {
      let precioFinal: number | null = null;
      if (p.cambiarPrecio) {
        if (p.precioFinalInput == null || p.precioFinalInput < 0) {
          throw new Error('Escribe el precio a cobrar (o desmarca "Cambiar precio").');
        }
        precioFinal = p.precioFinalInput;
      }
      const sesion = await this.sesiones.cerrarSesion(p.sesion_id, precioFinal);
      await this.cargar();
      const total = sesion.precio_total ?? 0;
      this.toast.exito(`${p.nombre}: cobrado $${total.toLocaleString('es-CO')} COP.`);
    } catch (e) {
      // Ej: otro empleado ya cerró esta sesión desde otro puesto — refresca para ver el estado real.
      this.toast.error(this.mensajeError(e));
      await this.cargar();
      this.marcarProcesando(p.id, false);
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

  readonly maxControles = MAX_CONTROLES_ADICIONALES;
  /** Atajos de conteo regresivo: de 30 min a 6 h (lo máximo que suelen jugar). */
  readonly presetsMinutos = [30, 60, 90, 120, 180, 240, 300, 360];

  /** Total pactado en el formulario de apertura de conteo regresivo (controles desde el inicio). */
  previewApertura(p: PuestoVM): number {
    const minutos = p.minutosInput || 0;
    return calcularCobro(
      minutos,
      Array(p.controlesInput).fill(minutos),
      p.usarPrecioManual ? p.precioManualInput : null,
    ).precioTotal;
  }

  /** "Cuánto va" en una sesión cronometrada activa: cada control cuenta mientras estuvo en uso. */
  previewCronometrado(p: PuestoVM): number {
    const ahora = this.ahora();
    const minutosControles = (p.controles ?? []).map((c) => {
      const fin = c.hasta ? new Date(c.hasta).getTime() : ahora;
      return Math.max(0, fin - new Date(c.desde).getTime()) / 60000;
    });
    return calcularCobro(this.segundosTranscurridos(p) / 60, minutosControles).precioTotal;
  }

  /** Precio que sugiere el sistema al cobrar. En conteo regresivo es el pactado (ya recalculado por el servidor). */
  precioSugerido(p: PuestoVM): number {
    return p.modalidad === 'conteo_regresivo' ? (p.precio_total ?? 0) : this.previewCronometrado(p);
  }

  toggleCambiarPrecio(p: PuestoVM): void {
    const sugerido = this.precioSugerido(p);
    this.puestos.update((list) =>
      list.map((x) =>
        x.id === p.id
          ? { ...x, cambiarPrecio: !x.cambiarPrecio, precioFinalInput: x.cambiarPrecio ? null : sugerido }
          : x,
      ),
    );
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
    if (umbral === 'vencido') this.toast.error(texto);
    else this.toast.info(texto);

    if (umbral === 'aviso') reproducirBeep(880, 150);
    else if (umbral === 'critico') reproducirBeep(880, 300);
    else reproducirBeep(660, 600);
  }
}
