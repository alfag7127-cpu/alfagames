import { Component } from '@angular/core';

/** Aviso de las páginas públicas de alquiler: solo se aceptan pagos por transferencia. */
@Component({
  selector: 'app-nota-transferencia',
  // Bloque para que respete el espacio entre secciones (space-y-*) del formulario.
  host: { class: 'block' },
  template: `
    <div class="rounded-2xl bg-amber-400/10 p-4 text-sm text-amber-50 ring-2 ring-amber-400/60" role="note">
      <p class="font-black uppercase tracking-wide text-amber-300">📌 Nota importante</p>
      <p class="mt-1">
        Para el alquiler de consolas <b>solo recibimos pagos por transferencia</b> (código QR).
      </p>
      <p class="mt-1 text-amber-100/90">
        Esta medida garantiza el compromiso del servicio por ambas partes: tu pago asegura la reserva y la consola
        queda apartada exclusivamente para ti en el horario elegido.
      </p>
    </div>
  `,
})
export class NotaTransferencia {}
