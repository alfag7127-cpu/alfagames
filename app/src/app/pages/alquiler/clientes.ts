import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlquilerService, normalizarTelefono } from '../../core/alquiler.service';
import { Cliente } from '../../core/models';
import { ToastService } from '../../core/toast.service';

/**
 * Clientes del alquiler (uno por teléfono). Se registran solos al alquilar; aquí se
 * buscan, se ve cuántas veces han alquilado y se corrigen nombre, dirección y notas.
 */
@Component({
  selector: 'app-clientes',
  imports: [FormsModule, DecimalPipe, DatePipe],
  template: `
    <section class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 class="font-semibold text-slate-900">Clientes</h2>
          <p class="text-xs text-slate-500">{{ clientes().length }} registrados · se agregan solos al alquilar con teléfono</p>
        </div>
        <input [(ngModel)]="busqueda" name="buscar" placeholder="Buscar por nombre o teléfono"
          class="w-full sm:w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
      </div>

      <ul class="divide-y divide-slate-100">
        @for (c of filtrados(); track c.id) {
          <li class="py-2.5 text-sm">
            @if (editandoId() === c.id) {
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input [(ngModel)]="edNombre" name="ed-nombre" placeholder="Nombre" class="rounded-lg border border-slate-300 px-2 py-1.5" />
                <input [(ngModel)]="edDireccion" name="ed-dir" placeholder="Dirección" class="rounded-lg border border-slate-300 px-2 py-1.5" />
                <input [(ngModel)]="edNotas" name="ed-notas" placeholder="Notas (ej. buen cliente, debe…)" class="rounded-lg border border-slate-300 px-2 py-1.5" />
              </div>
              <div class="mt-2 flex gap-3 text-xs">
                <button type="button" (click)="guardar(c)" class="font-semibold text-blue-600 hover:underline">Guardar</button>
                <button type="button" (click)="editandoId.set(null)" class="text-slate-500 hover:underline">Cancelar</button>
              </div>
            } @else {
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium text-slate-800">{{ c.nombre }}</p>
                  <p class="text-xs text-slate-500">
                    📞 {{ c.telefono }}{{ c.direccion ? ' · 📍 ' + c.direccion : '' }}
                  </p>
                  @if (c.notas) {
                    <p class="text-xs italic text-slate-500">{{ c.notas }}</p>
                  }
                </div>
                <div class="shrink-0 text-right text-xs text-slate-500 tabular-nums">
                  <p><b class="text-slate-800">{{ c.alquileres }}</b> alquiler{{ c.alquileres === 1 ? '' : 'es' }} · {{ c.total_pagado | number: '1.0-0' }}</p>
                  <p>{{ c.ultimo_alquiler ? 'último ' + (c.ultimo_alquiler | date: 'd MMM y') : 'sin alquileres' }}</p>
                  <button type="button" (click)="editar(c)" class="text-blue-600 hover:underline">Editar</button>
                </div>
              </div>
            }
          </li>
        } @empty {
          <li class="py-6 text-center text-sm text-slate-400">{{ busqueda ? 'Ningún cliente coincide.' : 'Todavía no hay clientes.' }}</li>
        }
      </ul>
    </section>
  `,
})
export class Clientes implements OnInit {
  readonly clientes = signal<Cliente[]>([]);
  readonly editandoId = signal<number | null>(null);
  private readonly texto = signal('');
  edNombre = '';
  edDireccion = '';
  edNotas = '';

  get busqueda(): string {
    return this.texto();
  }
  set busqueda(v: string) {
    this.texto.set(v);
  }

  readonly filtrados = computed(() => {
    const t = this.texto().trim().toLowerCase();
    if (!t) return this.clientes();
    const tel = normalizarTelefono(t);
    return this.clientes().filter((c) => c.nombre.toLowerCase().includes(t) || (tel && c.telefono.includes(tel)));
  });

  constructor(
    private readonly alquiler: AlquilerService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      this.clientes.set(await this.alquiler.listarClientes());
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  editar(c: Cliente): void {
    this.edNombre = c.nombre;
    this.edDireccion = c.direccion ?? '';
    this.edNotas = c.notas ?? '';
    this.editandoId.set(c.id);
  }

  async guardar(c: Cliente): Promise<void> {
    if (!this.edNombre.trim()) return this.toast.error('El nombre no puede quedar vacío.');
    try {
      await this.alquiler.actualizarCliente(c.id, {
        nombre: this.edNombre.trim(),
        direccion: this.edDireccion.trim() || null,
        notas: this.edNotas.trim() || null,
      });
      this.editandoId.set(null);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  private mensaje(e: unknown): string {
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'Ocurrió un error inesperado.';
  }
}
