import { AfterViewInit, Component, ElementRef, OnDestroy, output, signal, viewChild } from '@angular/core';

/**
 * Recuadro para firmar con el dedo (o el mouse). Funciona en celular sin instalar nada.
 * Entrega la firma como PNG con fondo transparente.
 */
@Component({
  selector: 'app-firma-pad',
  template: `
    <div class="space-y-1">
      <div class="relative rounded-lg bg-white ring-2 ring-slate-300">
        <canvas #lienzo class="block h-44 w-full touch-none select-none rounded-lg"></canvas>
        @if (vacia()) {
          <p class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Firme aquí con el dedo</p>
        }
        <div class="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-slate-300"></div>
      </div>
      <button type="button" (click)="limpiar()" class="text-xs font-medium text-slate-600 underline">Borrar y volver a firmar</button>
    </div>
  `,
})
export class FirmaPad implements AfterViewInit, OnDestroy {
  readonly cambio = output<boolean>();
  readonly vacia = signal(true);

  private readonly lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');
  private ctx!: CanvasRenderingContext2D;
  private dibujando = false;
  private ultimo: { x: number; y: number } | null = null;
  private observador?: ResizeObserver;

  ngAfterViewInit(): void {
    const c = this.lienzo().nativeElement;
    this.ctx = c.getContext('2d')!;
    this.ajustarTamano();
    this.observador = new ResizeObserver(() => this.ajustarTamano());
    this.observador.observe(c);
    c.addEventListener('pointerdown', this.empezar);
    c.addEventListener('pointermove', this.mover);
    c.addEventListener('pointerup', this.terminar);
    c.addEventListener('pointercancel', this.terminar);
    c.addEventListener('pointerleave', this.terminar);
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }

  /** Al cambiar el tamaño (girar el celular) se borra: la firma tiene que hacerse de nuevo. */
  private ajustarTamano(): void {
    const c = this.lienzo().nativeElement;
    const escala = window.devicePixelRatio || 1;
    const ancho = Math.round(c.clientWidth * escala);
    const alto = Math.round(c.clientHeight * escala);
    if (c.width === ancho && c.height === alto) return;
    c.width = ancho;
    c.height = alto;
    this.ctx.setTransform(escala, 0, 0, escala, 0, 0);
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#0f172a';
    this.marcarVacia(true);
  }

  private punto(e: PointerEvent): { x: number; y: number } {
    const r = this.lienzo().nativeElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private readonly empezar = (e: PointerEvent): void => {
    e.preventDefault();
    this.lienzo().nativeElement.setPointerCapture(e.pointerId);
    this.dibujando = true;
    this.ultimo = this.punto(e);
    this.ctx.beginPath();
    this.ctx.arc(this.ultimo.x, this.ultimo.y, 1.2, 0, Math.PI * 2);
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fill();
  };

  private readonly mover = (e: PointerEvent): void => {
    if (!this.dibujando || !this.ultimo) return;
    e.preventDefault();
    const p = this.punto(e);
    this.ctx.beginPath();
    this.ctx.moveTo(this.ultimo.x, this.ultimo.y);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.ultimo = p;
    if (this.vacia()) this.marcarVacia(false);
  };

  private readonly terminar = (): void => {
    this.dibujando = false;
    this.ultimo = null;
  };

  private marcarVacia(v: boolean): void {
    this.vacia.set(v);
    this.cambio.emit(!v);
  }

  limpiar(): void {
    const c = this.lienzo().nativeElement;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.ctx.restore();
    this.marcarVacia(true);
  }

  /** La firma como data URL PNG, o null si no ha firmado. */
  imagen(): string | null {
    return this.vacia() ? null : this.lienzo().nativeElement.toDataURL('image/png');
  }
}
