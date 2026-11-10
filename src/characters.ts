import { CONFIG } from './config';
import { THEME } from './theme';
import type { Vec2 } from './types';
import type { View } from './view';

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb color. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

export interface CharacterStyle {
  color: string;
  name: string;
  isHuman: boolean;
  /** Greyed-out look for eliminated players during reveal. */
  dead?: boolean;
  /** Walk cycle phase in radians (0 when idle). */
  walkPhase?: number;
  /** 0..1 how much the walk animation is applied. */
  moving?: number;
  /** Time in seconds for idle sway. */
  time?: number;
  alpha?: number;
  /** 0..1 gun recoil kick (visual only). */
  recoil?: number;
}

/**
 * Procedural top-down character. Art is drawn around the player's world position and may be larger
 * than the logical hitbox; the hitbox itself is never changed by this file.
 */
export function drawShadow(ctx: CanvasRenderingContext2D, view: View, pos: Vec2, alpha = 1): void {
  const s = view.toScreen(pos);
  const R = CONFIG.playerRadius * view.scale * THEME.art.characterScale;
  ctx.save();
  ctx.globalAlpha = 0.38 * alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(s.x + R * 0.18, s.y + R * 0.28, R * 1.15, R * 1.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  view: View,
  pos: Vec2,
  aim: Vec2,
  st: CharacterStyle,
): void {
  const s = view.toScreen(pos);
  const R = CONFIG.playerRadius * view.scale * THEME.art.characterScale;
  const angle = Math.atan2(aim.y, aim.x);
  const moving = st.moving ?? 0;
  const swing = Math.sin(st.walkPhase ?? 0) * moving;
  const breathe = Math.sin((st.time ?? 0) * THEME.anim.idleSwaySpeed) * (1 - moving);
  const recoil = (st.recoil ?? 0) * R * 0.35;

  const body = st.dead ? '#5a606b' : st.color;
  const bodyDark = st.dead ? '#41464f' : shade(st.color, -0.35);
  const bodyLight = st.dead ? '#6b7280' : shade(st.color, 0.28);
  const skin = st.dead ? '#8a8f98' : '#f1c9a5';

  ctx.save();
  if (st.alpha !== undefined) ctx.globalAlpha = st.alpha;
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Back arm + front arm reaching toward the gun (forward = +x).
  const armY = R * 0.78 + breathe * R * 0.02;
  const handFwd = R * 1.05 - recoil;
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = R * 0.38;
  for (const side of [-1, 1]) {
    const sh = { x: swing * R * 0.12 * side, y: armY * side };
    const hand = { x: handFwd + (side === 1 ? R * 0.1 : 0), y: R * 0.32 * side };
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
  }

  // Gun (drawn under hands): grip + body + barrel.
  const gx = R * 0.55 - recoil;
  ctx.fillStyle = '#2b3038';
  ctx.fillRect(gx, -R * 0.2, R * 0.95, R * 0.4); // receiver
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(gx + R * 0.95, -R * 0.1, R * 0.55, R * 0.2); // barrel
  ctx.fillStyle = '#8b97a8';
  ctx.fillRect(gx + R * 0.1, -R * 0.2, R * 0.7, R * 0.09); // top highlight
  ctx.fillStyle = '#1b1f26';
  ctx.fillRect(gx + R * 1.46, -R * 0.13, R * 0.1, R * 0.26); // muzzle

  // Hands
  ctx.fillStyle = skin;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, R * 0.07);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(handFwd + (side === 1 ? R * 0.1 : 0), R * 0.3 * side, R * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Torso / shoulders (wide across the aim direction)
  ctx.fillStyle = body;
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = Math.max(1.5, R * 0.1);
  ctx.beginPath();
  ctx.ellipse(-R * 0.05, 0, R * 0.62, R * (0.98 + breathe * 0.025), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Chest highlight stripe
  ctx.fillStyle = bodyLight;
  ctx.globalAlpha = (st.alpha ?? 1) * 0.55;
  ctx.beginPath();
  ctx.ellipse(R * 0.1, 0, R * 0.22, R * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = st.alpha ?? 1;

  // Head with a cap (back half) so facing is obvious from above.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(R * 0.1, 0, R * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = bodyLight;
  ctx.beginPath();
  ctx.arc(R * 0.05, 0, R * 0.5, Math.PI / 2, Math.PI * 1.5); // back half of the head
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = bodyDark;
  ctx.fillRect(R * 0.46, -R * 0.14, R * 0.12, R * 0.28); // visor / nose hint

  ctx.restore();

  if (THEME.art.showHitbox) {
    ctx.save();
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, CONFIG.playerRadius * view.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** Ring + tag that makes the human easy to find. */
export function drawHumanMarker(ctx: CanvasRenderingContext2D, view: View, pos: Vec2, time: number): void {
  const s = view.toScreen(pos);
  const R = CONFIG.playerRadius * view.scale * THEME.art.characterScale;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1.5, R * 0.1);
  ctx.setLineDash([R * 0.5, R * 0.4]);
  ctx.lineDashOffset = -time * R * 0.8;
  ctx.beginPath();
  ctx.arc(s.x, s.y, R * 1.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // small chevron above
  const y = s.y - R * 1.95;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(s.x, y + R * 0.3);
  ctx.lineTo(s.x - R * 0.34, y - R * 0.12);
  ctx.lineTo(s.x + R * 0.34, y - R * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawNameTag(
  ctx: CanvasRenderingContext2D,
  view: View,
  pos: Vec2,
  text: string,
  color: string,
  below = false,
): void {
  const s = view.toScreen(pos);
  const R = CONFIG.playerRadius * view.scale * THEME.art.characterScale;
  const size = Math.max(11, Math.round(13 * Math.min(1.5, view.scale * 1.6)));
  ctx.save();
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.fillStyle = color;
  const y = below ? s.y + R * 2.4 : s.y - R * 2.3;
  ctx.strokeText(text, s.x, y);
  ctx.fillText(text, s.x, y);
  ctx.restore();
}
