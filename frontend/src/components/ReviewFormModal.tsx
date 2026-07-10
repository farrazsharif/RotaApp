import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewsApi } from '../api/reviews';
import { useAuth } from '../contexts/AuthContext';
import { Review, ReviewOutcome, ReviewType } from '../types';
import { format, addMonths } from 'date-fns';

interface Props {
  serviceUserId: string;
  serviceUserName: string;
  reviewType: ReviewType;
  editReview: Review | null;
  onClose: () => void;
}

interface QA { answer: string; comment: string }
type Answers = Record<string, QA>;

interface Section { title: string; questions: { id: string; text: string; textOnly?: boolean }[] }

const SIX_WEEK_SECTIONS: Section[] = [
  {
    title: 'Service Assessment',
    questions: [
      { id: 'sa1', text: 'Were you satisfied with the assessment that was carried out?' },
      { id: 'sa2', text: 'Were you confident in the knowledge and expertise of the Care Assessor?' },
      { id: 'sa3', text: 'Do you feel the assessment captured enough information?' },
      { id: 'sa4', text: 'Do you have a blue folder in your property?' },
    ],
  },
  {
    title: 'Service Delivery',
    questions: [
      { id: 'sd1', text: 'Have you been satisfied with the service delivery?' },
      { id: 'sd2', text: 'Do you feel that the routine of work is in accordance to your needs?' },
      { id: 'sd3', text: 'Do you feel you have the necessary equipment needed to support you?' },
      { id: 'sd4', text: 'Has your dignity and privacy been maintained, ensuring that you are respected at all times?' },
      { id: 'sd5', text: 'Do you feel your care and support is person centered?' },
      { id: 'sd6', text: 'Are you safeguarded against any forms of neglect or abuse?' },
      { id: 'sd7', text: 'Is there any information or comments that you would like us to forward to the social worker?' },
    ],
  },
  {
    title: 'Staff Performance',
    questions: [
      { id: 'sp1', text: 'Does the carer inform and involve you in the delivery of your care?' },
      { id: 'sp2', text: 'Are you comfortable with the delivery of care and the competency skills of the carer?' },
      { id: 'sp3', text: 'Does the carer come on time and stay the full amount of time?' },
      { id: 'sp4', text: 'Are you happy with the call times provided?' },
      { id: 'sp5', text: 'Are you informed if the care workers are running late?' },
    ],
  },
  {
    title: 'Considerations',
    questions: [
      { id: 'c1', text: 'Are there any other areas that you feel you need support with?' },
      { id: 'c2', text: 'Are there any community groups that you would like us to sign-post you to e.g. walking, knitting, painting, reading, exercise etc.?' },
      { id: 'c3', text: 'Any areas that you feel that have not been considered in your care?' },
    ],
  },
  {
    title: 'Communication',
    questions: [
      { id: 'cm1', text: 'Has The Care Company Plus provided enough information to you in relation to the services being delivered?' },
      { id: 'cm2', text: 'Does The Care Company Plus inform and consult you of any changes in the service?' },
      { id: 'cm3', text: 'Have any complaints and requests relating to your service been dealt with appropriately and to your satisfaction?' },
    ],
  },
  {
    title: 'Carer Feedback',
    questions: [
      { id: 'cf1', text: 'Do you feel that there have been any changes to the service users care needs e.g. mobility, appetite, breathing?' },
      { id: 'cf2', text: 'Do you feel the task planner has the correct tasks for carers to complete?' },
      { id: 'cf3', text: 'Do you feel the duration of the call is sufficient to complete the care required?' },
      { id: 'cf4', text: 'Do you engage in conversation with the service user?' },
      { id: 'cf5', text: 'Do you know if the service user receives any additional care besides the carers?' },
      { id: 'cf6', text: 'Give an example of your service users likes/preferences (e.g. how they like their tea? how they like their hair done? how they like their bed made?)', textOnly: true },
    ],
  },
];

