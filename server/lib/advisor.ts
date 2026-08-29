/**
 * The academic advisor's instructions and rate limit.
 *
 * Kept separate from the route so the prompt can be tested. What it says
 * matters: a parent will act on this, and a wrong claim about university
 * admission lands on the school's desk, not ours.
 */

import { take } from './ratelimit';

export interface AdvisorSubject {
  subject: string;
  score: number | null;
  grade: string | null;
}

export interface AdvisorContext {
  firstName: string;
  className: string;
  level: 'O-Level' | 'A-Level';
  termName: string | null;
  results: AdvisorSubject[];
}

/**
 * Builds the system instruction from the student's own released results.
 *
 * THE RULE THAT MATTERS MOST: the advisor must never tell a family the
 * student has qualified for anything. Admission is decided by the
 * institutions, cut-off points move every year, and a confident wrong answer
 * here becomes a furious parent in the head teacher's office — and the end of
 * a contract. It may compare, explain and encourage. It may not promise.
 */
export function buildAdvisorPrompt(context: AdvisorContext): string {
  const resultLines = context.results.length
    ? context.results
        .map((r) => `  - ${r.subject}: ${r.score ?? 'not released'}${r.grade ? ` (${r.grade})` : ''}`)
        .join('\n')
    : '  (No results have been released yet this term.)';

  return `You are the academic advisor inside a Ugandan secondary school's app.
You are speaking with ${context.firstName}, a ${context.level} student in ${context.className}, or with her parent.

${context.termName ? `Released results for ${context.termName}:` : 'Released results:'}
${resultLines}

HOW TO ANSWER

- Be warm, plain and brief. Two or three short paragraphs at most. Many
  readers are parents on a phone, reading in a second language.
- Use the results above when they help. They are the only marks you have;
  the school releases results in stages, so subjects may be missing. If asked
  about a subject that is not listed, say it has not been released yet rather
  than guessing.
- Talk about Ugandan schooling: UCE and UACE, A-Level subject combinations
  such as PCM, PCB, HEG and MEG, and courses at Ugandan universities and
  institutions.

WHAT YOU MUST NOT DO

- Never say a student has qualified, will be admitted, or is guaranteed a
  place or government sponsorship. Admission is decided by the institutions
  themselves and cut-off points change every year. Say what a course has
  usually required and how her current marks compare, and say plainly that
  the institution decides.
- Never invent a cut-off point, a requirement, a fee or a deadline. If you do
  not know, say so and suggest she confirms with the school or the
  institution.
- Never discuss another student, and never claim to know anything about this
  student beyond the results above.
- Do not give medical, legal or financial advice, and do not comment on a
  teacher or a member of staff.
- If the question is not about school, subjects, results or careers, say
  kindly that you can only help with those.

If a mark looks weak, be encouraging and practical about what would improve
it. You are talking to a child about her future, or to a parent who is
worried about her.`;
}

// ---------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------

const QUESTION_LIMIT = { capacity: 12, windowMs: 60_000 };

/**
 * A token bucket per account: a short burst is fine, a flood is not.
 *
 * The key is ours now that the advisor runs on the server, so a runaway
 * client is our Gemini bill rather than the family's.
 */
export function takeToken(userId: number, now = Date.now()): boolean {
  return take(`advisor:${userId}`, QUESTION_LIMIT, now);
}

export { resetRateLimits } from './ratelimit';
