export interface Vec2 {
  x: number;
  y: number;
}

export type Phase = 'READY' | 'HIDDEN' | 'RESOLVE' | 'REVEAL' | 'GAME_OVER';

export interface Player {
  id: number;
  name: string;
  color: string;
  isHuman: boolean;
  pos: Vec2;
  aim: Vec2; // normalized, last valid aim direction
  radius: number;
  alive: boolean;
}

/** Immutable view of a living player at the deadline. */
export interface SnapshotPlayer {
  readonly id: number;
  readonly pos: Readonly<Vec2>;
  readonly aim: Readonly<Vec2>;
  readonly radius: number;
}

export interface ShotEvent {
  shooterId: number;
  origin: Vec2;
  end: Vec2; // where the shot line stops (hit point, arena edge)
  targetId: number | null;
}

export interface ResolutionResult {
  shots: ShotEvent[];
  shotDeaths: number[];
  boundaryDeaths: number[];
  deaths: number[]; // union, sorted by id
}

/** Per-tick input for one player (human input, bot decision, or future network command). */
export interface Command {
  move: Vec2; // raw direction, will be normalized (length <= 1)
  aim: Vec2 | null; // desired aim direction (any length), null = keep current
}

export type MatchOutcome = { kind: 'win'; winnerId: number } | { kind: 'draw' };
