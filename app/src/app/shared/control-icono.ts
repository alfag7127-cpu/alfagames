import { Component, input } from '@angular/core';
import { TipoConsola } from '../core/models';

/**
 * Ícono de control dibujado para la app (no son imágenes de Sony): PS4 oscuro estilo
 * DualShock 4 con barra de luz azul, PS5 blanco y negro estilo DualSense. Debajo va la
 * etiqueta PS4 / PS5.
 */
@Component({
  selector: 'app-control-icono',
  template: `
    <span class="flex flex-col items-center leading-none" [attr.aria-label]="'Control ' + tipo()" role="img">
      <svg viewBox="0 0 64 40" class="h-8 w-12" aria-hidden="true">
        @if (tipo() === 'PS4') {
          <!-- Cuerpo DualShock 4 -->
          <path [attr.d]="cuerpo" fill="#1e293b" stroke="#0f172a" stroke-width="1" />
          <rect x="23" y="7" width="18" height="10" rx="2" fill="#334155" />
          <rect x="25" y="5" width="14" height="1.6" rx="0.8" fill="#38bdf8" />
          <!-- Cruceta -->
          <path d="M12 15h3v-3h3v3h3v3h-3v3h-3v-3h-3z" fill="#64748b" />
          <!-- Botones -->
          <circle cx="47" cy="12" r="1.8" fill="#34d399" />
          <circle cx="51" cy="16" r="1.8" fill="#f87171" />
          <circle cx="43" cy="16" r="1.8" fill="#f472b6" />
          <circle cx="47" cy="20" r="1.8" fill="#60a5fa" />
          <!-- Palancas -->
          <circle cx="24" cy="24" r="4" fill="#0f172a" stroke="#475569" stroke-width="1" />
          <circle cx="40" cy="24" r="4" fill="#0f172a" stroke="#475569" stroke-width="1" />
        } @else {
          <!-- Cuerpo DualSense: alas blancas y centro negro -->
          <path [attr.d]="cuerpo" fill="#f8fafc" stroke="#94a3b8" stroke-width="1" />
          <path d="M20 7h24c2 0 3 1 3.5 3l2.5 18H14l2.5-18C17 8 18 7 20 7z" fill="#0f172a" />
          <rect x="23" y="6" width="18" height="10" rx="2.5" fill="#f1f5f9" stroke="#60a5fa" stroke-width="0.9" />
          <!-- Cruceta -->
          <path d="M8 15h3v-3h3v3h3v3h-3v3h-3v-3H8z" fill="#94a3b8" />
          <!-- Botones -->
          <circle cx="51" cy="12" r="1.7" fill="#94a3b8" />
          <circle cx="55" cy="16" r="1.7" fill="#94a3b8" />
          <circle cx="47" cy="16" r="1.7" fill="#94a3b8" />
          <circle cx="51" cy="20" r="1.7" fill="#94a3b8" />
          <!-- Palancas -->
          <circle cx="24" cy="23" r="4" fill="#1e293b" stroke="#475569" stroke-width="1" />
          <circle cx="40" cy="23" r="4" fill="#1e293b" stroke="#475569" stroke-width="1" />
        }
      </svg>
      <span class="mt-0.5 text-[10px] font-black tracking-wide" [class.text-sky-600]="tipo() === 'PS4'" [class.text-slate-700]="tipo() === 'PS5'">
        {{ tipo() }}
      </span>
    </span>
  `,
})
export class ControlIcono {
  readonly tipo = input.required<TipoConsola>();
  /** Silueta del control: cuerpo con las dos empuñaduras. */
  readonly cuerpo =
    'M14 5h36c6 0 9 4 10.5 10l3 15c1.2 6-4.5 9.5-8.5 6l-7-6.5H16L9 36c-4 3.5-9.7 0-8.5-6l3-15C5 9 8 5 14 5z';
}
