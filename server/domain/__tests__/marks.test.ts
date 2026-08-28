import {
  assertValidConfig,
  averageCoursework,
  computeSubjectResult,
  gradeFor,
  rankResults,
  GradingConfig,
  GradingConfigError,
  SubjectResult,
} from '../marks';

/** Nabisunsa's configuration: 20/80, best 3 coursework, Uganda scale. */
const NABISUNSA: GradingConfig = {
  caWeight: 20,
  eotWeight: 80,
  caBestOf: 3,
  scale: [
    { grade: 'A', minScore: 80, label: 'Distinction', points: 1 },
    { grade: 'B', minScore: 70, label: 'Credit', points: 2 },
    { grade: 'C', minScore: 60, label: 'Credit', points: 3 },
    { grade: 'D', minScore: 50, label: 'Pass', points: 4 },
    { grade: 'E', minScore: 40, label: 'Pass', points: 5 },
    { grade: 'O', minScore: 30, label: 'Subsidiary', points: 6 },
    { grade: 'F', minScore: 0, label: 'Failure', points: 9 },
  ],
};

/** A different school, to prove nothing is hardcoded to Nabisunsa. */
const OTHER_SCHOOL: GradingConfig = {
  caWeight: 40,
  eotWeight: 60,
  caBestOf: null,
  scale: [
    { grade: 'Distinction', minScore: 75 },
    { grade: 'Merit', minScore: 55 },
    { grade: 'Pass', minScore: 40 },
    { grade: 'Fail', minScore: 0 },
  ],
};

describe('assertValidConfig', () => {
  it('accepts a valid configuration', () => {
    expect(() => assertValidConfig(NABISUNSA)).not.toThrow();
    expect(() => assertValidConfig(OTHER_SCHOOL)).not.toThrow();
  });

  it('rejects weights that do not sum to 100', () => {
    expect(() => assertValidConfig({ ...NABISUNSA, caWeight: 30 })).toThrow(GradingConfigError);
  });

  it('rejects a scale with no bottom grade, which would leave 0 ungraded', () => {
    const scale = NABISUNSA.scale.filter((e) => e.minScore > 0);
    expect(() => assertValidConfig({ ...NABISUNSA, scale })).toThrow(/no bottom grade/);
  });

  it('rejects a repeated grade letter', () => {
    const scale = [...NABISUNSA.scale, { grade: 'A', minScore: 90 }];
    expect(() => assertValidConfig({ ...NABISUNSA, scale })).toThrow(/repeats grade/);
  });

  it('rejects an empty scale', () => {
    expect(() => assertValidConfig({ ...NABISUNSA, scale: [] })).toThrow(/empty/);
  });

  it('rejects a nonsensical best-of', () => {
    expect(() => assertValidConfig({ ...NABISUNSA, caBestOf: 0 })).toThrow(GradingConfigError);
    expect(() => assertValidConfig({ ...NABISUNSA, caBestOf: 2.5 })).toThrow(GradingConfigError);
  });
});

describe('averageCoursework', () => {
  it('averages the best 3 of 5', () => {
    // best three are 90, 80, 70 -> 80
    expect(averageCoursework([50, 70, 90, 60, 80], 3)).toBe(80);
  });

  it('averages everything when fewer scores than the best-of rule exist', () => {
    expect(averageCoursework([70, 80], 3)).toBe(75);
  });

  it('averages all scores when no best-of rule is set', () => {
    expect(averageCoursework([50, 70, 90, 60, 80], null)).toBe(70);
  });

  it('excludes absences rather than counting them as zero', () => {
    // A student absent for one test has one fewer score, not a zero.
    expect(averageCoursework([80, null, 90], null)).toBe(85);
  });

  it('returns null when nothing was recorded', () => {
    expect(averageCoursework([], null)).toBeNull();
    expect(averageCoursework([null, null], null)).toBeNull();
  });

  it('rounds to two decimal places', () => {
    expect(averageCoursework([70, 71, 73], null)).toBe(71.33);
  });
});

describe('gradeFor', () => {
  it('treats boundaries as inclusive lower bounds', () => {
    expect(gradeFor(80, NABISUNSA.scale)?.grade).toBe('A');
    expect(gradeFor(79.99, NABISUNSA.scale)?.grade).toBe('B');
    expect(gradeFor(30, NABISUNSA.scale)?.grade).toBe('O');
    expect(gradeFor(29.99, NABISUNSA.scale)?.grade).toBe('F');
  });

  it('grades the extremes', () => {
    expect(gradeFor(100, NABISUNSA.scale)?.grade).toBe('A');
    expect(gradeFor(0, NABISUNSA.scale)?.grade).toBe('F');
  });

  it('does not depend on the order the scale is given in', () => {
    const shuffled = [...NABISUNSA.scale].sort(() => 0.5 - Math.random());
    expect(gradeFor(75, shuffled)?.grade).toBe('B');
  });
});

