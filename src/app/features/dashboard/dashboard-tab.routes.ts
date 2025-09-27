
import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { DashboardTabComponent } from './dashboard-tab.component';
export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: DashboardTabComponent,
    providers: [
      provideTranslocoScope({
        scope: 'dashboard',
        alias: 'dashboard',
      }),
      {
        provide: 'TRANSLOCO_LOADING_TEMPLATE',
        useValue: '<p>loading...</p>',
      },
    ],
    canActivateChild: [],
    children: [],
  },
];