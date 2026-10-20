import { DatePipe } from '@angular/common';
import { Component, OnInit, input, signal } from '@angular/core';
import { AlquilerService, ArchivoContrato } from '../core/alquiler.service';
import { ToastService } from '../core/toast.service';
import { prepararArchivo } from './comprimir-imagen';

/**
 * Contrato físico firmado de un alquiler: fotos o PDF guardados en el bucket privado
 * "contratos". Se abren con un enlace temporal (no son públicos).
 */
@Component({
  selector: 'app-contratos',
  imports: [DatePipe],
  template: `
    <div class="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 space-y-2 text-sm">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold text-slate-600">📎 Contrato firmado</span>
        <label
          class="cursor-pointer rounded-lg bg-white border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          [class.opacity-50]="subiendo()"
        >
          {{ subiendo() ? 'Subiendo…' : '+ Foto o PDF' }}
          <input
            type="file"
            class="hidden"
            accept="image/*,application/pdf"
            multiple
            [disabled]="subiendo()"
            (change)="subir($event)"
          />
        </label>
      </div>
      @if (cargando()) {
        <p class="text-xs text-slate-400">Cargando…</p>
      } @else {
        @for (a of archivos(); track a.path) {
          <div class="flex items-center justify-between gap-2">
            <button type="button" (click)="abrir(a)" class="truncate text-left text-indigo-600 hover:underline">
              {{ a.esPdf ? '📄' : '🖼️' }} {{ a.nombre }}
            </button>
            <span class="flex items-center gap-2 shrink-0 text-xs text-slate-400">
              {{ a.creado | date }}
              @if (puedeEliminar()) {
                <button type="button" (click)="eliminar(a)" class="text-red-500 hover:underline">Quitar</button>
              }
            </span>
          </div>
        } @empty {
          <p class="text-xs text-slate-400">Sin contrato adjunto todavía.</p>
        }
      }
    </div>
  `,
})
export class Contratos implements OnInit {
  readonly alquilerId = input.required<number>();
  readonly puedeEliminar = input(false);

  readonly archivos = signal<ArchivoContrato[]>([]);
  readonly cargando = signal(true);
  readonly subiendo = signal(false);

  constructor(
    private readonly alquiler: AlquilerService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      this.archivos.set(await this.alquiler.listarContratos(this.alquilerId()));
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }

  async subir(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivos = Array.from(input.files ?? []);
    input.value = '';
    if (!archivos.length) return;
    this.subiendo.set(true);
    try {
      for (const archivo of archivos) {
        await this.alquiler.subirContrato(this.alquilerId(), await prepararArchivo(archivo));
      }
      this.toast.exito(archivos.length === 1 ? 'Contrato adjuntado.' : `${archivos.length} archivos adjuntados.`);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.subiendo.set(false);
    }
  }

  async abrir(a: ArchivoContrato): Promise<void> {
    // Se abre la pestaña antes del await para que el navegador no la bloquee.
    const ventana = window.open('', '_blank');
    try {
      const url = await this.alquiler.urlContrato(a.path);
      if (ventana) ventana.location.href = url;
      else window.location.href = url;
    } catch (e) {
      ventana?.close();
      this.toast.error(this.mensaje(e));
    }
  }

  async eliminar(a: ArchivoContrato): Promise<void> {
    if (!confirm(`¿Quitar ${a.nombre}?`)) return;
    try {
      await this.alquiler.eliminarContrato(a.path);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  private mensaje(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'No se pudo procesar el archivo.';
  }
}
