import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.guard';
import { Shell } from './layout/shell';
import { Login } from './pages/login/login';
import { Home } from './pages/home/home';
import { Sala } from './pages/sala/sala';
import { Historial } from './pages/historial/historial';
import { Gastos } from './pages/gastos/gastos';
import { Dashboard } from './pages/dashboard/dashboard';

export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', component: Home, pathMatch: 'full' },
      { path: 'sala', component: Sala },
      { path: 'historial', component: Historial },
      { path: 'gastos', component: Gastos, canActivate: [adminGuard] },
      { path: 'dashboard', component: Dashboard, canActivate: [adminGuard] },
    ],
  },
  { path: '**', redirectTo: '' },
];
