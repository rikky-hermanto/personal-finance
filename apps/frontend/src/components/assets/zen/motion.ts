// Load motion: each block rises 8px over 400ms, 60ms after the one before (index.css .zen-rise).
// Written out in full so Tailwind sees every class.
const DELAYS = [
  '',
  '[animation-delay:60ms]',
  '[animation-delay:120ms]',
  '[animation-delay:180ms]',
  '[animation-delay:240ms]',
  '[animation-delay:300ms]',
];

export function rise(enabled: boolean, index: number): string {
  return enabled ? `zen-rise ${DELAYS[Math.min(index, DELAYS.length - 1)]}` : '';
}
