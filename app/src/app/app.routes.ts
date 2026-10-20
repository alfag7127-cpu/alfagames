import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.guard';
import { Shell } from './layout/shell';
import { Login } from './pages/login/login';
import { Home } from './pages/home/home';
import { Sala } from './pages/sala/sala';

// La Sala carga de una vez (es la pantalla de trabajo); el resto se descarga al entrar.
export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', component: Home, pathMatch: 'full' },
      { path: 'sala', component: Sala },
      { path: 'historial', loadComponent: () => import('./pages/historial/historial').then((m) => m.Historial) },
      { path: 'alquiler', loadComponent: () => import('./pages/alquiler/alquiler').then((m) => m.AlquilerPage) },
      {
        path: 'gastos',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/gastos/gastos').then((m) => m.Gastos),
      },
      {
        path: 'dashboard',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'puestos',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/puestos/puestos').then((m) => m.Puestos),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
