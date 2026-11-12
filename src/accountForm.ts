/** DOM overlay for sign in / create account / reset password / change name.
 *  Real inputs are used (not canvas) so password managers and phone keyboards work. */
import type { Account, Result } from './account';
import { validateDisplayName, validateEmail, validatePassword } from './accountValidate';

export type FormMode = 'signIn' | 'signUp' | 'reset' | 'newPassword' | 'rename';

export interface FormHooks {
  /** Short success text to show back in the menu. */
  onDone: (message: string) => void;
  onClose: () => void;
}

const CSS = `
#lc-account { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  padding: 16px; box-sizing: border-box; background: rgba(6, 8, 14, 0.84); font-family: system-ui, "Segoe UI", sans-serif;
  -webkit-user-select: text; user-select: text; touch-action: manipulation; overflow-y: auto; }
#lc-account * { box-sizing: border-box; }
#lc-account .card { width: 100%; max-width: 380px; margin: auto; padding: 22px 20px 18px; border-radius: 16px;
  background: #0e1220; border: 1px solid rgba(76, 201, 240, 0.35); box-shadow: 0 0 28px rgba(76, 201, 240, 0.18); color: #e8ecf1; }
#lc-account h2 { margin: 0 0 4px; font-size: 20px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
#lc-account p.sub { margin: 0 0 14px; font-size: 13px; color: #8b97a8; line-height: 1.4; }
#lc-account .tabs { display: flex; gap: 6px; margin-bottom: 14px; }
#lc-account .tabs button { flex: 1; padding: 10px 6px; font: inherit; font-size: 13px; font-weight: 800; letter-spacing: 1px; cursor: pointer;
  color: #8b97a8; background: transparent; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; min-height: 44px; }
#lc-account .tabs button[aria-selected="true"] { color: #0b1117; background: #4cc9f0; border-color: #4cc9f0; }
#lc-account label { display: block; margin: 10px 0 4px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #8b97a8; text-transform: uppercase; }
#lc-account input { width: 100%; padding: 12px; font: inherit; font-size: 16px; color: #e8ecf1; background: #070a12;
  border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; outline: none; min-height: 46px; }
#lc-account input:focus { border-color: #4cc9f0; box-shadow: 0 0 0 2px rgba(76, 201, 240, 0.25); }
#lc-account .err { min-height: 20px; margin: 10px 0 0; font-size: 13px; font-weight: 700; color: #f25f5c; }
#lc-account .ok { color: #5dd39e; }
#lc-account .submit { width: 100%; margin-top: 8px; padding: 12px; font: inherit; font-size: 15px; font-weight: 900; letter-spacing: 2px; cursor: pointer;
  color: #0b1117; background: #4cc9f0; border: 0; border-radius: 10px; min-height: 48px; text-transform: uppercase; }
#lc-account .submit:disabled { opacity: 0.55; cursor: default; }
#lc-account .row { display: flex; justify-content: space-between; gap: 10px; margin-top: 12px; }
#lc-account .link { padding: 8px 2px; font: inherit; font-size: 13px; font-weight: 700; color: #8b97a8; background: none; border: 0; cursor: pointer; min-height: 40px; }
#lc-account .link:hover { color: #e8ecf1; }
`;

