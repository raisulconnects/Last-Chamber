/** Account session: sign up / in / out, profile fetch, the one-time local import, and the cloud economy calls. */
import { cloudEnabled, getClient } from './cloud';
import { friendlyAuthError } from './accountValidate';
import { buildImportPayload, parseCloudProfile, parseSubmit } from './merge';
import type { CloudProfile, MatchSummary } from './merge';
import type { Progress } from './progress';
import type { StatsData } from './stats';
import type { SubmitOutcome } from './sync';

export type AccountStatus = 'unavailable' | 'loading' | 'guest' | 'signedIn';

export interface AccountState {
  status: AccountStatus;
  email: string;
  userId: string;
  profile: CloudProfile | null;
}

export type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Result of a server-side buy / equip. `error` is a short code the UI turns into a message. */
export type ShopOutcome =
  | { ok: true; profile: CloudProfile }
  | { ok: false; error: 'need_more' | 'unknown' | 'not_owned' | 'network'; missing?: number; profile?: CloudProfile };

const errText = (e: unknown): string => friendlyAuthError(e instanceof Error ? e.message : String(e));

export class Account {
  state: AccountState = { status: cloudEnabled ? 'loading' : 'unavailable', email: '', userId: '', profile: null };
  /** Called after the profile is loaded (sign-in or session restore). */
  onProfile: (profile: CloudProfile) => void = () => undefined;
  /** Called when the session ends elsewhere (other tab) or by sign out. */
  onSignedOut: () => void = () => undefined;
  /** Called when the user arrives from a password-reset email. */
  onRecovery: () => void = () => undefined;
  /** Called on any state change so the UI can redraw. */
  onChange: () => void = () => undefined;
  /** Called as soon as the signed-in user id is known (before the profile loads). */
  onUser: (userId: string) => void = () => undefined;
  /** Awaited after sign-in so queued matches reach the server before the profile is fetched. */
  beforeProfile: () => Promise<void> = () => Promise.resolve();
  /** Supplies the current local save for the one-time import. */
  getLocal: () => { progress: Progress; stats: StatsData } = () => {
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
      if (!data.session) {
        this.set({ status: 'guest' });
        return;
      }
      const { id, email } = { id: data.session.user.id, email: data.session.user.email ?? '' };
      try {
        await this.afterAuth(id, email);
      } catch {
        // A saved session exists but the server is unreachable (offline start): stay signed in without a profile,
        // so matches still queue for this account, and load the profile once we are back online.
        this.onUser(id);
        this.set({ status: 'signedIn', email, userId: id, profile: null });
        this.startRetry();
      }
    } catch {
      this.set({ status: 'guest' }); // client could not even load: just play as a guest
    }
  }

  private retry: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;

  private startRetry(): void {
    if (this.retry || typeof window === 'undefined') return;
    this.retry = setInterval(() => void this.refresh(), 30_000);
    window.addEventListener('online', () => void this.refresh());
  }

  /** Loads the profile for a session restored while offline. Safe to call any time; never throws. */
  async refresh(): Promise<void> {
    if (this.refreshing || this.state.status !== 'signedIn' || this.state.profile) {
      if (this.state.profile && this.retry) {
        clearInterval(this.retry);
        this.retry = null;
      }
      return;
    }
    this.refreshing = true;
    try {
      await this.afterAuth(this.state.userId, this.state.email);
      if (this.retry) clearInterval(this.retry);
      this.retry = null;
    } catch {
      /* still offline: try again later */
    } finally {
      this.refreshing = false;
    }
  }

  private async afterAuth(userId: string, email: string): Promise<void> {
    const sb = await getClient();
    this.onUser(userId);
    await this.beforeProfile();
    let { data, error } = await sb.rpc('get_profile');
    if (error) throw error;
    let profile = parseCloudProfile(data);
    if (!profile) throw new Error('bad profile');
    if (!profile.reconciled) {
      const local = this.getLocal();
      ({ data, error } = await sb.rpc('import_local_progress', { payload: buildImportPayload(local.progress, local.stats) }));
      if (error) throw error;
      profile = parseCloudProfile(data) ?? profile;
    }
    this.set({ status: 'signedIn', email, userId, profile });
    this.onProfile(profile);
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
      return { ok: false, error: errText(e) };
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
      return { ok: false, error: errText(e) };
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
    this.onSignedOut();
  }

  async resetPassword(email: string): Promise<Result> {
    try {
      const sb = await getClient();
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname });
      if (error) return { ok: false, error: friendlyAuthError(error.message) };
      return { ok: true, message: 'If that email has an account, a reset link is on its way.' };
    } catch (e) {
      return { ok: false, error: errText(e) };
    }
  }

  async updatePassword(password: string): Promise<Result> {
    try {
      const sb = await getClient();
      const { error } = await sb.auth.updateUser({ password });
      if (error) return { ok: false, error: friendlyAuthError(error.message) };
      return { ok: true, message: 'Password updated.' };
    } catch (e) {
      return { ok: false, error: errText(e) };
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
      return { ok: false, error: errText(e) };
    }
  }

  // ---- cloud economy -----------------------------------------------------------------------

  /** Sends one finished match. Any failure to reach the server (or an expired session) counts as 'network': retry later. */
  async submitMatch(m: MatchSummary): Promise<SubmitOutcome> {
    try {
      const sb = await getClient();
      const { data, error } = await sb.rpc('submit_match', { payload: m });
      if (error) {
        // Only a definite data/constraint rejection (SQLSTATE class 22 or 23) can never succeed. Everything else
        // (offline, 5xx, expired session, a migration not applied yet) keeps the match queued for a later retry.
        const code = String((error as { code?: unknown }).code ?? '');
        return code.startsWith('22') || code.startsWith('23') ? { kind: 'invalid' } : { kind: 'network' };
      }
      if (data && typeof data === 'object' && (data as Record<string, unknown>).error === 'invalid') return { kind: 'invalid' };
      const parsed = parseSubmit(data);
      return parsed ? { kind: 'ok', data: parsed } : { kind: 'invalid' };
    } catch {
      return { kind: 'network' };
    }
  }

  private async shopCall(fn: 'buy_item' | 'equip_item', id: string): Promise<ShopOutcome> {
    try {
      const sb = await getClient();
      const { data, error } = await sb.rpc(fn, { item_id: id });
      if (error) return { ok: false, error: 'network' };
      const d = (data ?? {}) as Record<string, unknown>;
      const profile = parseCloudProfile(d.profile) ?? undefined;
      if (d.ok === true && profile) return { ok: true, profile };
      const code = d.error === 'need_more' || d.error === 'not_owned' ? d.error : 'unknown';
      return { ok: false, error: code, missing: typeof d.missing === 'number' ? d.missing : undefined, profile };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  buyItem(id: string): Promise<ShopOutcome> {
    return this.shopCall('buy_item', id);
  }

  equipItem(id: string): Promise<ShopOutcome> {
    return this.shopCall('equip_item', id);
  }
}
