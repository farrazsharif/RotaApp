/**
 * The in-app assistant: a manager asks a question in plain English, Claude
 * answers it by reading this company's own data through the tools in
 * lib/assistantTools.
 *
 * The agent loop runs here rather than in the browser so the tools execute
 * inside the caller's tenant context and permissions. Nothing about scoping is
 * left to the model: it can only call four read-only tools, each of which
 * re-checks what this user is allowed to see.
 */
import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { TOOLS, runAssistantTool } from '../lib/assistantTools';

const MODEL = 'claude-opus-5';
const MAX_TOOL_ROUNDS = 8; // a question needing more than this is a runaway
const MAX_HISTORY = 30; // turns kept from the client, oldest dropped
const MAX_MESSAGES_PER_HOUR = 60; // per user: a cost guard, not a security one

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

function systemPrompt(user: { firstName?: string }, today: string): string {
  return [
    'You are the assistant inside Caremid, the care-management system used by a UK care provider.',
    `You are speaking to ${user.firstName || 'a manager'}. Today is ${today}.`,
    '',
    'You answer questions about their own company by calling the tools available to you. The tools',
    'already enforce what this person is allowed to see, so call them freely — but if one returns a',
    '"Not permitted" message, tell the user plainly that their role does not cover it rather than',
    'guessing at an answer.',
    '',
    'How to answer:',
    '- Lead with the answer. "Four carers have training that has already lapsed" — then the names.',
    '  Never narrate which tool you called.',
    '- Give numbers with their denominator. "7 of 23 staff files are incomplete", not "several".',
    '- Name names. This is an internal tool for the people responsible for these records.',
    '- Separate urgent from untidy. A lapsed visa or an unstaffed visit tomorrow matters more than a',
    '  missing emergency contact. Lead with what stops someone working or puts a client at risk.',
    '',
    'Being careful:',
    '- Report what the data says, not what you infer. A missing date is "not recorded" — never',
    '  "expired" and never "valid". A blank field means nobody has checked, which is worth saying.',
    '- A DBS certificate has no expiry date. It is a snapshot of its issue date, and any renewal',
    '  period is the company\'s own policy. Never present a calculated DBS expiry as a fact.',
    '- If a tool errors, say so and what it said. Do not fall back on a partial answer that reads',
    '  like a complete one — an incomplete compliance picture gets acted on as if it were whole.',
    '- Write dates as 14 Mar 2026. Never MM/DD.',
    '',
    'You can only read. You cannot change anything in Caremid, assign a carer, send a message or',
    'upload a document. If asked to do something, say what you found and leave the doing to them.',
    '',
    'Keep answers short unless asked for detail. Markdown is rendered, so use short lists and bold',
    'for names. No preamble, no "Let me check" — just the answer.',
  ].join('\n');
}

const seen = new Map<string, { count: number; resetAt: number }>();
function overLimit(userId: string): boolean {
  const now = Date.now();
  const row = seen.get(userId);
  if (!row || now > row.resetAt) {
    seen.set(userId, { count: 1, resetAt: now + 3_600_000 });
    return false;
  }
  row.count += 1;
  return row.count > MAX_MESSAGES_PER_HOUR;
}

// Refusal fallbacks route around a safety-classifier decline instead of
// handing a manager an empty answer. The beta needs the organisation to be
// enrolled, though, and if it is not every request would 400 - which would
// look like "the assistant is broken" rather than "one optional extra is off".
// So: try with it, and if the enrolment is missing, drop it for the life of
// the process and carry on without.
let fallbacksAvailable = true;

async function ask(params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, 'betas' | 'fallbacks'>) {
  if (fallbacksAvailable) {
    try {
      return await client!.beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (e) {
      if (!(e instanceof Anthropic.BetaOrganizationNotEnrolledInBetaError)) throw e;
      console.warn('[assistant] refusal fallbacks unavailable on this account - continuing without them.');
      fallbacksAvailable = false;
    }
  }
  return client!.beta.messages.create(params);
}

interface ClientMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function assistantChat(req: AuthRequest, res: Response) {
  if (!client) {
    return res.status(503).json({
      error: 'The assistant is not set up yet. Add ANTHROPIC_API_KEY to the server environment to enable it.',
      code: 'ASSISTANT_NOT_CONFIGURED',
    });
  }
  if (overLimit(req.user!.id)) {
    return res.status(429).json({ error: 'That is a lot of questions in one hour. Try again shortly.' });
  }

  const incoming = (req.body as { messages?: ClientMessage[] }).messages;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ error: 'messages is required' });
  }

  const messages: Anthropic.MessageParam[] = incoming
    .slice(-MAX_HISTORY)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'The last message must be from the user.' });
  }

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const system = systemPrompt({ firstName: req.user!.email.split('@')[0] }, today);

  try {
    let rounds = 0;
    const toolsUsed: string[] = [];

    while (rounds <= MAX_TOOL_ROUNDS) {
      const response = await ask({
        model: MODEL,
        max_tokens: 16000,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === 'refusal') {
        return res.json({
          reply: 'I was not able to answer that one. Try rephrasing it, or ask something more specific about your staff, visits or compliance.',
          toolsUsed,
        });
      }

      // TS infers the narrowing from the discriminant, so no hand-written predicate.
      const toolUses = response.content.filter((b) => b.type === 'tool_use');

      if (toolUses.length === 0) {
        const text = response.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return res.json({ reply: text || 'I could not find an answer to that.', toolsUsed });
      }

      messages.push({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] });

      // All results go back in ONE user message: splitting them trains the
      // model out of making parallel calls.
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of toolUses) {
        toolsUsed.push(call.name);
        try {
          const out = await runAssistantTool(req, call.name, (call.input || {}) as Record<string, unknown>);
          results.push({ type: 'tool_result', tool_use_id: call.id, content: out });
        } catch (e) {
          // Handed back as a tool error so the model can tell the user what
          // failed, rather than collapsing the whole turn.
          console.error(`[assistant] tool ${call.name} failed:`, e);
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: true,
            content: `That lookup failed: ${(e as Error).message}`,
          });
        }
      }
      messages.push({ role: 'user', content: results });
      rounds += 1;
    }

    return res.json({
      reply: 'I went round in circles on that one without reaching an answer. Try asking it more narrowly.',
      toolsUsed,
    });
  } catch (e) {
    console.error('[assistant] request failed:', e);
    if (e instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'The assistant is busy right now. Try again in a moment.' });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: 'The assistant could not authenticate. Check ANTHROPIC_API_KEY on the server.' });
    }
    return res.status(502).json({ error: 'The assistant could not answer that. Please try again.' });
  }
}

export function assistantStatus(_req: AuthRequest, res: Response) {
  res.json({ configured: !!client });
}
