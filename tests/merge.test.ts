import { describe, expect, it } from 'vitest';
import { applyCloudProfile, buildImportPayload, parseCloudProfile } from '../src/merge';
import type { CloudProfile } from '../src/merge';
import { emptyProgress } from '../src/progress';

const cloud = (o: Partial<CloudProfile> = {}): CloudProfile => ({
  displayName: 'Cloudy',
  shells: 250,
  totalEarned: 400,
  owned: ['skin-cyan', 'skin-mint', 'bogus-item'],
  equipped: { skin: 'skin-mint', shot: 'shot-legendary-fake' },
  level: 2,
  xp: 10,
  imported: true,
  createdAt: 1_700_000_000_000,
  ...o,
});

describe('guest import payload', () => {
  it('carries the local save', () => {
    const p = { ...emptyProgress(), name: 'Zed', shells: 120, totalEarned: 300 };
    const payload = buildImportPayload(p);
    expect(payload).toMatchObject({ name: 'Zed', shells: 120, total_earned: 300 });
    expect(payload.owned).toEqual(p.owned);
    expect(payload.equipped).toEqual(p.equipped);
  });
});

describe('parseCloudProfile', () => {
  it('reads the server json and rejects junk', () => {
    const c = parseCloudProfile({ display_name: 'A1b', shells: 5, total_earned: 9, owned: ['skin-cyan', 7], equipped: {}, level: 0, xp: -3, imported: true, created_at: '2026-01-02T00:00:00Z' });
    expect(c?.displayName).toBe('A1b');
    expect(c?.owned).toEqual(['skin-cyan']);
    expect(c?.level).toBe(1);
    expect(c?.xp).toBe(0);
    expect(parseCloudProfile(null)).toBeNull();
    expect(parseCloudProfile({ shells: 5 })).toBeNull();
  });
});

describe('applyCloudProfile', () => {
  it('on a new device the cloud profile replaces local progress and drops unknown items', () => {
    const local = { ...emptyProgress(), shells: 9999, name: 'Local' };
    const out = applyCloudProfile(local, cloud(), false);
    expect(out.name).toBe('Cloudy');
    expect(out.shells).toBe(250);
    expect(out.owned).toContain('skin-mint');
    expect(out.owned).not.toContain('bogus-item');
    expect(out.equipped.skin).toBe('skin-mint');
    expect(out.equipped.shot).toBe('shot-default'); // invalid id falls back to the free item
  });

  it('on the same account the local save (which may have newer earnings) is kept', () => {
    const local = { ...emptyProgress(), shells: 9999, name: 'Local' };
    const out = applyCloudProfile(local, cloud(), true);
    expect(out.shells).toBe(9999);
    expect(out.name).toBe('Cloudy');
  });
});
