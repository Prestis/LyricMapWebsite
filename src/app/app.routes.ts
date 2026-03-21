import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';


export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/home/home').then(m => m.Home),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./pages/about/about').then(m => m.About),
  },
  {
    path: 'insights',
    loadComponent: () =>
      import('./pages/insights/insights').then(m => m.Insights),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./pages/contact/contact').then(m => m.Contact),
  },
  {
    path: 'admin/locations',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/admin/location-management/location-management.component').then(m => m.LocationManagementComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then(m => m.LoginComponent),
  }
];