const QUARTERLY_SECTIONS: Section[] = [
  {
    title: 'Service Assessment',
    questions: [
      { id: 'qa1', text: 'Are you supported with personal care? Have there been any changes?' },
      { id: 'qa2', text: 'Are you supported with shopping and laundry?' },
      { id: 'qa3', text: 'Are you as active as you would like to be?' },
      { id: 'qa4', text: 'Have you experienced any falls recently?' },
      { id: 'qa5', text: 'Have there been any changes to your vision, hearing and speech?' },
      { id: 'qa6', text: 'Have there been any changes in your mobility?' },
      { id: 'qa7', text: 'Do you receive any support from your family members/friends?' },
      { id: 'qa8', text: 'Do you have any concerns about your home?' },
      { id: 'qa9', text: 'Have there been any changes to your diet and weight?' },
      { id: 'qa10', text: 'Are you supported with food preparation? Have there been any changes?' },
      { id: 'qa11', text: 'Do you have any concerns about your skin? Do you have any pressure sores?' },
      { id: 'qa12', text: 'Do you face any breathing difficulties?' },
      { id: 'qa13', text: 'Are you supported with handling finances? Have there been any changes?' },
      { id: 'qa14', text: 'Have there been any changes to your health? Are you satisfied with the level of your health?' },
      { id: 'qa15', text: 'Have there been any changes to your sleeping pattern?' },
      { id: 'qa16', text: 'Have there been any changes to your memory?' },
      { id: 'qa17', text: 'Are you supported with medication? If so, what level of support do you require? (prompt, assist or administer)' },
    ],
  },
  {
    title: 'Service Review',
    questions: [
      { id: 'qr1', text: 'Do you feel the service you receive is safe?' },
      { id: 'qr2', text: 'Do you feel that you are protected from abuse and avoidable harm? Do you have any examples of this?' },
      { id: 'qr3', text: 'Do you feel the service is effective?' },
      { id: 'qr4', text: 'Is your care, treatment, and support achieving good outcomes and promoting a good quality of life? Do you have any examples of this?' },
      { id: 'qr5', text: 'Do you feel the culture of the organisation is caring?' },
      { id: 'qr6', text: 'Are you involved in decisions about your care and treated with compassion, kindness, dignity and respect? Do you have any examples of this?' },
      { id: 'qr7', text: 'Do you feel the service is responsive?' },
      { id: 'qr8', text: 'Do you feel the service is flexible, person-centered, and adapts to your needs and preferences? Do you have any examples of this?' },
      { id: 'qr9', text: 'Do you feel the service is well led?' },
      { id: 'qr10', text: 'Do you feel the leadership, management and governance of the organisation assure high quality, person centered care?' },
    ],
  },
  {
    title: 'Carer Feedback',
    questions: [
      { id: 'qcf1', text: 'Do you feel that there have been any changes to the service users care needs e.g. mobility, appetite, breathing?' },
      { id: 'qcf2', text: 'Do you feel the Care Plan has the correct tasks for carers to complete?' },
      { id: 'qcf3', text: 'Do you feel the duration of the call is sufficient to complete the care required?' },
      { id: 'qcf4', text: 'Do you engage in conversation with the service user?' },
      { id: 'qcf5', text: 'Do you know if the service user receives any additional care besides the carers?' },
      { id: 'qcf6', text: 'Do you feel that the environment in which you work in is safe?' },
      { id: 'qcf7', text: 'Give an example of your service users likes/preferences (e.g. how they like their tea? how they like their hair done? how they like their bed made?)', textOnly: true },
    ],
  },
];

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  SIX_WEEK: '6-Week Review',
  QUARTERLY: 'Quarterly Review',
};

const emptyOutcome = (): ReviewOutcome => ({ action: '', outcome: '', timescale: '', actionBy: '', completion: '' });

function parseAnswers(json?: string): Answers {
  if (!json) return {};
  try { return JSON.parse(json) || {}; } catch { return {}; }
}

