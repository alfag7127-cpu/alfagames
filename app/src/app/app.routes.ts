import { Routes } from '@angular/router';
import { adminGuard, alquilerGuard, authGuard, salaGuard } from './core/auth.guard';
import { SalaLayout } from './layout/sala-layout';
import { Shell } from './layout/shell';
import { Login } from './pages/login/login';
import { Home } from './pages/home/home';
import { Sala } from './pages/sala/sala';

// Dos secciones: Sala (con sus pestañas) y Alquiler. El trabajador solo entra a Sala → En vivo, Ventas e Historial; el rol alquiler solo a Alquiler. La Sala en vivo carga de una vez
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
        canActivate: [salaGuard],
        children: [
          { path: '', component: Sala, pathMatch: 'full' },
          // Historial: también para el trabajador, para presentar las cuentas del día.
          {
            path: 'historial',
            loadComponent: () => import('./pages/historial/historial').then((m) => m.Historial),
          },
          {
            path: 'productos',
            canActivate: [adminGuard],
            loadComponent: () => import('./pages/productos/productos').then((m) => m.Productos),
          },
          // Ventas de productos: también para el trabajador.
          { path: 'ventas', loadComponent: () => import('./pages/ventas/ventas').then((m) => m.Ventas) },
          { path: 'usuarios', redirectTo: '/usuarios' },
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
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/usuarios/usuarios').then((m) => m.Usuarios),
      },
      {
        path: 'alquiler',
        canActivate: [alquilerGuard],
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
