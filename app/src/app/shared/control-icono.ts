import { Component, input } from '@angular/core';
import { TipoConsola } from '../core/models';

/**
 * Imagen del control (PS4 o PS5) con la etiqueta debajo. Las imágenes las eligió el dueño
 * y viven en public/img (control-ps4.png, control-ps5.png), recortadas a 200 px de ancho.
 */
@Component({
  selector: 'app-control-icono',
  template: `
    <span class="flex flex-col items-center leading-none">
      <img [src]="tipo() === 'PS4' ? 'img/control-ps4.png' : 'img/control-ps5.png'" [alt]="'Control ' + tipo()"
        class="h-8 w-12 object-contain" loading="lazy" />
      <span class="mt-0.5 text-[10px] font-black tracking-wide" [class.text-sky-600]="tipo() === 'PS4'" [class.text-slate-700]="tipo() === 'PS5'">
        {{ tipo() }}
      </span>
    </span>
  `,
})
export class ControlIcono {
  readonly tipo = input.required<TipoConsola>();
}
