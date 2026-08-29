import { buildAdvisorPrompt, takeToken, resetRateLimits } from '../advisor';

const context = {
  firstName: 'Aisha',
  className: 'Senior Four',
  level: 'O-Level' as const,
  termName: 'Term 3 2026',
  results: [
    { subject: 'Mathematics', score: 78, grade: 'B' },
    { subject: 'Biology', score: 45, grade: 'E' },
  ],
};

describe('buildAdvisorPrompt', () => {
  it('names the student, class and term', () => {
    const prompt = buildAdvisorPrompt(context);
    expect(prompt).toContain('Aisha');
    expect(prompt).toContain('Senior Four');
    expect(prompt).toContain('Term 3 2026');
  });

  it('includes the released marks the advisor may use', () => {
    const prompt = buildAdvisorPrompt(context);
    expect(prompt).toContain('Mathematics: 78 (B)');
    expect(prompt).toContain('Biology: 45 (E)');
  });

  it('says plainly when nothing is released, rather than leaving a blank', () => {
    // Otherwise the model invents marks to fill the gap.
    const prompt = buildAdvisorPrompt({ ...context, results: [] });
    expect(prompt).toMatch(/No results have been released yet/);
  });

  it('marks an unreleased subject as such instead of showing a number', () => {
    const prompt = buildAdvisorPrompt({
      ...context,
      results: [{ subject: 'History', score: null, grade: null }],
    });
    expect(prompt).toContain('History: not released');
  });

  it('forbids promising admission or sponsorship', () => {
    // The rule that protects the school: a confident wrong answer about
    // qualifying becomes a furious parent in the head teacher's office.
    const prompt = buildAdvisorPrompt(context);
    expect(prompt).toMatch(/Never say a student has qualified/);
    expect(prompt).toMatch(/guaranteed a\s+place or government sponsorship/);
    expect(prompt).toMatch(/institution decides/);
  });

  it('forbids inventing cut-off points and requirements', () => {
    expect(buildAdvisorPrompt(context)).toMatch(/Never invent a cut-off point/);
  });

  it('forbids discussing another student', () => {
    expect(buildAdvisorPrompt(context)).toMatch(/Never discuss another student/);
  });

  it('keeps the advisor to school matters', () => {
    const prompt = buildAdvisorPrompt(context);
    expect(prompt).toMatch(/not about school, subjects, results or careers/);
    expect(prompt).toMatch(/medical, legal or financial advice/);
  });

  it('asks for short, plain answers for a parent on a phone', () => {
    const prompt = buildAdvisorPrompt(context);
    expect(prompt).toMatch(/two or three short paragraphs/i);
    expect(prompt).toMatch(/second language/);
  });
});

describe('takeToken', () => {
  beforeEach(() => resetRateLimits());

  it('allows a normal burst of questions', () => {
    for (let i = 0; i < 12; i += 1) {
      expect(takeToken(1)).toBe(true);
    }
  });

  it('stops a flood once the bucket is empty', () => {
    for (let i = 0; i < 12; i += 1) takeToken(1);
    expect(takeToken(1)).toBe(false);
  });

  it('refills over time', () => {
    const start = 1_000_000;
    for (let i = 0; i < 12; i += 1) takeToken(1, start);
    expect(takeToken(1, start)).toBe(false);
    // Half a minute later, half the bucket is back.
    expect(takeToken(1, start + 30_000)).toBe(true);
  });

  it('counts each account separately', () => {
    for (let i = 0; i < 12; i += 1) takeToken(1);
    expect(takeToken(1)).toBe(false);
    // One family exhausting their questions must not silence another.
    expect(takeToken(2)).toBe(true);
  });

  it('never refills beyond capacity', () => {
    const start = 1_000_000;
    takeToken(1, start);
    // A long gap should not bank unlimited questions.
    takeToken(1, start + 10 * 60_000);
    for (let i = 0; i < 11; i += 1) takeToken(1, start + 10 * 60_000);
    expect(takeToken(1, start + 10 * 60_000)).toBe(false);
  });
});
