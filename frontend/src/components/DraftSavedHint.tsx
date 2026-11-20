import { format } from 'date-fns';

/**
 * "Draft saved 14:32" next to the Save button.
 *
 * The draft itself has worked since the forms got it, but it only ever spoke
 * up on the way back in - "picked up where you left off". Which meant that
 * while somebody was typing, nothing on screen said the work was safe, and a
 * feature nobody can see is one they assume is missing.
 *
 * Deliberately quiet: small, grey, and absent until the first save actually
 * lands. A form that shouts "SAVED" at every keystroke reads as more anxious,
 * not less.
 */
export default function DraftSavedHint({ at }: { at: Date | null }) {
  if (!at) return null;
  return (
    <span className="text-xs text-gray-400" title="Kept in this browser until you save. Not yet on the server.">
      Draft saved {format(at, 'HH:mm')}
    </span>
  );
}
