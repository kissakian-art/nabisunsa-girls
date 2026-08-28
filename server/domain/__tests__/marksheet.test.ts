import {
  evaluateTransition,
  isVisibleToParents,
  summariseTerm,
  MarksheetState,
  MarksheetStatus,
} from '../marksheet';

const complete = (over: Partial<MarksheetState> = {}): MarksheetState => ({
  status: 'draft',
  expectedStudents: 40,
  recordedMarks: 40,
  enteredBy: null,
  verifiedBy: null,
  ...over,
});

const DOS = { actorId: 10, actorRole: 'dos' as const };
const OTHER_DOS = { actorId: 11, actorRole: 'dos' as const };
const CLERK = { actorId: 20, actorRole: 'dos_staff' as const };
const OTHER_CLERK = { actorId: 21, actorRole: 'dos_staff' as const };

describe('the parent visibility guarantee', () => {
  it('shows marks to parents only once published', () => {
    // This is the promise the proposal makes in writing. If it ever fails,
    // a school's unreleased marks have reached parents.
    const statuses: MarksheetStatus[] = ['draft', 'entered', 'verified'];
    for (const status of statuses) {
      expect(isVisibleToParents({ status })).toBe(false);
    }
    expect(isVisibleToParents({ status: 'published' })).toBe(true);
  });
});

describe('who may act', () => {
  it('refuses teachers, and says why in plain English', () => {
    const result = evaluateTransition(complete(), {
      action: 'enter', actorId: 5, actorRole: 'teacher',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Teachers do not use this system/);
    expect(result.reason).toMatch(/submitted on paper/);
    expect(result.reason).toMatch(/Director of Studies/);
  });

  it('refuses parents outright', () => {
    for (const action of ['enter', 'verify', 'publish'] as const) {
      const result = evaluateTransition(complete({ status: 'verified' }), {
        action, actorId: 5, actorRole: 'student_parent',
      });
      expect(result.allowed).toBe(false);
    }
  });

  it('allows the DoS and the school admin', () => {
    expect(evaluateTransition(complete(), { action: 'enter', ...DOS }).allowed).toBe(true);
    expect(
      evaluateTransition(complete(), { action: 'enter', actorId: 2, actorRole: 'school_admin' })
        .allowed,
    ).toBe(true);
  });
});

describe('the DoS office hierarchy', () => {
  // The DoS leads an office of several staff. They do the transcription;
  // the DoS decides what reaches parents.
  it('lets office staff enter marks', () => {
    expect(evaluateTransition(complete(), { action: 'enter', ...CLERK }).allowed).toBe(true);
  });

  it('lets office staff reopen a sheet to fix a mistake', () => {
    expect(
      evaluateTransition(complete({ status: 'entered' }), { action: 'reopen', ...CLERK }).allowed,
    ).toBe(true);
  });

  it('refuses to let office staff verify', () => {
    const state = complete({ status: 'entered', enteredBy: OTHER_CLERK.actorId });
    const result = evaluateTransition(state, { action: 'verify', ...CLERK });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Only the Director of Studies can verify/);
  });

  it('refuses to let office staff publish to parents', () => {
    // A clerk typing marks is not the person who decides 900 parents see them.
    const result = evaluateTransition(complete({ status: 'verified' }), {
      action: 'publish', ...CLERK,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Only the Director of Studies can publish/);
    expect(result.reason).toMatch(/DoS's decision/);
  });

  it('refuses to let office staff withdraw a published sheet', () => {
    expect(
      evaluateTransition(complete({ status: 'published' }), { action: 'unpublish', ...CLERK })
        .allowed,
    ).toBe(false);
  });

  it('lets the DoS verify a sheet one of the staff entered', () => {
    const state = complete({ status: 'entered', enteredBy: CLERK.actorId });
    expect(evaluateTransition(state, { action: 'verify', ...DOS }).allowed).toBe(true);
  });

  it('still applies four-eyes when the DoS entered it themselves', () => {
    // A small office where the DoS did the typing still needs a second reader.
    const state = complete({ status: 'entered', enteredBy: DOS.actorId });
    expect(evaluateTransition(state, { action: 'verify', ...DOS }).allowed).toBe(false);
    expect(evaluateTransition(state, { action: 'verify', ...OTHER_DOS }).allowed).toBe(true);
  });
});

describe('the four-eyes rule', () => {
  it('refuses verification by whoever entered the sheet', () => {
    // Marks are transcribed from paper by hand; a second reader is the only
    // check between a typo and a parent seeing a wrong mark.
    const state = complete({ status: 'entered', enteredBy: DOS.actorId });
    const result = evaluateTransition(state, { action: 'verify', ...DOS });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/other than the person who entered it/);
  });

  it('allows verification by a different person', () => {
    const state = complete({ status: 'entered', enteredBy: DOS.actorId });
    expect(evaluateTransition(state, { action: 'verify', ...OTHER_DOS }).allowed).toBe(true);
  });

  it('allows verification when the enterer is unrecorded', () => {
    const state = complete({ status: 'entered', enteredBy: null });
    expect(evaluateTransition(state, { action: 'verify', ...DOS }).allowed).toBe(true);
  });
});

describe('completeness before submission', () => {
  it('refuses to submit a sheet with students still unmarked', () => {
    const state = complete({ recordedMarks: 37, expectedStudents: 40 });
    const result = evaluateTransition(state, { action: 'enter', ...DOS });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/3 of 40 students have no mark yet/);
    expect(result.reason).toMatch(/absent/);
  });

  it('accepts a sheet where every student has a mark or an absence', () => {
    expect(evaluateTransition(complete(), { action: 'enter', ...DOS }).allowed).toBe(true);
  });

  it('accepts an empty class without complaint', () => {
    const state = complete({ expectedStudents: 0, recordedMarks: 0 });
    expect(evaluateTransition(state, { action: 'enter', ...DOS }).allowed).toBe(true);
  });
});

