import { Routes } from '@angular/router';
import { requireLoadedOrSummaryGuard } from './guards/require-loaded-or-summary.guard';

export const APP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/tabs/tabs-shell.component').then(m => m.TabsShellComponent),

    canActivateChild: [requireLoadedOrSummaryGuard],
    runGuardsAndResolvers: 'always',

    children: [
      {
        path: 'summary',
        title: 'Summary',
        loadComponent: () =>
          import('./features/summary/summary-tab.component').then(m => m.SummaryTabComponent),
      },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-tab.component').then(m => m.DashboardTabComponent),
      },
      {
        path: 'gantt',
        title: 'Activities Gantt',
        loadComponent: () =>
          import('./features/gantt/gantt-tab.component').then(m => m.GanttTabComponent),
      },
      {
        path: 'compare',
        title: 'Compare Schedule',
        loadComponent: () =>
          import('./features/compare/compare-tab.component').then(m => m.CompareTabComponent),
      },      
      {
        path: 'dcma',
        title: 'DCMA Checks',
        loadComponent: () =>
          import('./features/dcma/dcma-tab.component').then(m => m.DcmaChecksComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'summary' },
    ],
  },
  { path: '**', redirectTo: '' },
];
