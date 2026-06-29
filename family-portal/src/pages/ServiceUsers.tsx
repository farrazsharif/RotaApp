import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { differenceInYears, format } from 'date-fns';
import Layout from '../components/Layout';
import { serviceUsersApi } from '../api/serviceUsers';

export default function ServiceUsers() {
  const navigate = useNavigate();
  const { data: serviceUsers = [], isLoading } = useQuery({
    queryKey: ['my-service-users'],
    queryFn: serviceUsersApi.list,
  });

  if (isLoading) {
    return (
      <Layout title="Your Family">
        <p className="text-center text-gray-400 py-8">Loading…</p>
      </Layout>
    );
  }

  if (serviceUsers.length === 1) {
    navigate(`/client/${serviceUsers[0].id}`, { replace: true });
    return null;
  }

  return (
    <Layout title="Your Family">
      {serviceUsers.length === 0 ? (
        <p className="text-center text-gray-400 py-8 text-sm">
          You don't have access to anyone yet. Please contact the care team.
        </p>
      ) : (
        <div className="space-y-3">
          {serviceUsers.map((su) => (
            <button
              key={su.id}
              onClick={() => navigate(`/client/${su.id}`)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-200"
            >
              <p className="font-semibold text-gray-900">{su.firstName} {su.lastName}</p>
              <p className="text-xs text-gray-500">
                {su.relation ? `${su.relation} · ` : ''}
                {su.dateOfBirth && `${differenceInYears(new Date(), new Date(su.dateOfBirth))} yrs · DOB ${format(new Date(su.dateOfBirth), 'dd MMM yyyy')}`}
              </p>
            </button>
          ))}
        </div>
      )}
    </Layout>
  );
}
