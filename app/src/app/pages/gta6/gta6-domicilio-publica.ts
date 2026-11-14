import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Gta6Publico, Gta6Service, PlanGta6, ReservaGta6Creada } from '../../core/gta6.service';
import { ReservasService, enlaceWhatsapp } from '../../core/reservas.service';
import { Gta6Hero } from './gta6-hero';
import { aHoraLocal, consolasLibres, deHoraLocal, diaYHora, finPlan, hora, mensajeError } from './gta6-util';

type Paso = 'plan' | 'datos' | 'pago' | 'listo';

/**
 * Página pública /gta6-domicilio: alquilar una PS5 con GTA 6 a domicilio desde el lanzamiento.
 * El cliente elige plan, día y hora de entrega y dirección; paga todo por adelantado con el QR.
 * El sistema asigna una PS5 libre con el juego.
 */
@Component({
  selector: 'app-gta6-domicilio-publica',
  imports: [FormsModule, DecimalPipe, Gta6Hero],
  template: `
    <div class="min-h-screen bg-slate-950 text-white">
      <app-gta6-hero titulo="PS5 con GTA 6 a domicilio" subtitulo="Te llevamos la PS5 con GTA 6 a tu casa. Reserva desde ya y paga por adelantado." [lanzamiento]="estado()?.lanzamiento ?? null" />

      <main class="mx-auto max-w-3xl px-4 py-5">
        @if (error()) {
          <p class="mb-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-100 ring-1 ring-red-400/40">{{ error() }}</p>
        }

        @switch (paso()) {
          @case ('plan') {
            @if (!estado()) {
              <p class="text-slate-400">Cargando…</p>
            } @else if (!estado()!.alquiler_planes.length || !estado()!.alquiler_consolas.length) {
              <p class="rounded-xl bg-white/5 p-4 text-sm text-slate-300">Muy pronto abrimos las reservas de PS5 con GTA 6 a domicilio. ¡Vuelve en un rato!</p>
            } @else {
              <section class="space-y-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                <div>
                  <p class="mb-2 text-sm font-semibold text-pink-200">1. Elige el plan</p>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    @for (p of estado()!.alquiler_planes; track p.id) {
                      <button type="button" (click)="plan.set(p)"
                        class="rounded-xl px-2 py-3 text-sm font-semibold ring-1 transition-colors"
                        [class.bg-pink-500]="plan()?.id === p.id" [class.text-slate-950]="plan()?.id === p.id" [class.ring-pink-500]="plan()?.id === p.id"
                        [class.bg-white/5]="plan()?.id !== p.id" [class.ring-white/15]="plan()?.id !== p.id">
                        {{ textoPlan(p) }}
                        <span class="block text-base font-black tabular-nums">{{ p.precio | number: '1.0-0' }}</span>
                      </button>
                    }
                  </div>
                  @if (plan()?.es_noche) {
                    <p class="mt-2 text-xs text-slate-400">La noche: entrega desde las {{ horaCorta(estado()!.noche_desde) }} y la recogemos a las {{ horaCorta(estado()!.noche_hasta) }}.</p>
                  }
                </div>
                <label class="block text-sm">
                  <span class="font-semibold text-pink-200">2. Día y hora de entrega</span>
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
                      <p class="font-semibold text-emerald-200">✅ Hay {{ libres() }} PS5 con GTA 6 disponible{{ libres() > 1 ? 's' : '' }} para ese horario</p>
                    } @else {
                      <p class="font-semibold text-red-200">No quedan PS5 con GTA 6 para ese horario. Prueba otro día u hora.</p>
                    }
                    <p class="mt-1 text-lg font-black">Total: {{ plan()!.precio | number: '1.0-0' }} COP</p>
                  </div>
                }
                <button type="button" (click)="aDatos()" class="w-full rounded-xl bg-gradient-to-r from-pink-500 to-orange-400 py-2.5 text-sm font-black text-slate-950 hover:brightness-110">Continuar</button>
              </section>
            }
          }

          @case ('datos') {
            <section class="space-y-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <p class="text-sm text-slate-300">{{ plan()?.nombre }} · entrega {{ diaYHora(inicioMs()) }} · <b class="text-white">{{ plan()?.precio | number: '1.0-0' }} COP</b></p>
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
              <div class="flex gap-2">
                <button type="button" (click)="paso.set('plan')" class="rounded-xl bg-white/10 px-4 py-2.5 text-sm hover:bg-white/20">Atrás</button>
                <button type="button" (click)="reservar()" [disabled]="enviando()"
                  class="flex-1 rounded-xl bg-pink-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-pink-400 disabled:opacity-50">
                  {{ enviando() ? 'Reservando…' : 'Reservar y pagar' }}
                </button>
              </div>
            </section>
          }

          @case ('pago') {
            <section class="space-y-4 rounded-2xl bg-white/5 p-5 text-center ring-1 ring-white/10">
              <p class="text-sm text-slate-300">Reserva GTA 6 a domicilio #{{ creada()?.id }}</p>
              <p class="text-lg">Paga <b class="text-2xl">{{ creada()?.precio | number: '1.0-0' }} COP</b></p>
              <p class="text-sm text-slate-300">{{ creada()?.plan }} · entrega {{ diaYHora(creada()!.inicio) }}</p>
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
              <p class="text-sm text-slate-300">{{ creada()?.plan }} · entrega {{ diaYHora(creada()!.inicio) }} · recogida {{ diaYHora(creada()!.fin) }} · {{ creada()?.precio | number: '1.0-0' }} COP</p>
              <div class="space-y-2 rounded-xl bg-amber-500/15 p-4 text-sm text-amber-50 ring-2 ring-amber-400/60">
                <p class="font-bold text-amber-200">⚠️ Importante</p>
                <p>Te escribimos por WhatsApp para coordinar la entrega.</p>
                <p>El tiempo del plan cuenta desde que recibes la consola.</p>
              </div>
              @if (enlaceComprobante()) {
                <a [href]="enlaceComprobante()" target="_blank" rel="noopener"
                  class="block w-full rounded-xl bg-emerald-500 py-2.5 text-center text-sm font-bold text-slate-950 hover:bg-emerald-400">Enviar comprobante por WhatsApp</a>
              }
              <p class="text-xs text-slate-400">Tu reserva queda confirmada cuando verifiquemos el pago.</p>
              <button type="button" (click)="reiniciar()" class="w-full rounded-xl bg-white/10 py-2.5 text-sm hover:bg-white/20">Hacer otra reserva</button>
            </section>
          }
        }
      </main>
    </div>
  `,
})
export class Gta6DomicilioPublica implements OnInit {
  readonly paso = signal<Paso>('plan');
  readonly estado = signal<Gta6Publico | null>(null);
  readonly error = signal<string | null>(null);
  readonly plan = signal<PlanGta6 | null>(null);
  readonly inicio = signal('');
  readonly enviando = signal(false);
  readonly creada = signal<ReservaGta6Creada | null>(null);
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
  readonly libres = computed(() => consolasLibres(this.estado()?.alquiler_consolas ?? [], this.inicioMs(), this.finMs()));
  readonly urlQr = computed(() => this.reservas.urlQr(this.estado()?.qr_path ?? null));
  readonly enlaceComprobante = computed(() => {
    const c = this.creada();
    if (!c) return null;
    return enlaceWhatsapp(
      this.estado()?.whatsapp ?? null,
      `Hola, envío el comprobante de mi reserva de PS5 con GTA 6 a domicilio #${c.id}: ${c.plan}, entrega ${diaYHora(c.inicio)}, ` +
        `${c.precio.toLocaleString('es-CO')} COP. A nombre de ${this.nombre.trim()}. Dirección: ${this.direccion.trim()}.`,
    );
  });

