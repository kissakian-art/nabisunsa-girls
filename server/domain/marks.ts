/**
 * Term mark computation.
 *
 * Pure functions, no database. The same rules must eventually run in the
 * parent app, so nothing here may reach for a connection or a request.
 *
 * Every school-specific number — the coursework/exam split, the best-of-N
 * rule, the grade boundaries — arrives as configuration. Nabisunsa's 20/80
 * and "best 3" are not hardcoded, because the next school will differ.
 */

export interface GradingScaleEntry {
  /** 'A', 'B', 'C', 'D', 'E', 'O', 'F' */
  grade: string;
  /** Inclusive lower bound: a score qualifies when score >= minScore. */
  minScore: number;
  label?: string | null;
  /** Aggregate points, where the school uses them. */
  points?: number | null;
}

/**
 * Where the formative mark comes from.
 *
 * 'computed' averages coursework scores out of 100 and weights them.
 *
 * 'entered' takes the mark the office typed, already out of caWeight — the
 * number a teacher wrote on a paper marksheet. Nabisunsa's report shows that
 * column holding 20, 18, 17, 14, 11, 10; one subject has 20 out of 20 beside
 * an exam of 46 out of 80. That is judgement, not arithmetic, and nobody at
 * the school could state a rule for it because there is not one.
 *
 * A system that computes that number owns it, and spends every term arguing
 * about arithmetic with the person whose judgement is the actual input. So
 * it can be an input.
 */
export type FormativeSource = 'computed' | 'entered';

/**
 * What an unsat exam means.
 *
 * 'excluded' leaves the result incomplete until the paper is sat — the
 * kinder reading, and the default.
 *
 * 'zero' scores it as nothing. Nabisunsa's report does this: French shows
 * formative 11, no exam, total 11, grade E. Neither is a bug; it is policy.
 */
export type MissingExamRule = 'excluded' | 'zero';

export interface GradingConfig {
  /** Coursework weight as a percentage. Must sum to 100 with eotWeight. */
  caWeight: number;
  /** End-of-term exam weight as a percentage. */
  eotWeight: number;
  /**
   * Average only the best N coursework scores. Nabisunsa uses 3.
   * null/undefined averages all of them.
   *
   * Ignored when formativeSource is 'entered': there is nothing to take the
   * best of, and dropping the office's lower entries would silently rewrite
   * a mark the school decided.
   */
  caBestOf?: number | null;
  formativeSource?: FormativeSource;
  missingExamRule?: MissingExamRule;
  scale: GradingScaleEntry[];
}

/** A single coursework score. `null` means recorded as absent. */
export type CourseworkScore = number | null;

export interface SubjectMarkInput {
  studentId: number;
  subjectId: number;
  /**
   * Coursework scores. Out of 100 when formativeSource is 'computed'; out of
   * caWeight when it is 'entered', because that is what the office typed.
   */
  coursework: CourseworkScore[];
  /** End-of-term exam, out of 100. `null` means the student did not sit it. */
  endOfTerm: number | null;
}

export type IncompleteReason = 'no-exam-score' | 'no-scores-at-all';

export interface SubjectResult {
  studentId: number;
  subjectId: number;
  /**
   * The formative mark. Out of 100 for a 'computed' school, out of caWeight
   * for an 'entered' one — `caOutOf` says which, so a report card can label
   * it rather than guess.
   */
  caScore: number | null;
  caOutOf: number;
  eotScore: number | null;
  /** Weighted total, or null when it cannot be computed. */
  finalScore: number | null;
  grade: string | null;
  points: number | null;
  /** Set when finalScore is null — tells the DoS what is missing. */
  incomplete: IncompleteReason | null;
}

export interface RankedSubjectResult extends SubjectResult {
  /**
   * Position within the ranked group, or null when the student has no
   * final score. Ties share a position and the next position skips
   * accordingly (1, 2, 2, 4) — standard competition ranking.
   */
  position: number | null;
}

export class GradingConfigError extends Error {}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Validates a school's grading configuration.
 *
 * Called before any computation because a misconfigured scale produces
 * plausible-looking wrong grades on every report card in the school, which
 * is far worse than refusing to compute.
 */
export function assertValidConfig(config: GradingConfig): void {
  const { caWeight, eotWeight, scale, caBestOf } = config;

  if (!Number.isFinite(caWeight) || !Number.isFinite(eotWeight)) {
    throw new GradingConfigError('Weights must be numbers');
  }
  if (caWeight < 0 || eotWeight < 0) {
    throw new GradingConfigError('Weights must not be negative');
  }
  if (caWeight + eotWeight !== 100) {
    throw new GradingConfigError(
      `Weights must sum to 100, got ${caWeight} + ${eotWeight} = ${caWeight + eotWeight}`,
    );
  }
  if (caBestOf != null && (!Number.isInteger(caBestOf) || caBestOf < 1)) {
    throw new GradingConfigError('caBestOf must be a positive whole number when set');
  }
  if (!scale || scale.length === 0) {
    throw new GradingConfigError('Grading scale is empty');
  }
  if (!scale.some((e) => e.minScore <= 0)) {
    throw new GradingConfigError(
      'Grading scale has no bottom grade — a score of 0 would have no grade',
    );
  }
  const seen = new Set<string>();
  for (const entry of scale) {
    if (seen.has(entry.grade)) {
      throw new GradingConfigError(`Grading scale repeats grade '${entry.grade}'`);
    }
    seen.add(entry.grade);
    if (!Number.isFinite(entry.minScore)) {
      throw new GradingConfigError(`Grade '${entry.grade}' has a non-numeric minScore`);
    }
  }
}

