import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { assistantApi, AssistantMessage } from '../api/assistant';

// Rendering the assistant's answer.
//
// The model is told markdown is rendered, and it uses three things: bold for
// names, short bullet lists, and blank lines. Rather than pull in a markdown
// library and a sanitiser for that, this builds React nodes directly — so
// there is no innerHTML anywhere and nothing a reply could contain can
// execute. Anything it writes that this does not understand simply shows as
// the literal text, which is the right failure.
function bold(text: string, keyBase: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={`${keyBase}-${i}`} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyBase}-${i}`}>{part}</span>
    ),
  );
}

function Answer({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (!bullets.length) return;
    out.push(
      <ul key={key} className="list-disc pl-5 space-y-1 my-1.5">
        {bullets.map((b, i) => <li key={i}>{bold(b, `${key}-${i}`)}</li>)}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flush(`ul-${i}`);
    if (line.trim()) out.push(<p key={`p-${i}`} className="my-1.5">{bold(line, `p-${i}`)}</p>);
  });
  flush('ul-end');

  return <div className="text-sm leading-relaxed text-gray-800">{out}</div>;
}

const SUGGESTIONS = [
  'What would an inspector pick up today?',
  'Whose training has lapsed?',
  'Which staff files are incomplete?',
  'What is still unassigned next week?',
];

export default function AssistantPanel() {
  const { pathname } = useLocation();
  // The dashboard carries the Notes rail down its right edge (w-80, lg and up,
  // office staff only — which is everyone who sees this panel). Sitting on top
  // of it would bury the "write an update" box, so step left of it there and
  // only there: 20rem of rail plus the same 1.25rem gap used everywhere else.
  const clearOfNotesRail = pathname === '/' ? 'lg:right-[21.25rem]' : '';

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery({
    queryKey: ['assistant-status'],
    queryFn: assistantApi.status,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, open]);

  if (!status?.configured) return null;

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next: AssistantMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setDraft('');
    setError(null);
    setBusy(true);
    try {
      const { reply } = await assistantApi.chat(next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Could not reach the assistant. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-5 ${clearOfNotesRail} z-40 rounded-full bg-blue-600 text-white shadow-lg h-14 w-14 flex items-center justify-center text-2xl hover:bg-blue-700 active:scale-95`}
        aria-label="Ask Caremid"
        title="Ask Caremid"
      >
        ✨
      </button>
    );
  }

  return (
    <div className={`fixed bottom-0 right-0 sm:bottom-5 sm:right-5 ${clearOfNotesRail} z-40 w-full sm:w-[420px] h-[80vh] sm:h-[600px] sm:max-h-[80vh] bg-white border border-gray-200 sm:rounded-2xl shadow-2xl flex flex-col`}>
      <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-700 text-white sm:rounded-t-2xl">
        <div>
          <p className="font-semibold text-sm">Ask Caremid</p>
          <p className="text-xs text-blue-100">Reads your data. Can't change anything.</p>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setError(null); }} className="text-xs text-blue-100 hover:text-white px-2 py-1">
              Clear
            </button>
          )}
          <button onClick={() => setOpen(false)} className="text-blue-100 hover:text-white text-xl leading-none px-2" aria-label="Close">×</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Ask about your staff, visits or compliance — in plain English.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full text-left text-sm rounded-lg border border-gray-200 px-3 py-2 text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <p className="bg-blue-600 text-white text-sm rounded-2xl rounded-br-sm px-3.5 py-2 max-w-[85%]">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <Answer text={m.content} />
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-gray-400 px-1">
            <span className="animate-spin h-3.5 w-3.5 border-b-2 border-gray-400 rounded-full" />
            Looking it up…
          </div>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(draft); }}
        className="border-t p-3 flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter for a new line — the convention
            // everywhere else people type a message.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); }
          }}
          rows={1}
          placeholder="Ask a question…"
          className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm max-h-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          className="btn-primary btn shrink-0 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
