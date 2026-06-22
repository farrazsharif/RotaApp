import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../api/reports';
import { shiftsApi } from '../api/shifts';
import { useAuth } from '../contexts/AuthContext';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { Shift } from '../types';

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function shiftDuration(s: Shift) {
  const [sh, sm] = s.startTime.split(':').map(Number);
  const [eh, em] = s.endTime.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ''}`.trim();
}

export default function Dashboard() {
  const { user, isManager } = useAuth();
  const today = new Date();
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: reportsApi.dashboard,
    enabled: isManager,
  });

  const { data: myShifts = [] } = useQuery({
    queryKey: ['shifts', 'my', weekStart, weekEnd],
    queryFn: () => shiftsApi.list({ startDate: weekStart, endDate: weekEnd, userId: user?.id }),
  });

  const todayShifts = myShifts.filter(
    (s) => format(new Date(s.date), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Good {today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening'}, {user?.firstName}!
        </h1>
        <p className="text-gray-500 mt-1">{format(today, 'EEEE, MMMM d yyyy')}</p>
      </div>

      {isManager && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Employees" value={stats.totalEmployees} icon="👥" color="bg-blue-100" />
          <StatCard label="Shifts This Week" value={stats.shiftsThisWeek} icon="📅" color="bg-green-100" />
          <StatCard label="Pending Time Off" value={stats.pendingTimeOff} icon="🏖️" color="bg-yellow-100" />
          <StatCard label="Pending Trades" value={stats.pendingTrades} icon="🔄" color="bg-purple-100" />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's shifts */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Today's Shifts</h2>
          {todayShifts.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No shifts scheduled for today</p>
          ) : (
            <div className="space-y-3">
              {todayShifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">
                      {isManager ? (s.user ? `${s.user.firstName} ${s.user.lastName}` : 'Unassigned') : s.role || 'Shift'}
                    </p>
                    <p className="text-sm text-gray-500">{s.startTime} – {s.endTime} · {shiftDuration(s)}</p>
                  </div>
                  <span className={`badge ${s.status === 'SCHEDULED' ? 'badge-blue' : s.status === 'COMPLETED' ? 'badge-green' : 'badge-gray'}`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* This week */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">This Week</h2>
          {myShifts.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">No shifts this week</p>
          ) : (
            <div className="space-y-2">
              {myShifts.slice(0, 7).map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="text-center w-10">
                      <p className="text-xs text-gray-400 uppercase">{format(new Date(s.date), 'EEE')}</p>
                      <p className="text-lg font-bold text-gray-700">{format(new Date(s.date), 'd')}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {isManager ? (s.user ? `${s.user.firstName} ${s.user.lastName}` : 'Unassigned') : s.role || 'Shift'}
                      </p>
                      <p className="text-xs text-gray-500">{s.startTime} – {s.endTime}</p>
                    </div>
                  </div>
                  <span className={`badge ${s.status === 'SCHEDULED' ? 'badge-blue' : 'badge-gray'}`}>
                    {shiftDuration(s)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
