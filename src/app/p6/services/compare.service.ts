// src/app/p6/services/compare.service.ts
import { Injectable } from '@angular/core';
import { compareObjects, CompareOptions } from '../utils/compare.util';

@Injectable({ providedIn: 'root' })
export class CompareService {
  compare(base: unknown, candidate: unknown, options: CompareOptions = {}) {
    return compareObjects(base, candidate, options);
  }
}