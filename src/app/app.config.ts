import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { provideTransloco, provideTranslocoScope } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './transloco-loader';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAnalytics, getAnalytics, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';
import { getPerformance, providePerformance } from '@angular/fire/performance';


const firebaseConfig = {
  apiKey: 'AIzaSyCZfzM-ligoFaTTUPKVFzHNilWoZtugBDA',
  authDomain: 'schedulevision-3161f.firebaseapp.com',
  projectId: 'schedulevision-3161f',
  storageBucket: 'schedulevision-3161f.firebasestorage.app',
  messagingSenderId: '283282531481',
  appId: '1:283282531481:web:a66fd9c1c959d47a85c408',
  measurementId: 'G-ZGVKDFTTD5',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),

    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAnalytics(() => getAnalytics()),

    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes), 
    provideTransloco({
        config: { 
          availableLangs: ['en', 'ru'],
          defaultLang: 'en',
          // Remove this option if your application doesn't support changing language in runtime.
          reRenderOnLangChange: true,
          prodMode: !isDevMode(),
        },
        loader: TranslocoHttpLoader
      }), 
  ]
};
