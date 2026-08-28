import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { serviceUsersApi } from '../api/serviceUsers';
import { ServiceUser } from '../types';

export default function SupportedLiving() {
  const navigate = useNavigate();
  const { data: all = [], isLoading } = useQuery({
    queryKey: ['service-users', 'supported-living'],
    queryFn: () => serviceUsersApi.list({ active: true }),
  });

  const clients = useMemo(() => all.filter((c: ServiceUser) => c.careType === 'SUPPORTED_LIVING'), [all]);

  // Group by scheme (shared schemes) so a staffed house shows its tenants together.
  const grouped = useMemo(() => {
    const m = new Map<string, ServiceUser[]>();
    for (const c of clients) {
      const key = c.housingScheme?.trim() || 'Individual tenancies';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return [...m.entries()].sort((a, b) => (a[0] === 'Individual tenancies' ? 1 : b[0] === 'Individual tenancies' ? -1 : a[0].localeCompare(b[0])));
  }, [clients]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Supported Living</h1>
        <p className="text-sm text-gray-500">People in their own tenancy with a separate housing provider, supported to live independently. Support hours are rostered on the Schedule.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
      ) : clients.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-500">No supported-living clients yet.</p>
          <p className="text-sm text-gray-400 mt-1">Set a service user's <span className="font-medium">Care Type</span> to <span className="font-medium">Supported living</span> (on their edit page) and they'll appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([scheme, list]) => (
            <div key={scheme}>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">{scheme} <span className="text-gray-400 font-normal">· {list.length}</span></h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((c) => (
                  <button key={c.id} onClick={() => navigate(`/service-users/${c.id}`)} className="card text-left hover:shadow-md transition-shadow">
                    <p className="font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                    <p className="text-sm text-gray-500">{[c.address, c.postcode].filter(Boolean).join(', ') || '—'}</p>
                    {c.housingProvider && <p className="text-xs text-gray-500 mt-1">🏘️ {c.housingProvider}</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
