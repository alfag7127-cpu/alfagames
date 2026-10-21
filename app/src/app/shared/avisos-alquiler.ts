import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AlquilerService } from '../core/alquiler.service';
import { AuthService } from '../core/auth.service';
import { Alquiler, ConsolaConEstado } from '../core/models';
import { SupabaseService } from '../core/supabase.service';

type TipoAviso = 'alquilada' | 'pronto' | 'vencida';

interface Aviso {
  clave: string;
  tipo: TipoAviso;
  consola: string;
  cliente: string;
  telefono: string | null;
  direccion: string | null;
  fin: string;
}

/** Minutos antes de la hora de devolución en que se avisa "recoger pronto". */
const MINUTOS_ANTES = 30;
const PREFIJO = 'aviso-alquiler:';

/**
 * Aviso emergente (celular y PC) para quien maneja el alquiler (admin y rol alquiler),
 * en cualquier pantalla de la app:
 * - cuando otra persona alquila una consola;
 * - 30 minutos antes de la hora de devolución y cuando ya hay que recogerla.
 * Cada aviso sale una sola vez por dispositivo (si se extiende el alquiler, vuelve a avisar
 * con la nueva hora). Suena, vibra en el celular y, si el navegador lo permite, también
 * sale como notificación del sistema cuando la app está en segundo plano.
 */
