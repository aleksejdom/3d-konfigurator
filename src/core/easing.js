// Easing-Funktionen: bilden einen Fortschritt 0..1 auf 0..1 ab.

export const EASINGS = {
  linear: (u) => u,
  easeIn: (u) => u * u * u,
  easeOut: (u) => 1 - Math.pow(1 - u, 3),
  easeInOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  sineInOut: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
};

export const DEFAULT_EASING = 'easeInOut';

export function ease(name, u) {
  const fn = EASINGS[name] || EASINGS[DEFAULT_EASING];
  return fn(Math.min(1, Math.max(0, u)));
}
