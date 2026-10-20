import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlquilerService } from '../../core/alquiler.service';
import { AuthService } from '../../core/auth.service';
import { Alquiler, AlquilerConfig, AlquilerTarifa, ConsolaConEstado, TipoConsola } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { fechaColombia, finDiaColombia, inicioDiaColombia, sumarDias } from '../../core/zona-horaria';
import { formatearDuracion } from '../../shared/duracion.pipe';
import { Contratos } from '../../shared/contratos';
import { prepararArchivo } from '../../shared/comprimir-imagen';

type Pestana = 'consolas' | 'historial' | 'inventario';

interface ConsolaVM extends ConsolaConEstado {
  procesando: boolean;
  // Formulario para alquilar
  formAbierto: boolean;
  tarifaId: number | null;
  clienteNombre: string;
  clienteTelefono: string;
  clienteDireccion: string;
  controlesExtra: number;
  cambiarPrecio: boolean;
  precioFinal: number | null;
  notasEntrega: string;
  /** Fotos o PDF del contrato, se suben al registrar el alquiler. */
  contratoArchivos: File[];
  // Extensión (más tiempo pagado)
  extenderAbierto: boolean;
  extTarifaId: number | null;
  extHoras: number | null;
  extCambiarPrecio: boolean;
  extPrecio: number | null;
  verContrato: boolean;
  // Formulario de devolución
  devolverAbierto: boolean;
  ajustarPrecioDevolucion: boolean;
  precioDevolucion: number | null;
  notasDevolucion: string;
}

const FORM_VACIO = {
  procesando: false,
  formAbierto: false,
  tarifaId: null,
  clienteNombre: '',
  clienteTelefono: '',
  clienteDireccion: '',
  controlesExtra: 0,
  cambiarPrecio: false,
  precioFinal: null,
  notasEntrega: '',
  contratoArchivos: [] as File[],
  extenderAbierto: false,
  extTarifaId: null,
  extHoras: null,
  extCambiarPrecio: false,
  extPrecio: null,
  verContrato: false,
  devolverAbierto: false,
  ajustarPrecioDevolucion: false,
  precioDevolucion: null,
  notasDevolucion: '',
};

@Component({
  selector: 'app-alquiler',
  imports: [FormsModule, DecimalPipe, DatePipe, Contratos],
  templateUrl: './alquiler.html',
})
export class AlquilerPage implements OnInit, OnDestroy {
  readonly pestana = signal<Pestana>('consolas');
  readonly consolas = signal<ConsolaVM[]>([]);
  readonly tarifas = signal<AlquilerTarifa[]>([]);
  readonly config = signal<AlquilerConfig | null>(null);
  readonly controlesLibres = signal(0);
  readonly historial = signal<Alquiler[]>([]);
  private readonly ahora = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;

  // Filtros del historial (fechas en hora de Colombia)
  desde = sumarDias(fechaColombia(), -30);
  hasta = fechaColombia();

  // Admin: nueva consola
  nuevaNombre = '';
  nuevaTipo: TipoConsola = 'PS4';
  nuevaDescripcion = '';
  nuevaControles = 2;

  readonly enInventario = computed(() => this.consolas().filter((c) => c.activo));
  readonly disponibles = computed(() => this.enInventario().filter((c) => !c.alquiler_id).length);
  readonly alquiladas = computed(() => this.enInventario().filter((c) => !!c.alquiler_id).length);
  readonly vencidas = computed(
    () => this.enInventario().filter((c) => c.fin_pactado && new Date(c.fin_pactado).getTime() < this.ahora()).length,
  );
  readonly totalHistorial = computed(() =>
    this.historial()
      .filter((a) => a.estado !== 'cancelado')
      .reduce((s, a) => s + this.totalPagado(a), 0),
  );
  /** Historial: qué fila tiene abierto su contrato. */
  readonly contratoAbierto = signal<number | null>(null);

