import { Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';
import { ZONA_HORARIA } from '../../core/zona-horaria';
import { cuentaRegresiva } from './gta6-util';

/**
 * Encabezado de las páginas públicas GTA 6: atardecer neón con una cuenta regresiva grande
 * (días, horas, minutos y segundos) al lanzamiento. Cada número "salta" cuando cambia.
 */
@Component({
  selector: 'app-gta6-hero',
  styles: `
    .cielo {
      background: linear-gradient(180deg, #1e0b3a 0%, #5b1a7a 35%, #d62f7f 65%, #ff8a3d 100%);
    }
    .sol {
      background: linear-gradient(180deg, #ffe066 0%, #ff9a3d 45%, #ff3d7f 100%);
      -webkit-mask: linear-gradient(180deg, #000 0 58%, transparent 58% 62%, #000 62% 72%, transparent 72% 77%, #000 77% 85%, transparent 85% 91%, #000 91%);
      mask: linear-gradient(180deg, #000 0 58%, transparent 58% 62%, #000 62% 72%, transparent 72% 77%, #000 77% 85%, transparent 85% 91%, #000 91%);
      box-shadow: 0 0 80px 20px rgba(255, 90, 140, 0.45);
    }
    .piso {
      background-image:
        linear-gradient(rgba(255, 120, 200, 0.55) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 120, 200, 0.55) 1px, transparent 1px);
      background-size: 38px 22px;
      transform: perspective(220px) rotateX(58deg);
      transform-origin: top;
    }
    .neon {
      text-shadow: 0 0 6px rgba(255, 255, 255, 0.8), 0 0 18px #ff4fa3, 0 0 36px #ff4fa3;
    }
    .caja {
      background: rgba(20, 6, 40, 0.55);
      box-shadow: inset 0 0 0 2px rgba(255, 120, 200, 0.6), 0 0 22px rgba(255, 79, 163, 0.45);
      backdrop-filter: blur(4px);
    }
    .salto {
      animation: salto 0.45s cubic-bezier(0.2, 1.6, 0.4, 1);
    }
    @keyframes salto {
      0% { transform: translateY(-40%) scale(1.25); opacity: 0; filter: blur(2px); }
      100% { transform: none; opacity: 1; filter: none; }
    }
    .latido {
      animation: latido 1.4s ease-in-out infinite;
    }
    @keyframes latido {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 214, 10, 0.7); }
      50% { transform: scale(1.06); box-shadow: 0 0 0 10px rgba(255, 214, 10, 0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .salto, .latido { animation: none; }
    }
  `,
  template: `
    <header class="cielo relative overflow-hidden px-4 pt-5 pb-8 text-white">
      <!-- Sol retro y piso cuadriculado -->
      <div class="sol pointer-events-none absolute left-1/2 top-24 h-64 w-64 -translate-x-1/2 rounded-full opacity-80 sm:h-80 sm:w-80"></div>
      <div class="piso pointer-events-none absolute inset-x-[-50%] bottom-0 h-28 opacity-60"></div>

      <div class="relative mx-auto max-w-3xl">
        <div class="flex items-center gap-3">
          <span class="shrink-0 rounded-xl bg-white p-1.5 shadow-lg">
            <img src="img/alfa-games.jpg" alt="Alfa Games" class="h-10 w-auto" />
          </span>
          <div>
            <p class="text-[11px] font-bold uppercase tracking-[0.3em] text-pink-200">Alfa Games presenta</p>
            <h1 class="neon text-2xl font-black italic leading-tight tracking-tight sm:text-3xl">{{ titulo() }}</h1>
          </div>
        </div>
        <p class="mt-2 max-w-xl text-sm text-pink-50">{{ subtitulo() }}</p>

        @if (falta(); as f) {
          <div class="mt-6 text-center">
            <p class="neon text-xs font-black uppercase tracking-[0.35em] text-yellow-200 sm:text-sm">Lanzamiento en</p>
            <div class="mt-3 grid grid-cols-4 gap-2 sm:gap-3">
              @for (u of unidades(f); track u.etiqueta) {
                <div class="caja overflow-hidden rounded-2xl py-3 sm:py-4">
                  @for (v of [u.valor]; track v) {
                    <p class="salto neon text-4xl font-black tabular-nums leading-none sm:text-6xl">{{ dosCifras(v) }}</p>
                  }
                  <p class="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-pink-200 sm:text-xs">{{ u.etiqueta }}</p>
                </div>
              }
            </div>
            <p class="mt-4 text-sm font-bold text-white drop-shadow">📅 {{ fechaLanzamiento() }}</p>
            <span class="latido mt-3 inline-block rounded-full bg-yellow-300 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-fuchsia-900">
              🔥 Cupos limitados · reserva desde ya
            </span>
          </div>
        } @else if (lanzamiento()) {
          <div class="mt-6 text-center">
            <p class="neon text-4xl font-black italic sm:text-6xl">¡YA SALIÓ!</p>
            <span class="latido mt-3 inline-block rounded-full bg-yellow-300 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-fuchsia-900">
              🔥 GTA 6 disponible · reserva tu turno
            </span>
          </div>
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
  readonly fechaLanzamiento = computed(() => {
    const l = this.lanzamiento();
    if (!l) return '';
    const d = new Date(l);
    const dia = d.toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, weekday: 'long', day: 'numeric', month: 'long' });
    return dia.charAt(0).toUpperCase() + dia.slice(1);
  });

  ngOnInit(): void {
    this.timer = setInterval(() => this.ahora.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  unidades(f: { dias: number; horas: number; minutos: number; segundos: number }): { etiqueta: string; valor: number }[] {
    return [
      { etiqueta: f.dias === 1 ? 'día' : 'días', valor: f.dias },
      { etiqueta: 'horas', valor: f.horas },
      { etiqueta: 'min', valor: f.minutos },
      { etiqueta: 'seg', valor: f.segundos },
    ];
  }

  dosCifras(n: number): string {
    return n.toString().padStart(2, '0');
  }
}
