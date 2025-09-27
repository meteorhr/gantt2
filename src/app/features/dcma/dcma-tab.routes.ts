
import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { DcmaChecksComponent } from './dcma-tab.component';
export const DCMA_ROUTES: Routes = [
  {
    path: '',
    component: DcmaChecksComponent,
    providers: [
      provideTranslocoScope({
        scope: 'dcma',
        alias: 'dcma',
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