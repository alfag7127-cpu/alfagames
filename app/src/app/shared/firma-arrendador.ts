import { Component, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlquilerService } from '../core/alquiler.service';
import { ReservasService } from '../core/reservas.service';
import { ToastService } from '../core/toast.service';
import { FirmaPad } from './firma-pad';

/**
 * Firma, nombre y cédula del arrendador para el contrato. El dueño los guarda una sola vez
 * y salen solos en todos los contratos. Solo el dueño los cambia (candado en la base de datos).
 */
@Component({
  selector: 'app-firma-arrendador',
  imports: [FormsModule, FirmaPad],
  template: `
    <div class="space-y-3 text-sm">
      @if (puedeEditar()) {
        <div class="grid gap-2 sm:grid-cols-2">
          <label class="block text-xs font-medium text-slate-500">Nombre del arrendador
            <input [(ngModel)]="nombre" name="arr-nombre" maxlength="120" class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800" />
          </label>
          <label class="block text-xs font-medium text-slate-500">Cédula
            <input [(ngModel)]="cedula" name="arr-cedula" maxlength="20" inputmode="numeric" class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800" />
          </label>
        </div>
        <button type="button" (click)="guardarDatos()" [disabled]="ocupado()" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">Guardar nombre y cédula</button>
      } @else {
        <p><b>Arrendador:</b> {{ nombre || 'sin nombre' }} · C.C. {{ cedula || '—' }}</p>
      }

      <div class="space-y-1">
        <p class="text-xs font-medium text-slate-500">Firma del arrendador</p>
        @if (firma()) {
          <img [src]="firma()" alt="Firma del arrendador" class="h-24 rounded bg-white ring-1 ring-slate-200" />
        } @else {
          <p class="text-xs text-amber-700">⚠️ Aún no hay firma guardada.</p>
        }
      </div>

      @if (puedeEditar()) {
        @if (cambiandoFirma()) {
          <app-firma-pad #pad (cambio)="hayTrazo.set($event)" />
          <div class="flex gap-2">
            <button type="button" (click)="guardarFirma()" [disabled]="!hayTrazo() || ocupado()" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Guardar mi firma</button>
            <button type="button" (click)="cambiandoFirma.set(false)" class="rounded-lg px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-300">Cancelar</button>
          </div>
        } @else {
          <div class="flex flex-wrap gap-2">
            <button type="button" (click)="cambiandoFirma.set(true)" class="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-900">
              ✍️ {{ firma() ? 'Cambiar mi firma' : 'Dibujar mi firma' }}
            </button>
            <!-- Pedido del dueño: subir la foto de su firma en papel (PNG con fondo transparente o blanco). -->
            <label class="cursor-pointer rounded-lg bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50" [class.opacity-50]="ocupado()">
              📷 Subir foto de mi firma
              <input type="file" accept="image/png" class="hidden" [disabled]="ocupado()" (change)="subirFoto($event)" />
            </label>
          </div>
          <p class="text-xs text-slate-500">La foto debe ser PNG, solo con el trazo de la firma (sin nombre ni cédula).</p>
        }
      } @else {
        <p class="text-xs text-slate-500">🔒 Solo el dueño puede cambiar la firma y los datos del arrendador.</p>
      }
    </div>
  `,
})
export class FirmaArrendador implements OnInit {
  readonly puedeEditar = signal(false);
  readonly firma = signal<string | null>(null);
  readonly cambiandoFirma = signal(false);
  readonly hayTrazo = signal(false);
  readonly ocupado = signal(false);
  private readonly pad = viewChild<FirmaPad>('pad');
  nombre = '';
  cedula = '';

  constructor(
    private readonly alquiler: AlquilerService,
    private readonly reservas: ReservasService,
    private readonly toast: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    const [puede, config, firma] = await Promise.all([
      this.reservas.puedoEditarPagos(),
      this.alquiler.obtenerConfig().catch(() => null),
      this.alquiler.firmaArrendador().catch(() => null),
    ]);
    this.puedeEditar.set(puede);
    this.nombre = config?.arrendador_nombre ?? '';
    this.cedula = config?.arrendador_cedula ?? '';
    this.firma.set(firma);
  }

  async guardarDatos(): Promise<void> {
    this.ocupado.set(true);
    try {
      await this.alquiler.guardarArrendador(this.nombre, this.cedula);
      this.toast.exito('Datos del arrendador guardados.');
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  async guardarFirma(): Promise<void> {
    const url = this.pad()?.imagen();
    if (!url) return;
    this.ocupado.set(true);
    try {
      const png = await (await fetch(url)).blob();
      await this.alquiler.guardarFirmaArrendador(png);
      this.firma.set(url);
      this.cambiandoFirma.set(false);
      this.toast.exito('Tu firma quedó guardada. Saldrá en todos los contratos.');
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  async subirFoto(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    if (archivo.type !== 'image/png') return this.toast.error('La firma debe ser una imagen PNG.');
    if (archivo.size > 2_000_000) return this.toast.error('La imagen es muy pesada (máximo 2 MB).');
    this.ocupado.set(true);
    try {
      await this.alquiler.guardarFirmaArrendador(archivo);
      this.firma.set(await this.alquiler.firmaArrendador());
      this.toast.exito('Tu firma quedó guardada. Saldrá en todos los contratos.');
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  private mensaje(e: unknown): string {
    return (e as { message?: string })?.message ?? 'No se pudo guardar.';
  }
}
