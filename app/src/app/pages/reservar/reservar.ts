import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ConsolaPublica,
  EstadoPublico,
  ReservaCreada,
  ReservasService,
  enlaceWhatsapp,
} from '../../core/reservas.service';
import { ZONA_HORARIA } from '../../core/zona-horaria';
import { formatearDuracion } from '../../shared/duracion.pipe';

type Paso = 'consolas' | 'datos' | 'tiempo' | 'pago' | 'listo';

/** "YYYY-MM-DDTHH:mm" en hora de Colombia, para un input datetime-local. */
function aHoraLocal(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: ZONA_HORARIA }).slice(0, 16).replace(' ', 'T');
}

/** "YYYY-MM-DDTHH:mm" (hora de Colombia) → ms. */
function deHoraLocal(valor: string): number {
  return new Date(`${valor}:00-05:00`).getTime();
}

function hora(iso: string | number): string {
  return new Date(iso).toLocaleTimeString('es-CO', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: '2-digit' });
}

/** "hoy 7:00 p. m.", "mañana 3:30 p. m." o "sáb 15 nov 7:00 p. m.". */
function diaYHora(iso: string | number): string {
  const d = new Date(iso);
  const dia = (x: Date) => x.toLocaleDateString('sv-SE', { timeZone: ZONA_HORARIA });
  const hoy = new Date();
  const manana = new Date(hoy.getTime() + 86_400_000);
  if (dia(d) === dia(hoy)) return `hoy ${hora(iso)}`;
  if (dia(d) === dia(manana)) return `mañana ${hora(iso)}`;
  return `${d.toLocaleDateString('es-CO', { timeZone: ZONA_HORARIA, weekday: 'short', day: 'numeric', month: 'short' })} ${hora(iso)}`;
}

/**
 * Página pública /reservar (sin login): el cliente ve qué consolas están libres (verde)
 * u ocupadas (rojo), y reserva: nombre y celular → tiempo y hora → QR para pagar → aviso.
 */