export class AccountForm {
  private root: HTMLDivElement | null = null;
  /** Capture-phase guard: while the form is open no key reaches the game, and Esc closes the form. */
  private keyGuard = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.type === 'keydown' && e.key === 'Escape') this.close();
  };

  constructor(
    private account: Account,
    private hooks: FormHooks,
  ) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    window.removeEventListener('keydown', this.keyGuard, true);
    window.removeEventListener('keyup', this.keyGuard, true);
    this.hooks.onClose();
  }

  open(mode: FormMode): void {
    this.close();
    if (!document.getElementById('lc-account-css')) {
      const st = document.createElement('style');
      st.id = 'lc-account-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const root = document.createElement('div');
    root.id = 'lc-account';
    window.addEventListener('keydown', this.keyGuard, true);
    window.addEventListener('keyup', this.keyGuard, true);
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.addEventListener('click', (e) => {
      if (e.target === root) this.close();
    });
    this.root = root;
    this.render(mode);
    document.body.appendChild(root);
    this.focusFirst();
  }

  private focusFirst(): void {
    this.root?.querySelector<HTMLInputElement>('input')?.focus();
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    Object.assign(e, props);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private render(mode: FormMode): void {
    const root = this.root;
    if (!root) return;
    root.replaceChildren();
    const card = this.el('div', { className: 'card' });
    const form = this.el('form', { noValidate: true });
    const err = this.el('p', { className: 'err' });
    err.setAttribute('role', 'alert');

    const titles: Record<FormMode, [string, string]> = {
      signIn: ['Account', 'Sign in to keep your Shells, items and name on any device.'],
      signUp: ['Account', 'Create a free account. Your progress on this device is saved to it.'],
      reset: ['Reset password', 'We will email you a link to choose a new password.'],
      newPassword: ['New password', 'Choose a new password for your account.'],
      rename: ['Display name', '3-14 characters: letters, numbers, spaces, _ and -. Other players will see it.'],
    };
    card.append(this.el('h2', {}, titles[mode][0]), this.el('p', { className: 'sub' }, titles[mode][1]));

    if (mode === 'signIn' || mode === 'signUp') {
      const tabs = this.el('div', { className: 'tabs' });
      tabs.setAttribute('role', 'tablist');
      for (const [m, label] of [['signIn', 'Sign in'], ['signUp', 'Create account']] as const) {
        const b = this.el('button', { type: 'button' }, label);
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(m === mode));
        b.addEventListener('click', () => {
          this.render(m);
          this.focusFirst();
        });
        tabs.append(b);
      }
      card.append(tabs);
    }

    const field = (label: string, type: string, name: string, auto: string, value = ''): HTMLInputElement => {
      const id = 'lc-' + name;
      const l = this.el('label', { htmlFor: id }, label);
      const i = this.el('input', { type, id, name, value });
      i.setAttribute('autocomplete', auto);
      i.spellcheck = false;
      if (type === 'email') i.inputMode = 'email';
      i.autocapitalize = 'off';
      form.append(l, i);
      return i;
    };

    let email: HTMLInputElement | null = null;
    let pw: HTMLInputElement | null = null;
    let pw2: HTMLInputElement | null = null;
    let name: HTMLInputElement | null = null;
    if (mode === 'signIn' || mode === 'signUp' || mode === 'reset') email = field('Email', 'email', 'email', 'email');
    if (mode === 'signIn') pw = field('Password', 'password', 'password', 'current-password');
    if (mode === 'signUp' || mode === 'newPassword') {
      pw = field('Password (8+ characters)', 'password', 'password', 'new-password');
      pw2 = field('Repeat password', 'password', 'password2', 'new-password');
    }
    if (mode === 'rename') name = field('Display name', 'text', 'name', 'nickname', this.account.state.profile?.displayName ?? '');

    const submitLabels: Record<FormMode, string> = {
      signIn: 'Sign in',
      signUp: 'Create account',
      reset: 'Send reset link',
      newPassword: 'Save password',
      rename: 'Save name',
    };
    const submit = this.el('button', { type: 'submit', className: 'submit' }, submitLabels[mode]);
    form.append(err, submit);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit(mode, { email, pw, pw2, name }, err, submit);
    });
    card.append(form);

    const row = this.el('div', { className: 'row' });
    if (mode === 'signIn') {
      const f = this.el('button', { type: 'button', className: 'link' }, 'Forgot password?');
      f.addEventListener('click', () => {
        this.render('reset');
        this.focusFirst();
      });
      row.append(f);
    } else if (mode === 'reset') {
      const f = this.el('button', { type: 'button', className: 'link' }, 'Back to sign in');
      f.addEventListener('click', () => {
        this.render('signIn');
        this.focusFirst();
      });
      row.append(f);
    } else row.append(this.el('span'));
    const cancel = this.el('button', { type: 'button', className: 'link' }, 'Cancel');
    cancel.addEventListener('click', () => this.close());
    row.append(cancel);
    card.append(row);
    root.append(card);
  }

  private async submit(
    mode: FormMode,
    f: { email: HTMLInputElement | null; pw: HTMLInputElement | null; pw2: HTMLInputElement | null; name: HTMLInputElement | null },
    err: HTMLElement,
    btn: HTMLButtonElement,
  ): Promise<void> {
    const show = (msg: string, good = false): void => {
      err.textContent = msg;
      err.classList.toggle('ok', good);
    };
    const email = f.email?.value ?? '';
    const pw = f.pw?.value ?? '';
    // Client-side checks first (the server checks again).
    if (f.email) {
      const m = validateEmail(email);
      if (m) return show(m);
    }
    if (mode === 'signIn' && !pw) return show('Enter your password.');
    if (mode === 'signUp' || mode === 'newPassword') {
      const m = validatePassword(pw);
      if (m) return show(m);
      if (pw !== (f.pw2?.value ?? '')) return show('Passwords do not match.');
    }
    if (mode === 'rename') {
      const m = validateDisplayName(f.name?.value ?? '');
      if (m) return show(m);
    }

    btn.disabled = true;
    show('Working...', true);
    let res: Result;
    if (mode === 'signIn') res = await this.account.signIn(email, pw);
    else if (mode === 'signUp') res = await this.account.signUp(email, pw);
    else if (mode === 'reset') res = await this.account.resetPassword(email);
    else if (mode === 'newPassword') res = await this.account.updatePassword(pw);
    else res = await this.account.setDisplayName(f.name?.value ?? '');
    btn.disabled = false;

    if (!res.ok) return show(res.error);
    if (mode === 'reset' || (mode === 'signUp' && this.account.state.status !== 'signedIn')) {
      show(res.message ?? 'Done.', true); // stay open: the player has to act on the email
      return;
    }
    const message = res.message ?? 'Done.';
    this.close();
    this.hooks.onDone(message);
  }
}
