import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.guard';
import { SalaLayout } from './layout/sala-layout';
import { Shell } from './layout/shell';
import { Login } from './pages/login/login';
import { Home } from './pages/home/home';
import { Sala } from './pages/sala/sala';

// Dos secciones: Sala (con sus pestañas) y Alquiler. El trabajador solo entra a Sala → En vivo. La Sala en vivo carga de una vez
// (es la pantalla de trabajo); el resto se descarga al entrar.
export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', component: Home, pathMatch: 'full' },
      {
        path: 'sala',
        component: SalaLayout,
        children: [
          { path: '', component: Sala, pathMatch: 'full' },
          {
            path: 'historial',
            canActivate: [adminGuard],
            loadComponent: () => import('./pages/historial/historial').then((m) => m.Historial),
          },
          {
            path: 'productos',
            canActivate: [adminGuard],
            loadComponent: () => import('./pages/productos/productos').then((m) => m.Productos),
          },
          {
            path: 'usuarios',
            canActivate: [adminGuard],
            loadComponent: () => import('./pages/usuarios/usuarios').then((m) => m.Usuarios),
          },
          {
            path: 'dashboard',
            canActivate: [adminGuard],
            loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
          },
          {
            path: 'gastos',
            canActivate: [adminGuard],
            loadComponent: () => import('./pages/gastos/gastos').then((m) => m.Gastos),
          },
          {
            path: 'puestos',
            canActivate: [adminGuard],
            loadComponent: () => import('./pages/puestos/puestos').then((m) => m.Puestos),
          },
        ],
      },
      {
        path: 'alquiler',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/alquiler/alquiler').then((m) => m.AlquilerPage),
      },
      // Direcciones viejas (enlaces guardados) a su nuevo lugar dentro de Sala.
      { path: 'historial', redirectTo: 'sala/historial' },
      { path: 'dashboard', redirectTo: 'sala/dashboard' },
      { path: 'gastos', redirectTo: 'sala/gastos' },
      { path: 'puestos', redirectTo: 'sala/puestos' },
    ],
  },
  { path: '**', redirectTo: '' },
];
