import { DatePipe } from '@angular/common';
import { Component, OnInit, input, signal } from '@angular/core';
import { AlquilerService, ArchivoContrato, FirmaEnLinea } from '../core/alquiler.service';
import { generarContratoPdf } from './contrato-pdf';
import { ToastService } from '../core/toast.service';
import { prepararArchivo } from './comprimir-imagen';
import { ContratoFirma } from './contrato-firma';

/** Reservas cuyo PDF firmado en línea ya se está guardando en esta pestaña. */
const GUARDANDO_EN_LINEA = new Set<number>();

/**
 * Contrato firmado de un alquiler: fotos o PDF guardados en el bucket privado
 * "contratos". Se abren con un enlace temporal (no son públicos).
 * "✍️ Firmar contrato" llena el formato del dueño y el cliente firma en pantalla.
 */
@Component({
  selector: 'app-contratos',
  imports: [DatePipe, ContratoFirma],
  template: `
    <div class="rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 space-y-2 text-sm">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold text-slate-600">📎 Contrato firmado</span>
        <span class="flex items-center gap-1.5">
        <button type="button" (click)="firmando.set(true)"
          class="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
          ✍️ Firmar contrato
        </button>
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
        </span>
      </div>
      @if (firmando()) {
        <app-contrato-firma [alquilerId]="alquilerId()" (cerrado)="alCerrarFirma($event)" />
      }
      @if (enLinea(); as f) {
        @if (!f.firmado_en) {
          <p class="text-xs text-amber-700">🕓 Se le envió el enlace para firmar desde su celular; aún no ha firmado.</p>
        } @else if (!f.pdf_guardado_en) {
          <p class="text-xs text-emerald-700">✍️ El cliente firmó desde su celular. Guardando el PDF…</p>
        }
      }
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

  readonly firmando = signal(false);

  ngOnInit(): void {
    this.cargar();
  }

  alCerrarFirma(guardado: boolean): void {
    this.firmando.set(false);
    if (guardado) this.cargar();
  }

  readonly enLinea = signal<FirmaEnLinea | null>(null);

  async cargar(): Promise<void> {
    try {
      const [archivos, enLinea] = await Promise.all([
        this.alquiler.listarContratos(this.alquilerId()),
        this.alquiler.firmaEnLinea(this.alquilerId()).catch(() => null),
      ]);
      this.archivos.set(archivos);
      this.enLinea.set(enLinea);
      if (enLinea?.firma && enLinea.firmado_en && !enLinea.pdf_guardado_en) void this.guardarFirmaEnLinea(enLinea);
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /**
   * El cliente firmó desde su celular (reserva web): se arma el PDF con la firma del dueño
   * y se guarda en el alquiler. Lo hace la app de quien abra primero el alquiler.
   */
  private async guardarFirmaEnLinea(f: FirmaEnLinea): Promise<void> {
    // El mismo alquiler puede verse en dos sitios a la vez (tarjeta e historial): uno solo guarda.
    if (GUARDANDO_EN_LINEA.has(f.reserva_id)) return;
    GUARDANDO_EN_LINEA.add(f.reserva_id);
    try {
      const [d, firmaDueno] = await Promise.all([
        this.alquiler.datosContrato(this.alquilerId()),
        this.alquiler.firmaArrendador().catch(() => null),
      ]);
      const a = d.alquiler;
      const pdf = await generarContratoPdf(
        d,
        {
          mandos: (a.controles ?? 0) + (a.controles_extra ?? 0),
          cablePoder: true,
          cableHdmi: true,
          cableCarga: true,
          otro: (a.juegos_entregados ?? []).join(', '),
        },
        f.firma!,
        firmaDueno,
        new Date(f.firmado_en!),
        true,
      );
      await this.alquiler.subirContratoFirmado(this.alquilerId(), pdf);
      await this.alquiler.marcarContratoGuardado(f.reserva_id);
      this.enLinea.set({ ...f, pdf_guardado_en: new Date().toISOString() });
      this.archivos.set(await this.alquiler.listarContratos(this.alquilerId()));
    } catch {
      // Se reintenta la próxima vez que se abra el alquiler.
      GUARDANDO_EN_LINEA.delete(f.reserva_id);
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
