import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Página principal pública /servicios (sin login): un solo enlace para los clientes con
 * los tres servicios. Cada tarjeta lleva a su página pública: alquiler a domicilio
 * (/alquilar), sala de videojuegos (/reservar) y GTA 6 (/gta6-sala o /gta6-domicilio).
 */
@Component({
  selector: 'app-servicios',
  imports: [RouterLink],
  styles: `
    .tarjeta {
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .tarjeta:hover,
    .tarjeta:focus-visible {
      transform: translateY(-3px);
    }
    .gta {
      background: linear-gradient(160deg, #1e0b3a 0%, #5b1a7a 40%, #d62f7f 75%, #ff8a3d 100%);
    }
    .neon {
      text-shadow: 0 0 6px rgba(255, 255, 255, 0.7), 0 0 18px #ff4fa3;
    }
    @media (prefers-reduced-motion: reduce) {
      .tarjeta { transition: none; }
      .tarjeta:hover, .tarjeta:focus-visible { transform: none; }
    }
  `,
  template: `
    <div class="min-h-screen bg-slate-950 text-white">
      <header class="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-4 py-6 shadow-lg">
        <div class="mx-auto flex max-w-4xl items-center gap-4">
          <span class="shrink-0 rounded-2xl bg-white p-2 shadow-[0_0_24px_rgba(56,189,248,0.45)]">
            <img src="img/alfa-games.jpg" alt="Alfa Games" class="h-12 w-auto sm:h-14" />
          </span>
          <div>
            <h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">Alfa Games</h1>
            <p class="text-sm text-sky-100/80">¿Qué quieres hacer hoy? Elige un servicio.</p>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-4xl px-4 py-6">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <!-- 1. Alquiler de consolas a domicilio -->
          <a routerLink="/alquilar"
            class="tarjeta flex flex-col rounded-3xl bg-gradient-to-br from-slate-900 to-lime-900 p-5 ring-2 ring-lime-400/60 shadow-[0_0_24px_rgba(163,230,53,0.25)] focus:outline-none focus-visible:ring-4">
            <span class="text-5xl" aria-hidden="true">🎮</span>
            <span class="mt-3 text-xs font-bold uppercase tracking-widest text-lime-300">1</span>
            <h2 class="text-xl font-extrabold">Alquiler de consolas</h2>
            <p class="mt-1 flex-1 text-sm text-lime-50/80">PS4 o PS5 a domicilio. Te la llevamos a tu casa.</p>
            <span class="mt-4 rounded-xl bg-lime-400 py-2.5 text-center text-sm font-bold text-slate-950">Alquilar consola</span>
          </a>

          <!-- 2. Sala de videojuegos -->
          <a routerLink="/reservar"
            class="tarjeta flex flex-col rounded-3xl bg-gradient-to-br from-slate-900 to-sky-900 p-5 ring-2 ring-sky-400/60 shadow-[0_0_24px_rgba(56,189,248,0.25)] focus:outline-none focus-visible:ring-4">
            <span class="text-5xl" aria-hidden="true">🕹️</span>
            <span class="mt-3 text-xs font-bold uppercase tracking-widest text-sky-300">2</span>
            <h2 class="text-xl font-extrabold">Sala de videojuegos</h2>
            <p class="mt-1 flex-1 text-sm text-sky-50/80">Mira qué consolas están libres y reserva tu horario en el local.</p>
            <span class="mt-4 rounded-xl bg-sky-400 py-2.5 text-center text-sm font-bold text-slate-950">Reservar en la sala</span>
          </a>

          <!-- 3. GTA 6 -->
          <div class="tarjeta gta flex flex-col rounded-3xl p-5 ring-2 ring-pink-400/70 shadow-[0_0_28px_rgba(255,79,163,0.35)]">
            <span class="text-5xl" aria-hidden="true">🌴</span>
            <span class="mt-3 text-xs font-bold uppercase tracking-widest text-yellow-200">3</span>
            <h2 class="neon text-xl font-black italic">Alquiler GTA 6</h2>
            <p class="mt-1 flex-1 text-sm text-pink-50/90">Juega GTA 6 en la sala o llévate la PS5 con el juego a tu casa.</p>
            @if (!gtaAbierto()) {
              <button type="button" (click)="gtaAbierto.set(true)"
                class="mt-4 rounded-xl bg-yellow-300 py-2.5 text-sm font-bold text-slate-950 hover:bg-yellow-200">
                Reservar GTA 6
              </button>
            } @else {
              <div class="mt-4 grid grid-cols-2 gap-2">
                <a routerLink="/gta6-sala" class="rounded-xl bg-yellow-300 py-2.5 text-center text-sm font-bold text-slate-950 hover:bg-yellow-200">En la sala</a>
                <a routerLink="/gta6-domicilio" class="rounded-xl bg-white/90 py-2.5 text-center text-sm font-bold text-fuchsia-800 hover:bg-white">A domicilio</a>
              </div>
            }
          </div>
        </div>

        <p class="mt-8 text-center text-xs text-slate-500">
          <a routerLink="/login" class="hover:text-slate-300 hover:underline">Ingreso del personal</a>
        </p>
      </main>
    </div>
  `,
})
export class Servicios {
  /** GTA 6 tiene dos opciones: en la sala o a domicilio. */
  readonly gtaAbierto = signal(false);
}
