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

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth).pipe(map(() => auth.isLoggedIn() || router.createUrlTree(['/login'])));
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return whenReady(auth).pipe(map(() => auth.isAdmin() || router.createUrlTree(['/sala'])));
};
