/** Resolves the equipped items to render parameters. Presentation only. */
import type { Progress } from './progress';
import { itemById } from './shop';
import type { ArenaParams, KillKind, ShotParams, SkinParams } from './shop';

export interface Loadout {
  skin: SkinParams;
  shot: ShotParams | null;
  kill: KillKind | null;
  arena: ArenaParams | null;
  title: string;
}

export function loadoutOf(p: Progress): Loadout {
  const get = (id: string) => itemById(id);
  return {
    skin: get(p.equipped.skin)?.skin ?? {},
    shot: get(p.equipped.shot)?.shot ?? null,
    kill: get(p.equipped.kill)?.kill ?? null,
    arena: get(p.equipped.arena)?.arena ?? null,
    title: get(p.equipped.title)?.title ?? 'Rookie',
  };
}

export const DEFAULT_LOADOUT: Loadout = { skin: {}, shot: null, kill: null, arena: null, title: 'Rookie' };
