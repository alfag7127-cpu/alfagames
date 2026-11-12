import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReservasService, Reserva, numeroReserva } from '../core/reservas.service';
import { ZONA_HORARIA, fechaColombia, inicioDiaColombia } from '../core/zona-horaria';
import { sonarCaja } from './sonido-caja';

/**
 * Aviso emergente para la Sala (admin y trabajador): llegó una reserva nueva desde el
 * enlace público y hay que revisar el pago. Montado en el shell; suena la caja registradora.
 */
@Component({
  selector: 'app-avisos-reservas',
  imports: [RouterLink],
  template: `
    @if (nueva(); as r) {
      <div class="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 rounded-2xl bg-white p-4 shadow-2xl ring-2 ring-amber-400">
        <p class="font-bold text-slate-900">📅 Nueva reserva #{{ num(r) }}</p>
        <p class="text-sm text-slate-600">{{ r.cliente_nombre }} · {{ hora(r.inicio) }} · {{ r.minutos }} min · {{ r.precio.toLocaleString('es-CO') }} COP</p>
        <p class="text-xs text-amber-700">Revisa el comprobante y confirma el pago.</p>
        <div class="mt-3 flex gap-2">
          <a routerLink="/reservas" (click)="nueva.set(null)" class="flex-1 rounded-lg bg-amber-500 py-2 text-center text-sm font-semibold text-white hover:bg-amber-600">Ver reservas</a>
          <button type="button" (click)="nueva.set(null)" class="rounded-lg bg-slate-100 px-3 text-sm text-slate-700 hover:bg-slate-200">Cerrar</button>
        </div>
      </div>
    }
  `,
})
export class AvisosReservas implements OnInit, OnDestroy {
  readonly nueva = signal<Reserva | null>(null);
  readonly num = numeroReserva;
  /** Ids ya vistos; la primera carga no avisa. */
  private vistos: Set<number> | null = null;
  private unsubscribe?: () => void;

  constructor(private readonly reservas: ReservasService) {}

  ngOnInit(): void {
    this.revisar();
    this.unsubscribe = this.reservas.onCambios(() => this.revisar());
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
      const lista = await this.reservas.listar(inicioDiaColombia(fechaColombia()));
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