@Component({
  selector: 'app-avisos-alquiler',
  imports: [DatePipe],
  template: `
    @if (avisos()[0]; as a) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-[fadeIn_150ms_ease-out]"
        role="alertdialog" aria-modal="true" aria-labelledby="aviso-titulo">
        <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div class="px-5 py-4 text-white"
            [class.bg-emerald-600]="a.tipo === 'alquilada'"
            [class.bg-amber-500]="a.tipo === 'pronto'"
            [class.bg-red-600]="a.tipo === 'vencida'">
            <p class="text-xs font-bold uppercase tracking-widest opacity-90">Alquiler · aviso</p>
            <h2 id="aviso-titulo" class="text-2xl font-black leading-tight">
              {{ a.tipo === 'alquilada' ? '🎮 Consola alquilada' : a.tipo === 'pronto' ? '⏰ Recoger pronto' : '🚨 Recoger consola YA' }}
            </h2>
          </div>
          <div class="space-y-1.5 px-5 py-4 text-slate-800">
            <p class="text-lg font-bold">{{ a.consola }}</p>
            <p>Cliente: <b>{{ a.cliente }}</b></p>
            @if (a.telefono) {
              <p>Teléfono: <a [href]="'tel:' + a.telefono" class="font-semibold text-blue-700 underline">{{ a.telefono }}</a></p>
            }
            @if (a.direccion) {
              <p>Dirección: <b>{{ a.direccion }}</b></p>
            }
            <p [class.text-red-700]="a.tipo === 'vencida'" [class.font-bold]="a.tipo !== 'alquilada'">
              {{ a.tipo === 'vencida' ? 'Debía devolverse' : 'Devolver' }}: {{ a.fin | date: 'EEE d MMM, h:mm a' }}
            </p>
            @if (avisos().length > 1) {
              <p class="pt-1 text-xs text-slate-500">+ {{ avisos().length - 1 }} aviso{{ avisos().length === 2 ? '' : 's' }} más</p>
            }
          </div>
          <div class="flex gap-2 border-t border-slate-100 px-5 py-3">
            <button type="button" (click)="verAlquiler()" class="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              Ver en Alquiler
            </button>
            <button type="button" (click)="cerrar()" class="flex-1 rounded-lg bg-slate-100 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-200">
              Entendido
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AvisosAlquiler implements OnInit, OnDestroy {
  readonly avisos = signal<Aviso[]>([]);
  private activos: ConsolaConEstado[] = [];
  private canal?: RealtimeChannel;
  private reloj?: ReturnType<typeof setInterval>;

  constructor(
    private readonly alquiler: AlquilerService,
    private readonly auth: AuthService,
    private readonly supabase: SupabaseService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.canal = this.supabase.client
      .channel(`avisos-alquiler-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alquileres' }, (p) =>
        this.cargar(p.new as Alquiler),
      )
      // Devoluciones, cancelaciones y extensiones cambian qué hay que recoger y cuándo.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alquileres' }, () => this.cargar())
      .subscribe();
    this.reloj = setInterval(() => this.revisarVencimientos(), 30_000);
  }

  ngOnDestroy(): void {
    if (this.canal) this.supabase.client.removeChannel(this.canal);
    clearInterval(this.reloj);
  }

  private async cargar(nuevo?: Alquiler): Promise<void> {
    try {
      const consolas = await this.alquiler.listarConsolasConEstado();
      this.activos = consolas.filter((c) => c.alquiler_id != null && c.fin_pactado);
    } catch {
      return; // Los avisos son de apoyo: si falla la carga, se intenta en el próximo cambio.
    }
    // Quien entrega la consola ya lo sabe: el aviso es para los demás.
    if (nuevo && nuevo.empleado_id !== this.auth.currentProfile()?.id) {
      const c = this.activos.find((x) => x.alquiler_id === nuevo.id);
      if (c) this.avisar('alquilada', c);
    }
    this.revisarVencimientos();
  }

  private revisarVencimientos(): void {
    const ahora = Date.now();
    for (const c of this.activos) {
      const fin = new Date(c.fin_pactado!).getTime();
      if (ahora >= fin) this.avisar('vencida', c);
      else if (fin - ahora <= MINUTOS_ANTES * 60_000) this.avisar('pronto', c);
    }
  }

  private avisar(tipo: TipoAviso, c: ConsolaConEstado): void {
    const clave = `${PREFIJO}${c.alquiler_id}:${tipo}:${c.fin_pactado}`;
    if (this.yaAvisado(clave) || this.avisos().some((a) => a.clave === clave)) return;
    this.marcar(clave);
    // "Pronto" ya no sirve si en la cola quedó el de "ya vencida" de la misma consola.
    this.avisos.update((lista) => [
      ...lista.filter((a) => !(tipo === 'vencida' && a.tipo === 'pronto' && a.consola === c.nombre)),
      {
        clave,
        tipo,
        consola: c.nombre,
        cliente: c.cliente_nombre ?? 'Sin nombre',
        telefono: c.cliente_telefono,
        direccion: c.cliente_direccion,
        fin: c.fin_pactado!,
      },
    ]);
    this.llamarAtencion(tipo, c);
  }

  cerrar(): void {
    this.avisos.update((lista) => lista.slice(1));
    // Se pide permiso para avisos del sistema tras un toque del usuario (los navegadores lo exigen).
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined);
    }
  }

  verAlquiler(): void {
    this.cerrar();
    this.router.navigateByUrl('/alquiler');
  }

  /** Sonido, vibración y notificación del sistema si la app no está a la vista. */
  private llamarAtencion(tipo: TipoAviso, c: ConsolaConEstado): void {
    try {
      navigator.vibrate?.(tipo === 'vencida' ? [300, 150, 300, 150, 300] : [250, 120, 250]);
    } catch {
      /* sin vibración */
    }
    this.sonar(tipo === 'vencida' ? 3 : 2);
    if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
      const titulo = tipo === 'alquilada' ? 'Consola alquilada' : tipo === 'pronto' ? 'Recoger consola pronto' : 'Recoger consola YA';
      try {
        new Notification(`${titulo}: ${c.nombre}`, { body: `Cliente: ${c.cliente_nombre ?? 'Sin nombre'}`, tag: `${c.alquiler_id}-${tipo}` });
      } catch {
        /* algunos celulares no permiten notificaciones sin service worker: queda el aviso en pantalla */
      }
    }
  }

  private sonar(pitidos: number): void {
    try {
      const ctx = new AudioContext();
      for (let i = 0; i < pitidos; i++) {
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        osc.frequency.value = 880;
        vol.gain.value = 0.15;
        osc.connect(vol).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.35);
        osc.stop(ctx.currentTime + i * 0.35 + 0.2);
      }
      setTimeout(() => ctx.close(), pitidos * 400 + 200);
    } catch {
      /* el navegador puede bloquear el sonido hasta el primer toque */
    }
  }

  private yaAvisado(clave: string): boolean {
    try {
      return localStorage.getItem(clave) != null;
    } catch {
      return false;
    }
  }

  private marcar(clave: string): void {
    try {
      localStorage.setItem(clave, String(Date.now()));
    } catch {
      /* sin almacenamiento: puede repetirse al recargar */
    }
  }
}
