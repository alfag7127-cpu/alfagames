import { Component, OnInit, input, signal } from '@angular/core';
import { DestinoPago, ReservasService } from '../core/reservas.service';

/**
 * Lo que ve el cliente para pagar en las páginas públicas: el QR y la llave (para quien
 * no sabe pagar con QR). La sala y el alquiler a domicilio tienen cuentas distintas
 * (regla del dueño: no mezclar la plata del local con la del alquiler).
 */
@Component({
  selector: 'app-pago-publico',
  template: `
    @if (cargado()) {
      @if (qr()) {
        <img [src]="qr()" alt="QR para pagar" class="mx-auto w-64 max-w-full rounded-xl bg-white p-2" />
      }
      @if (llave(); as ll) {
        <div class="rounded-xl bg-white/10 p-3 text-sm ring-1 ring-white/20">
          <p class="text-slate-300">{{ qr() ? '¿No sabes pagar con QR? Envía a esta llave:' : 'Paga enviando a esta llave:' }}</p>
          <p class="mt-1 break-all text-xl font-bold tracking-wide text-white select-all">{{ ll }}</p>
          <button type="button" (click)="copiar(ll)"
            class="mt-2 rounded-lg bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25 hover:bg-white/25">
            {{ copiada() ? '✅ Copiada' : '📋 Copiar llave' }}
          </button>
        </div>
      }
      @if (!qr() && !llave()) {
        <p class="rounded-xl bg-amber-500/15 p-3 text-sm text-amber-100 ring-1 ring-amber-400/40">
          El QR de pago aún no está disponible. Escríbenos por WhatsApp para pagar.
        </p>
      }
    }
  `,
})
export class PagoPublico implements OnInit {
  readonly destino = input.required<DestinoPago>();

  readonly qr = signal<string | null>(null);
  readonly llave = signal<string | null>(null);
  readonly cargado = signal(false);
  readonly copiada = signal(false);

  constructor(private readonly reservas: ReservasService) {}

  async ngOnInit(): Promise<void> {
    try {
      const p = await this.reservas.pago(this.destino());
      this.qr.set(p.qr);
      this.llave.set(p.llave);
    } catch {
      // Sin datos: se muestra el aviso de escribir por WhatsApp.
    } finally {
      this.cargado.set(true);
    }
  }

  async copiar(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiada.set(true);
      setTimeout(() => this.copiada.set(false), 2000);
    } catch {
      // Sin portapapeles: la llave se puede seleccionar con el dedo (select-all).
    }
  }
}
