import { Component, model, signal } from '@angular/core';

/**
 * Botón "📍 Usar mi ubicación" para las reservas a domicilio (pedido del dueño: más ágil
 * que escribir la dirección). Usa el GPS del celular; el cliente debe dar permiso.
 */
@Component({
  selector: 'app-ubicacion-boton',
  template: `
    <div class="space-y-1">
      @if (ubicacion(); as u) {
        <div class="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-sm ring-1 ring-emerald-400/40">
          <span class="font-semibold text-emerald-200">✅ Ubicación agregada</span>
          <a [href]="mapa(u)" target="_blank" rel="noopener" class="text-xs text-emerald-100 underline">Ver en el mapa</a>
          <button type="button" (click)="ubicacion.set(null)" class="ml-auto text-xs text-slate-300 underline">Quitar</button>
        </div>
      } @else {
        <button type="button" (click)="pedir()" [disabled]="buscando()"
          class="w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-50">
          {{ buscando() ? 'Buscando tu ubicación…' : '📍 Usar mi ubicación actual' }}
        </button>
      }
      @if (error()) {
        <p class="text-xs text-amber-200">{{ error() }}</p>
      }
    </div>
  `,
})
export class UbicacionBoton {
  readonly ubicacion = model<{ lat: number; lng: number } | null>(null);
  readonly buscando = signal(false);
  readonly error = signal<string | null>(null);

  mapa(u: { lat: number; lng: number }): string {
    return `https://www.google.com/maps/search/?api=1&query=${u.lat},${u.lng}`;
  }

  pedir(): void {
    this.error.set(null);
    if (!('geolocation' in navigator)) {
      this.error.set('Tu celular no permite compartir la ubicación aquí. Escribe la dirección.');
      return;
    }
    this.buscando.set(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        this.ubicacion.set({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) });
        this.buscando.set(false);
      },
      (e) => {
        this.buscando.set(false);
        this.error.set(
          e.code === e.PERMISSION_DENIED
            ? 'No diste permiso de ubicación. Actívalo en el navegador o escribe la dirección.'
            : 'No pudimos obtener tu ubicación. Intenta de nuevo o escribe la dirección.',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }
}
