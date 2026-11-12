/** Account session: sign up / in / out, profile fetch and the one-time guest import. */
import { cloudEnabled, getClient } from './cloud';
import { friendlyAuthError } from './accountValidate';
import { buildImportPayload, parseCloudProfile } from './merge';
import type { CloudProfile } from './merge';
import type { Progress } from './progress';

export type AccountStatus = 'unavailable' | 'loading' | 'guest' | 'signedIn';

export interface AccountState {
  status: AccountStatus;
  email: string;
  userId: string;
  profile: CloudProfile | null;
}

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const ACCOUNT_KEY = 'last-chamber-account';

/** Which account the local save belongs to (so a later sign-in on the same device keeps local progress). */
export function loadAccountMarker(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveAccountMarker(userId: string): void {
  try {
    if (userId) localStorage.setItem(ACCOUNT_KEY, userId);
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class Account {
  state: AccountState = { status: cloudEnabled ? 'loading' : 'unavailable', email: '', userId: '', profile: null };
  /** Called after the profile is loaded (sign-in or session restore). `sameAccount` is true on this device's own account. */
  onProfile: (profile: CloudProfile, sameAccount: boolean) => void = () => undefined;
  /** Called when the session ends elsewhere (other tab) or by sign out. */
  onSignedOut: () => void = () => undefined;
  /** Called when the user arrives from a password-reset email. */
  onRecovery: () => void = () => undefined;
  /** Called on any state change so the UI can redraw. */
  onChange: () => void = () => undefined;
  /** Supplies the current local progress for the one-time import. */
  getLocal: () => Progress = () => {
    throw new Error('getLocal not set');
  };

  private set(patch: Partial<AccountState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange();
  }

  /** Restore a saved session in the background. Never throws; failures leave the player as a guest. */
  async init(): Promise<void> {
    if (!cloudEnabled) return;
    try {
      const sb = await getClient();
      sb.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') this.onRecovery();
        if (event === 'SIGNED_OUT' && this.state.status === 'signedIn') {
          this.set({ status: 'guest', email: '', userId: '', profile: null });
          this.onSignedOut();
        }
      });
      const { data } = await sb.auth.getSession();
      if (data.session) await this.afterAuth(data.session.user.id, data.session.user.email ?? '');
      else this.set({ status: 'guest' });
    } catch {
      this.set({ status: 'guest' }); // offline or paused project: just play as a guest
    }
  }

  private async afterAuth(userId: string, email: string): Promise<void> {
    const sb = await getClient();
    let { data, error } = await sb.rpc('get_profile');
    if (error) throw error;
    let profile = parseCloudProfile(data);
    if (!profile) throw new Error('bad profile');
    if (!profile.imported) {
      ({ data, error } = await sb.rpc('import_local_progress', { payload: buildImportPayload(this.getLocal()) }));
      if (error) throw error;
      profile = parseCloudProfile(data) ?? profile;
    }
    const same = loadAccountMarker() === userId;
    this.set({ status: 'signedIn', email, userId, profile });
    this.onProfile(profile, same);
    saveAccountMarker(userId);
  }

  async signUp(email: string, password: string): Promise<Result> {
    try {
      const sb = await getClient();
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
      if (error) return { ok: false, error: friendlyAuthError(error.message) };
      if (!data.session || !data.user) return { ok: true, message: 'Check your email to confirm your account, then sign in.' };
      await this.afterAuth(data.user.id, data.user.email ?? email);
      return { ok: true, message: 'Account created.' };
    } catch (e) {
      return { ok: false, error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
    }
  }

  async signIn(email: string, password: string): Promise<Result> {
    try {
      const sb = await getClient();
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { ok: false, error: friendlyAuthError(error.message) };
      await this.afterAuth(data.user.id, data.user.email ?? email);
      return { ok: true, message: 'Signed in.' };
    } catch (e) {
      return { ok: false, error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
    }
  }

  async signOut(): Promise<void> {
    try {
      const sb = await getClient();
      await sb.auth.signOut();
    } catch {
      /* local session is cleared below regardless */
    }
    this.set({ status: 'guest', email: '', userId: '', profile: null });
    saveAccountMarker('');
    this.onSignedOut();
  }

  async resetPassword(email: string): Promise<Result> {
    try {
      const sb = await getClient();
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname });
      if (error) return { ok: false, error: friendlyAuthError(error.message) };
      return { ok: true, message: 'If that email has an account, a reset link is on its way.' };
    } catch (e) {
      return { ok: false, error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
    }
  }

  async updatePassword(password: string): Promise<Result> {
    try {
      const sb = await getClient();
      const { error } = await sb.auth.updateUser({ password });
      if (error) return { ok: false, error: friendlyAuthError(error.message) };
      return { ok: true, message: 'Password updated.' };
    } catch (e) {
      return { ok: false, error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
    }
  }

  async setDisplayName(name: string): Promise<Result> {
    try {
      const sb = await getClient();
      const { data, error } = await sb.rpc('set_display_name', { new_name: name.trim() });
      if (error) return { ok: false, error: friendlyAuthError(error.message) };
      if (data === 'taken') return { ok: false, error: 'That name is taken.' };
      if (data !== 'ok') return { ok: false, error: 'That name is not allowed.' };
      if (this.state.profile) this.set({ profile: { ...this.state.profile, displayName: name.trim() } });
      return { ok: true, message: 'Name updated.' };
    } catch (e) {
      return { ok: false, error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
    }
  }
}