  constructor(
    private readonly alquiler: AlquilerService,
    readonly auth: AuthService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.cargarHistorial();
    this.unsubscribe = this.alquiler.onCambios(() => {
      this.cargar();
      this.cargarHistorial();
    });
    this.timer = setInterval(() => this.ahora.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.unsubscribe?.();
  }

  async cargar(): Promise<void> {
    try {
      const [consolas, tarifas, config, libres] = await Promise.all([
        this.alquiler.listarConsolasConEstado(),
        this.alquiler.listarTarifas(),
        this.alquiler.obtenerConfig(),
        this.alquiler.controlesLibres(),
      ]);
      // Conserva lo que el empleado está escribiendo si llega una actualización.
      const previas = new Map(this.consolas().map((c) => [c.id, c]));
      this.consolas.set(
        consolas.map((c) => {
          const previa = previas.get(c.id);
          return previa && previa.alquiler_id === c.alquiler_id ? { ...previa, ...c } : { ...c, ...FORM_VACIO };
        }),
      );
      this.tarifas.set(tarifas);
      this.config.set(config);
      this.controlesLibres.set(libres);
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  async cargarHistorial(): Promise<void> {
    try {
      this.historial.set(
        await this.alquiler.historial(
          this.desde ? inicioDiaColombia(this.desde) : undefined,
          this.hasta ? finDiaColombia(this.hasta) : undefined,
        ),
      );
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  // ── Alquilar ──

  tarifasDe(tipo: TipoConsola): AlquilerTarifa[] {
    return this.tarifas().filter((t) => t.tipo === tipo && t.activo);
  }

  private actualizar(id: number, cambios: Partial<ConsolaVM>): void {
    this.consolas.update((list) => list.map((c) => (c.id === id ? { ...c, ...cambios } : c)));
  }

  abrirFormulario(c: ConsolaVM): void {
    this.actualizar(c.id, { ...FORM_VACIO, formAbierto: true, tarifaId: this.tarifasDe(c.tipo)[0]?.id ?? null });
  }

  cerrarFormularios(c: ConsolaVM): void {
    this.actualizar(c.id, { formAbierto: false, devolverAbierto: false, extenderAbierto: false });
  }

  ajustarControlesExtra(c: ConsolaVM, delta: number): void {
    const valor = Math.min(this.controlesLibres(), Math.max(0, c.controlesExtra + delta));
    this.actualizar(c.id, { controlesExtra: valor });
  }

  precioSugerido(c: ConsolaVM): number {
    const tarifa = this.tarifas().find((t) => t.id === c.tarifaId);
    return (tarifa?.precio ?? 0) + c.controlesExtra * (this.config()?.precio_control_extra ?? 0);
  }

  toggleCambiarPrecio(c: ConsolaVM): void {
    this.actualizar(c.id, { cambiarPrecio: !c.cambiarPrecio, precioFinal: c.cambiarPrecio ? null : this.precioSugerido(c) });
  }

  async alquilar(c: ConsolaVM): Promise<void> {
    if (!c.tarifaId) return this.toast.error('Elige un plan.');
    if (!c.clienteNombre.trim()) return this.toast.error('Escribe el nombre del cliente.');
    if (c.cambiarPrecio && (c.precioFinal == null || c.precioFinal < 0)) {
      return this.toast.error('Escribe el precio a cobrar (o desmarca "Cambiar precio").');
    }
    this.actualizar(c.id, { procesando: true });
    try {
      const a = await this.alquiler.alquilar({
        consolaId: c.id,
        tarifaId: c.tarifaId,
        clienteNombre: c.clienteNombre,
        clienteTelefono: c.clienteTelefono || null,
        clienteDireccion: c.clienteDireccion || null,
        controlesExtra: c.controlesExtra,
        precioFinal: c.cambiarPrecio ? c.precioFinal : null,
        notas: c.notasEntrega || null,
      });
      this.toast.exito(`${c.nombre} alquilada a ${a.cliente_nombre}: ${a.precio_total.toLocaleString('es-CO')} COP.`);
      await this.subirContratosNuevos(a.id, c.contratoArchivos);
      await Promise.all([this.cargar(), this.cargarHistorial()]);
    } catch (e) {
      this.toast.error(this.mensajeError(e));
      this.actualizar(c.id, { procesando: false });
    }
  }

  elegirContrato(c: ConsolaVM, evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.actualizar(c.id, { contratoArchivos: [...c.contratoArchivos, ...Array.from(input.files ?? [])] });
    input.value = '';
  }

  quitarContratoElegido(c: ConsolaVM, indice: number): void {
    this.actualizar(c.id, { contratoArchivos: c.contratoArchivos.filter((_, i) => i !== indice) });
  }

  /** El alquiler ya quedó registrado; si falla un archivo se avisa y se puede adjuntar después. */
  private async subirContratosNuevos(alquilerId: number, archivos: File[]): Promise<void> {
    if (!archivos.length) return;
    try {
      for (const archivo of archivos) {
        await this.alquiler.subirContrato(alquilerId, await prepararArchivo(archivo));
      }
      this.toast.exito('Contrato adjuntado.');
    } catch (e) {
      this.toast.error(`El alquiler quedó registrado, pero el contrato no se subió: ${this.mensajeError(e)}. Adjúntalo desde la tarjeta.`);
    }
  }

  // ── Extender (más tiempo pagado) ──

  abrirExtension(c: ConsolaVM): void {
    this.actualizar(c.id, {
      extenderAbierto: true,
      devolverAbierto: false,
      extTarifaId: this.tarifasDe(c.tipo)[0]?.id ?? null,
      extHoras: null,
      extCambiarPrecio: false,
      extPrecio: null,
    });
  }

  elegirPlanExtension(c: ConsolaVM, tarifaId: number): void {
    this.actualizar(c.id, { extTarifaId: tarifaId, extHoras: null });
  }

  elegirHorasExtension(c: ConsolaVM): void {
    // Horas sueltas no tienen tarifa: el precio se escribe a mano.
    this.actualizar(c.id, { extTarifaId: null, extHoras: c.extHoras ?? 1, extCambiarPrecio: true });
  }

  precioSugeridoExtension(c: ConsolaVM): number | null {
    const tarifa = this.tarifas().find((t) => t.id === c.extTarifaId);
    if (!tarifa) return null;
    return tarifa.precio + (c.controles_extra ?? 0) * (this.config()?.precio_control_extra ?? 0);
  }

  toggleCambiarPrecioExtension(c: ConsolaVM): void {
    this.actualizar(c.id, {
      extCambiarPrecio: !c.extCambiarPrecio,
      extPrecio: c.extCambiarPrecio ? null : this.precioSugeridoExtension(c),
    });
  }

  async extender(c: ConsolaVM): Promise<void> {
    if (!c.alquiler_id) return;
    if (!c.extTarifaId && (!c.extHoras || c.extHoras <= 0)) return this.toast.error('Elige un plan o las horas.');
    if ((c.extCambiarPrecio || !c.extTarifaId) && (c.extPrecio == null || c.extPrecio < 0)) {
      return this.toast.error('Escribe el precio que pagó el cliente.');
    }
    this.actualizar(c.id, { procesando: true });
    try {
      const a = await this.alquiler.extender(c.alquiler_id, {
        tarifaId: c.extTarifaId,
        horas: c.extTarifaId ? null : c.extHoras,
        precioFinal: c.extCambiarPrecio || !c.extTarifaId ? c.extPrecio : null,
      });
      this.toast.exito(`${c.nombre}: tiempo extendido hasta ${new Date(a.fin_pactado).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })}.`);
      this.actualizar(c.id, { extenderAbierto: false, procesando: false });
      await Promise.all([this.cargar(), this.cargarHistorial()]);
    } catch (e) {
      this.toast.error(this.mensajeError(e));
      this.actualizar(c.id, { procesando: false });
    }
  }

  /** Lo que pagó el cliente: entrega + extensiones. */
  totalPagado(a: Alquiler): number {
    return a.precio_total + (a.alquiler_extensiones ?? []).reduce((s, e) => s + e.precio, 0);
  }

  toggleContratoHistorial(id: number): void {
    this.contratoAbierto.update((actual) => (actual === id ? null : id));
  }

  // ── Devolver / cancelar ──

  abrirDevolucion(c: ConsolaVM): void {
    this.actualizar(c.id, { devolverAbierto: true, extenderAbierto: false, ajustarPrecioDevolucion: false, precioDevolucion: c.precio_total, notasDevolucion: '' });
  }

  async devolver(c: ConsolaVM): Promise<void> {
    if (!c.alquiler_id) return;
    if (c.ajustarPrecioDevolucion && (c.precioDevolucion == null || c.precioDevolucion < 0)) {
      return this.toast.error('Escribe el precio final.');
    }
    this.actualizar(c.id, { procesando: true });
    try {
      const a = await this.alquiler.devolver(
        c.alquiler_id,
        c.ajustarPrecioDevolucion ? c.precioDevolucion : null,
        c.notasDevolucion || null,
      );
      this.toast.exito(`${c.nombre} recibida. Total: $${a.precio_total.toLocaleString('es-CO')} COP.`);
      await Promise.all([this.cargar(), this.cargarHistorial()]);
    } catch (e) {
      this.toast.error(this.mensajeError(e));
      this.actualizar(c.id, { procesando: false });
    }
  }

  async cancelar(c: ConsolaVM): Promise<void> {
    if (!c.alquiler_id) return;
    if (!confirm(`¿Cancelar el alquiler de ${c.nombre}? No contará como venta.`)) return;
    this.actualizar(c.id, { procesando: true });
    try {
      await this.alquiler.cancelar(c.alquiler_id);
      this.toast.info(`Alquiler de ${c.nombre} cancelado.`);
      await Promise.all([this.cargar(), this.cargarHistorial()]);
    } catch (e) {
      this.toast.error(this.mensajeError(e));
      this.actualizar(c.id, { procesando: false });
    }
  }

  // ── Tiempo ──

  minutosRestantes(c: ConsolaConEstado): number {
    if (!c.fin_pactado) return 0;
    return Math.floor((new Date(c.fin_pactado).getTime() - this.ahora()) / 60000);
  }

  textoRestante(c: ConsolaConEstado): string {
    const min = this.minutosRestantes(c);
    if (min >= 0) return `Quedan ${formatearDuracion(Math.max(min, 1))}`;
    return `Vencida hace ${formatearDuracion(-min)}`;
  }

  nombreConsola(id: number): string {
    return this.consolas().find((c) => c.id === id)?.nombre ?? `Consola #${id}`;
  }

  /** Enlace de WhatsApp para escribirle al cliente (número colombiano). */
  enlaceWhatsapp(telefono: string | null): string | null {
    const digitos = (telefono ?? '').replace(/\D/g, '');
    if (digitos.length < 7) return null;
    return `https://wa.me/${digitos.length === 10 ? '57' + digitos : digitos}`;
  }

  // ── Admin ──

  async agregarConsola(): Promise<void> {
    const nombre = this.nuevaNombre.trim();
    if (!nombre) return this.toast.error('Escribe el nombre de la consola.');
    try {
      await this.alquiler.crearConsola({
        nombre,
        tipo: this.nuevaTipo,
        descripcion: this.nuevaDescripcion.trim() || null,
        controlesIncluidos: this.nuevaControles,
      });
      this.toast.exito(`${nombre} agregada al inventario.`);
      this.nuevaNombre = '';
      this.nuevaDescripcion = '';
      this.nuevaControles = 2;
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  async cambiarActivo(c: ConsolaVM): Promise<void> {
    if (c.activo && c.alquiler_id) return this.toast.error(`${c.nombre} está alquilada; recíbela antes de quitarla.`);
    if (c.activo && !confirm(`¿Quitar ${c.nombre} del inventario? Su historial se conserva.`)) return;
    try {
      await this.alquiler.actualizarConsola(c.id, { activo: !c.activo });
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  async guardarTarifa(t: AlquilerTarifa, valor: number | null): Promise<void> {
    if (valor == null || valor <= 0 || valor === t.precio) return;
    try {
      await this.alquiler.actualizarTarifa(t.id, valor);
      this.toast.exito(`${t.tipo} · ${t.nombre}: $${valor.toLocaleString('es-CO')}`);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  async guardarConfig(cambios: { controles_sueltos?: number; precio_control_extra?: number }): Promise<void> {
    try {
      await this.alquiler.actualizarConfig(cambios);
      this.toast.exito('Configuración guardada.');
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  private mensajeError(e: unknown): string {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code === '23505') {
      return 'Ya existe una consola con ese nombre.';
    }
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}
