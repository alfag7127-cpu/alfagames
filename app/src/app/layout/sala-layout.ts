import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

interface PestanaSala {
  ruta: string;
  texto: string;
  soloAdmin: boolean;
  exacta: boolean;
}

/** Sección Sala: pestañas propias (igual que Alquiler) y la página elegida debajo. */
@Component({
  selector: 'app-sala-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex gap-1 mb-4 rounded-xl bg-slate-200/70 p-1 text-sm font-medium w-full sm:w-fit overflow-x-auto">
      @for (p of pestanas; track p.ruta) {
        @if (!p.soloAdmin || auth.isAdmin()) {
          <a
            [routerLink]="p.ruta"
            routerLinkActive="bg-white shadow-sm !text-indigo-700"
            [routerLinkActiveOptions]="{ exact: p.exacta }"
            class="flex-1 sm:flex-none rounded-lg px-4 py-1.5 text-center text-slate-600 transition-colors whitespace-nowrap hover:text-slate-900"
          >
            {{ p.texto }}
          </a>
        }
      }
    </div>
    <router-outlet />
  `,
})
export class SalaLayout {
  readonly pestanas: PestanaSala[] = [
    { ruta: '/sala', texto: '🎮 En vivo', soloAdmin: false, exacta: true },
    { ruta: '/sala/historial', texto: '📋 Historial', soloAdmin: false, exacta: false },
    { ruta: '/sala/dashboard', texto: '📊 Dashboard', soloAdmin: true, exacta: false },
    { ruta: '/sala/gastos', texto: '💸 Gastos', soloAdmin: true, exacta: false },
    { ruta: '/sala/puestos', texto: '🕹️ Puestos', soloAdmin: true, exacta: false },
  ];

  constructor(readonly auth: AuthService) {}
}
