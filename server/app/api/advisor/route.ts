import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  apiSession,
  authorisedChild,
  badRequest,
  isServable,
  notFound,
  schoolState,
  suspended,
  unauthorized,
} from '../../../lib/api';
import { getStudentTermResults } from '../../../lib/results';
import { currentTerm } from '../../../lib/marksheets';
import { buildAdvisorPrompt, takeToken } from '../../../lib/advisor';

export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_MESSAGE = 2000;
const MAX_HISTORY = 20;

interface Turn {
  role: 'user' | 'model';
  text: string;
}

/**
 * The academic advisor.
 *
 * WHY THIS IS ON THE SERVER
 * -------------------------
 * The app used to call Gemini directly with EXPO_PUBLIC_GEMINI_API_KEY, which
 * ships inside the APK and can be extracted by anyone who downloads it. That
 * is someone else's bill and someone else's quota.
 *
 * Moving it here fixes a second problem that matters more for the product:
 * the system prompt is now built on the server from the student's OWN
 * released results. The app cannot state who it is, what marks it has, or
 * what the advisor should pretend to be — it can only send a question.
 */
export async function POST(request: NextRequest) {
  const context = apiSession(request);
  if (!context) return unauthorized();

  // Validate the request before anything else. It costs nothing, and a
  // malformed question should be told what is wrong with it rather than
  // hearing that the feature is unconfigured.
  let body: { message?: string; history?: Turn[]; studentId?: number };
  try {
    body = await request.json();
  } catch {
    return badRequest('Expected a JSON body');
  }

  const message = (body.message ?? '').trim();
  if (!message) return badRequest('A question is required');
  if (message.length > MAX_MESSAGE) {
    return badRequest(`Please keep the question under ${MAX_MESSAGE} characters`);
  }

  const state = await schoolState(context);
  if (!isServable(state)) return suspended(state.suspendedReason);

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'The academic advisor is not configured for this school yet.' },
      { status: 503 },
    );
  }

  // Rate limit per account. The key is ours now, so a runaway client or a
  // bored student is our bill rather than theirs.
  if (!takeToken(context.session.userId)) {
    return NextResponse.json(
      { error: 'That is a lot of questions at once. Please wait a moment and try again.' },
      { status: 429 },
    );
  }

  const child = await authorisedChild(context, body.studentId ?? null);
  if (!child) return notFound('No such student');

  const term = await currentTerm(context.db);
  const results = term ? await getStudentTermResults(context.db, child.id, term.id) : [];

  // Built here, from the database — never accepted from the client.
  const systemPrompt = buildAdvisorPrompt({
    firstName: child.firstName,
    className: child.className,
    level: child.level,
    termName: term?.name ?? null,
    results: results.map((r) => ({
      subject: r.subjectName,
      score: r.finalScore == null ? null : Number(r.finalScore),
      grade: r.grade,
    })),
  });

  // History is the conversation only. Roles are forced to the two Gemini
  // accepts, so a crafted payload cannot smuggle in a system turn.
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-MAX_HISTORY)
    .filter((turn) => typeof turn?.text === 'string' && turn.text.trim())
    .map((turn) => ({
      role: turn.role === 'model' ? ('model' as const) : ('user' as const),
      parts: [{ text: String(turn.text).slice(0, MAX_MESSAGE) }],
    }));

  // Gemini requires the history to begin with a user turn.
  while (history.length && history[0].role !== 'user') history.shift();

  try {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({
      model: MODEL,
      systemInstruction: systemPrompt,
    });
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(message);
    const reply = result.response.text();

    return NextResponse.json({ reply });
  } catch (error) {
    // Never surface the provider's message: it can carry key or quota detail.
    console.error('advisor error', error);
    return NextResponse.json(
      { error: 'The advisor is unavailable at the moment. Please try again shortly.' },
      { status: 502 },
    );
  }
}
