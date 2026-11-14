import { Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';
import { cuentaRegresiva } from './gta6-util';

/** Encabezado de las páginas públicas GTA 6 con la cuenta regresiva al lanzamiento. */
@Component({
  selector: 'app-gta6-hero',
  template: `
    <header class="relative overflow-hidden bg-gradient-to-br from-fuchsia-700 via-pink-600 to-orange-500 px-4 pt-5 pb-6 shadow-lg">
      <div class="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-cyan-300/25 blur-3xl"></div>
      <div class="relative mx-auto max-w-3xl">
        <div class="flex items-center gap-3">
          <span class="shrink-0 rounded-xl bg-white p-1.5 shadow">
            <img src="img/alfa-games.jpg" alt="Alfa Games" class="h-10 w-auto" />
          </span>
          <div>
            <p class="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-100">Alfa Games</p>
            <h1 class="text-2xl font-black leading-tight tracking-tight drop-shadow">{{ titulo() }}</h1>
          </div>
        </div>
        <p class="mt-2 text-sm text-pink-50">{{ subtitulo() }}</p>
        @if (falta(); as f) {
          <div class="mt-4 grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl bg-black/25 py-2"><p class="text-2xl font-black tabular-nums">{{ f.dias }}</p><p class="text-[10px] uppercase tracking-wide text-pink-100">días</p></div>
            <div class="rounded-xl bg-black/25 py-2"><p class="text-2xl font-black tabular-nums">{{ f.horas }}</p><p class="text-[10px] uppercase tracking-wide text-pink-100">horas</p></div>
            <div class="rounded-xl bg-black/25 py-2"><p class="text-2xl font-black tabular-nums">{{ f.minutos }}</p><p class="text-[10px] uppercase tracking-wide text-pink-100">min</p></div>
          </div>
          <p class="mt-2 text-center text-xs font-semibold text-orange-50">para el lanzamiento · reserva desde ya y asegura tu cupo</p>
        } @else if (lanzamiento()) {
          <p class="mt-3 inline-block rounded-full bg-black/25 px-3 py-1 text-xs font-bold">🔥 ¡Ya disponible!</p>
        }
      </div>
    </header>
  `,
})
export class Gta6Hero implements OnInit, OnDestroy {
  readonly titulo = input.required<string>();
  readonly subtitulo = input('');
  readonly lanzamiento = input<string | null>(null);
  private readonly ahora = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;
  readonly falta = computed(() => {
    const l = this.lanzamiento();
    return l ? cuentaRegresiva(l, this.ahora()) : null;
  });

  ngOnInit(): void {
    this.timer = setInterval(() => this.ahora.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
