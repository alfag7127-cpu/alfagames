import { Component, OnInit, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlquilerService, DatosContrato } from '../core/alquiler.service';
import { ToastService } from '../core/toast.service';
import { AccesoriosContrato, CONDICIONES_CONTRATO, fechaContrato, fechaHoraContrato, generarContratoPdf, pesosContrato } from './contrato-pdf';
import { FirmaPad } from './firma-pad';

/**
 * Al entregar la consola: el formato de contrato del dueño ya lleno con los datos del
 * alquiler, casillas de accesorios, y el cliente firma con el dedo en el celular.
 * Se guarda como PDF en "📎 Contrato firmado" del alquiler.
 */
@Component({
  selector: 'app-contrato-firma',
  imports: [FormsModule, FirmaPad],
  template: `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 p-2 sm:p-6" (click)="$event.target === $event.currentTarget && cerrar()">
      <div class="mx-auto max-w-2xl space-y-4 rounded-2xl bg-white p-4 text-sm text-slate-800 shadow-xl">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-bold">✍️ Contrato de alquiler</h2>
          <button type="button" (click)="cerrar()" class="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        @if (!datos()) {
          <p class="text-slate-500">Cargando…</p>
        } @else {
          @let d = datos()!;
          @let a = d.alquiler;
          <div class="space-y-1 text-center">
            <p class="text-lg font-black tracking-wide">ALFA GAMES</p>
            <p class="text-xs font-semibold">CONTRATO DE ALQUILER DE CONSOLA DE VIDEOJUEGOS</p>
          </div>

          <section class="space-y-1">
            <h3 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">1. DATOS DE LAS PARTES</h3>
            <p><b>Fecha:</b> {{ hoy }}</p>
            <p><b>Arrendador:</b> {{ d.arrendadorNombre || '⚠️ sin nombre' }} (ALFA GAMES) · C.C. {{ d.arrendadorCedula || '⚠️' }}</p>
            <p><b>Cliente:</b> {{ a.cliente_nombre }}</p>
            <p><b>C.C.:</b> {{ a.cliente_cedula || '⚠️ falta' }} · <b>Teléfono:</b> {{ a.cliente_telefono || '⚠️ falta' }}</p>
            <p><b>Dirección de entrega:</b> {{ a.cliente_direccion || '⚠️ falta' }}</p>
          </section>

          <section class="space-y-2">
            <h3 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">2. DETALLE DEL EQUIPO Y TIEMPOS</h3>
            <p><b>Consola:</b> {{ d.consola?.tipo }} · {{ d.consola?.nombre }}</p>
            <p><b>Nº de serie:</b> {{ d.consola?.serial || '⚠️ sin serie (anótala en Alquiler → Configuración)' }}</p>
            <div class="space-y-1.5 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <p class="text-xs font-semibold text-slate-600">Accesorios entregados (desmarca lo que no lleve)</p>
              <label class="flex items-center gap-2">
                <input type="number" min="0" max="10" [(ngModel)]="acc.mandos" name="mandos" class="w-16 rounded border border-slate-300 px-2 py-1" />
                Mando(s) inalámbrico(s)
              </label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="acc.cablePoder" name="poder" class="h-5 w-5" /> Cable de poder</label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="acc.cableHdmi" name="hdmi" class="h-5 w-5" /> Cable HDMI</label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="acc.cableCarga" name="carga" class="h-5 w-5" /> Cable de carga de mando</label>
              <label class="block">Otro / Juego:
                <input [(ngModel)]="acc.otro" name="otro" maxlength="200" class="mt-1 block w-full rounded border border-slate-300 px-2 py-1" />
              </label>
            </div>
            <p><b>Entrega:</b> {{ fh(a.inicio) }}</p>
            <p><b>Devolución:</b> {{ fh(a.fin_pactado) }}</p>
            <p><b>Valor pagado:</b> {{ pesos(d.pagado) }}</p>
          </section>

          <section class="space-y-1">
            <h3 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">3. CONDICIONES BÁSICAS Y COMPROMISOS</h3>
            @for (c of condiciones; track c.titulo; let i = $index) {
              <p class="text-xs leading-snug"><b>{{ i + 1 }}. {{ c.titulo }}:</b> {{ c.texto }}</p>
            }
          </section>

          <section class="space-y-2">
            <h3 class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">4. FIRMAS DE CONFORMIDAD</h3>
            <div>
              <p class="text-xs font-semibold text-slate-600">Firma arrendador</p>
              @if (firmaArrendador()) {
                <img [src]="firmaArrendador()" alt="Firma del arrendador" class="h-20 rounded bg-white ring-1 ring-slate-200" />
              } @else {
                <p class="text-xs text-amber-700">⚠️ El dueño aún no ha guardado su firma (Alquiler → Configuración). El contrato sale sin ella.</p>
              }
            </div>
            <div>
              <p class="mb-1 text-xs font-semibold text-slate-600">Firma del cliente: {{ a.cliente_nombre }} · C.C. {{ a.cliente_cedula }}</p>
              <app-firma-pad #pad (cambio)="firmado.set($event)" />
            </div>
          </section>

          @if (pdfGuardado()) {
            <div class="space-y-2 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <p class="font-semibold text-emerald-800">✅ Contrato firmado guardado en el alquiler.</p>
              @if (puedeCompartir()) {
                <button type="button" (click)="compartir()" class="w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white hover:bg-emerald-700">
                  📤 Enviar al cliente (WhatsApp u otra app)
                </button>
              }
              <button type="button" (click)="cerrado.emit(true)" class="w-full rounded-xl bg-slate-800 py-2.5 font-bold text-white hover:bg-slate-900">Listo</button>
            </div>
          } @else {
            <button type="button" (click)="guardar()" [disabled]="!firmado() || guardando()"
              class="w-full rounded-xl bg-emerald-600 py-3 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
              {{ guardando() ? 'Guardando…' : firmado() ? '✅ Guardar contrato firmado' : 'Falta la firma del cliente' }}
            </button>
          }
        }
      </div>
    </div>
  `,
})
export class ContratoFirma implements OnInit {
  readonly alquilerId = input.required<number>();
  readonly cerrado = output<boolean>();

