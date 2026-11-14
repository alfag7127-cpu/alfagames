import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Gta6Publico, Gta6Service, ReservaGta6Creada } from '../../core/gta6.service';
import { ReservasService, enlaceWhatsapp } from '../../core/reservas.service';
import { formatearDuracion } from '../../shared/duracion.pipe';
import { Gta6Hero } from './gta6-hero';
import { aHoraLocal, deHoraLocal, diaYHora, hora, mensajeError } from './gta6-util';

type Paso = 'consolas' | 'datos' | 'tiempo' | 'pago' | 'listo';
type ConsolaGta6 = Gta6Publico['sala_consolas'][number];

/**
 * Página pública /gta6-sala: reservar una consola de la sala para jugar GTA 6 desde el
 * lanzamiento. Se paga todo por adelantado con el QR; el local confirma el pago.
 */
@Component({
  selector: 'app-gta6-sala-publica',
  imports: [FormsModule, DecimalPipe, Gta6Hero],
  template: `
    <div class="min-h-screen bg-slate-950 text-white">
      <app-gta6-hero titulo="Juega GTA 6 en la sala" subtitulo="Reserva tu consola y tu horario. Pagas por adelantado y llegas a jugar." [lanzamiento]="estado()?.lanzamiento ?? null" />

      <main class="mx-auto max-w-3xl px-4 py-5">
        @if (error()) {
          <p class="mb-4 rounded-xl bg-red-500/15 ring-1 ring-red-400/40 px-4 py-3 text-sm text-red-100">{{ error() }}</p>
        }

        @switch (paso()) {
          @case ('consolas') {
            @if (!estado()) {
              <p class="text-slate-400">Cargando…</p>
            } @else if (!estado()!.sala_consolas.length || !estado()!.sala_precios.length) {
              <p class="rounded-xl bg-white/5 p-4 text-sm text-slate-300">Muy pronto abrimos las reservas de GTA 6 en la sala. ¡Vuelve en un rato!</p>
            } @else {
              <section class="mb-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <p class="mb-2 text-sm font-semibold text-pink-200">Precios GTA 6</p>
                <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  @for (p of estado()!.sala_precios; track p.minutos) {
                    <div class="rounded-xl bg-white/5 py-2 text-center ring-1 ring-white/10">
                      <p class="text-sm font-bold">{{ duracion(p.minutos) }}</p>
                      <p class="text-xs text-slate-300 tabular-nums">{{ p.precio | number: '1.0-0' }}</p>
                    </div>
                  }
                </div>
              </section>
              <p class="mb-2 text-sm text-slate-300">Elige la consola:</p>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                @for (c of estado()!.sala_consolas; track c.id) {
                  <article class="rounded-2xl bg-fuchsia-500/10 p-4 ring-2 ring-fuchsia-500/60">
                    <h2 class="text-lg font-bold">🎮 {{ c.nombre }} <span class="ml-1 rounded bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-black">GTA 6</span></h2>
                    @if (c.reservas.length) {
                      <p class="mt-2 text-xs text-slate-300">Horarios ya reservados:</p>
                      <div class="mt-1 flex flex-wrap gap-1">
                        @for (r of c.reservas; track r.inicio) {
                          <span class="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">{{ diaYHora(r.inicio) }} – {{ hora(r.fin) }}</span>
                        }
                      </div>
                    } @else {
                      <p class="mt-2 text-sm text-emerald-200">Todos los horarios libres</p>
                    }
                    <button type="button" (click)="elegir(c)"
                      class="mt-3 w-full rounded-xl bg-gradient-to-r from-pink-500 to-orange-400 py-2.5 text-sm font-black text-slate-950 hover:brightness-110">
                      Reservar esta consola
                    </button>
                  </article>
                }
              </div>
            }
          }

          @case ('datos') {
            <section class="space-y-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <p class="text-sm text-slate-300">Consola <b class="text-white">{{ consola()?.nombre }}</b> · Paso 1 de 3</p>
              <label class="block text-sm">
                Nombre
                <input [(ngModel)]="nombre" name="nombre" autocomplete="name" maxlength="60"
                  class="mt-1 block w-full rounded-xl bg-white px-3 py-2.5 text-base text-slate-900" />
              </label>
              <label class="block text-sm">
                Número de celular
                <input [(ngModel)]="telefono" name="telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="20"
                  class="mt-1 block w-full rounded-xl bg-white px-3 py-2.5 text-base text-slate-900" />
              </label>
              <div class="flex gap-2">
                <button type="button" (click)="volver()" class="rounded-xl bg-white/10 px-4 py-2.5 text-sm hover:bg-white/20">Atrás</button>
                <button type="button" (click)="aTiempo()" class="flex-1 rounded-xl bg-pink-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-pink-400">Continuar</button>
              </div>
            </section>
          }

          @case ('tiempo') {
            <section class="space-y-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <p class="text-sm text-slate-300">Consola <b class="text-white">{{ consola()?.nombre }}</b> · Paso 2 de 3</p>
              <div>
                <p class="mb-2 text-sm">¿Cuánto tiempo vas a jugar?</p>
                <div class="grid grid-cols-3 gap-2">
                  @for (p of estado()?.sala_precios ?? []; track p.minutos) {
                    <button type="button" (click)="minutos.set(p.minutos)"
                      class="rounded-xl py-2 text-sm font-semibold ring-1 transition-colors"
                      [class.bg-pink-500]="minutos() === p.minutos" [class.text-slate-950]="minutos() === p.minutos" [class.ring-pink-500]="minutos() === p.minutos"
                      [class.bg-white/5]="minutos() !== p.minutos" [class.ring-white/15]="minutos() !== p.minutos">
                      {{ duracion(p.minutos) }}
                      <span class="block text-[11px] font-normal opacity-80">{{ p.precio | number: '1.0-0' }}</span>
                    </button>
                  }
                </div>
              </div>
              <label class="block text-sm">
                Día y hora de llegada
                <input type="datetime-local" [ngModel]="inicio()" (ngModelChange)="inicio.set($event)" name="inicio"
                  [min]="minimo()" [max]="maximo()"
                  class="mt-1 block w-full rounded-xl bg-white px-3 py-2.5 text-base text-slate-900" />
              </label>
              @if (minutos() && inicio()) {
                <div class="rounded-xl bg-pink-500/15 p-3 text-sm ring-1 ring-pink-400/40">
                  <p>{{ consola()?.nombre }} · {{ diaYHora(inicioMs()) }} a {{ hora(inicioMs() + minutos()! * 60000) }}</p>
                  <p class="text-lg font-bold">Total: {{ precioElegido() | number: '1.0-0' }} COP</p>
                </div>
              }
              <div class="flex gap-2">
                <button type="button" (click)="paso.set('datos')" class="rounded-xl bg-white/10 px-4 py-2.5 text-sm hover:bg-white/20">Atrás</button>
                <button type="button" (click)="reservar()" [disabled]="enviando()"
                  class="flex-1 rounded-xl bg-pink-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-pink-400 disabled:opacity-50">
                  {{ enviando() ? 'Reservando…' : 'Reservar y pagar' }}
                </button>
              </div>
            </section>
          }

          @case ('pago') {
            <section class="space-y-4 rounded-2xl bg-white/5 p-5 text-center ring-1 ring-white/10">
              <p class="text-sm text-slate-300">Paso 3 de 3 · Reserva GTA 6 #{{ creada()?.numero ?? creada()?.id }}</p>
              <p class="text-lg">Paga <b class="text-2xl">{{ creada()?.precio | number: '1.0-0' }} COP</b></p>
              <p class="text-sm text-slate-300">{{ creada()?.consola }} · {{ diaYHora(creada()!.inicio) }} a {{ hora(creada()!.fin) }}</p>
              @if (urlQr()) {
                <img [src]="urlQr()" alt="QR para pagar" class="mx-auto w-64 max-w-full rounded-xl bg-white p-2" />
              } @else {
                <p class="rounded-xl bg-amber-500/15 p-3 text-sm text-amber-100 ring-1 ring-amber-400/40">El QR de pago aún no está disponible. Escríbenos por WhatsApp para pagar.</p>
              }
              <p class="text-xs text-slate-400">Tu horario queda apartado {{ creada()?.minutos_para_pagar }} minutos mientras confirmamos el pago.</p>
              <button type="button" (click)="paso.set('listo')" class="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">Ya pagué</button>
            </section>
          }

          @case ('listo') {
            <section class="space-y-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
              <h2 class="text-lg font-bold">✅ ¡Reserva GTA 6 registrada!</h2>
              <p class="text-sm text-slate-300">{{ creada()?.consola }} · {{ diaYHora(creada()!.inicio) }} a {{ hora(creada()!.fin) }} · {{ creada()?.precio | number: '1.0-0' }} COP</p>
              <div class="space-y-2 rounded-xl bg-amber-500/15 p-4 text-sm text-amber-50 ring-2 ring-amber-400/60">
                <p class="font-bold text-amber-200">⚠️ Importante</p>
                <p>Llega <b>por lo menos 5 minutos antes</b> de tu hora.</p>
                <p>Si no estás al iniciar, <b>tu tiempo comenzará a correr</b> igual.</p>
                <p>Si no puedes ir, <b>tu dinero no podrá ser devuelto</b>.</p>
              </div>
              @if (enlaceComprobante()) {
                <a [href]="enlaceComprobante()" target="_blank" rel="noopener"
                  class="block w-full rounded-xl bg-emerald-500 py-2.5 text-center text-sm font-bold text-slate-950 hover:bg-emerald-400">Enviar comprobante por WhatsApp</a>
              }
              <p class="text-xs text-slate-400">Tu reserva queda confirmada cuando el local verifique el pago.</p>
              <button type="button" (click)="reiniciar()" class="w-full rounded-xl bg-white/10 py-2.5 text-sm hover:bg-white/20">Hacer otra reserva</button>
            </section>
          }
        }
      </main>
    </div>
  `,
})
export class Gta6SalaPublica implements OnInit {
  readonly paso = signal<Paso>('consolas');
  readonly estado = signal<Gta6Publico | null>(null);
  readonly error = signal<string | null>(null);
  readonly consola = signal<ConsolaGta6 | null>(null);
  readonly minutos = signal<number | null>(null);
  readonly inicio = signal('');
  readonly enviando = signal(false);
  readonly creada = signal<ReservaGta6Creada | null>(null);
  nombre = '';
  telefono = '';

