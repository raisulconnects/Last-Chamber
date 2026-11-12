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

describe('account menu', () => {
  const env = { volume: 0.6, muted: false, reduceFlashing: false };

  it('hides Account entries when accounts are unavailable', () => {
    const m = new MenuModel(env);
    expect(m.items().some((i) => i.id === 'account')).toBe(false);
  });

  it('guest sees sign in / create account, which open the form', () => {
    const m = new MenuModel(env);
    m.accountAvailable = true;
    m.accountInfo = { status: 'guest', email: '', level: 1 };
    m.focus = m.items().findIndex((i) => i.id === 'account');
    expect(m.activate()).toBeNull();
    expect(m.screen).toBe('account');
    expect(m.items().map((i) => i.id)).toEqual(['accSignIn', 'accSignUp', 'back']);
    expect(m.activate()).toEqual({ type: 'openForm', mode: 'signIn' });
    m.focus = 1;
    expect(m.activate()).toEqual({ type: 'openForm', mode: 'signUp' });
  });

  it('sign out needs a confirming second tap', () => {
    const m = new MenuModel(env);
    m.accountAvailable = true;
    m.accountInfo = { status: 'signedIn', email: 'a@b.co', level: 3 };
    m.focus = m.items().findIndex((i) => i.id === 'account');
    m.activate();
    m.focus = m.items().findIndex((i) => i.id === 'signOut');
    expect(m.activate()).toBeNull();
    expect(m.items()[m.focus].label).toMatch(/again/);
    expect(m.activate()).toEqual({ type: 'signOut' });
  });
});
