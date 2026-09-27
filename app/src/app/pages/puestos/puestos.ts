import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Puesto } from '../../core/models';
import { PuestosService } from '../../core/puestos.service';
import { ToastService } from '../../core/toast.service';

/** Código de Postgres cuando se viola el índice único de nombre. */
const NOMBRE_DUPLICADO = '23505';

@Component({
  selector: 'app-puestos',
  imports: [FormsModule],
  templateUrl: './puestos.html',
})
export class Puestos implements OnInit {
  readonly puestos = signal<Puesto[]>([]);
  readonly editandoId = signal<number | null>(null);
  nuevoNombre = '';
  nombreEditado = '';

  constructor(
    private readonly puestosService: PuestosService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      const lista = await this.puestosService.listar();
      this.puestos.set(lista);
      if (!this.nuevoNombre) this.nuevoNombre = this.nombreSugerido(lista);
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  /** Siguiente "PS5-N" libre, para no tener que escribirlo. */
  private nombreSugerido(lista: Puesto[]): string {
    const usados = new Set(lista.map((p) => p.nombre.trim().toLowerCase()));
    let n = lista.length + 1;
    while (usados.has(`ps5-${n}`)) n++;
    return `PS5-${n}`;
  }

  async agregar(): Promise<void> {
    const nombre = this.nuevoNombre.trim();
    if (!nombre) return;
    try {
      await this.puestosService.crear(nombre);
      this.toast.exito(`${nombre} agregada a la sala.`);
      this.nuevoNombre = '';
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  empezarEdicion(p: Puesto): void {
    this.editandoId.set(p.id);
    this.nombreEditado = p.nombre;
  }

  async guardarNombre(p: Puesto): Promise<void> {
    const nombre = this.nombreEditado.trim();
    if (!nombre || nombre === p.nombre) {
      this.editandoId.set(null);
      return;
    }
    try {
      await this.puestosService.renombrar(p.id, nombre);
      this.editandoId.set(null);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  async cambiarActivo(p: Puesto): Promise<void> {
    if (p.activo && !confirm(`¿Quitar ${p.nombre} de la sala? Su historial se conserva y la puedes reactivar.`)) {
      return;
    }
    try {
      await this.puestosService.cambiarActivo(p.id, !p.activo);
      this.toast.exito(p.activo ? `${p.nombre} quitada de la sala.` : `${p.nombre} de nuevo en la sala.`);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensajeError(e));
    }
  }

  private mensajeError(e: unknown): string {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code === NOMBRE_DUPLICADO) {
      return 'Ya existe un puesto con ese nombre.';
    }
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}
