import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Enlace de las páginas públicas de vuelta a la página de servicios (/servicios). */
@Component({
  selector: 'app-volver-servicios',
  imports: [RouterLink],
  template: `
    <a routerLink="/servicios"
      class="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20 hover:bg-white/20">
      ← Todos los servicios
    </a>
  `,
})
export class VolverServicios {}
