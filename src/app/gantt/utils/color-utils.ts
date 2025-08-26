// src/app/gantt/utils/color-utils.ts

/** #RRGGBB → rgba(r,g,b,a); если не распарсили — вернём исходную строку */
export function hexToRgba(hex: string, a: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${a})`;
}