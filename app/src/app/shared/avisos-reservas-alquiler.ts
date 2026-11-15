import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReservaAlquiler } from '../core/gta6.service';
import { ReservasAlquilerService } from '../core/reservas-alquiler.service';
import { ZONA_HORARIA, fechaColombia } from '../core/zona-horaria';
import { sonarCaja } from './sonido-caja';

/**
 * Aviso emergente del alquiler (admin y rol alquiler): llegó una reserva a domicilio nueva desde
 * /alquilar o /gta6-domicilio. Montado en el shell; suena la caja registradora.
 */
@Component({
  selector: 'app-avisos-reservas-alquiler',
  imports: [RouterLink],
  template: `
    @if (nueva(); as r) {
      <div class="fixed bottom-4 right-4 left-4 z-50 rounded-2xl bg-white p-4 shadow-2xl ring-2 ring-lime-500 sm:left-auto sm:w-96">
        <p class="font-bold text-slate-900">🚚 Nueva reserva a domicilio #{{ r.id }}{{ r.juego === 'gta6' ? ' · GTA 6' : '' }}</p>
        <p class="text-sm text-slate-600">
          {{ r.cliente_nombre }} · {{ r.alquiler_consolas?.tipo }} · {{ r.plan_nombre }} · entrega {{ hora(r.inicio) }} · {{ r.precio.toLocaleString('es-CO') }} COP
        </p>
        <p class="text-xs text-lime-700">{{ r.forma_pago === 'efectivo' ? 'Paga en efectivo al recibir: confirma la reserva.' : 'Pagó con QR: revisa el comprobante y confirma.' }}</p>
        <div class="mt-3 flex gap-2">
          <a routerLink="/alquiler" [queryParams]="{ pestana: 'reservas' }" (click)="nueva.set(null)"
            class="flex-1 rounded-lg bg-lime-600 py-2 text-center text-sm font-semibold text-white hover:bg-lime-700">Ver reservas</a>
          <button type="button" (click)="nueva.set(null)" class="rounded-lg bg-slate-100 px-3 text-sm text-slate-700 hover:bg-slate-200">Cerrar</button>
        </div>
      </div>
    }
  `,
})
export class AvisosReservasAlquiler implements OnInit, OnDestroy {
  readonly nueva = signal<ReservaAlquiler | null>(null);
  /** Ids ya vistos; la primera carga no avisa. */
  private vistos: Set<number> | null = null;
  private unsubscribe?: () => void;

  constructor(private readonly servicio: ReservasAlquilerService) {}

  ngOnInit(): void {
    this.revisar();
    this.unsubscribe = this.servicio.onCambios(() => this.revisar());
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  hora(iso: string): string {
    const d = new Date(iso);
    const dia = fechaColombia(d) === fechaColombia() ? 'hoy' : d.toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, day: 'numeric', month: 'short' });
    return `${dia} ${d.toLocaleTimeString('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' })}`;
  }

  private async revisar(): Promise<void> {
    try {
      const lista = await this.servicio.listar();
      if (this.vistos) {
        const nueva = lista.filter((r) => r.estado === 'pendiente' && !this.vistos!.has(r.id)).pop();
        if (nueva) {
          this.nueva.set(nueva);
          sonarCaja();
        }
      }
      this.vistos = new Set(lista.map((r) => r.id));
    } catch {
      /* sin conexión: se intenta en la próxima actualización */
    }
  }
}