  readonly datos = signal<DatosContrato | null>(null);
  readonly firmaArrendador = signal<string | null>(null);
  readonly firmado = signal(false);
  readonly guardando = signal(false);
  readonly condiciones = CONDICIONES_CONTRATO;
  readonly hoy = fechaContrato(new Date().toISOString());
  private readonly pad = viewChild<FirmaPad>('pad');

  acc: AccesoriosContrato = { mandos: 0, cablePoder: true, cableHdmi: true, cableCarga: true, otro: '' };

  constructor(
    private readonly alquiler: AlquilerService,
    private readonly toast: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const [d, firma] = await Promise.all([
        this.alquiler.datosContrato(this.alquilerId()),
        this.alquiler.firmaArrendador().catch(() => null),
      ]);
      const a = d.alquiler;
      this.acc.mandos = (a.controles ?? 0) + (a.controles_extra ?? 0);
      this.acc.otro = (a.juegos_entregados ?? []).join(', ');
      this.firmaArrendador.set(firma);
      this.datos.set(d);
    } catch (e) {
      this.toast.error(this.mensaje(e));
      this.cerrado.emit(false);
    }
  }

  fh(iso: string): string {
    return fechaHoraContrato(iso);
  }

  pesos(n: number): string {
    return pesosContrato(n);
  }

  cerrar(): void {
    if (this.pdfGuardado()) return this.cerrado.emit(true);
    if (this.firmado() && !confirm('¿Cerrar sin guardar el contrato firmado?')) return;
    this.cerrado.emit(false);
  }

  async guardar(): Promise<void> {
    const d = this.datos();
    const firma = this.pad()?.imagen();
    if (!d || !firma) return this.toast.error('Falta la firma del cliente.');
    this.guardando.set(true);
    try {
      const pdf = await generarContratoPdf(
        d,
        { ...this.acc, mandos: Math.max(0, Math.round(Number(this.acc.mandos) || 0)) },
        firma,
        this.firmaArrendador(),
        new Date(),
      );
      await this.alquiler.subirContratoFirmado(this.alquilerId(), pdf);
      this.toast.exito('Contrato firmado guardado.');
      this.pdfGuardado.set(new File([pdf], `Contrato-ALFA-GAMES-${d.alquiler.id}.pdf`, { type: 'application/pdf' }));
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.guardando.set(false);
    }
  }

  readonly pdfGuardado = signal<File | null>(null);

  /** El celular permite mandar el PDF a WhatsApp u otra app. */
  puedeCompartir(): boolean {
    const f = this.pdfGuardado();
    const nav = navigator as Navigator & { canShare?: (x: ShareData) => boolean };
    return !!f && !!nav.share && !!nav.canShare?.({ files: [f] });
  }

  async compartir(): Promise<void> {
    const f = this.pdfGuardado();
    if (!f) return;
    try {
      await navigator.share({ files: [f], title: 'Contrato de alquiler ALFA GAMES' });
    } catch {
      // Canceló el envío: el contrato ya quedó guardado.
    }
  }

  private mensaje(e: unknown): string {
    return (e as { message?: string })?.message ?? 'No se pudo guardar el contrato.';
  }
}
