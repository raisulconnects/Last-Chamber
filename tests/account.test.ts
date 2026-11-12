import { describe, expect, it } from 'vitest';
import { MenuModel } from '../src/menu/menuModel';
import { friendlyAuthError, validateDisplayName, validateEmail, validatePassword } from '../src/accountValidate';

describe('account validation', () => {
  it('accepts normal emails and rejects junk', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail(' me@example.com ')).toBeNull();
    expect(validateEmail('')).not.toBeNull();
    expect(validateEmail('nope')).not.toBeNull();
    expect(validateEmail('a@b')).not.toBeNull();
  });

  it('requires 8+ character passwords', () => {
    expect(validatePassword('1234567')).not.toBeNull();
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('x'.repeat(73))).not.toBeNull();
  });

  it('checks display names like the database does', () => {
    expect(validateDisplayName('Raisul')).toBeNull();
    expect(validateDisplayName('A_b-9 z')).toBeNull();
    expect(validateDisplayName('ab')).not.toBeNull();
    expect(validateDisplayName('x'.repeat(15))).not.toBeNull();
    expect(validateDisplayName('bad<name>')).not.toBeNull();
    expect(validateDisplayName('Admin')).not.toBeNull();
  });

  it('maps server errors to friendly text', () => {
    expect(friendlyAuthError('Invalid login credentials')).toBe('Wrong email or password.');
    expect(friendlyAuthError('User already registered')).toMatch(/already has an account/);
    expect(friendlyAuthError('TypeError: Failed to fetch')).toMatch(/Cannot reach/);
    expect(friendlyAuthError('weird internal thing')).toBe('Something went wrong. Try again.');
    expect(friendlyAuthError(undefined)).toBe('Something went wrong. Try again.');
  });
});

describe('account menu and player card', () => {
  const env = { volume: 0.6, muted: false, reduceFlashing: false };
  const toProfile = (m: MenuModel): void => {
    m.focus = m.items().findIndex((i) => i.id === 'profile');
    m.activate();
  };

  it('has no Account entry in the main list and no account actions without accounts', () => {
    const m = new MenuModel(env);
    expect(m.items().some((i) => i.id === 'account')).toBe(false);
    m.accountAvailable = true;
    expect(m.items().some((i) => i.id === 'account')).toBe(false);
    m.accountAvailable = false;
    toProfile(m);
    expect(m.items().some((i) => i.id === 'accSignIn' || i.id === 'signOut')).toBe(false);
  });

  it('guest: Profile offers Sign in, which opens the form', () => {
    const m = new MenuModel(env);
    m.accountAvailable = true;
    m.accountInfo = { status: 'guest', email: '', level: 1 };
    toProfile(m);
    m.focus = m.items().findIndex((i) => i.id === 'accSignIn');
    expect(m.focus).toBeGreaterThan(-1);
    expect(m.activate()).toEqual({ type: 'openForm', mode: 'signIn' });
  });

  it('signed in: Profile sign out needs a confirming second tap', () => {
    const m = new MenuModel(env);
    m.accountAvailable = true;
    m.accountInfo = { status: 'signedIn', email: 'a@b.co', level: 3 };
    toProfile(m);
    m.focus = m.items().findIndex((i) => i.id === 'signOut');
    expect(m.activate()).toBeNull();
    expect(m.items()[m.focus].label).toMatch(/again/);
    expect(m.activate()).toEqual({ type: 'signOut' });
  });

  it('tapping the player card: guests get the sign-in form, signed-in players the Profile', () => {
    const m = new MenuModel(env);
    m.accountAvailable = true;
    m.accountInfo = { status: 'guest', email: '', level: 1 };
    expect(m.clickItem(-1, 'card')).toEqual({ type: 'openForm', mode: 'signIn' });
    expect(m.screen).toBe('main');
    m.accountInfo = { status: 'signedIn', email: 'a@b.co', level: 1 };
    expect(m.clickItem(-1, 'card')).toBeNull();
    expect(m.screen).toBe('profile');
    m.clickItem(-1, 'card'); // already on Profile: stays put, no extra history
    expect(m.screen).toBe('profile');
  });

  it('without accounts the card just opens the Profile', () => {
    const m = new MenuModel(env);
    expect(m.clickItem(-1, 'card')).toBeNull();
    expect(m.screen).toBe('profile');
  });
});