@Component({
  selector: 'app-reservar',
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="min-h-screen bg-slate-950 text-white">
      <header class="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-4 py-4 shadow-lg">
        <div class="mx-auto max-w-3xl flex items-center gap-3">
          <span class="shrink-0 rounded-xl bg-white p-1.5 shadow-[0_0_18px_rgba(56,189,248,0.45)]">
            <img src="img/alfa-games.jpg" alt="Alfa Games" class="h-10 w-auto" />
          </span>
          <div>
            <h1 class="text-xl font-extrabold tracking-tight">Reserva tu consola</h1>
            <p class="text-xs text-sky-100/80">Alfa Games · disponibilidad en tiempo real</p>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-3xl px-4 py-5">
        @if (error()) {
          <p class="mb-4 rounded-xl bg-red-500/15 ring-1 ring-red-400/40 px-4 py-3 text-sm text-red-100">{{ error() }}</p>
        }

        @switch (paso()) {
          @case ('consolas') {
            @if (!estado()) {
              <p class="text-slate-400">Cargando consolas…</p>
            } @else {
              <p class="mb-3 text-sm text-slate-300">
                <span class="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 mr-1"></span> Disponible
                <span class="inline-block h-2.5 w-2.5 rounded-full bg-red-500 ml-3 mr-1"></span> Ocupada
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                @for (c of estado()!.consolas; track c.id) {
                  <article class="rounded-2xl p-4 ring-2"
                    [class.bg-emerald-500/10]="!c.ocupada && !c.fuera_servicio" [class.ring-emerald-500/70]="!c.ocupada && !c.fuera_servicio"
                    [class.bg-red-500/10]="c.ocupada" [class.ring-red-500/70]="c.ocupada"
                    [class.bg-white/5]="c.fuera_servicio && !c.ocupada" [class.ring-slate-600]="c.fuera_servicio && !c.ocupada" [class.opacity-70]="c.fuera_servicio && !c.ocupada">
                    <div class="flex items-center justify-between gap-2">
                      <h2 class="text-lg font-bold">🎮 {{ c.nombre }}</h2>
                      <span class="rounded-full px-2.5 py-0.5 text-xs font-bold"
                        [class.bg-emerald-500]="!c.ocupada && !c.fuera_servicio" [class.bg-red-600]="c.ocupada" [class.bg-slate-600]="c.fuera_servicio && !c.ocupada">
                        {{ c.ocupada ? 'Ocupada' : c.fuera_servicio ? 'Fuera de servicio' : 'Disponible' }}
                      </span>
                    </div>
                    @if (c.ocupada) {
                      @if (c.modalidad === 'conteo_regresivo' && c.libre_en) {
                        <p class="mt-2 text-sm text-red-100">Pidió <b>{{ duracion(c.minutos_pedidos) }}</b></p>
                        <p class="text-sm text-red-100">
                          Le quedan <b>{{ duracion(minutosHasta(c.libre_en)) }}</b> · se desocupa a las {{ hora(c.libre_en) }}
                        </p>
                        <button type="button" (click)="elegir(c)"
                          class="mt-3 w-full rounded-xl bg-white/90 py-2.5 text-sm font-bold text-red-700 hover:bg-white">
                          Reservar desde las {{ hora(c.libre_en) }}
                        </button>
                      } @else {
                        <p class="mt-2 text-sm text-red-100">Tiempo libre (sin hora de salida)</p>
                        <p class="text-sm text-red-100">Lleva jugando <b>{{ duracion(c.minutos_jugados) }}</b></p>
                        <p class="mt-1 text-xs text-red-200/80">No se puede reservar hasta saber a qué hora termina.</p>
                      }
                    } @else if (c.fuera_servicio) {
                      <p class="mt-2 text-sm text-slate-300">No disponible por ahora.</p>
                    } @else {
                      <button type="button" (click)="elegir(c)"
                        class="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
                        Reservar ahora
                      </button>
                    }
                    @if (c.reservas.length) {
                      <div class="mt-2 flex flex-wrap gap-1">
                        @for (r of c.reservas; track r.inicio) {
                          <span class="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">
                            📅 Reservada {{ diaYHora(r.inicio) }} – {{ hora(r.fin) }}
                          </span>
                        }
                      </div>
                    }
                  </article>
                }
              </div>
              <p class="mt-4 text-xs text-slate-500">Se actualiza solo cada 20 segundos.</p>
            }
          }

          @case ('datos') {
            <section class="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 space-y-4">
              <p class="text-sm text-slate-300">Consola <b class="text-white">{{ consola()?.nombre }}</b> · Paso 1 de 3</p>
              @if (consola()?.libre_en) {
                <p class="rounded-xl bg-red-500/15 ring-1 ring-red-400/40 px-3 py-2 text-sm text-red-100">
                  Está ocupada ahora: tu reserva puede empezar desde las {{ hora(consola()!.libre_en!) }}, cuando termina el cliente que está jugando.
                </p>
              }
              <label class="block text-sm">
                Nombre
                <input [(ngModel)]="nombre" name="nombre" autocomplete="name" maxlength="60"
                  class="mt-1 block w-full rounded-xl bg-white text-slate-900 px-3 py-2.5 text-base" />
              </label>
              <label class="block text-sm">
                Número de celular
                <input [(ngModel)]="telefono" name="telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="20"
                  class="mt-1 block w-full rounded-xl bg-white text-slate-900 px-3 py-2.5 text-base" />
              </label>
              <div class="flex gap-2">
                <button type="button" (click)="volver()" class="rounded-xl bg-white/10 px-4 py-2.5 text-sm hover:bg-white/20">Atrás</button>
                <button type="button" (click)="aTiempo()" class="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400">Continuar</button>
              </div>
            </section>
          }

          @case ('tiempo') {
            <section class="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 space-y-4">
              <p class="text-sm text-slate-300">Consola <b class="text-white">{{ consola()?.nombre }}</b> · Paso 2 de 3</p>
              <div>
                <p class="text-sm mb-2">¿Cuánto tiempo vas a jugar?</p>
                <div class="grid grid-cols-4 gap-2">
                  @for (p of estado()?.precios ?? []; track p.minutos) {
                    <button type="button" (click)="minutos.set(p.minutos)"
                      class="rounded-xl py-2 text-sm font-semibold ring-1 transition-colors"
                      [class.bg-sky-500]="minutos() === p.minutos" [class.text-slate-950]="minutos() === p.minutos" [class.ring-sky-500]="minutos() === p.minutos"
                      [class.bg-white/5]="minutos() !== p.minutos" [class.ring-white/15]="minutos() !== p.minutos">
                      {{ duracion(p.minutos) }}
                      <span class="block text-[11px] font-normal opacity-80">{{ p.precio | number: '1.0-0' }}</span>
                    </button>
                  }
                </div>
              </div>
              <label class="block text-sm">
                ¿A qué hora llegas?
                <input type="datetime-local" [ngModel]="inicio()" (ngModelChange)="inicio.set($event)" name="inicio"
                  [min]="minimoInicio()" [max]="maximoInicio()"
                  class="mt-1 block w-full rounded-xl bg-white text-slate-900 px-3 py-2.5 text-base" />
              </label>
              @if (minutos()) {
                <div class="rounded-xl bg-sky-500/15 ring-1 ring-sky-400/40 p-3 text-sm">
                  <p>{{ consola()?.nombre }} · {{ diaYHora(inicioMs()) }} a {{ hora(inicioMs() + minutos()! * 60000) }}</p>
                  <p class="text-lg font-bold">Total: {{ precioElegido() | number: '1.0-0' }} COP</p>
                </div>
              }
              <div class="flex gap-2">
                <button type="button" (click)="paso.set('datos')" class="rounded-xl bg-white/10 px-4 py-2.5 text-sm hover:bg-white/20">Atrás</button>
                <button type="button" (click)="reservar()" [disabled]="enviando()"
                  class="flex-1 rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50">
                  {{ enviando() ? 'Reservando…' : 'Reservar y pagar' }}
                </button>
              </div>
            </section>
          }

          @case ('pago') {
            <section class="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 space-y-4 text-center">
              <p class="text-sm text-slate-300">Paso 3 de 3 · Reserva #{{ creada()?.id }}</p>
              <p class="text-lg">Paga <b class="text-2xl">{{ creada()?.precio | number: '1.0-0' }} COP</b></p>
              <p class="text-sm text-slate-300">{{ creada()?.consola }} · {{ diaYHora(creada()!.inicio) }} a {{ hora(creada()!.fin) }}</p>
              @if (urlQr()) {
                <img [src]="urlQr()" alt="QR para pagar" class="mx-auto w-64 max-w-full rounded-xl bg-white p-2" />
              } @else {
                <p class="rounded-xl bg-amber-500/15 ring-1 ring-amber-400/40 p-3 text-sm text-amber-100">
                  El QR de pago aún no está disponible. Escríbenos por WhatsApp para pagar.
                </p>
              }
              <p class="text-xs text-slate-400">
                Tu consola queda apartada {{ creada()?.minutos_para_pagar }} minutos mientras confirmamos el pago.
              </p>
              <button type="button" (click)="paso.set('listo')"
                class="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
                Ya pagué
              </button>
            </section>
          }

          @case ('listo') {
            <section class="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 space-y-4">
              <h2 class="text-lg font-bold">✅ ¡Reserva registrada!</h2>
              <p class="text-sm text-slate-300">
                {{ creada()?.consola }} · {{ diaYHora(creada()!.inicio) }} a {{ hora(creada()!.fin) }} · {{ creada()?.precio | number: '1.0-0' }} COP
              </p>
              <div class="rounded-xl bg-amber-500/15 ring-2 ring-amber-400/60 p-4 text-sm text-amber-50 space-y-2">
                <p class="font-bold text-amber-200">⚠️ Importante</p>
                <p>Debes estar <b>por lo menos 5 minutos antes</b> de la hora de tu reserva.</p>
                <p>Si no estás al iniciar el tiempo acordado, <b>tu tiempo comenzará a correr</b> igual.</p>
                <p>Si no puedes ir, <b>tu dinero no podrá ser devuelto</b>.</p>
              </div>
              @if (enlaceComprobante()) {
                <a [href]="enlaceComprobante()" target="_blank" rel="noopener"
                  class="block w-full rounded-xl bg-emerald-500 py-2.5 text-center text-sm font-bold text-slate-950 hover:bg-emerald-400">
                  Enviar comprobante por WhatsApp
                </a>
              }
              <p class="text-xs text-slate-400">Tu reserva queda confirmada cuando el local verifique el pago.</p>
              <button type="button" (click)="reiniciar()" class="w-full rounded-xl bg-white/10 py-2.5 text-sm hover:bg-white/20">
                Hacer otra reserva
              </button>
            </section>
          }
        }
      </main>
    </div>
  `,
})
export class Reservar implements OnInit, OnDestroy {
  readonly paso = signal<Paso>('consolas');
  readonly estado = signal<EstadoPublico | null>(null);
  readonly error = signal<string | null>(null);
  readonly consola = signal<ConsolaPublica | null>(null);
  readonly minutos = signal<number | null>(null);
  readonly inicio = signal('');
  readonly enviando = signal(false);
  readonly creada = signal<ReservaCreada | null>(null);
  private readonly ahora = signal(Date.now());
  nombre = '';
  telefono = '';

  readonly hora = hora;
  readonly diaYHora = diaYHora;
  readonly inicioMs = computed(() => (this.inicio() ? deHoraLocal(this.inicio()) : Date.now()));
  readonly precioElegido = computed(() => this.estado()?.precios.find((p) => p.minutos === this.minutos())?.precio ?? 0);
  readonly urlQr = computed(() => this.reservas.urlQr(this.estado()?.qr_path ?? null));
  readonly enlaceComprobante = computed(() => {
    const c = this.creada();
    if (!c) return null;
    return enlaceWhatsapp(
      this.estado()?.whatsapp ?? null,
      `Hola, envío el comprobante de mi reserva #${c.id}: ${c.consola}, ${diaYHora(c.inicio)} a ${hora(c.fin)}, ` +
        `${c.precio.toLocaleString('es-CO')} COP. A nombre de ${this.nombre.trim()}.`,
    );
  });

  private timer?: ReturnType<typeof setInterval>;
  private readonly alVolver = () => {
    if (document.visibilityState === 'visible') this.cargar();
  };

  constructor(private readonly reservas: ReservasService) {}

  ngOnInit(): void {
    this.cargar();
    this.timer = setInterval(() => {
      this.ahora.set(Date.now());
      if (this.paso() === 'consolas') this.cargar();
    }, 20_000);
    document.addEventListener('visibilitychange', this.alVolver);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.alVolver);
  }

  async cargar(): Promise<void> {
    try {
      this.estado.set(await this.reservas.estadoPublico());
      this.ahora.set(Date.now());
    } catch {
      this.error.set('No pudimos cargar las consolas. Revisa tu conexión e intenta de nuevo.');
    }
  }

  duracion(min: number | null): string {
    return formatearDuracion(Math.max(0, Math.round(min ?? 0)));
  }

  minutosHasta(iso: string): number {
    return Math.max(1, Math.ceil((new Date(iso).getTime() - this.ahora()) / 60_000));
  }

  /** Desde cuándo se puede reservar la consola elegida: ahora, o cuando termina la sesión en curso. */
  private desdeMs(): number {
    const libre = this.consola()?.libre_en;
    // Al minuto siguiente del fin (el input solo maneja minutos).
    return libre ? Math.max(Date.now(), Math.ceil(new Date(libre).getTime() / 60_000) * 60_000) : Date.now();
  }

  minimoInicio(): string {
    return aHoraLocal(this.desdeMs());
  }

  maximoInicio(): string {
    return aHoraLocal(Date.now() + (this.estado()?.dias_maximos ?? 7) * 86_400_000);
  }

  elegir(c: ConsolaPublica): void {
    this.error.set(null);
    this.consola.set(c);
    this.inicio.set('');
    this.paso.set('datos');
    window.scrollTo({ top: 0 });
  }

  volver(): void {
    this.error.set(null);
    this.paso.set('consolas');
    this.cargar();
  }

  aTiempo(): void {
    if (this.nombre.trim().length < 2) return this.error.set('Escribe tu nombre.');
    if (this.telefono.replace(/\D/g, '').length < 7) return this.error.set('Escribe tu número de celular.');
    this.error.set(null);
    // Por defecto: libre ya → en 15 minutos (redondeado al cuarto de hora); ocupada → cuando termina.
    const cuarto = 15 * 60_000;
    if (!this.inicio()) {
      this.inicio.set(aHoraLocal(this.consola()?.libre_en ? this.desdeMs() : Math.ceil((Date.now() + cuarto) / cuarto) * cuarto));
    }
    this.paso.set('tiempo');
  }

  async reservar(): Promise<void> {
    const c = this.consola();
    const minutos = this.minutos();
    if (!c) return;
    if (!minutos) return this.error.set('Elige cuánto tiempo vas a jugar.');
    if (!this.inicio()) return this.error.set('Elige a qué hora llegas.');
    const inicio = this.inicioMs();
    if (inicio < Date.now() - 2 * 60_000) return this.error.set('Esa hora ya pasó. Elige una hora desde ahora.');
    if (c.libre_en && inicio < this.desdeMs() - 60_000) {
      return this.error.set(`${c.nombre} está ocupada hasta las ${hora(c.libre_en)}. Elige una hora desde entonces.`);
    }
    const fin = inicio + minutos * 60_000;
    const choque = c.reservas.find((r) => new Date(r.inicio).getTime() < fin && new Date(r.fin).getTime() > inicio);
    if (choque) {
      return this.error.set(`${c.nombre} ya está reservada ${diaYHora(choque.inicio)} – ${hora(choque.fin)}. Elige otra hora.`);
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      this.creada.set(
        await this.reservas.crear({
          puestoId: c.id,
          nombre: this.nombre.trim(),
          telefono: this.telefono,
          inicio: new Date(inicio).toISOString(),
          minutos,
        }),
      );
      this.paso.set('pago');
      window.scrollTo({ top: 0 });
    } catch (e) {
      this.error.set(e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'No se pudo reservar. Intenta de nuevo.');
    } finally {
      this.enviando.set(false);
    }
  }

  reiniciar(): void {
    this.creada.set(null);
    this.consola.set(null);
    this.minutos.set(null);
    this.inicio.set('');
    this.paso.set('consolas');
    this.cargar();
  }
}
