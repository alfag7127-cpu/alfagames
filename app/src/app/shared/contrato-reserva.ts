import { Component, OnInit, input, output, signal, viewChild } from '@angular/core';
import { ReservasAlquilerService } from '../core/reservas-alquiler.service';
import { CONDICIONES_CONTRATO, duracionContrato, fechaContrato, fechaHoraContrato, pesosContrato } from './contrato-pdf';
import { FirmaPad } from './firma-pad';

export interface DatosContratoReserva {
  nombre: string;
  cedula: string;
  telefono: string;
  direccion: string;
  ubicacion: { lat: number; lng: number } | null;
  tipo: string;
  plan: string;
  inicio: number;
  fin: number;
  precio: number;
}

/**
 * Paso "Contrato" de las reservas a domicilio (orden del dueño): el cliente lee su contrato
 * ya lleno y firma con el dedo; sin firma no puede reservar. La consola exacta y su serie
 * se asignan al reservar y salen en el PDF que guarda el local.
 */
@Component({
  selector: 'app-contrato-reserva',
  imports: [FirmaPad],
  template: `
    <div class="space-y-4 rounded-2xl bg-white p-4 text-sm text-slate-800">
      <div class="text-center">
        <p class="text-lg font-black tracking-wide">ALFA GAMES</p>
        <p class="text-xs font-semibold">CONTRATO DE ALQUILER DE CONSOLA DE VIDEOJUEGOS</p>
      </div>
      @let d = datos();
      <section class="space-y-1">
        <h3 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">1. DATOS DE LAS PARTES</h3>
        <p><b>Fecha:</b> {{ hoy }}</p>
        <p><b>Arrendador:</b> {{ arrendador().nombre }} (ALFA GAMES) · C.C. {{ arrendador().cedula }}</p>
        <p><b>Cliente:</b> {{ d.nombre }}</p>
        <p><b>C.C.:</b> {{ d.cedula }} · <b>Teléfono:</b> {{ d.telefono }}</p>
        <p><b>Dirección de entrega:</b> {{ d.direccion || 'Ubicación compartida' }}{{ d.ubicacion && d.direccion ? ' (y ubicación compartida)' : '' }}</p>
      </section>
      <section class="space-y-1">
        <h3 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">2. DETALLE DEL EQUIPO Y TIEMPOS</h3>
        <p><b>Consola:</b> {{ d.tipo }} (la consola y su número de serie quedan en tu contrato al reservar)</p>
        <p><b>Accesorios:</b> mandos inalámbricos de la consola, cable de poder, cable HDMI y cable de carga de mando.</p>
        <p><b>Entrega:</b> {{ fh(d.inicio) }}</p>
        <p><b>Devolución:</b> {{ fh(d.fin) }}</p>
        <p><b>Plan / tiempo:</b> {{ d.plan }} · total {{ dur(d.inicio, d.fin) }}</p>
        <p><b>Valor a pagar:</b> {{ pesos(d.precio) }}</p>
      </section>
      <section class="space-y-1">
        <h3 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">3. CONDICIONES BÁSICAS Y COMPROMISOS</h3>
        @for (x of condiciones; track x.titulo; let i = $index) {
          <p class="text-xs leading-snug"><b>{{ i + 1 }}. {{ x.titulo }}:</b> {{ x.texto }}</p>
        }
      </section>
      <section class="space-y-2">
        <h3 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">4. TU FIRMA</h3>
        <label class="flex items-start gap-2 text-xs">
          <input type="checkbox" [checked]="acepto()" (change)="acepto.set($any($event.target).checked)" class="mt-0.5 h-5 w-5 shrink-0" />
          <span>Leí el contrato y acepto las condiciones. {{ d.nombre }} · C.C. {{ d.cedula }}</span>
        </label>
        <app-firma-pad #pad (cambio)="hayFirma.set($event)" />
      </section>
      <button type="button" (click)="enviar()" [disabled]="!hayFirma() || !acepto() || enviando()"
        class="w-full rounded-xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-40">
        {{ enviando() ? 'Reservando…' : !acepto() ? 'Marca que aceptas el contrato' : !hayFirma() ? 'Firma arriba con el dedo' : '✍️ Firmar y reservar' }}
      </button>
    </div>
  `,
})
export class ContratoReserva implements OnInit {
  readonly datos = input.required<DatosContratoReserva>();
  readonly enviando = input(false);
  /** La firma (PNG) cuando el cliente toca "Firmar y reservar". */
  readonly firmado = output<string>();

  readonly arrendador = signal<{ nombre: string | null; cedula: string | null }>({ nombre: '', cedula: '' });
  readonly hayFirma = signal(false);
  readonly acepto = signal(false);
  readonly condiciones = CONDICIONES_CONTRATO;
  readonly hoy = fechaContrato(new Date().toISOString());
  private readonly pad = viewChild<FirmaPad>('pad');

  constructor(private readonly servicio: ReservasAlquilerService) {}

  async ngOnInit(): Promise<void> {
    try {
      this.arrendador.set(await this.servicio.arrendador());
    } catch {
      // Sin conexión: el contrato se muestra sin el nombre del arrendador; el PDF sí lo lleva.
    }
  }

  fh(ms: number): string {
    return fechaHoraContrato(new Date(ms).toISOString());
  }

  dur(a: number, b: number): string {
    return duracionContrato(new Date(a).toISOString(), new Date(b).toISOString());
  }

  pesos(n: number): string {
    return pesosContrato(n);
  }

  enviar(): void {
    const firma = this.pad()?.imagen();
    if (firma && this.acepto()) this.firmado.emit(firma);
  }
}
