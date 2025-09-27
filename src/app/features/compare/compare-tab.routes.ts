
import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { CompareTabComponent } from './compare-tab.component';
export const COMPARE_ROUTES: Routes = [
  {
    path: '',
    component: CompareTabComponent,
    providers: [
      provideTranslocoScope({
        scope: 'compare',
        alias: 'compare',
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