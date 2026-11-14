import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlanGta6 } from '../../core/gta6.service';
import { AlquilerPublico, FormaPagoReserva, ReservaAlquilerCreada, ReservasAlquilerService } from '../../core/reservas-alquiler.service';
import { ReservasService, enlaceWhatsapp } from '../../core/reservas.service';
import { TipoConsola } from '../../core/models';
import { aHoraLocal, consolasLibres, deHoraLocal, diaYHora, finPlan, hora, mensajeError } from '../gta6/gta6-util';

type Paso = 'plan' | 'datos' | 'pago' | 'qr' | 'listo';

/**
 * Página pública /alquilar: el cliente reserva una PS4 o PS5 a domicilio con los planes del alquiler.
 * Paga con el QR (el local confirma el pago) o en efectivo al recibir la consola.
 */
@Component({
  selector: 'app-alquilar',
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="min-h-screen bg-slate-950 text-white">
      <header class="bg-gradient-to-br from-slate-950 via-slate-900 to-lime-900 px-4 py-5 shadow-lg">
        <div class="mx-auto flex max-w-3xl items-center gap-4">
          <img src="img/alfa-frank-over.jpg" alt="Alfa Games & Frank Over"
            class="h-16 w-16 shrink-0 rounded-full shadow-[0_0_24px_rgba(163,230,53,0.4)] ring-2 ring-lime-400/70 sm:h-20 sm:w-20" />
          <div>
            <h1 class="text-2xl font-extrabold tracking-tight">Alquila tu PS4 o PS5 a domicilio</h1>
            <p class="text-sm text-lime-100/80">Te la llevamos a tu casa · Alfa Games &amp; Frank Over</p>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-3xl px-4 py-5">
        @if (error()) {
          <p class="mb-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-100 ring-1 ring-red-400/40">{{ error() }}</p>
        }

        @switch (paso()) {
          @case ('plan') {
            @if (!estado()) {
              <p class="text-slate-400">Cargando…</p>
            } @else if (!tiposDisponibles().length) {
              <p class="rounded-xl bg-white/5 p-4 text-sm text-slate-300">Por ahora no hay consolas para reservar. Escríbenos por WhatsApp.</p>
            } @else {
              <section class="space-y-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                <div>
                  <p class="mb-2 text-sm font-semibold text-lime-200">1. Elige la consola</p>
                  <div class="grid grid-cols-2 gap-2">
                    @for (t of tiposDisponibles(); track t) {
                      <button type="button" (click)="elegirTipo(t)"
                        class="rounded-xl px-2 py-3 text-lg font-black ring-1 transition-colors"
                        [class.bg-lime-400]="tipo() === t" [class.text-slate-950]="tipo() === t" [class.ring-lime-400]="tipo() === t"
                        [class.bg-white/5]="tipo() !== t" [class.ring-white/15]="tipo() !== t">
                        🎮 {{ t }}
                      </button>
                    }
                  </div>
                </div>
                <div>
                  <p class="mb-2 text-sm font-semibold text-lime-200">2. Elige el plan</p>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    @for (p of planesTipo(); track p.id) {
                      <button type="button" (click)="plan.set(p)"
                        class="rounded-xl px-2 py-3 text-sm font-semibold ring-1 transition-colors"
                        [class.bg-lime-400]="plan()?.id === p.id" [class.text-slate-950]="plan()?.id === p.id" [class.ring-lime-400]="plan()?.id === p.id"
                        [class.bg-white/5]="plan()?.id !== p.id" [class.ring-white/15]="plan()?.id !== p.id">
                        {{ p.nombre }}
                        <span class="block text-base font-black tabular-nums">{{ p.precio | number: '1.0-0' }}</span>
                      </button>
                    }
                  </div>
                  @if (plan()?.es_noche) {
                    <p class="mt-2 text-xs text-slate-400">La noche: la recogemos a las {{ horaCorta(estado()!.noche_hasta) }}.</p>
                  }
                </div>
                <label class="block text-sm">
                  <span class="font-semibold text-lime-200">3. Día y hora de entrega</span>
                  <input type="datetime-local" [ngModel]="inicio()" (ngModelChange)="inicio.set($event)" name="inicio"
                    [min]="minimo()" [max]="maximo()"
                    class="mt-1 block w-full rounded-xl bg-white px-3 py-2.5 text-base text-slate-900" />
                </label>
                @if (plan() && inicio()) {
                  <div class="rounded-xl p-3 text-sm ring-1"
                    [class.bg-emerald-500/15]="libres() > 0" [class.ring-emerald-400/40]="libres() > 0"
                    [class.bg-red-500/15]="libres() === 0" [class.ring-red-400/40]="libres() === 0">
                    <p>Entrega {{ diaYHora(inicioMs()) }} · recogida {{ diaYHora(finMs()) }}</p>
                    @if (libres() > 0) {
                      <p class="font-semibold text-emerald-200">✅ Hay {{ libres() }} {{ tipo() }} disponible{{ libres() > 1 ? 's' : '' }} para ese horario</p>
                    } @else {
                      <p class="font-semibold text-red-200">No quedan {{ tipo() }} para ese horario. Prueba otro día u hora.</p>
                    }
                    <p class="mt-1 text-lg font-black">Total: {{ plan()!.precio | number: '1.0-0' }} COP</p>
                  </div>
                }
                <button type="button" (click)="aDatos()" class="w-full rounded-xl bg-lime-400 py-2.5 text-sm font-black text-slate-950 hover:bg-lime-300">Continuar</button>
              </section>
            }
          }

          @case ('datos') {
            <section class="space-y-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <p class="text-sm text-slate-300">{{ tipo() }} · {{ plan()?.nombre }} · entrega {{ diaYHora(inicioMs()) }} · <b class="text-white">{{ plan()?.precio | number: '1.0-0' }} COP</b></p>
              <label class="block text-sm">
                Nombre completo
                <input [(ngModel)]="nombre" name="nombre" autocomplete="name" maxlength="60"
                  class="mt-1 block w-full rounded-xl bg-white px-3 py-2.5 text-base text-slate-900" />
              </label>
              <label class="block text-sm">
                Número de celular
                <input [(ngModel)]="telefono" name="telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="20"
                  class="mt-1 block w-full rounded-xl bg-white px-3 py-2.5 text-base text-slate-900" />
              </label>
              <label class="block text-sm">
                Dirección de entrega (barrio, calle y número)
                <textarea [(ngModel)]="direccion" name="direccion" autocomplete="street-address" maxlength="200" rows="2"
                  class="mt-1 block w-full rounded-xl bg-white px-3 py-2.5 text-base text-slate-900"></textarea>
              </label>
              <div>
                <p class="mb-2 text-sm font-semibold text-lime-200">¿Cómo vas a pagar?</p>
                <div class="grid grid-cols-2 gap-2">
                  <button type="button" (click)="formaPago.set('qr')"
                    class="rounded-xl px-2 py-3 text-sm font-bold ring-1"
                    [class.bg-lime-400]="formaPago() === 'qr'" [class.text-slate-950]="formaPago() === 'qr'" [class.ring-lime-400]="formaPago() === 'qr'"
                    [class.bg-white/5]="formaPago() !== 'qr'" [class.ring-white/15]="formaPago() !== 'qr'">
                    📱 QR ahora
                    <span class="block text-[11px] font-normal opacity-80">Transferencia</span>
                  </button>
                  <button type="button" (click)="formaPago.set('efectivo')"
                    class="rounded-xl px-2 py-3 text-sm font-bold ring-1"
                    [class.bg-lime-400]="formaPago() === 'efectivo'" [class.text-slate-950]="formaPago() === 'efectivo'" [class.ring-lime-400]="formaPago() === 'efectivo'"
                    [class.bg-white/5]="formaPago() !== 'efectivo'" [class.ring-white/15]="formaPago() !== 'efectivo'">
                    💵 Efectivo
                    <span class="block text-[11px] font-normal opacity-80">Al recibir la consola</span>
                  </button>
                </div>
              </div>
              <div class="flex gap-2">
                <button type="button" (click)="paso.set('plan')" class="rounded-xl bg-white/10 px-4 py-2.5 text-sm hover:bg-white/20">Atrás</button>
                <button type="button" (click)="reservar()" [disabled]="enviando()"
                  class="flex-1 rounded-xl bg-lime-400 py-2.5 text-sm font-bold text-slate-950 hover:bg-lime-300 disabled:opacity-50">
                  {{ enviando() ? 'Reservando…' : 'Reservar' }}
                </button>
              </div>
            </section>
          }

          @case ('qr') {
            <section class="space-y-4 rounded-2xl bg-white/5 p-5 text-center ring-1 ring-white/10">
              <p class="text-sm text-slate-300">Reserva #{{ creada()?.id }}</p>
              <p class="text-lg">Paga <b class="text-2xl">{{ creada()?.precio | number: '1.0-0' }} COP</b></p>
              <p class="text-sm text-slate-300">{{ creada()?.tipo }} · {{ creada()?.plan }} · entrega {{ diaYHora(creada()!.inicio) }}</p>
              @if (urlQr()) {
                <img [src]="urlQr()" alt="QR para pagar" class="mx-auto w-64 max-w-full rounded-xl bg-white p-2" />
              } @else {
                <p class="rounded-xl bg-amber-500/15 p-3 text-sm text-amber-100 ring-1 ring-amber-400/40">El QR de pago aún no está disponible. Escríbenos por WhatsApp para pagar.</p>
              }
              <p class="text-xs text-slate-400">La consola queda apartada {{ creada()?.minutos_para_pagar }} minutos mientras confirmamos el pago.</p>
              <button type="button" (click)="paso.set('listo')" class="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">Ya pagué</button>
            </section>
          }

          @case ('listo') {
            <section class="space-y-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <h2 class="text-lg font-bold">✅ ¡Reserva registrada!</h2>
              <p class="text-sm text-slate-300">
                #{{ creada()?.id }} · {{ creada()?.tipo }} · {{ creada()?.plan }} · entrega {{ diaYHora(creada()!.inicio) }} · recogida {{ diaYHora(creada()!.fin) }} · {{ creada()?.precio | number: '1.0-0' }} COP
              </p>
              <div class="space-y-2 rounded-xl bg-lime-500/10 p-4 text-sm text-lime-50 ring-1 ring-lime-400/40">
                @if (creada()?.forma_pago === 'efectivo') {
                  <p>💵 Pagas <b>{{ creada()?.precio | number: '1.0-0' }} en efectivo</b> cuando recibas la consola.</p>
                  <p>Escríbenos por WhatsApp para confirmar tu reserva: queda confirmada cuando te respondamos.</p>
                } @else {
                  <p>Envía el comprobante por WhatsApp: tu reserva queda confirmada cuando verifiquemos el pago.</p>
                }
                <p>El tiempo del plan cuenta desde que recibes la consola.</p>
              </div>
              @if (enlaceWhatsapp()) {
                <a [href]="enlaceWhatsapp()" target="_blank" rel="noopener"
                  class="block w-full rounded-xl bg-emerald-500 py-2.5 text-center text-sm font-bold text-slate-950 hover:bg-emerald-400">
                  {{ creada()?.forma_pago === 'efectivo' ? 'Confirmar por WhatsApp' : 'Enviar comprobante por WhatsApp' }}
                </a>
              }
              <button type="button" (click)="reiniciar()" class="w-full rounded-xl bg-white/10 py-2.5 text-sm hover:bg-white/20">Hacer otra reserva</button>
            </section>
          }
        }
      </main>
    </div>
  `,
})
export class Alquilar implements OnInit {
  readonly paso = signal<Paso>('plan');
  readonly estado = signal<AlquilerPublico | null>(null);
  readonly error = signal<string | null>(null);
  readonly tipo = signal<TipoConsola>('PS4');
  readonly plan = signal<PlanGta6 | null>(null);
  readonly inicio = signal('');
  readonly formaPago = signal<FormaPagoReserva | null>(null);
  readonly enviando = signal(false);
  readonly creada = signal<ReservaAlquilerCreada | null>(null);
  nombre = '';
  telefono = '';
  direccion = '';

  readonly hora = hora;
  readonly diaYHora = diaYHora;
  readonly inicioMs = computed(() => (this.inicio() ? deHoraLocal(this.inicio()) : Date.now()));
  readonly finMs = computed(() => {
    const p = this.plan();
    return p ? finPlan(this.inicioMs(), p, this.estado()?.noche_hasta ?? '09:00:00') : this.inicioMs();
  });
  /** PS4 y/o PS5, según haya consolas activas y planes de ese tipo. */
  readonly tiposDisponibles = computed<TipoConsola[]>(() => {
    const e = this.estado();
    if (!e) return [];
    return (['PS4', 'PS5'] as TipoConsola[]).filter(
      (t) => e.planes.some((p) => p.tipo === t) && e.consolas.some((c) => c.tipo === t),
    );
  });
  readonly planesTipo = computed(() => (this.estado()?.planes ?? []).filter((p) => p.tipo === this.tipo()));
  readonly libres = computed(() =>
    consolasLibres((this.estado()?.consolas ?? []).filter((c) => c.tipo === this.tipo()), this.inicioMs(), this.finMs()),
  );
  readonly urlQr = computed(() => this.reservas.urlQr(this.estado()?.qr_path ?? null));
  readonly enlaceWhatsapp = computed(() => {
    const c = this.creada();
    if (!c) return null;
    const pago = c.forma_pago === 'efectivo' ? 'Pago en efectivo al recibir' : 'Envío el comprobante del pago';
    return enlaceWhatsapp(
      this.estado()?.whatsapp ?? null,
      `Hola, hice la reserva #${c.id} de ${c.tipo} a domicilio: ${c.plan}, entrega ${diaYHora(c.inicio)}, ` +
        `${c.precio.toLocaleString('es-CO')} COP. ${pago}. A nombre de ${this.nombre.trim()}. Dirección: ${this.direccion.trim()}.`,
    );
  });

  constructor(
    private readonly servicio: ReservasAlquilerService,
    private readonly reservas: ReservasService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      const e = await this.servicio.publico();
      this.estado.set(e);
      const tipos = this.tiposDisponibles();
      if (tipos.length && !tipos.includes(this.tipo())) this.tipo.set(tipos[0]);
      if (!this.inicio()) this.inicio.set(aHoraLocal(Math.ceil((Date.now() + 2 * 3_600_000) / 900_000) * 900_000));
    } catch {
      this.error.set('No pudimos cargar la información. Revisa tu conexión e intenta de nuevo.');
    }
  }

  horaCorta(t: string): string {
    return hora(`2000-01-01T${t.slice(0, 5)}:00-05:00`);
  }

  elegirTipo(t: TipoConsola): void {
    if (t === this.tipo()) return;
    this.tipo.set(t);
    this.plan.set(null);
    this.error.set(null);
  }

  minimo(): string {
    return aHoraLocal(Date.now());
  }

  maximo(): string {
    return aHoraLocal(Date.now() + (this.estado()?.dias_maximos ?? 7) * 86_400_000);
  }

  aDatos(): void {
    if (!this.plan()) return this.error.set('Elige un plan.');
    if (!this.inicio()) return this.error.set('Elige el día y la hora de entrega.');
    if (this.inicioMs() < Date.now() - 60_000) return this.error.set('Esa hora ya pasó. Elige una hora desde ahora.');
    if (this.libres() === 0) return this.error.set(`No quedan ${this.tipo()} para ese horario. Prueba otro día u hora.`);
    this.error.set(null);
    this.paso.set('datos');
    window.scrollTo({ top: 0 });
  }

  async reservar(): Promise<void> {
    const p = this.plan();
    const forma = this.formaPago();
    if (!p) return;
    if (this.nombre.trim().length < 2) return this.error.set('Escribe tu nombre.');
    if (this.telefono.replace(/\D/g, '').length < 7) return this.error.set('Escribe tu número de celular.');
    if (this.direccion.trim().length < 5) return this.error.set('Escribe la dirección de entrega.');
    if (!forma) return this.error.set('Elige cómo vas a pagar: QR o efectivo.');
    this.enviando.set(true);
    this.error.set(null);
    try {
      const c = await this.servicio.crear({
        tarifaId: p.id,
        nombre: this.nombre.trim(),
        telefono: this.telefono,
        direccion: this.direccion.trim(),
        inicio: new Date(this.inicioMs()).toISOString(),
        formaPago: forma,
      });
      this.creada.set(c);
      this.paso.set(c.forma_pago === 'qr' ? 'qr' : 'listo');
      window.scrollTo({ top: 0 });
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo reservar. Intenta de nuevo.'));
      this.cargar();
    } finally {
      this.enviando.set(false);
    }
  }

  reiniciar(): void {
    this.creada.set(null);
    this.plan.set(null);
    this.formaPago.set(null);
    this.paso.set('plan');
    this.cargar();
  }
}