describe('state machine', () => {
  it('walks the full happy path', () => {
    let state = complete();
    const entered = evaluateTransition(state, { action: 'enter', ...DOS });
    expect(entered.nextStatus).toBe('entered');

    state = complete({ status: 'entered', enteredBy: DOS.actorId });
    const verified = evaluateTransition(state, { action: 'verify', ...OTHER_DOS });
    expect(verified.nextStatus).toBe('verified');

    state = complete({ status: 'verified', enteredBy: DOS.actorId, verifiedBy: OTHER_DOS.actorId });
    const published = evaluateTransition(state, { action: 'publish', ...DOS });
    expect(published.nextStatus).toBe('published');
  });

  it('refuses to publish a sheet that was never verified', () => {
    // Skipping verification would put unchecked marks in front of parents.
    const result = evaluateTransition(complete({ status: 'entered' }), {
      action: 'publish', ...DOS,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Cannot publish a marksheet that is entered/);
  });

  it('refuses to publish straight from draft', () => {
    expect(evaluateTransition(complete(), { action: 'publish', ...DOS }).allowed).toBe(false);
  });

  it('refuses to publish twice', () => {
    expect(
      evaluateTransition(complete({ status: 'published' }), { action: 'publish', ...DOS }).allowed,
    ).toBe(false);
  });

  it('allows a published sheet to be withdrawn when an error is found', () => {
    const result = evaluateTransition(complete({ status: 'published' }), {
      action: 'unpublish', ...DOS,
    });
    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe('verified');
  });

  it('allows reopening for correction before publication', () => {
    expect(
      evaluateTransition(complete({ status: 'entered' }), { action: 'reopen', ...DOS }).nextStatus,
    ).toBe('draft');
    expect(
      evaluateTransition(complete({ status: 'verified' }), { action: 'reopen', ...DOS }).nextStatus,
    ).toBe('draft');
  });

  it('refuses to reopen a published sheet directly — withdraw it first', () => {
    expect(
      evaluateTransition(complete({ status: 'published' }), { action: 'reopen', ...DOS }).allowed,
    ).toBe(false);
  });

  it('rejects an unknown action', () => {
    const result = evaluateTransition(complete(), {
      action: 'destroy' as any, ...DOS,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Unknown action/);
  });
});

describe('summariseTerm', () => {
  const sheet = (status: MarksheetStatus) => ({ status });

  it('counts each state and the published percentage', () => {
    const progress = summariseTerm([
      sheet('draft'), sheet('draft'),
      sheet('entered'),
      sheet('verified'),
      sheet('published'), sheet('published'), sheet('published'), sheet('published'),
    ]);
    expect(progress.total).toBe(8);
    expect(progress.draft).toBe(2);
    expect(progress.entered).toBe(1);
    expect(progress.verified).toBe(1);
    expect(progress.published).toBe(4);
    expect(progress.percentPublished).toBe(50);
  });

  it('reports zero rather than dividing by zero on an empty term', () => {
    expect(summariseTerm([])).toEqual({
      total: 0, draft: 0, entered: 0, verified: 0, published: 0, percentPublished: 0,
    });
  });

  it('reports 100 when everything is published', () => {
    expect(summariseTerm([sheet('published'), sheet('published')]).percentPublished).toBe(100);
  });
});
