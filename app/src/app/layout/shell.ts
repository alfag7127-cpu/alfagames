import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';

interface EnlaceMenu {
  ruta: string;
  icono: string;
  texto: string;
  soloAdmin: boolean;
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
    { ruta: '/sala', icono: '🎮', texto: 'Sala', soloAdmin: false },
    { ruta: '/alquiler', icono: '🏠', texto: 'Alquiler', soloAdmin: true },
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

  async logout(): Promise<void> {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