/**
 * Averages coursework, honouring the school's best-of-N rule.
 *
 * Absences are excluded rather than counted as zero: a student who missed a
 * test has not scored nothing, they have one fewer score. Counting absences
 * as zero would quietly punish illness.
 *
 * Returns null when nothing was recorded.
 */
export function averageCoursework(
  scores: CourseworkScore[],
  bestOf?: number | null,
): number | null {
  const present = scores.filter((s): s is number => s != null && Number.isFinite(s));
  if (present.length === 0) return null;

  // Take the best N, or everything when fewer than N were recorded.
  const considered =
    bestOf != null && bestOf < present.length
      ? [...present].sort((a, b) => b - a).slice(0, bestOf)
      : present;

  const sum = considered.reduce((acc, n) => acc + n, 0);
  return round2(sum / considered.length);
}

/**
 * Finds the grade for a score.
 *
 * Boundaries are inclusive lower bounds, matching the grading_scale table,
 * and the scale is sorted here rather than trusting the caller's order.
 */
export function gradeFor(
  score: number,
  scale: GradingScaleEntry[],
): GradingScaleEntry | null {
  const ordered = [...scale].sort((a, b) => b.minScore - a.minScore);
  return ordered.find((entry) => score >= entry.minScore) ?? null;
}

/**
 * Computes one student's result in one subject.
 *
 * A missing exam score yields null rather than a guess. Publishing a final
 * mark computed from coursework alone would misrepresent a student who has
 * not yet sat the paper that carries most of the weight.
 */
export function computeSubjectResult(
  input: SubjectMarkInput,
  config: GradingConfig,
): SubjectResult {
  assertValidConfig(config);

  const entered = config.formativeSource === 'entered';
  const caOutOf = entered ? config.caWeight : 100;

  // Best-of-N is a rule for picking among several coursework attempts. An
  // entered mark is one number the school decided, so there is nothing to
  // choose between and dropping anything would rewrite their decision.
  const caScore = averageCoursework(input.coursework, entered ? null : config.caBestOf);
  const eotScore =
    input.endOfTerm != null && Number.isFinite(input.endOfTerm) ? input.endOfTerm : null;

  const base: Omit<SubjectResult, 'finalScore' | 'grade' | 'points' | 'incomplete'> = {
    studentId: input.studentId,
    subjectId: input.subjectId,
    caScore,
    caOutOf,
    eotScore,
  };

  const zeroForMissingExam = config.missingExamRule === 'zero';

  if (eotScore == null && !zeroForMissingExam) {
    return {
      ...base,
      finalScore: null,
      grade: null,
      points: null,
      incomplete: caScore == null ? 'no-scores-at-all' : 'no-exam-score',
    };
  }

  // Nothing at all, under either rule: there is no mark to publish.
  if (eotScore == null && caScore == null) {
    return {
      ...base,
      finalScore: null,
      grade: null,
      points: null,
      incomplete: 'no-scores-at-all',
    };
  }

  // Both components are reduced to points out of their own weight, then
  // added. Keeping them in the same unit is what lets an entered mark (out
  // of 20) and an exam (out of 100) meet without one being silently
  // rescaled into the other's scale.
  const examPoints = ((eotScore ?? 0) * config.eotWeight) / 100;

  // Formative absent entirely: the exam carries the full result rather than
  // dragging the student down with a zero they never earned.
  const formativePoints =
    caScore != null
      ? entered
        ? caScore
        : (caScore * config.caWeight) / 100
      : ((eotScore ?? 0) * config.caWeight) / 100;

  const finalScore = round2(formativePoints + examPoints);
  const entry = gradeFor(finalScore, config.scale);

  return {
    ...base,
    finalScore,
    grade: entry?.grade ?? null,
    points: entry?.points ?? null,
    incomplete: null,
  };
}

/**
 * Ranks results within a group — normally one subject across one class.
 *
 * Students without a final score are returned with a null position rather
 * than being ranked last, because "not yet marked" is not the same as
 * "came bottom".
 */
export function rankResults(results: SubjectResult[]): RankedSubjectResult[] {
  const ranked = results
    .filter((r) => r.finalScore != null)
    .sort((a, b) => (b.finalScore as number) - (a.finalScore as number));

  const positionByStudent = new Map<number, number>();
  let lastScore: number | null = null;
  let lastPosition = 0;

  ranked.forEach((result, index) => {
    const score = result.finalScore as number;
    // Equal scores share a position; the next distinct score skips ahead.
    const position = score === lastScore ? lastPosition : index + 1;
    positionByStudent.set(result.studentId, position);
    lastScore = score;
    lastPosition = position;
  });

  return results.map((result) => ({
    ...result,
    position: positionByStudent.get(result.studentId) ?? null,
  }));
}