  constructor(
    private readonly gta6: Gta6Service,
    private readonly reservas: ReservasService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      const e = await this.gta6.publico();
      this.estado.set(e);
      if (!this.inicio()) {
        // Por defecto: el día del lanzamiento a las 10:00 a. m. (o en dos horas, si ya salió).
        const lanz = new Date(e.lanzamiento).getTime();
        this.inicio.set(aHoraLocal(lanz > Date.now() ? lanz + 10 * 3_600_000 : Math.ceil((Date.now() + 2 * 3_600_000) / 900_000) * 900_000));
      }
    } catch {
      this.error.set('No pudimos cargar la información. Revisa tu conexión e intenta de nuevo.');
    }
  }

  textoPlan(p: PlanGta6): string {
    return p.nombre.replace(/^GTA 6 · /, '');
  }

  horaCorta(t: string): string {
    return hora(`2000-01-01T${t.slice(0, 5)}:00-05:00`);
  }

  private desdeMs(): number {
    return Math.max(new Date(this.estado()?.lanzamiento ?? Date.now()).getTime(), Date.now());
  }

  minimo(): string {
    return aHoraLocal(this.desdeMs());
  }

  maximo(): string {
    return aHoraLocal(this.desdeMs() + (this.estado()?.dias_maximos ?? 30) * 86_400_000);
  }

  aDatos(): void {
    if (!this.plan()) return this.error.set('Elige un plan.');
    if (!this.inicio()) return this.error.set('Elige el día y la hora de entrega.');
    if (this.inicioMs() < this.desdeMs() - 60_000) return this.error.set(`GTA 6 se entrega desde ${diaYHora(this.desdeMs())}.`);
    if (this.libres() === 0) return this.error.set('No quedan PS5 con GTA 6 para ese horario. Prueba otro día u hora.');
    this.error.set(null);
    this.paso.set('datos');
    window.scrollTo({ top: 0 });
  }

  async reservar(): Promise<void> {
    const p = this.plan();
    if (!p) return;
    if (this.nombre.trim().length < 2) return this.error.set('Escribe tu nombre.');
    if (this.telefono.replace(/\D/g, '').length < 7) return this.error.set('Escribe tu número de celular.');
    if (this.direccion.trim().length < 5) return this.error.set('Escribe la dirección de entrega.');
    this.enviando.set(true);
    this.error.set(null);
    try {
      this.creada.set(
        await this.gta6.crearDomicilio({
          tarifaId: p.id,
          nombre: this.nombre.trim(),
          telefono: this.telefono,
          direccion: this.direccion.trim(),
          inicio: new Date(this.inicioMs()).toISOString(),
        }),
      );
      this.paso.set('pago');
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
    this.paso.set('plan');
    this.cargar();
  }
}
