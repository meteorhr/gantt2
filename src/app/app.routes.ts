import { Routes } from '@angular/router';
import { requireLoadedChildGuard, requireLoadedGuard } from './guards/require-loaded-or-summary.guard';

export const APP_ROUTES: Routes = [
    {
    path: '',
    loadComponent: () =>
      import('./features/main/main.component').then(m => m.MainComponent),
  }, 
  {
    path: 'app',
    loadComponent: () =>
      import('./features/tabs/tabs-shell.component').then(m => m.TabsShellComponent),

 canActivate: [requireLoadedGuard],
    canActivateChild: [requireLoadedChildGuard],
    runGuardsAndResolvers: 'always',

    children: [
      {
        path: 'summary',
        title: 'Summary',
        loadChildren: () => import('./features/summary/summary-tab.routes')
          .then(m => m.SUMMARY_ROUTES),
      },
      {
        path: 'dashboard',
        title: 'Dashboard',        
        loadChildren: () => import('./features/dashboard/dashboard-tab.routes')
          .then(m => m.DASHBOARD_ROUTES),
      },
      {
        path: 'gantt',
        title: 'Schedule',
        loadChildren: () => import('./features/gantt/gantt-tab.routes')
          .then(m => m.GANTT_ROUTES),
      },
      {
        path: 'compare',
        title: 'Compare Schedule',
        loadChildren: () => import('./features/compare/compare-tab.routes')
          .then(m => m.COMPARE_ROUTES),
      },      
      {
        path: 'dcma',
        title: 'Schedule Health',
        loadChildren: () => import('./features/dcma/dcma-tab.routes')
          .then(m => m.DCMA_ROUTES),
      },
      { path: '', pathMatch: 'full', redirectTo: 'summary' },
    ],
  },
  { path: '**', redirectTo: '' },
];
