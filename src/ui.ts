/** Shared presentation state: whether the player is currently using touch input. */
export const ui = {
  /** True after a touch pointer is seen (or on coarse-pointer devices at startup); false again on mouse use. */
  touch: false,
};

try {
  ui.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
} catch {
  /* non-browser environment */
}

export const isNarrow = (cssWidth: number): boolean => cssWidth < 560;
export const isPortrait = (w: number, h: number): boolean => h > w;

/** Device pixel ratio, capped at 2 so phones with 3x screens do not overpay in fill rate. */
export const getDpr = (): number => Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
