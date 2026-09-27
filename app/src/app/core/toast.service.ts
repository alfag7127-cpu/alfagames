import { Injectable, signal } from '@angular/core';

export type TipoToast = 'exito' | 'error' | 'info';

export interface Toast {
  id: number;
  tipo: TipoToast;
  mensaje: string;
}

/**
 * Notificaciones no intrusivas (toasts) para confirmar acciones — "sesión cobrada",
 * "sesión abierta", errores del servidor, etc. Sin librería externa: unas pocas
 * líneas con signals bastan y evitamos arrastrar Angular Animations solo para esto.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private siguienteId = 1;
  readonly toasts = signal<Toast[]>([]);

  exito(mensaje: string): void {
    this.mostrar('exito', mensaje);
  }

  error(mensaje: string): void {
    this.mostrar('error', mensaje);
  }

  info(mensaje: string): void {
    this.mostrar('info', mensaje);
  }

  private mostrar(tipo: TipoToast, mensaje: string, duracionMs = 4000): void {
    const id = this.siguienteId++;
    this.toasts.update((lista) => [...lista, { id, tipo, mensaje }]);
    setTimeout(() => this.descartar(id), duracionMs);
  }

  descartar(id: number): void {
    this.toasts.update((lista) => lista.filter((t) => t.id !== id));
  }
}
