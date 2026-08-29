import {
  DEFAULT_CA_WEIGHT,
  DEFAULT_EOT_WEIGHT,
  DEFAULT_GRADING_SCALE,
  MIN_ADMIN_PASSWORD,
  SCHOOL_STATUSES,
  adminPasswordProblem,
  canSignIn,
  slugProblem,
  statusChange,
  suggestSlug,
} from '../platform';
import { MIN_PASSWORD } from '../invites';

describe('school status', () => {
  it('lets a trial or active school sign in, and nobody else', () => {
    expect(canSignIn('trial')).toBe(true);
    expect(canSignIn('active')).toBe(true);
    expect(canSignIn('suspended')).toBe(false);
    expect(canSignIn('closed')).toBe(false);
  });

  it('covers every status the schema allows', () => {
    // If the enum in 001_init.sql grows, this fails until the rule above has
    // an answer for the new value — better than defaulting to "can sign in".
    expect([...SCHOOL_STATUSES].sort()).toEqual(
      ['active', 'closed', 'suspended', 'trial'].sort(),
    );
  });
});

describe('changing a school status', () => {
  it('refuses a change to the status it already has', () => {
    const result = statusChange('active', 'active', '');
    expect(result.ok).toBe(false);
  });

  it('requires a reason before anyone loses access', () => {
    expect(statusChange('active', 'suspended', '').ok).toBe(false);
    expect(statusChange('active', 'closed', '   ').ok).toBe(false);
    expect(statusChange('active', 'suspended', 'Unpaid since March').ok).toBe(true);
  });

  it('needs no reason to give access back', () => {
    expect(statusChange('suspended', 'active', '').ok).toBe(true);
    expect(statusChange('trial', 'active', '').ok).toBe(true);
  });

  it('reopens a closed school only by way of suspension', () => {
    expect(statusChange('closed', 'active', 'paid up').ok).toBe(false);
    expect(statusChange('closed', 'trial', 'paid up').ok).toBe(false);
    expect(statusChange('closed', 'suspended', 'coming back').ok).toBe(true);
  });
});

describe('slugs', () => {
  it('builds one from a school name that a person would have chosen', () => {
    expect(suggestSlug("Nabisunsa Girls' Secondary School")).toBe(
      'nabisunsa-girls-secondary-school',
    );
    expect(suggestSlug('St. Mary’s College, Kisubi')).toBe('st-marys-college-kisubi');
  });

  it('never suggests one it would then reject', () => {
    const names = [
      "Nabisunsa Girls' Secondary School",
      'St. Mary’s College, Kisubi',
      '  Seeta   High  ',
      'Kings College — Budo',
      'École Belge',
    ];
    for (const name of names) {
      expect(slugProblem(suggestSlug(name))).toBeNull();
    }
  });

  it('rejects what would break a branded build', () => {
    expect(slugProblem('')).not.toBeNull();
    expect(slugProblem('Nabisunsa Girls')).not.toBeNull(); // spaces and capitals
    expect(slugProblem('nabisunsa_girls')).not.toBeNull(); // underscore
    expect(slugProblem('-nabisunsa')).not.toBeNull();
    expect(slugProblem('nabisunsa-')).not.toBeNull();
    expect(slugProblem('nabisunsa--girls')).not.toBeNull();
    expect(slugProblem('n'.repeat(65))).not.toBeNull();
  });

  it('accepts the one the deployed app is already built with', () => {
    expect(slugProblem('nabisunsa-girls')).toBeNull();
  });
});

describe('administrator passwords', () => {
  it('asks for more than a parent password does', () => {
    // A parent's password reaches one family's marks; these reach a whole
    // school, or every school.
    expect(MIN_ADMIN_PASSWORD).toBeGreaterThan(MIN_PASSWORD);
  });

  it('refuses anything shorter', () => {
    expect(adminPasswordProblem('x'.repeat(MIN_ADMIN_PASSWORD - 1))).not.toBeNull();
    expect(adminPasswordProblem('x'.repeat(MIN_ADMIN_PASSWORD))).toBeNull();
  });
});

describe('what a new school starts with', () => {
  it('weights coursework and end-of-term to exactly 100', () => {
    // The schema enforces this with a CHECK constraint; a default that
    // violated it would fail the insert at school creation.
    expect(DEFAULT_CA_WEIGHT + DEFAULT_EOT_WEIGHT).toBe(100);
  });

  it('has a grading scale that starts at zero and never leaves a gap', () => {
    const boundaries = DEFAULT_GRADING_SCALE.map(([, min]) => min);
    expect(Math.min(...boundaries)).toBe(0);
    // Descending, so every mark from 0 to 100 falls into exactly one grade.
    expect([...boundaries].sort((a, b) => b - a)).toEqual(boundaries);
    expect(new Set(boundaries).size).toBe(boundaries.length);
  });
});