describe('computeSubjectResult', () => {
  it('applies the 20/80 weighting', () => {
    const result = computeSubjectResult(
      { studentId: 1, subjectId: 1, coursework: [90, 80, 70], endOfTerm: 60 },
      NABISUNSA,
    );
    // CA = 80, final = 80*0.2 + 60*0.8 = 16 + 48 = 64
    expect(result.caScore).toBe(80);
    expect(result.finalScore).toBe(64);
    expect(result.grade).toBe('C');
    expect(result.points).toBe(3);
    expect(result.incomplete).toBeNull();
  });

  it('applies a different school\'s weighting to the same marks', () => {
    const result = computeSubjectResult(
      { studentId: 1, subjectId: 1, coursework: [90, 80, 70], endOfTerm: 60 },
      OTHER_SCHOOL,
    );
    // CA = 80 (all three, no best-of), final = 80*0.4 + 60*0.6 = 32 + 36 = 68
    expect(result.finalScore).toBe(68);
    expect(result.grade).toBe('Merit');
  });

  it('refuses to compute a final mark without the exam score', () => {
    // The exam carries 80% — a "final" mark from coursework alone would
    // misrepresent a student who has not sat the paper.
    const result = computeSubjectResult(
      { studentId: 1, subjectId: 1, coursework: [90, 80], endOfTerm: null },
      NABISUNSA,
    );
    expect(result.caScore).toBe(85);
    expect(result.finalScore).toBeNull();
    expect(result.grade).toBeNull();
    expect(result.incomplete).toBe('no-exam-score');
  });

  it('reports a student with no scores at all distinctly', () => {
    const result = computeSubjectResult(
      { studentId: 1, subjectId: 1, coursework: [], endOfTerm: null },
      NABISUNSA,
    );
    expect(result.incomplete).toBe('no-scores-at-all');
  });

  it('lets the exam stand alone when no coursework was recorded', () => {
    const result = computeSubjectResult(
      { studentId: 1, subjectId: 1, coursework: [], endOfTerm: 70 },
      NABISUNSA,
    );
    // Not 70*0.8 = 56: a missing coursework record is not a zero.
    expect(result.finalScore).toBe(70);
    expect(result.grade).toBe('B');
  });

  it('handles a perfect and a zero score', () => {
    const top = computeSubjectResult(
      { studentId: 1, subjectId: 1, coursework: [100], endOfTerm: 100 },
      NABISUNSA,
    );
    expect(top.finalScore).toBe(100);
    expect(top.grade).toBe('A');

    const bottom = computeSubjectResult(
      { studentId: 2, subjectId: 1, coursework: [0], endOfTerm: 0 },
      NABISUNSA,
    );
    expect(bottom.finalScore).toBe(0);
    expect(bottom.grade).toBe('F');
  });

  it('refuses to compute against a broken configuration', () => {
    expect(() =>
      computeSubjectResult(
        { studentId: 1, subjectId: 1, coursework: [80], endOfTerm: 80 },
        { ...NABISUNSA, caWeight: 50 },
      ),
    ).toThrow(GradingConfigError);
  });
});

describe('rankResults', () => {
  const result = (studentId: number, finalScore: number | null): SubjectResult => ({
    studentId,
    subjectId: 1,
    caScore: null,
    eotScore: null,
    finalScore,
    grade: null,
    points: null,
    incomplete: finalScore == null ? 'no-exam-score' : null,
  });

  it('ranks highest first', () => {
    const ranked = rankResults([result(1, 55), result(2, 90), result(3, 70)]);
    const byStudent = new Map(ranked.map((r) => [r.studentId, r.position]));
    expect(byStudent.get(2)).toBe(1);
    expect(byStudent.get(3)).toBe(2);
    expect(byStudent.get(1)).toBe(3);
  });

  it('gives tied students the same position and skips the next', () => {
    // Two students on 90 are both 1st; the next is 3rd, not 2nd.
    const ranked = rankResults([result(1, 90), result(2, 90), result(3, 70), result(4, 60)]);
    const byStudent = new Map(ranked.map((r) => [r.studentId, r.position]));
    expect(byStudent.get(1)).toBe(1);
    expect(byStudent.get(2)).toBe(1);
    expect(byStudent.get(3)).toBe(3);
    expect(byStudent.get(4)).toBe(4);
  });

  it('handles a three-way tie', () => {
    const ranked = rankResults([result(1, 80), result(2, 80), result(3, 80), result(4, 50)]);
    const byStudent = new Map(ranked.map((r) => [r.studentId, r.position]));
    expect(byStudent.get(1)).toBe(1);
    expect(byStudent.get(2)).toBe(1);
    expect(byStudent.get(3)).toBe(1);
    expect(byStudent.get(4)).toBe(4);
  });

  it('does not rank unmarked students last — they have no position', () => {
    // "Not yet marked" must never read as "came bottom of the class".
    const ranked = rankResults([result(1, 90), result(2, null), result(3, 40)]);
    const byStudent = new Map(ranked.map((r) => [r.studentId, r.position]));
    expect(byStudent.get(1)).toBe(1);
    expect(byStudent.get(3)).toBe(2);
    expect(byStudent.get(2)).toBeNull();
  });

  it('returns every student it was given', () => {
    const ranked = rankResults([result(1, 90), result(2, null), result(3, 40)]);
    expect(ranked).toHaveLength(3);
  });

  it('copes with an empty group', () => {
    expect(rankResults([])).toEqual([]);
  });
});
