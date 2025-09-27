// app.config.ts
import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { APP_ROUTES } from './app.routes';

import { provideTransloco } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './transloco-loader';

// Firebase / AngularFire
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';

// Analytics
import { provideAnalytics } from '@angular/fire/analytics';
import { getAnalytics } from 'firebase/analytics';
import { ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';

// Performance
import { providePerformance } from '@angular/fire/performance';
import { getPerformance } from 'firebase/performance';


const firebaseConfig = {
  apiKey: 'AIzaSyCZfzM-ligoFaTTUPKVFzHNilWoZtugBDA',
  authDomain: 'schedulevision-3161f.firebaseapp.com',
  projectId: 'schedulevision-3161f',
  storageBucket: 'schedulevision-3161f.firebasestorage.app', // при использовании Storage лучше '...appspot.com'
  messagingSenderId: '283282531481',
  appId: '1:283282531481:web:a66fd9c1c959d47a85c408',
  measurementId: 'G-ZGVKDFTTD5',
};

// простая проверка среды
const isBrowser = typeof window !== 'undefined';
const hasPerformance = isBrowser && typeof performance !== 'undefined';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),

    // Firebase App всегда в DI-контексте
    provideFirebaseApp(() => initializeApp(firebaseConfig)),

    // 🔹 Подключаем Analytics ТОЛЬКО в браузере
    ...(isBrowser
      ? [
          provideAnalytics(() => getAnalytics()),
          ScreenTrackingService,
          UserTrackingService,
        ]
      : []),

    // 🔹 Подключаем Performance ТОЛЬКО если есть window.performance
    ...(hasPerformance
      ? [
          providePerformance(() => getPerformance()),
        ]
      : []),

    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(APP_ROUTES),

    provideTransloco({
      config: {
        availableLangs: ['en', 'ru'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};
