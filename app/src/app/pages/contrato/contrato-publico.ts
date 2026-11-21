import { Component, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AlquilerService, ContratoPublico } from '../../core/alquiler.service';
import { CONDICIONES_CONTRATO, duracionContrato, fechaContrato, fechaHoraContrato, pesosContrato } from '../../shared/contrato-pdf';
import { FirmaPad } from '../../shared/firma-pad';

/**
 * Página pública /contrato/<token> (sin login): el cliente de una reserva a domicilio ve
 * su contrato lleno y lo firma con el dedo. El enlace le llega por WhatsApp al confirmar
 * el pago. El PDF lo arma y guarda la app del personal.
 */
@Component({
  selector: 'app-contrato-publico',
  imports: [FirmaPad],
  template: `
    <div class="min-h-screen bg-slate-950 px-3 py-5 text-white">
      <div class="mx-auto max-w-xl space-y-4">
        <header class="text-center">
          <p class="text-2xl font-black tracking-wide">ALFA GAMES</p>
          <p class="text-xs font-semibold text-slate-300">CONTRATO DE ALQUILER DE CONSOLA DE VIDEOJUEGOS</p>
        </header>

        @if (estado() === 'cargando') {
          <p class="text-center text-slate-400">Cargando tu contrato…</p>
        } @else if (estado() === 'invalido') {
          <p class="rounded-xl bg-red-500/15 p-4 text-center ring-1 ring-red-400/40">Este enlace no es válido. Escríbenos por WhatsApp.</p>
        } @else if (estado() === 'cancelada') {
          <p class="rounded-xl bg-amber-500/15 p-4 text-center ring-1 ring-amber-400/40">Esta reserva fue cancelada.</p>
        } @else if (c(); as k) {
          <div class="space-y-4 rounded-2xl bg-white p-4 text-sm text-slate-800">
            <section class="space-y-1">
              <h2 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">1. DATOS DE LAS PARTES</h2>
              <p><b>Fecha:</b> {{ hoy }}</p>
              <p><b>Arrendador:</b> {{ k.arrendador_nombre }} (ALFA GAMES) · C.C. {{ k.arrendador_cedula }}</p>
              <p><b>Cliente:</b> {{ k.cliente_nombre }}</p>
              <p><b>C.C.:</b> {{ k.cliente_cedula }} · <b>Teléfono:</b> {{ k.cliente_telefono }}</p>
              <p><b>Dirección de entrega:</b> {{ k.cliente_direccion }}</p>
            </section>
            <section class="space-y-1">
              <h2 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">2. DETALLE DEL EQUIPO Y TIEMPOS</h2>
              <p><b>Consola:</b> {{ k.consola_tipo }} · {{ k.consola_nombre }}</p>
              @if (k.consola_serial) { <p><b>Nº de serie:</b> {{ k.consola_serial }}</p> }
              <p><b>Accesorios:</b> {{ k.mandos }} mando(s) inalámbrico(s), cable de poder, cable HDMI y cable de carga de mando{{ k.juegos.length ? '. Juegos: ' + k.juegos.join(', ') : '' }}.</p>
              <p><b>Entrega:</b> {{ fh(k.inicio) }}</p>
              <p><b>Devolución:</b> {{ fh(k.fin) }}</p>
              <p><b>Tiempo total:</b> {{ dur(k.inicio, k.fin) }}</p>
              <p><b>Valor pagado:</b> {{ pesos(k.pagado) }}</p>
            </section>
            <section class="space-y-1">
              <h2 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">3. CONDICIONES BÁSICAS Y COMPROMISOS</h2>
              @for (x of condiciones; track x.titulo; let i = $index) {
                <p class="text-xs leading-snug"><b>{{ i + 1 }}. {{ x.titulo }}:</b> {{ x.texto }}</p>
              }
            </section>
            <section class="space-y-2">
              <h2 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">4. FIRMA DEL CLIENTE</h2>
              @if (k.firmado_en || estado() === 'firmado') {
                <p class="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  ✅ Contrato firmado{{ k.firmado_en ? ' el ' + fh(k.firmado_en) : '' }}. ¡Gracias! Ya puedes cerrar esta página.
                </p>
              } @else {
                <p class="text-xs text-slate-600">Al firmar aceptas las condiciones de arriba. {{ k.cliente_nombre }} · C.C. {{ k.cliente_cedula }}</p>
                <app-firma-pad #pad (cambio)="hayFirma.set($event)" />
                <button type="button" (click)="firmar()" [disabled]="!hayFirma() || enviando()"
                  class="w-full rounded-xl bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-40">
                  {{ enviando() ? 'Enviando…' : hayFirma() ? '✅ Firmar contrato' : 'Firma arriba con el dedo' }}
                </button>
                @if (error()) { <p class="text-sm text-red-600">{{ error() }}</p> }
              }
            </section>
          </div>
        }
      </div>
    </div>
  `,
})
export class ContratoPublicoPage implements OnInit {
  /** Viene de la ruta /contrato/:token. */
  readonly token = signal('');

  readonly estado = signal<'cargando' | 'invalido' | 'cancelada' | 'listo' | 'firmado'>('cargando');
  readonly c = signal<ContratoPublico | null>(null);
  readonly hayFirma = signal(false);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly condiciones = CONDICIONES_CONTRATO;
  readonly hoy = fechaContrato(new Date().toISOString());
  private readonly pad = viewChild<FirmaPad>('pad');

  constructor(
    private readonly alquiler: AlquilerService,
    route: ActivatedRoute,
  ) {
    this.token.set(route.snapshot.paramMap.get('token') ?? '');
  }

  async ngOnInit(): Promise<void> {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(this.token())) return this.estado.set('invalido');
      const c = await this.alquiler.contratoPublico(this.token());
      if (!c) return this.estado.set('invalido');
      if (c.cancelada) return this.estado.set('cancelada');
      this.c.set({ ...c, pagado: Number(c.pagado), juegos: c.juegos ?? [] });
      this.estado.set('listo');
    } catch {
      this.estado.set('invalido');
    }
  }

  fh(iso: string): string {
    return fechaHoraContrato(iso);
  }

  dur(desde: string, hasta: string): string {
    return duracionContrato(desde, hasta);
  }

  pesos(n: number): string {
    return pesosContrato(n);
  }

  async firmar(): Promise<void> {
    const firma = this.pad()?.imagen();
    if (!firma) return;
    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.alquiler.firmarContrato(this.token(), firma);
      this.estado.set('firmado');
    } catch (e) {
      this.error.set((e as { message?: string })?.message ?? 'No se pudo firmar. Intenta de nuevo.');
    } finally {
      this.enviando.set(false);
    }
  }
}
