/**
 * The Director of Studies marksheet workflow.
 *
 * A marksheet is one paper sheet handed in by a teacher: one class, one
 * stream, one subject, one assessment. It moves through four states:
 *
 *   draft -> entered -> verified -> published
 *
 * The proposal tells schools, in writing, that "nothing is visible to any
 * parent until the school releases it". That promise lives here: a
 * marksheet is only visible to parents in the `published` state, and
 * reaching it requires someone to have verified the entry first.
 *
 * Pure state logic, no database — so the rules can be tested exhaustively
 * without a server.
 */

export type MarksheetStatus = 'draft' | 'entered' | 'verified' | 'published';

export type MarksheetAction = 'enter' | 'verify' | 'publish' | 'unpublish' | 'reopen';

/**
 * Roles permitted to move a marksheet along. Teachers appear nowhere.
 *
 * The Director of Studies runs an office with several staff, so `dos_staff`
 * covers the people who actually transcribe the paper marksheets. They can
 * enter and correct, but not verify or publish: the clerk who types a mark
 * is not the person who should decide it goes out to every parent in the
 * school. Release authority stays with the DoS, who is accountable for it.
 */
export type ActorRole =
  | 'school_admin'
  | 'dos'
  | 'dos_staff'
  | 'teacher'
  | 'student_parent';

export interface MarksheetState {
  status: MarksheetStatus;
  /** Number of students on the class list for this sheet. */
  expectedStudents: number;
  /** Number of marks recorded, including explicit absences. */
  recordedMarks: number;
  enteredBy?: number | null;
  verifiedBy?: number | null;
}

export interface TransitionRequest {
  action: MarksheetAction;
  actorId: number;
  actorRole: ActorRole;
}

export interface TransitionResult {
  allowed: boolean;
  nextStatus?: MarksheetStatus;
  /** Why it was refused — shown to the DoS, so it must be plain English. */
  reason?: string;
}

const TRANSITIONS: Record<MarksheetAction, { from: MarksheetStatus[]; to: MarksheetStatus }> = {
  enter:     { from: ['draft'],              to: 'entered' },
  verify:    { from: ['entered'],            to: 'verified' },
  publish:   { from: ['verified'],           to: 'published' },
  unpublish: { from: ['published'],          to: 'verified' },
  reopen:    { from: ['entered', 'verified'], to: 'draft' },
};

/** Only these roles may act on a marksheet at all. */
const PERMITTED: Record<MarksheetAction, ActorRole[]> = {
  // Office staff do the transcription.
  enter:     ['dos_staff', 'dos', 'school_admin'],
  reopen:    ['dos_staff', 'dos', 'school_admin'],
  // Signing off and releasing to parents stays with the DoS.
  verify:    ['dos', 'school_admin'],
  publish:   ['dos', 'school_admin'],
  unpublish: ['dos', 'school_admin'],
};

/**
 * Decides whether a requested transition may proceed.
 *
 * Two rules carry most of the weight:
 *
 *  - A sheet cannot be verified by whoever entered it. Marks are transcribed
 *    from paper by hand, and a second pair of eyes is the only thing standing
 *    between a typo and a parent seeing the wrong mark for their child.
 *  - A sheet cannot leave `draft` while students are missing marks, because a
 *    half-entered sheet that reaches parents looks like the school lost the
 *    rest.
 */
export function evaluateTransition(
  state: MarksheetState,
  request: TransitionRequest,
): TransitionResult {
  const rule = TRANSITIONS[request.action];
  if (!rule) {
    return { allowed: false, reason: `Unknown action '${request.action}'` };
  }

  if (!PERMITTED[request.action].includes(request.actorRole)) {
    if (request.actorRole === 'teacher') {
      return {
        allowed: false,
        reason:
          'Teachers do not use this system. Marksheets are submitted on paper and processed by the Director of Studies office.',
      };
    }
    if (request.actorRole === 'dos_staff') {
      return {
        allowed: false,
        reason: `Only the Director of Studies can ${request.action} a marksheet. Office staff enter and correct marks; releasing them to parents is the DoS's decision.`,
      };
    }
    return {
      allowed: false,
      reason: `This role cannot ${request.action} marksheets.`,
    };
  }

  if (!rule.from.includes(state.status)) {
    return {
      allowed: false,
      reason: `Cannot ${request.action} a marksheet that is ${state.status}.`,
    };
  }

  if (request.action === 'enter') {
    if (state.recordedMarks < state.expectedStudents) {
      const missing = state.expectedStudents - state.recordedMarks;
      return {
        allowed: false,
        reason: `${missing} of ${state.expectedStudents} students have no mark yet. Record a score or mark them absent.`,
      };
    }
  }

  if (request.action === 'verify') {
    if (state.enteredBy != null && state.enteredBy === request.actorId) {
      return {
        allowed: false,
        reason: 'A marksheet must be verified by someone other than the person who entered it.',
      };
    }
  }

  return { allowed: true, nextStatus: rule.to };
}

/** Whether a parent or student may see this sheet's marks. */
export function isVisibleToParents(state: Pick<MarksheetState, 'status'>): boolean {
  return state.status === 'published';
}

/**
 * Summarises a term's progress for the DoS dashboard: how many sheets are
 * outstanding, and how far through the process the term is.
 */
export interface TermProgress {
  total: number;
  draft: number;
  entered: number;
  verified: number;
  published: number;
  /** Percentage of sheets fully published, 0-100. */
  percentPublished: number;
}

export function summariseTerm(sheets: Pick<MarksheetState, 'status'>[]): TermProgress {
  const counts: Record<MarksheetStatus, number> = {
    draft: 0, entered: 0, verified: 0, published: 0,
  };
  for (const sheet of sheets) counts[sheet.status] += 1;

  const total = sheets.length;
  return {
    total,
    ...counts,
    percentPublished: total === 0 ? 0 : Math.round((counts.published / total) * 100),
  };
}
