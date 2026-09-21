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
      this.error.set('Correo o contraseña incorrectos.');
      return;
    }
    this.router.navigateByUrl('/');
  }
}
