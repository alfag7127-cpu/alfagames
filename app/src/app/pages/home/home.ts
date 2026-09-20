import { Component, effect } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** Ruta raíz: no muestra nada, solo redirige según el rol una vez la sesión está lista. */
@Component({
  selector: 'app-home',
  template: '',
})
export class Home {
  constructor(auth: AuthService, router: Router) {
    effect(() => {
      if (!auth.isReady()) return;
      router.navigateByUrl(auth.isAdmin() ? '/dashboard' : '/sala');
    });
  }
}