  readonly hora = hora;
  readonly diaYHora = diaYHora;
  readonly inicioMs = computed(() => (this.inicio() ? deHoraLocal(this.inicio()) : Date.now()));
  readonly precioElegido = computed(() => this.estado()?.sala_precios.find((p) => p.minutos === this.minutos())?.precio ?? 0);
  readonly urlQr = computed(() => this.reservas.urlQr(this.estado()?.qr_path ?? null));
  readonly enlaceComprobante = computed(() => {
    const c = this.creada();
    if (!c) return null;
    return enlaceWhatsapp(
      this.estado()?.whatsapp ?? null,
      `Hola, envío el comprobante de mi reserva GTA 6 #${c.numero ?? c.id}: ${c.consola}, ${diaYHora(c.inicio)} a ${hora(c.fin)}, ` +
        `${c.precio.toLocaleString('es-CO')} COP. A nombre de ${this.nombre.trim()}.`,
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
      this.estado.set(await this.gta6.publico());
    } catch {
      this.error.set('No pudimos cargar la información. Revisa tu conexión e intenta de nuevo.');
    }
  }

  duracion(min: number): string {
    return formatearDuracion(min);
  }

  /** Desde el lanzamiento (o desde ya, si ya salió). */
  private desdeMs(): number {
    const lanz = new Date(this.estado()?.lanzamiento ?? Date.now()).getTime();
    return Math.max(lanz, Date.now());
  }

  minimo(): string {
    return aHoraLocal(this.desdeMs());
  }

  maximo(): string {
    return aHoraLocal(this.desdeMs() + (this.estado()?.dias_maximos ?? 30) * 86_400_000);
  }

  elegir(c: ConsolaGta6): void {
    this.error.set(null);
    this.consola.set(c);
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
    if (!this.inicio()) {
      // Por defecto: el día del lanzamiento a las 3:00 p. m. (o en una hora, si ya salió).
      const lanz = new Date(this.estado()?.lanzamiento ?? Date.now()).getTime();
      const sugerido = lanz > Date.now() ? lanz + 15 * 3_600_000 : Math.ceil((Date.now() + 3_600_000) / 900_000) * 900_000;
      this.inicio.set(aHoraLocal(sugerido));
    }
    this.paso.set('tiempo');
  }

  async reservar(): Promise<void> {
    const c = this.consola();
    const minutos = this.minutos();
    if (!c) return;
    if (!minutos) return this.error.set('Elige cuánto tiempo vas a jugar.');
    if (!this.inicio()) return this.error.set('Elige el día y la hora.');
    const inicio = this.inicioMs();
    if (inicio < this.desdeMs() - 60_000) return this.error.set(`GTA 6 se puede jugar desde ${diaYHora(this.desdeMs())}.`);
    const fin = inicio + minutos * 60_000;
    const choque = c.reservas.find((r) => new Date(r.inicio).getTime() < fin && new Date(r.fin).getTime() > inicio);
    if (choque) return this.error.set(`${c.nombre} ya está reservada ${diaYHora(choque.inicio)} – ${hora(choque.fin)}. Elige otra hora.`);
    this.enviando.set(true);
    this.error.set(null);
    try {
      this.creada.set(
        await this.gta6.crearSala({ puestoId: c.id, nombre: this.nombre.trim(), telefono: this.telefono, inicio: new Date(inicio).toISOString(), minutos }),
      );
      this.paso.set('pago');
      window.scrollTo({ top: 0 });
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo reservar. Intenta de nuevo.'));
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
