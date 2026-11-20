import { Component, OnInit, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DestinoPago, ReservasService } from '../core/reservas.service';
import { ToastService } from '../core/toast.service';

/**
 * Configuración del QR y la llave de pago de un negocio. Sala: en Reservas → Configuración
 * (admin). Domicilio: en Alquiler → Configuración (admin o rol alquiler). Son cuentas
 * distintas para no mezclar la plata del local con la del alquiler.
 */
@Component({
  selector: 'app-pago-config',
  imports: [FormsModule],
  template: `
    <div class="flex flex-wrap items-start gap-4">
      <div class="space-y-2">
        <p class="text-xs font-medium text-slate-500">QR de pago {{ nombre() }}</p>
        @if (qr()) {
          <img [src]="qr()" alt="QR de pago" class="w-40 rounded-lg ring-1 ring-slate-200" />
        } @else {
          <p class="text-xs text-amber-700">⚠️ Falta subir el QR.</p>
        }
        <label class="inline-block cursor-pointer rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-900"
          [class.opacity-50]="ocupado()">
          {{ qr() ? 'Cambiar QR' : 'Subir QR' }}
          <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" [disabled]="ocupado()" (change)="subirQr($event)" />
        </label>
      </div>
      <div class="min-w-[220px] flex-1 space-y-2">
        <label class="block text-xs font-medium text-slate-500">
          Llave de pago {{ nombre() }} (para quien no sabe pagar con QR)
          <input [(ngModel)]="llaveTexto" [name]="'llave-' + destino()" maxlength="100" placeholder="Ej. @alfagames o 3001234567"
            class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800" />
        </label>
        <button type="button" (click)="guardarLlave()" [disabled]="ocupado()"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">Guardar llave</button>
        <p class="text-xs text-slate-500">{{ ayuda() }}</p>
      </div>
    </div>
  `,
})
export class PagoConfig implements OnInit {
  readonly destino = input.required<DestinoPago>();

  readonly qr = signal<string | null>(null);
  readonly ocupado = signal(false);
  llaveTexto = '';

  constructor(
    private readonly reservas: ReservasService,
    private readonly toast: ToastService,
  ) {}

  nombre(): string {
    return this.destino() === 'sala' ? 'de la sala' : 'del alquiler a domicilio';
  }

  ayuda(): string {
    return this.destino() === 'sala'
      ? 'Se muestra en /reservar y GTA 6 en la sala. El alquiler a domicilio tiene su propio QR y llave (Alquiler → Configuración).'
      : 'Se muestra en /alquilar y GTA 6 a domicilio. La sala tiene su propio QR y llave (Reservas → Configuración).';
  }

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      const p = await this.reservas.pago(this.destino());
      this.qr.set(p.qr);
      this.llaveTexto = p.llave ?? '';
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async subirQr(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    this.ocupado.set(true);
    try {
      await this.reservas.subirQr(archivo, this.destino());
      this.toast.exito(`QR ${this.nombre()} guardado.`);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  async guardarLlave(): Promise<void> {
    this.ocupado.set(true);
    try {
      await this.reservas.guardarLlave(this.destino(), this.llaveTexto);
      this.toast.exito(this.llaveTexto.trim() ? `Llave ${this.nombre()} guardada.` : `Llave ${this.nombre()} quitada.`);
      await this.cargar();
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
