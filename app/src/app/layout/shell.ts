import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';

interface EnlaceMenu {
  ruta: string;
  icono: string;
  texto: string;
  modulo: 'sala' | 'alquiler';
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
})
export class Shell {
  /** Menú lateral en el celular: se abre con ☰ y se esconde al elegir una sección. */
  readonly menuAbierto = signal(false);

  /** Solo dos secciones; cada una tiene sus pestañas adentro. */
  readonly enlaces: EnlaceMenu[] = [
    { ruta: '/sala', icono: '🎮', texto: 'Sala', modulo: 'sala' },
    { ruta: '/alquiler', icono: '🏠', texto: 'Alquiler', modulo: 'alquiler' },
  ];

  constructor(
    readonly auth: AuthService,
    private readonly router: Router,
  ) {
    router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.menuAbierto.set(false));
  }

  /** Cada rol ve solo sus módulos. */
  puedeVer(e: EnlaceMenu): boolean {
    return e.modulo === 'sala' ? this.auth.puedeSala() : this.auth.puedeAlquiler();
  }

  /** Nombre del rol para mostrar junto al usuario. */
  nombreRol(): string {
    const rol = this.auth.currentProfile()?.role;
    return rol === 'admin' ? 'Admin' : rol === 'alquiler' ? 'Alquiler' : 'Trabajador';
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
