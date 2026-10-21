import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

interface PestanaSala {
  ruta: string;
  texto: string;
  soloAdmin: boolean;
  exacta: boolean;
}

/** Sección Sala: encabezado con el tema del logo Alfa Games, pestañas y la página elegida. */
@Component({
  selector: 'app-sala-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <section class="banner-sala p-5 mb-4">
      <div class="flex items-center gap-4">
        <span class="shrink-0 rounded-2xl bg-white p-2 ring-2 ring-sky-400/60 shadow-[0_0_24px_rgba(56,189,248,0.45)]">
          <img src="img/alfa-games.jpg" alt="Alfa Games" class="h-14 sm:h-16 w-auto" />
        </span>
        <div class="min-w-0">
          <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">Sala de videojuegos</h1>
          <p class="text-sm text-sky-100/80">Consolas en vivo, historial y cuentas del día</p>
        </div>
      </div>
    </section>

    <div class="flex gap-1 mb-4 rounded-xl bg-slate-200/70 p-1 text-sm font-medium w-full sm:w-fit overflow-x-auto">
      @for (p of pestanas; track p.ruta) {
        @if (!p.soloAdmin || auth.isAdmin()) {
          <a
            [routerLink]="p.ruta"
            routerLinkActive="bg-white shadow-sm !text-blue-700"
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
    { ruta: '/sala/ventas', texto: '🛒 Ventas', soloAdmin: false, exacta: false },
    { ruta: '/sala/historial', texto: '📋 Historial', soloAdmin: false, exacta: false },
    { ruta: '/sala/productos', texto: '📦 Productos', soloAdmin: true, exacta: false },
    { ruta: '/sala/dashboard', texto: '📊 Dashboard', soloAdmin: true, exacta: false },
    { ruta: '/sala/gastos', texto: '💸 Gastos', soloAdmin: true, exacta: false },
    { ruta: '/sala/puestos', texto: '🕹️ Puestos', soloAdmin: true, exacta: false },
  ];

  constructor(readonly auth: AuthService) {}
}
