import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async submit(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    const errorMessage = await this.auth.signIn(this.email, this.password);
    this.loading.set(false);
    if (errorMessage) {
      this.error.set(this.traducirError(errorMessage));
      return;
    }
    this.router.navigateByUrl('/');
  }

  /** Traduce los mensajes más comunes de Supabase Auth; el resto se muestra tal cual (útil para depurar). */
  private traducirError(mensaje: string): string {
    const normalizado = mensaje.toLowerCase();
    if (normalizado.includes('email not confirmed')) {
      return 'Correo sin confirmar. Pide al admin que lo confirme en Supabase (Authentication → Users).';
    }
    if (normalizado.includes('invalid login credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    return mensaje;
  }
}
