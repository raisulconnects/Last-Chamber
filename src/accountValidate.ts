/** Pure account input validation and friendly error text. Mirrors the SQL checks in supabase/migrations. */

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 14;
export const PASSWORD_MIN = 8;
export const RESERVED_NAMES = ['admin', 'administrator', 'moderator', 'support', 'system', 'lastchamber', 'last chamber'];

const NAME_RE = /^[A-Za-z0-9 _-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns an error message, or null when valid. */
export function validateEmail(email: string): string | null {
  const e = email.trim();
  if (!e) return 'Enter your email.';
  if (e.length > 254 || !EMAIL_RE.test(e)) return 'That email does not look right.';
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > 72) return 'Password is too long (max 72).';
  return null;
}

export function validateDisplayName(name: string): string | null {
  const n = name.trim();
  if (n.length < DISPLAY_NAME_MIN) return `Name needs at least ${DISPLAY_NAME_MIN} characters.`;
  if (n.length > DISPLAY_NAME_MAX) return `Name can be at most ${DISPLAY_NAME_MAX} characters.`;
  if (!NAME_RE.test(n)) return 'Use letters, numbers, spaces, _ and - only.';
  if (RESERVED_NAMES.includes(n.toLowerCase())) return 'That name is reserved.';
  return null;
}

/** Turns a Supabase / network error message into something a player can act on. */
export function friendlyAuthError(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase();
  if (!m) return 'Something went wrong. Try again.';
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account. Try signing in.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many tries. Wait a minute and try again.';
  if (m.includes('email not confirmed')) return 'Confirm your email first, then sign in.';
  if (m.includes('password') && (m.includes('short') || m.includes('least'))) return `Use at least ${PASSWORD_MIN} characters.`;
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Cannot reach the server. Check your connection.';
  if (m.includes('invalid') && m.includes('email')) return 'That email does not look right.';
  return 'Something went wrong. Try again.';
}
