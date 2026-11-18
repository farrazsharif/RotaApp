import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Layout from '../components/Layout'
import { policiesApi, CATEGORY_LABEL } from '../api/policies'
import type { MyPolicy } from '../api/policies'

// The policies that apply to this carer, and the ones they still have to
// sign.
//
// Unsigned ones come first and stay first. A list sorted by category would
// bury the one thing this screen is for — and "I read it" has to be a
// deliberate tap at the bottom of the text, not a button beside the title
// that can be hit without scrolling.

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const err = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'Could not save that. Check your signal and try again.'

export default function Policies() {
  const [open, setOpen] = useState<MyPolicy | null>(null)

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['my-policies'],
    queryFn: policiesApi.mine,
  })

  const unsigned = policies.filter((p) => p.needsSignature)
  const signed = policies.filter((p) => !p.needsSignature)

  return (
    <Layout title="Policies">
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : policies.length === 0 ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">No policies to read just now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {unsigned.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1.5">
                To read and sign ({unsigned.length})
              </p>
              <div className="space-y-2">
                {unsigned.map((p) => (
                  <Row key={p.id} policy={p} onOpen={() => setOpen(p)} />
                ))}
              </div>
            </div>
          )}

          {signed.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                Signed
              </p>
              <div className="space-y-2">
                {signed.map((p) => (
                  <Row key={p.id} policy={p} onOpen={() => setOpen(p)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {open && <PolicySheet policy={open} onClose={() => setOpen(null)} />}
    </Layout>
  )
}

function Row({ policy, onOpen }: { policy: MyPolicy; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className={`w-full text-left bg-white rounded-xl border px-4 py-3 shadow-sm flex items-center justify-between gap-3 ${
        policy.needsSignature ? 'border-amber-300' : 'border-gray-200'
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold text-gray-800">{policy.title}</p>
        <p className="text-xs text-gray-500">
          {CATEGORY_LABEL[policy.category] || policy.category} · v{policy.version}
          {policy.signedAt ? ` · signed ${fmt(policy.signedAt)}` : ''}
        </p>
      </div>
      <span className={`text-xs font-semibold shrink-0 ${policy.needsSignature ? 'text-amber-700' : 'text-green-700'}`}>
        {policy.needsSignature ? 'Read it' : '✓'}
      </span>
    </button>
  )
}

// The formatted original, for anyone who wants it. Under the text, not above:
// on a phone the text is the readable one, and a 40-page PDF is the fallback
// rather than the first thing offered.
function OriginalDocument({ policyId, fileName }: { policyId: string; fileName: string }) {
  const open = useMutation({
    mutationFn: () => policiesApi.attachment(policyId),
    onSuccess: (d) => window.open(d.url, '_blank', 'noopener'),
  })

  return (
    <div className="mt-4 pt-3 border-t">
      <button
        className="text-sm text-blue-600 font-medium disabled:opacity-50"
        disabled={open.isPending}
        onClick={() => open.mutate()}
      >
        {open.isPending ? 'Opening…' : `📄 Open the original (${fileName})`}
      </button>
      {open.isError && <p className="text-xs text-red-600 mt-1">{err(open.error)}</p>}
    </div>
  )
}

function PolicySheet({ policy, onClose }: { policy: MyPolicy; onClose: () => void }) {
  const qc = useQueryClient()

  // Fetched on open, not with the list. One policy is a few kilobytes; the
  // whole library is a couple of megabytes.
  const { data: full, isLoading } = useQuery({
    queryKey: ['policy', policy.id],
    queryFn: () => policiesApi.one(policy.id),
  })

  const sign = useMutation({
    mutationFn: () => policiesApi.sign(policy.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-policies'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 border-b shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{policy.title}</h3>
            <p className="text-xs text-gray-500">
              v{policy.version} · issued {fmt(policy.issuedAt)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none px-2">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : full?.bodyText ? (
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{full.bodyText}</p>
          ) : (
            <p className="text-sm text-gray-500">
              This policy is held as a document. Ask the office for a copy if you have not been given one.
            </p>
          )}

          {full?.files?.length ? <OriginalDocument policyId={policy.id} fileName={full.files[0].fileName} /> : null}

          {sign.isError && <p className="text-sm text-red-600 mt-3">{err(sign.error)}</p>}
        </div>

        <div className="p-4 border-t shrink-0">
          {policy.needsSignature ? (
            <button
              className="w-full rounded-xl bg-blue-600 text-white py-3.5 font-semibold disabled:opacity-50"
              disabled={sign.isPending || isLoading}
              onClick={() => sign.mutate()}
            >
              {sign.isPending ? 'Saving…' : 'I have read this'}
            </button>
          ) : (
            <p className="text-center text-sm text-green-700 font-medium">
              Signed {fmt(policy.signedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
