// One-time, idempotent normalisation: older records stored visit names without
// the "Call" suffix (e.g. "Shopping", "Domestic"). The app now uses "Shopping
// Call" etc. everywhere, so bring existing data in line. Runs on every startup
// but short-circuits once there is nothing left to convert.
const RENAMES: Record<string, string> = {
  Shopping: 'Shopping Call',
  Cleaning: 'Cleaning Call',
  Domestic: 'Domestic Call',
  Social: 'Social Call',
  Morning: 'Morning Call',
  Lunch: 'Lunch Call',
  Tea: 'Tea Call',
  Bed: 'Bed Call',
};

// Loosely typed like the other startup helpers because the app uses an
// extended Prisma client whose type doesn't match the base PrismaClient.
export async function normalizeVisitNames(prisma: any): Promise<void> {
  const oldNames = Object.keys(RENAMES);

  // Cheap guard so this is effectively a no-op after the first successful run.
  const shiftHits = await prisma.shift.count({ where: { visitName: { in: oldNames } } });
  const suHits = await prisma.serviceUser.count({
    where: { OR: oldNames.map((n) => ({ visits: { contains: `"type":"${n}"` } })) },
  });
  if (shiftHits === 0 && suHits === 0) return;

  // Shift.visitName is a plain string — a direct updateMany per name.
  for (const [oldName, newName] of Object.entries(RENAMES)) {
    await prisma.shift.updateMany({ where: { visitName: oldName }, data: { visitName: newName } });
  }

  // ServiceUser.visits is a JSON string of { type, duration } — parse, remap, save.
  const users = await prisma.serviceUser.findMany({ select: { id: true, visits: true } });
  for (const u of users) {
    if (!u.visits || u.visits === '[]') continue;
    let arr: { type: string; duration: number }[];
    try {
      const parsed = JSON.parse(u.visits);
      if (!Array.isArray(parsed)) continue;
      arr = parsed;
    } catch {
      continue;
    }
    let changed = false;
    const next = arr.map((v) => {
      if (v && typeof v.type === 'string' && RENAMES[v.type]) {
        changed = true;
        return { ...v, type: RENAMES[v.type] };
      }
      return v;
    });
    if (changed) {
      await prisma.serviceUser.update({ where: { id: u.id }, data: { visits: JSON.stringify(next) } });
    }
  }

  console.log(`Visit-name normalisation done (shifts: ${shiftHits}, service users scanned: ${suHits}).`);
}
