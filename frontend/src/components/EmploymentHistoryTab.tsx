import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { User } from '../types';
import SignatureField from './SignatureField';
import AutoGrowTextarea from './AutoGrowTextarea';
import { useFormDraft } from '../lib/useFormDraft';
import DraftSavedHint from './DraftSavedHint';
import {
  EmploymentEntry,
  EmploymentHistory,
  GapExplanation,
  emptyEmploymentHistory,
  findGaps,
  formatMonth,
  overseasStays,
  unexplainedGaps,
} from '../lib/employmentHistory';

/**
 * The Employment Gap History Form, shortened.
 *
 * The paper version opens with the applicant's name, date of birth, address,
 * phone, email and the post applied for, and closes with an office section
 * asking whether a DBS check and references are needed. None of that is typed
 * here: it is already on the staff record and on the Compliance tab, and
 * asking twice is how two different answers end up on file.
 *
 * What is left is the part only the applicant knows - where they worked, and
 * what they were doing the rest of the time.
 */

const blankEntry = (): EmploymentEntry => ({ employer: '', jobTitle: '', from: '', to: '', reason: '', country: '' });

export default function EmploymentHistoryTab({
  userId,
  isManager,
  initial,
}: {
  userId: string;
  isManager: boolean;
  initial: User;
}) {
  const qc = useQueryClient();
  const ro = !isManager;

  const saved = (initial.employmentHistory as EmploymentHistory | null) || null;
  // A draft written before the last save is somebody's abandoned keystroke,
  // not work in progress — see useFormDraft.
  const draft = useFormDraft<EmploymentHistory>(`employment:${userId}`, !ro, saved?.updatedAt ?? null);
  const [form, setForm] = useState<EmploymentHistory>(() => ({
    ...emptyEmploymentHistory(),
    ...((initial.employmentHistory as EmploymentHistory | null) || {}),
    ...(draft.restored ?? {}),
  }));
  const [discarded, setDiscarded] = useState(false);

  const update = (next: EmploymentHistory) => {
    setForm(next);
    if (!ro) draft.keep(next);
  };
  const set = <K extends keyof EmploymentHistory>(key: K, val: EmploymentHistory[K]) =>
    update({ ...form, [key]: val });

  const setEntry = (i: number, patch: Partial<EmploymentEntry>) =>
    update({ ...form, entries: form.entries.map((e, n) => (n === i ? { ...e, ...patch } : e)) });

  const setGap = (key: string, patch: Partial<GapExplanation>) => {
    const current: GapExplanation = form.gaps[key] || { reason: '', activity: '' };
    update({ ...form, gaps: { ...form.gaps, [key]: { ...current, ...patch } } });
  };

  const gaps = useMemo(() => findGaps(form), [form]);
  const missing = useMemo(() => unexplainedGaps(form), [form]);
  // Six months or more in one country, derived from the jobs and the gaps.
  const overseas = useMemo(() => overseasStays(form), [form]);

  const saveMut = useMutation({
    mutationFn: () =>
      usersApi.update(userId, { employmentHistory: { ...form, updatedAt: new Date().toISOString() } }),
    onSuccess: () => {
      draft.clear();
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', userId] });
    },
  });

  const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`;

  return (
    <div className="space-y-5">
      {draft.restored && !discarded && draft.restoredAt && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex flex-wrap items-center gap-2 text-sm text-blue-900">
          <span>Picked up where you left off — unsaved from {draft.restoredAt.toLocaleString('en-GB')}.</span>
          <div className="flex-1" />
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={() => {
              draft.clear();
              setDiscarded(true);
              setForm({
                ...emptyEmploymentHistory(),
                ...((initial.employmentHistory as EmploymentHistory | null) || {}),
              });
            }}
          >
            Start again
          </button>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-gray-900">Employment history</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Every job since leaving full-time education, including self-employment. The gaps between them are worked
          out below — there is no second list to fill in.
        </p>
      </div>

      <div className="max-w-xs">
        <label className="label">Left full-time education</label>
        {ro ? (
          <p className="text-sm text-gray-800">{form.educationEndedAt ? formatMonth(form.educationEndedAt) : '—'}</p>
        ) : (
          <input
            type="month"
            className="input"
            value={form.educationEndedAt || ''}
            onChange={(e) => set('educationEndedAt', e.target.value)}
          />
        )}
        <p className="mt-1 text-xs text-gray-500">Where the timeline starts, so a gap before the first job shows up.</p>
      </div>

      <div className="space-y-3">
        {form.entries.map((e, i) => (
          <div key={i} className="rounded-xl border border-gray-200 p-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Employer</label>
                {ro ? (
                  <p className="text-sm text-gray-800">{e.employer || '—'}</p>
                ) : (
                  <input
                    className="input"
                    value={e.employer}
                    onChange={(ev) => setEntry(i, { employer: ev.target.value })}
                    placeholder="Name and address"
                  />
                )}
              </div>
              <div>
                <label className="label">Job title</label>
                {ro ? (
                  <p className="text-sm text-gray-800">{e.jobTitle || '—'}</p>
                ) : (
                  <input
                    className="input"
                    value={e.jobTitle}
                    onChange={(ev) => setEntry(i, { jobTitle: ev.target.value })}
                  />
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">From</label>
                {ro ? (
                  <p className="text-sm text-gray-800">{e.from ? formatMonth(e.from) : '—'}</p>
                ) : (
                  <input
                    type="month"
                    className="input"
                    value={e.from}
                    onChange={(ev) => setEntry(i, { from: ev.target.value })}
                  />
                )}
              </div>
              <div>
                <label className="label">To</label>
                {ro ? (
                  <p className="text-sm text-gray-800">{e.to ? formatMonth(e.to) : 'Still there'}</p>
                ) : (
                  <>
                    <input
                      type="month"
                      className="input"
                      value={e.to}
                      onChange={(ev) => setEntry(i, { to: ev.target.value })}
                    />
                    <p className="mt-1 text-xs text-gray-500">Leave blank if still there.</p>
                  </>
                )}
              </div>
              <div>
                <label className="label">Reason for leaving</label>
                {ro ? (
                  <p className="text-sm text-gray-800">{e.reason || '—'}</p>
                ) : (
                  <input
                    className="input"
                    value={e.reason}
                    onChange={(ev) => setEntry(i, { reason: ev.target.value })}
                  />
                )}
              </div>
              <div>
                <label className="label">Country</label>
                {ro ? (
                  <p className="text-sm text-gray-800">{e.country?.trim() || 'United Kingdom'}</p>
                ) : (
                  <>
                    <input
                      className="input"
                      value={e.country || ''}
                      onChange={(ev) => setEntry(i, { country: ev.target.value })}
                      placeholder="United Kingdom"
                    />
                    <p className="mt-1 text-xs text-gray-500">Leave blank for the UK.</p>
                  </>
                )}
              </div>
            </div>
            {!ro && (
              <div className="flex">
                <div className="flex-1" />
                <button
                  type="button"
                  className="text-xs text-gray-400 hover:text-red-600"
                  onClick={() => update({ ...form, entries: form.entries.filter((_, n) => n !== i) })}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
        {form.entries.length === 0 && <p className="text-sm text-gray-400">No employment recorded yet.</p>}
        {!ro && (
          <button
            type="button"
            className="btn-secondary btn btn-sm"
            onClick={() => update({ ...form, entries: [...form.entries, blankEntry()] })}
          >
            Add a job
          </button>
        )}
      </div>

      <div className="border-t pt-4 space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">Gaps</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Worked out from the dates above. Each one needs a reason — unemployment, study, travel, caring, illness,
            parental leave, running a household.
          </p>
        </div>

        {gaps.length === 0 ? (
          <p className="text-sm text-gray-500">
            {form.entries.length === 0
              ? 'Add the employment above and any gaps will appear here.'
              : 'No gaps — the dates above cover the whole period.'}
          </p>
        ) : (
          gaps.map((g) => {
            const said = form.gaps[g.key] || { reason: '', activity: '' };
            const blank = !said.reason.trim();
            return (
              <div
                key={g.key}
                className={`rounded-xl border p-3 space-y-3 ${blank ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
              >
                <p className="text-sm font-medium text-gray-900">
                  {formatMonth(g.from)} – {formatMonth(g.to)}{' '}
                  <span className="font-normal text-gray-500">· {months(g.months)}</span>
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label">Reason</label>
                    {ro ? (
                      <p className="text-sm text-gray-800">{said.reason || '—'}</p>
                    ) : (
                      <input
                        className="input"
                        value={said.reason}
                        onChange={(ev) => setGap(g.key, { reason: ev.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <label className="label">What they were doing</label>
                    {ro ? (
                      <p className="text-sm text-gray-800">{said.activity || '—'}</p>
                    ) : (
                      <input
                        className="input"
                        value={said.activity}
                        onChange={(ev) => setGap(g.key, { activity: ev.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <label className="label">Country</label>
                    {ro ? (
                      <p className="text-sm text-gray-800">{said.country?.trim() || 'United Kingdom'}</p>
                    ) : (
                      <>
                        <input
                          className="input"
                          value={said.country || ''}
                          onChange={(ev) => setGap(g.key, { country: ev.target.value })}
                          placeholder="United Kingdom"
                        />
                        <p className="mt-1 text-xs text-gray-500">Leave blank for the UK.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {missing.length > 0 && (
          <p className="text-sm text-amber-800">
            <strong>{missing.length}</strong> gap{missing.length === 1 ? '' : 's'} still need a reason.
          </p>
        )}
      </div>

      {/* Not a question - an answer, read off the dates above. Six months in a
          country is the point at which that country's police check belongs on
          the file, and nobody should have to add the months up by hand. */}
      {overseas.length > 0 && (
        <div className="border-t pt-4 space-y-3">
          <div>
            <h3 className="font-semibold text-gray-900">Time spent outside the UK</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Worked out from the countries above. Six months or more in one country means a police check or
              certificate of good conduct from that country belongs on the file, alongside the DBS.
            </p>
          </div>
          <ul className="space-y-2 list-none p-0 m-0">
            {overseas.map((o) => (
              <li
                key={o.country}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3"
              >
                <span className="text-sm font-medium text-gray-900">{o.country}</span>
                <span className="text-sm text-gray-700">
                  {months(o.months)} &middot; {o.worked ? 'employed there' : 'not employed, accounted for in a gap'}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">
            Upload each one on the Documents tab as "Overseas Police Check".
          </p>
        </div>
      )}

      <div className="border-t pt-4 space-y-3">
        <h3 className="font-semibold text-gray-900">Declaration</h3>
        <p className="text-sm text-gray-600">
          I confirm the above is true and complete to the best of my knowledge. I understand that false or misleading
          information may mean my application is rejected or, if employed, disciplinary action up to and including
          dismissal. I consent to references being sought and to my employment history being verified.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Printed name</label>
            {ro ? (
              <p className="text-sm text-gray-800">{form.signedName || '—'}</p>
            ) : (
              <input className="input" value={form.signedName || ''} onChange={(e) => set('signedName', e.target.value)} />
            )}
          </div>
          <div>
            <label className="label">Date</label>
            {ro ? (
              <p className="text-sm text-gray-800">{form.signedDate || '—'}</p>
            ) : (
              <input
                type="date"
                className="input"
                value={form.signedDate || ''}
                onChange={(e) => set('signedDate', e.target.value)}
              />
            )}
          </div>
        </div>
        <div>
          <label className="label">Signature</label>
          <SignatureField value={form.signature || ''} ro={ro} onChange={(val) => set('signature', val)} />
        </div>
      </div>

      {isManager && (
        <div className="border-t pt-4 space-y-3">
          <h3 className="font-semibold text-gray-900">Office use</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Received by</label>
              <input className="input" value={form.receivedBy || ''} onChange={(e) => set('receivedBy', e.target.value)} />
            </div>
            <div>
              <label className="label">Date received</label>
              <input
                type="date"
                className="input"
                value={form.receivedAt || ''}
                onChange={(e) => set('receivedAt', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <AutoGrowTextarea
              value={form.notes || ''}
              minRows={2}
              className="input text-sm"
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
          <p className="text-xs text-gray-500">
            Whether a DBS check and references are needed is on the Compliance tab, which already tracks both.
          </p>
        </div>
      )}

      {!ro && (
        <div className="flex items-center gap-2 border-t pt-4">
          {saveMut.isSuccess && <span className="text-sm text-green-600">Saved ✓</span>}
          {saveMut.isError && <span className="text-sm text-red-600">That did not save. Please try again.</span>}
          {!saveMut.isSuccess && <DraftSavedHint at={draft.savedAt} />}
          <div className="flex-1" />
          <button className="btn-primary btn" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