function parseOutcomes(json?: string): ReviewOutcome[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export default function ReviewFormModal({ serviceUserId, serviceUserName, reviewType, editReview, onClose }: Props) {
  const { isManager } = useAuth();
  const ro = !isManager;
  const qc = useQueryClient();
  const sections = reviewType === 'QUARTERLY' ? QUARTERLY_SECTIONS : SIX_WEEK_SECTIONS;

  const [reviewDate, setReviewDate] = useState(editReview ? format(new Date(editReview.reviewDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  // Quarterly reviews default the next one to 3 months out; editable below.
  const [nextReviewDate, setNextReviewDate] = useState(() => {
    if (editReview) return editReview.nextReviewDate ? format(new Date(editReview.nextReviewDate), 'yyyy-MM-dd') : '';
    // Both the one-off 6-week and recurring quarterly reviews schedule the next
    // review 3 months on — auto-filled from the review date, adjustable.
    return format(addMonths(new Date(), 3), 'yyyy-MM-dd');
  });
  const [assessorName, setAssessorName] = useState(editReview?.assessorName || '');
  const [answers, setAnswers] = useState<Answers>(() => parseAnswers(editReview?.answers));
  const [otherInfo, setOtherInfo] = useState(editReview?.otherInfo || '');
  const [outcomes, setOutcomes] = useState<ReviewOutcome[]>(() => {
    const parsed = parseOutcomes(editReview?.outcomes);
    return parsed.length > 0 ? parsed : [emptyOutcome()];
  });
  const [representativeName, setRepresentativeName] = useState(editReview?.representativeName || '');
  const [phoneConsent, setPhoneConsent] = useState(editReview?.phoneConsent || false);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        serviceUserId,
        type: reviewType,
        reviewDate,
        nextReviewDate: nextReviewDate || null,
        assessorName,
        answers,
        otherInfo,
        outcomes: outcomes.filter((o) => o.action.trim() || o.outcome.trim()),
        representativeName,
        phoneConsent,
      };
      return editReview ? reviewsApi.update(editReview.id, payload) : reviewsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews'] });
      onClose();
    },
  });

  const setQA = (id: string, patch: Partial<QA>) =>
    setAnswers((a) => {
      const current: QA = a[id] || { answer: '', comment: '' };
      return { ...a, [id]: { ...current, ...patch } };
    });

  const setOutcome = (i: number, patch: Partial<ReviewOutcome>) =>
    setOutcomes((o) => o.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const error = saveMut.error as { response?: { data?: { error?: string } } } | null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold">{REVIEW_TYPE_LABELS[reviewType]} — {serviceUserName}</h2>
            {ro && <p className="text-xs text-gray-500">read-only</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error.response?.data?.error || 'An error occurred'}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Date of Review *</label>
              {ro ? <p className="text-sm text-gray-800">{format(new Date(reviewDate), 'dd MMM yyyy')}</p> :
                <input type="date" value={reviewDate} onChange={(e) => { const v = e.target.value; setReviewDate(v); if (v) setNextReviewDate(format(addMonths(new Date(v), 3), 'yyyy-MM-dd')); }} className="input" />}
            </div>
            <div>
              <label className="label">Name of Assessor</label>
              {ro ? <p className="text-sm text-gray-800">{assessorName || '—'}</p> :
                <input value={assessorName} onChange={(e) => setAssessorName(e.target.value)} className="input" />}
            </div>
            <div>
              <label className="label">Next Review Due</label>
              {ro ? <p className="text-sm text-gray-800">{nextReviewDate ? format(new Date(nextReviewDate), 'dd MMM yyyy') : '—'}</p> :
                <input type="date" value={nextReviewDate} onChange={(e) => setNextReviewDate(e.target.value)} className="input" />}
              {!ro && <p className="text-xs text-gray-500 mt-1">Auto-set to 3 months after the review date — adjust if needed.</p>}
            </div>
          </div>

          {sections.map((section) => (
            <section key={section.title}>
              <h3 className="font-semibold text-gray-900 mb-2">{section.title}</h3>
              <div className="space-y-3">
                {section.questions.map((q) => {
                  const qa = answers[q.id] || { answer: '', comment: '' };
                  return (
                    <div key={q.id} className="border rounded-lg p-3">
                      <p className="text-sm text-gray-800 mb-2">{q.text}</p>
                      <div className="flex flex-wrap items-start gap-4">
                        {!q.textOnly && (
                          <div className="flex gap-2">
                            {(['YES', 'NO', 'NA'] as const).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                disabled={ro}
                                onClick={() => setQA(q.id, { answer: qa.answer === opt ? '' : opt })}
                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                  qa.answer === opt
                                    ? opt === 'YES' ? 'bg-green-600 text-white border-green-600'
                                      : opt === 'NO' ? 'bg-red-600 text-white border-red-600'
                                      : 'bg-gray-600 text-white border-gray-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {opt === 'NA' ? 'N/A' : opt.charAt(0) + opt.slice(1).toLowerCase()}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex-1 min-w-48">
                          {ro ? (
                            qa.comment ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{qa.comment}</p> : <p className="text-sm text-gray-300">No comment</p>
                          ) : (
                            <input
                              value={qa.comment}
                              onChange={(e) => setQA(q.id, { comment: e.target.value })}
                              placeholder="Comment…"
                              className="input py-1 text-sm"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <section>
            <h3 className="font-semibold text-gray-900 mb-2">Other Information</h3>
            <p className="text-xs text-gray-500 mb-2">
              Please record any discussions held with the Service User{reviewType === 'QUARTERLY' ? ' and Care Worker' : ''}
            </p>
            {ro ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{otherInfo || '—'}</p> :
              <textarea value={otherInfo} rows={4} onChange={(e) => setOtherInfo(e.target.value)} className="input resize-none text-sm" />}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">Any Agreed Outcomes</h3>
              {!ro && <button type="button" className="btn-secondary btn btn-sm" onClick={() => setOutcomes((o) => [...o, emptyOutcome()])}>+ Add Row</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border font-medium text-gray-600 w-8">#</th>
                    <th className="text-left p-2 border font-medium text-gray-600">Action</th>
                    <th className="text-left p-2 border font-medium text-gray-600">Outcome</th>
                    <th className="text-left p-2 border font-medium text-gray-600">Timescale</th>
                    <th className="text-left p-2 border font-medium text-gray-600">Action by</th>
                    <th className="text-left p-2 border font-medium text-gray-600">Completion</th>
                    {!ro && <th className="p-2 border w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((row, i) => (
                    <tr key={i}>
                      <td className="p-2 border text-gray-500">{i + 1}</td>
                      {(['action', 'outcome', 'timescale', 'actionBy', 'completion'] as const).map((field) => (
                        <td key={field} className="p-1 border">
                          {ro ? (
                            <span className="text-gray-800">{row[field] || <span className="text-gray-300">—</span>}</span>
                          ) : (
                            <input value={row[field]} onChange={(e) => setOutcome(i, { [field]: e.target.value })} className="input py-1 text-sm" />
                          )}
                        </td>
                      ))}
                      {!ro && (
                        <td className="p-1 border text-center">
                          <button type="button" onClick={() => setOutcomes((o) => o.filter((_, idx) => idx !== i))} className="text-red-600 hover:text-red-700" title="Remove">×</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {reviewType === 'SIX_WEEK' && (
          <section>
            <h3 className="font-semibold text-gray-900 mb-2">Consent to the Phone Consultation</h3>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={phoneConsent} disabled={ro} onChange={(e) => setPhoneConsent(e.target.checked)} className="mt-0.5" />
              I can confirm that I have consent to discuss the review on the phone on behalf of the service user.
            </label>
            <div className="mt-3">
              <label className="label">Representative Name and Relation</label>
              {ro ? <p className="text-sm text-gray-800">{representativeName || '—'}</p> :
                <input value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} className="input" />}
            </div>
          </section>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t sticky bottom-0 bg-white">
          <div className="flex-1" />
          <button onClick={onClose} className="btn-secondary btn">Close</button>
          {isManager && (
            <button className="btn-primary btn" disabled={saveMut.isPending || !reviewDate} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Saving…' : editReview ? 'Save Changes' : 'Save Review'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
