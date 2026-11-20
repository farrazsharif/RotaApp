import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewsApi } from '../api/reviews';
import { serviceUsersApi } from '../api/serviceUsers';
import { useAuth } from '../contexts/AuthContext';
import { Review, ReviewType, ServiceUser } from '../types';
import { format, addWeeks } from 'date-fns';
import ReviewFormModal from '../components/ReviewFormModal';
import Icon from '../components/Icon';
import PaperSeedModal from '../components/PaperSeedModal';
import SearchableSelect from '../components/SearchableSelect';

export default function Reviews({ embedded = false }: { embedded?: boolean }) {
  const { isManager, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [newForUserId, setNewForUserId] = useState('');
  const [newType, setNewType] = useState<ReviewType>('SIX_WEEK');
  const [modal, setModal] = useState<{ serviceUserId: string; serviceUserName: string; reviewType: ReviewType; editReview: Review | null; locked?: boolean } | null>(null);
  const [paperFor, setPaperFor] = useState<{ serviceUserId: string; serviceUserName: string } | null>(null);
  // Which clients have their earlier reviews showing.
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: reviews = [], isLoading } = useQuery({ queryKey: ['reviews'], queryFn: () => reviewsApi.list() });
  const { data: serviceUsers = [] } = useQuery({
    queryKey: ['service-users', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => reviewsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reviews'] }); setConfirmDelete(null); },
  });

  const term = search.trim().toLowerCase();

  const isOverdue = (r: Review) => !!r.nextReviewDate && new Date(r.nextReviewDate) < new Date();

  // The review schedule starts from the care start date: the first (6-week)
  // review falls 6 weeks after service start, and every review thereafter carries
  // its own 3-monthly next-review date. So a client's due date is their latest
  // review's next date, or — when they have no review yet — 6 weeks from their
  // service start. This is what reminds the supervisor to book the first review.
  const firstReviewDue = (su: ServiceUser): Date | null =>
    su.serviceStartDate ? addWeeks(new Date(su.serviceStartDate), 6) : null;
  const rowDueDate = (su: ServiceUser, review: Review | null): Date | null =>
    review ? (review.nextReviewDate ? new Date(review.nextReviewDate) : null) : firstReviewDue(su);
  // A paused package: in hospital, or on hold. A service review is a
  // conversation about care being delivered, so it cannot be held while
  // nobody is delivering any - and showing it in red says the office has
  // failed to do something it could not do. The row stays on the list with
  // the reason on it, so nobody is quietly dropped, and the due date is
  // untouched: the day they come back it reads overdue again.
  const servicePaused = (su: ServiceUser) => su.status === 'HOSPITALISED' || su.status === 'ON_HOLD';
  const rowOverdue = (su: ServiceUser, review: Review | null): boolean => {
    if (servicePaused(su)) return false;
    const d = rowDueDate(su, review);
    return !!d && d < new Date();
  };
  // Only the most recent review per service user determines whether their
  // next review is overdue — older reviews' due dates have been superseded.
  const latestPerUser = new Map<string, Review>();
  for (const r of reviews) {
    const existing = latestPerUser.get(r.serviceUserId);
    const later = !existing
      || new Date(r.reviewDate) > new Date(existing.reviewDate)
      // Same-day reviews: fall back to creation order
      || (r.reviewDate === existing.reviewDate && new Date(r.createdAt) > new Date(existing.createdAt));
    if (later) latestPerUser.set(r.serviceUserId, r);
  }

  // All of a client's reviews, newest first — powers the per-row "Past reviews"
  // dropdown. Only the latest is editable; older ones open locked (read-only).
  const reviewsByUser = new Map<string, Review[]>();
  for (const r of reviews) {
    const arr = reviewsByUser.get(r.serviceUserId) ?? [];
    arr.push(r);
    reviewsByUser.set(r.serviceUserId, arr);
  }
  for (const arr of reviewsByUser.values()) {
    arr.sort((a, b) => new Date(b.reviewDate).getTime() - new Date(a.reviewDate).getTime());
  }

  // One row per ACTIVE service user (discharged/deceased excluded), joined with
  // their latest review — so clients with no review yet still appear (flagged),
  // not just those who already have a review.
  type ReviewRow = { su: ServiceUser; review: Review | null };
  const rows: ReviewRow[] = serviceUsers
    .filter((su) => su.status !== 'DISCHARGED' && su.status !== 'DECEASED')
    .map((su) => ({ su, review: latestPerUser.get(su.id) ?? null }));

  const filteredRows = rows.filter(({ su, review }) =>
    !term || `${su.firstName} ${su.lastName} ${review?.assessorName || ''}`.toLowerCase().includes(term)
  );

  // Click-to-sort on Service User (name) and Next Review (date); default is by
  // name. Clients with no next-review date sort to the bottom.
  const [sortBy, setSortBy] = useState<'name' | 'nextReview' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (c: 'name' | 'nextReview') => {
    if (sortBy === c) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(c); setSortDir('asc'); }
  };
  const sortCol = sortBy ?? 'name';
  const sortWay = sortBy ? sortDir : 'asc';
  const sortedRows = [...filteredRows].sort((a, b) => {
    const cmp = sortCol === 'name'
      ? `${a.su.firstName} ${a.su.lastName}`.localeCompare(`${b.su.firstName} ${b.su.lastName}`, undefined, { sensitivity: 'base' })
      : (rowDueDate(a.su, a.review)?.getTime() ?? Infinity) - (rowDueDate(b.su, b.review)?.getTime() ?? Infinity);
    return sortWay === 'asc' ? cmp : -cmp;
  });
  const sortArrow = (c: 'name' | 'nextReview') => (sortBy === c ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');


  // Review coverage across ACTIVE service users (discharged/deceased excluded —
  // same rule as the CQC report). A paused package is counted on its own:
  // calling it due would be asking for a review nobody can hold, and calling
  // it up to date would be saying one happened.
  const reviewStats = (() => {
    const activeSUs = serviceUsers.filter((su) => su.status !== 'DISCHARGED' && su.status !== 'DECEASED');
    let upToDate = 0, due = 0, noRecord = 0, paused = 0;
    for (const su of activeSUs) {
      if (servicePaused(su)) { paused += 1; continue; }
      const latest = latestPerUser.get(su.id) ?? null;
      if (latest) {
        if (isOverdue(latest)) due += 1;
        else upToDate += 1;
      } else if (rowOverdue(su, null)) {
        // No review yet, but the first 6-week review is now past due.
        due += 1;
      } else {
        noRecord += 1;
      }
    }
    return { active: activeSUs.length, upToDate, due, noRecord, paused };
  })();

  // Only a user's most recent review row offers "Review now" — older, superseded
  // rows shouldn't. The follow-up is always a quarterly (the 6-week is a one-off
  // at the start of the care package).
  const latestReviewIds = new Set([...latestPerUser.values()].map((r) => r.id));

  const startFollowUp = (r: Review) => setModal({
    serviceUserId: r.serviceUserId,
    serviceUserName: r.serviceUser ? `${r.serviceUser.firstName} ${r.serviceUser.lastName}` : '',
    reviewType: 'QUARTERLY',
    editReview: null,
  });

  const startNewReview = () => {
    const su = serviceUsers.find((s) => s.id === newForUserId);
    if (!su) return;
    setModal({ serviceUserId: su.id, serviceUserName: `${su.firstName} ${su.lastName}`, reviewType: newType, editReview: null });
  };


  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Service Review</h1>
            <p className="text-sm text-gray-500">6-week review after service start, then quarterly reviews</p>
          </div>
        )}
        <div className={`flex flex-wrap items-center gap-2 ${embedded ? 'ml-auto' : ''}`}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client or assessor…"
            className="input w-64 shrink-0"
          />
          {isManager && (
            <>
              <SearchableSelect
                value={newForUserId}
                onChange={setNewForUserId}
                options={serviceUsers.map((su) => ({ value: su.id, label: `${su.firstName} ${su.lastName}` }))}
                placeholder="Select service user…"
                className="w-56 shrink-0"
              />
              <select value={newType} onChange={(e) => setNewType(e.target.value as ReviewType)} className="input w-32 shrink-0">
                <option value="SIX_WEEK">6-Week</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
              <button className="btn-secondary btn whitespace-nowrap" disabled={!newForUserId} onClick={startNewReview}>
                + New Review
              </button>
              {/* Recording a review held on paper is an administrator-only action. */}
              {isAdmin && (
                <button
                  className="btn-secondary btn whitespace-nowrap"
                  disabled={!newForUserId}
                  title="Log a review already held on paper, so the next one is scheduled"
                  onClick={() => { const su = serviceUsers.find((s) => s.id === newForUserId); if (su) setPaperFor({ serviceUserId: su.id, serviceUserName: `${su.firstName} ${su.lastName}` }); }}
                >
                  📄 Record previous (paper)
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-900 tabular-nums">{reviewStats.active}</div>
          <div className="text-xs text-gray-500 mt-0.5">Active service users</div>
          {/* Said out loud, because otherwise the three counts beside this one
              stop adding up to it and the difference looks like a fault. */}
          {reviewStats.paused > 0 && (
            <div className="text-xs text-gray-400 mt-1">
              {reviewStats.paused} in hospital / on hold — not counted as due
            </div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-green-600 tabular-nums">{reviewStats.upToDate}</div>
          <div className="text-xs text-gray-500 mt-0.5">Up to date</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-red-600 tabular-nums">{reviewStats.due}</div>
          <div className="text-xs text-gray-500 mt-0.5">Review due / overdue</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-amber-600 tabular-nums">{reviewStats.noRecord}</div>
          <div className="text-xs text-gray-500 mt-0.5">No review yet</div>
        </div>
      </div>


      {sortedRows.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>{term ? 'No service users match your search' : 'No active service users'}</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center hover:text-gray-900">Service User{sortArrow('name')}</button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 font-medium text-gray-600">Review Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  <button type="button" onClick={() => toggleSort('nextReview')} className="inline-flex items-center hover:text-gray-900">Next Review{sortArrow('nextReview')}</button>
                </th>
                <th className="hidden xl:table-cell text-left px-4 py-3 font-medium text-gray-600">Assessor</th>
                <th className="hidden xl:table-cell text-left px-4 py-3 font-medium text-gray-600">Last Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedRows.map(({ su, review }) => {
                const overdue = rowOverdue(su, review);
                const dueDate = rowDueDate(su, review);
                // The client's earlier reviews (everything except the latest shown here).
                const pastRevs = (reviewsByUser.get(su.id) ?? []).filter((x) => x.id !== review?.id);
                return [
                  <tr key={su.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {pastRevs.length > 0 ? (
                        <button
                          className="flex items-center gap-2 font-medium text-gray-900 hover:text-blue-700"
                          onClick={() => setOpenHistory((o) => ({ ...o, [su.id]: !o[su.id] }))}
                          title={`${pastRevs.length + 1} reviews on record`}
                        >
                          <Icon
                            name="chevron"
                            size={14}
                            className={`text-gray-400 shrink-0 transition-transform duration-150 ${openHistory[su.id] ? 'rotate-90' : ''}`}
                          />
                          {su.firstName} {su.lastName}
                          <span className="text-xs font-normal text-gray-400">{pastRevs.length + 1}</span>
                        </button>
                      ) : (
                        // Indented to line up with the names that do expand.
                        <span className="flex items-center gap-2 font-medium text-gray-900"><span className="w-[14px] shrink-0" />{su.firstName} {su.lastName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {servicePaused(su)
                        ? <span className="badge-gray badge">{su.status === 'HOSPITALISED' ? 'In hospital' : 'On hold'}</span>
                        : overdue
                          ? <span className="badge-red badge">Overdue</span>
                          : review
                            ? <span className="badge-green badge">Up to date</span>
                            : <span className="badge-yellow badge">No review yet</span>}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3">
                      {review
                        ? <span className={review.type === 'QUARTERLY' ? 'badge-purple badge' : 'badge-blue badge'}>{review.type === 'QUARTERLY' ? 'Quarterly' : '6-Week'}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-600">
                      {review ? (
                        <>
                          {format(new Date(review.reviewDate), 'dd MMM yyyy')}
                          {review.source === 'paper' && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Paper</span>}
                        </>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {dueDate ? (
                        <span className="inline-flex items-center gap-1.5">
                          {overdue
                            ? <span className="badge-red badge">⚠ {format(dueDate, 'dd MMM yyyy')}</span>
                            : <span className="text-gray-600">{format(dueDate, 'dd MMM yyyy')}</span>}
                          {!review && <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded" title="First review is due 6 weeks after the service start date">6-week</span>}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="hidden xl:table-cell px-4 py-3 text-gray-600">{review?.assessorName || '—'}</td>
                    <td className="hidden xl:table-cell px-4 py-3 text-gray-500">{review ? format(new Date(review.updatedAt), 'dd MMM yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {!review ? (
                        isManager && (
                          <button
                            className="btn-primary btn btn-sm whitespace-nowrap"
                            onClick={() => setModal({ serviceUserId: su.id, serviceUserName: `${su.firstName} ${su.lastName}`, reviewType: 'SIX_WEEK', editReview: null })}
                          >
                            + New Review
                          </button>
                        )
                      ) : confirmDelete === review.id ? (
                        <span className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-red-700">Delete?</span>
                          <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(review.id)}>Yes</button>
                          <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDelete(null)}>No</button>
                        </span>
                      ) : (
                        <span className="flex gap-2 justify-end items-center">
                          {isManager && overdue && latestReviewIds.has(review.id) && (
                            <button className="btn-primary btn btn-sm whitespace-nowrap" onClick={() => startFollowUp(review)}>Review now</button>
                          )}
                          <button
                            className="btn-secondary btn btn-sm"
                            onClick={() => setModal({
                              serviceUserId: review.serviceUserId,
                              serviceUserName: `${su.firstName} ${su.lastName}`,
                              reviewType: review.type,
                              editReview: review,
                            })}
                          >
                            {isManager ? 'Open / Edit' : 'View'}
                          </button>
                          {isManager && (
                            <button className="text-xs text-red-600 hover:underline" onClick={() => setConfirmDelete(review.id)}>Delete</button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>,
                  // Earlier reviews, superseded by the one above. They open
                  // read-only: the current review is the one that gets edited,
                  // and a past one is the record of what was agreed then.
                  ...(openHistory[su.id]
                    ? pastRevs.map((x) => (
                        <tr key={x.id} className="bg-gray-50/60 text-gray-600">
                          <td className="px-4 py-2 pl-12 text-xs text-gray-500">earlier review</td>
                          <td className="px-4 py-2" />
                          <td className="hidden lg:table-cell px-4 py-2">
                            <span className={x.type === 'QUARTERLY' ? 'badge-purple badge' : 'badge-blue badge'}>
                              {x.type === 'QUARTERLY' ? 'Quarterly' : '6-Week'}
                            </span>
                          </td>
                          <td className="hidden lg:table-cell px-4 py-2 text-gray-600">
                            {format(new Date(x.reviewDate), 'dd MMM yyyy')}
                            {x.source === 'paper' && (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Paper</span>
                            )}
                          </td>
                          {/* Its next-review date was superseded by the review
                              above, so showing it reads as something still due. */}
                          <td className="px-4 py-2 text-gray-300">—</td>
                          <td className="hidden xl:table-cell px-4 py-2 text-gray-600">{x.assessorName || '—'}</td>
                          <td className="hidden xl:table-cell px-4 py-2 text-gray-500">{format(new Date(x.updatedAt), 'dd MMM yyyy')}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              className="btn-secondary btn btn-sm"
                              onClick={() => setModal({
                                serviceUserId: x.serviceUserId,
                                serviceUserName: `${su.firstName} ${su.lastName}`,
                                reviewType: x.type,
                                editReview: x,
                                locked: true,
                              })}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ReviewFormModal
          serviceUserId={modal.serviceUserId}
          serviceUserName={modal.serviceUserName}
          reviewType={modal.reviewType}
          editReview={modal.editReview}
          locked={modal.locked}
          onClose={() => setModal(null)}
        />
      )}

      {paperFor && (
        <PaperSeedModal
          title="Record previous review"
          subjectName={paperFor.serviceUserName}
          intro="Seed the schedule from a review held on paper"
          dateLabel="Review date (on paper)"
          personLabel="Assessor"
          showNextDue
          onSubmit={({ date, person, note, nextDue }) => reviewsApi.create({ serviceUserId: paperFor.serviceUserId, type: 'QUARTERLY', reviewDate: date, nextReviewDate: nextDue || undefined, assessorName: person || undefined, otherInfo: note || undefined, source: 'paper' })}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['reviews'] }); qc.invalidateQueries({ queryKey: ['supervision-summary'] }); }}
          onClose={() => setPaperFor(null)}
        />
      )}
    </div>
  );
}
