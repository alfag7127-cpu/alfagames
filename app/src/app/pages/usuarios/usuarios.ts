import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Rol, UsuarioApp } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UsuariosService } from '../../core/usuarios.service';

/**
 * Usuarios (solo admin). Trabajador = Sala en vivo, ventas e historial.
 * Admin = todo, incluido Alquiler, potes, gastos e historial.
 */
@Component({
  selector: 'app-usuarios',
  imports: [FormsModule, DatePipe],
  template: `
    <h2 class="text-lg font-bold text-slate-900 mb-1">Usuarios</h2>
    <p class="text-sm text-slate-500 mb-4">
      <b>Trabajador</b>: solo Sala (en vivo, ventas e historial para las cuentas del día). <b>Alquiler</b>: solo el módulo de Alquiler (sin inventario, precios ni movimientos de potes). <b>Admin</b>: todo.
    </p>

    <form (ngSubmit)="crear()" class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 mb-4 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
      <label class="text-xs font-medium text-slate-500">
        Nombre
        <input [(ngModel)]="nombre" name="nombre" placeholder="Ej. Carlos"
          class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
      </label>
      <label class="text-xs font-medium text-slate-500">
        Correo
        <input type="email" [(ngModel)]="email" name="email" placeholder="carlos@alfagames.com"
          class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
      </label>
      <label class="text-xs font-medium text-slate-500">
        Contraseña (mín. 6)
        <input type="text" [(ngModel)]="password" name="password" autocomplete="new-password"
          class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
      </label>
      <label class="text-xs font-medium text-slate-500">
        Rol
        <select [(ngModel)]="rol" name="rol" class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900">
          <option ngValue="empleado">Trabajador (Sala)</option>
          <option ngValue="alquiler">Alquiler</option>
          <option ngValue="admin">Admin</option>
        </select>
      </label>
      <button type="submit" [disabled]="guardando()" class="rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {{ guardando() ? 'Creando…' : 'Crear usuario' }}
      </button>
    </form>

    <section class="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th class="px-4 py-2 font-medium">Usuario</th>
            <th class="px-4 py-2 font-medium">Rol</th>
            <th class="px-4 py-2 font-medium">Último ingreso</th>
            <th class="px-4 py-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @for (u of usuarios(); track u.id) {
            <tr [class.opacity-50]="!u.activo">
              <td class="px-4 py-2.5">
                <p class="font-medium text-slate-800">{{ u.nombre || '—' }} @if (u.yo) {<span class="text-xs text-slate-400">(tú)</span>} @if (u.protegido) {<span class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">🛡 Súper usuario</span>}</p>
                <p class="text-xs text-slate-500">{{ u.email }}{{ u.activo ? '' : ' · desactivado' }}</p>
              </td>
              <td class="px-4 py-2.5">
                <select [ngModel]="u.rol" (ngModelChange)="cambiarRol(u, $event)" [name]="'rol-' + u.id" [disabled]="u.yo || u.protegido"
                  class="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-900 disabled:opacity-60">
                  <option ngValue="empleado">Trabajador (Sala)</option>
                  <option ngValue="alquiler">Alquiler</option>
                  <option ngValue="admin">Admin</option>
                </select>
              </td>
              <td class="px-4 py-2.5 text-slate-500 whitespace-nowrap">{{ u.ultimo_ingreso ? (u.ultimo_ingreso | date) : 'nunca' }}</td>
              <td class="px-4 py-2.5 whitespace-nowrap">
                @if (!u.protegido || u.yo) {
                  <button type="button" (click)="cambiarPassword(u)" class="text-blue-600 hover:underline mr-3">Contraseña</button>
                }
                @if (!u.yo && !u.protegido) {
                  <button type="button" (click)="cambiarActivo(u)" class="hover:underline"
                    [class.text-red-600]="u.activo" [class.text-emerald-600]="!u.activo">
                    {{ u.activo ? 'Desactivar' : 'Activar' }}
                  </button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class Usuarios implements OnInit {
  readonly usuarios = signal<UsuarioApp[]>([]);
  readonly guardando = signal(false);
  nombre = '';
  email = '';
  password = '';
  rol: Rol = 'empleado';

  constructor(
    private readonly servicio: UsuariosService,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    try {
      this.usuarios.set(await this.servicio.listar());
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async crear(): Promise<void> {
    if (!this.email.includes('@')) return this.toast.error('Escribe un correo válido.');
    if (this.password.length < 6) return this.toast.error('La contraseña debe tener al menos 6 caracteres.');
    this.guardando.set(true);
    try {
      await this.servicio.crear(this.email.trim(), this.password, this.nombre.trim(), this.rol);
      this.toast.exito(`Usuario creado: ${this.email.trim()}. Ya puede iniciar sesión.`);
      this.nombre = '';
      this.email = '';
      this.password = '';
      this.rol = 'empleado';
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
    } finally {
      this.guardando.set(false);
    }
  }

  async cambiarRol(u: UsuarioApp, rol: Rol): Promise<void> {
    try {
      await this.servicio.cambiarRol(u.id, rol);
      this.toast.exito(`${u.email}: ahora es ${rol === 'admin' ? 'admin' : rol === 'alquiler' ? 'de alquiler' : 'trabajador'}.`);
      await this.cargar();
    } catch (e) {
      this.toast.error(this.mensaje(e));
      await this.cargar();
    }
  }

  async cambiarPassword(u: UsuarioApp): Promise<void> {
    const nueva = prompt(`Nueva contraseña para ${u.email} (mínimo 6 caracteres):`);
    if (!nueva) return;
    try {
      await this.servicio.cambiarPassword(u.id, nueva);
      this.toast.exito('Contraseña actualizada.');
    } catch (e) {
      this.toast.error(this.mensaje(e));
    }
  }

  async cambiarActivo(u: UsuarioApp): Promise<void> {
    if (u.activo && !confirm(`¿Desactivar a ${u.email}? No podrá iniciar sesión; su historial se conserva.`)) return;
    try {
      await this.servicio.cambiarActivo(u.id, !u.activo);
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
