import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from './auth.service';

/** Espera a que AuthService termine de resolver la sesión inicial antes de decidir. */
function whenReady(auth: AuthService) {
  return toObservable(auth.isReady).pipe(
    filter((ready) => ready),
    take(1),
  );
}

/** Sin sesión: la dirección principal ("/") muestra la página de servicios para clientes; lo demás pide login. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const destino = state.url === '/' ? '/servicios' : '/login';
  return whenReady(auth).pipe(map(() => auth.isLoggedIn() || router.createUrlTree([destino])));
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth).pipe(map(() => auth.isAdmin() || router.createUrlTree([auth.inicio()])));
};

/** Sala: admin y trabajador. */
export const salaGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth).pipe(map(() => auth.puedeSala() || router.createUrlTree([auth.inicio()])));
};

/** Alquiler: admin y rol alquiler. */
export const alquilerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth).pipe(map(() => auth.puedeAlquiler() || router.createUrlTree([auth.inicio()])));
};
