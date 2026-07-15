import { format, startOfWeek, addDays, addWeeks } from 'date-fns';
import { shiftsApi } from '../api/shifts';

// One shared query for the carer's shifts across the widest window any screen
// needs — My Hours' range (3 weeks back … 4 weeks ahead). Today, Rota and My
// Hours all use the SAME query key, so the data is fetched once and shared from
// cache: fewer backend round-trips and instant tab switches.
export function myShiftsRange() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  return {
    weekStart,
    start: addWeeks(weekStart, -3),
    end: addWeeks(weekStart, 5), // covers the full +4 weeks window
  };
}

export function myShiftsQuery(userId: string) {
  const { weekStart, start, end } = myShiftsRange();
  return {
    queryKey: ['my-shifts', userId, format(weekStart, 'yyyy-MM-dd')] as const,
    queryFn: () => shiftsApi.list({
      userId,
      // Widen by a day each side to absorb local-vs-UTC boundary drift.
      startDate: format(addDays(start, -1), 'yyyy-MM-dd'),
      endDate: format(addDays(end, 1), 'yyyy-MM-dd'),
    }),
  };
}
