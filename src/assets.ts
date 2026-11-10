import { THEME } from './theme';

/** Loads floor tiles; any failure just leaves the list empty so the arena uses a plain fill. */
export async function loadFloorTiles(): Promise<HTMLImageElement[]> {
  const loads = THEME.art.floorTiles.map(
    (url) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      }),
  );
  const imgs = await Promise.all(loads);
  return imgs.filter((i): i is HTMLImageElement => i !== null);
}
