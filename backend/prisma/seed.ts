import { PrismaClient } from '@prisma/client';
import { Role } from '../src/constants';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Build a local date at midday for a given day offset from today (avoids TZ day-shift)
function dayAt(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}
function dateTimeAt(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0);
}

async function main() {
  // Only seed demo data into a genuinely empty database. If any service user
  // already exists, this is a real (or previously-seeded) database with real
  // data in it — never wipe it. Staff account upserts below are always safe
  // to re-run since they're idempotent (upsert, not delete+recreate).
  const existingServiceUsers = await prisma.serviceUser.count();
  if (existingServiceUsers > 0) {
    console.log(`Database already has ${existingServiceUsers} service user(s) — skipping demo data seed.`);
    return;
  }

  console.log('Seeding domiciliary care data (empty database detected)...');

  const adminPassword = await bcrypt.hash('admin123', 10);
  const managerPassword = await bcrypt.hash('manager123', 10);
  const carerPassword = await bcrypt.hash('carer123', 10);

  // ---- Staff ----
  const admin = await prisma.user.upsert({
    where: { email: 'admin@rotaapp.com' },
    update: { firstName: 'Aisha', lastName: 'Khan', role: Role.ADMIN, phone: '07700900000', hourlyRate: 0 },
    create: { email: 'admin@rotaapp.com', password: adminPassword, firstName: 'Aisha', lastName: 'Khan', role: Role.ADMIN, phone: '07700900000', hourlyRate: 0 },
  });

  const coordinator = await prisma.user.upsert({
    where: { email: 'manager@rotaapp.com' },
    update: { firstName: 'Sarah', lastName: 'Johnson', role: Role.MANAGER, phone: '07700900001', hourlyRate: 18 },
    create: { email: 'manager@rotaapp.com', password: managerPassword, firstName: 'Sarah', lastName: 'Johnson', role: Role.MANAGER, phone: '07700900001', hourlyRate: 18 },
  });

  const carerDefs = [
    { email: 'alice@rotaapp.com', firstName: 'Alice', lastName: 'Brown', phone: '07700900002' },
    { email: 'bob@rotaapp.com', firstName: 'Bob', lastName: 'Smith', phone: '07700900003' },
    { email: 'carol@rotaapp.com', firstName: 'Carol', lastName: 'Davies', phone: '07700900004' },
    { email: 'david@rotaapp.com', firstName: 'David', lastName: 'Okafor', phone: '07700900005' },
    { email: 'emma@rotaapp.com', firstName: 'Emma', lastName: 'Wilson', phone: '07700900006' },
  ];
  const carers = [];
  for (const c of carerDefs) {
    const u = await prisma.user.upsert({
      where: { email: c.email },
      update: { firstName: c.firstName, lastName: c.lastName, role: Role.EMPLOYEE, phone: c.phone, hourlyRate: 12.5 },
      create: { email: c.email, password: carerPassword, firstName: c.firstName, lastName: c.lastName, role: Role.EMPLOYEE, phone: c.phone, hourlyRate: 12.5 },
    });
    carers.push(u);
  }

  // ---- Sites / areas ----
  const siteDefs = [
    { name: 'Manchester', color: '#3b82f6' },
    { name: 'Stockport', color: '#10b981' },
    { name: 'Care 24 Plus', color: '#f59e0b' },
  ];
  const sites = [];
  for (const s of siteDefs) {
    const site = await prisma.site.upsert({ where: { name: s.name }, update: { color: s.color }, create: s });
    sites.push(site);
  }

  // ---- Service users (clients) ----
  const clientDefs = [
    {
      firstName: 'Margaret', lastName: 'Thompson', dateOfBirth: new Date('1938-03-12'),
      nhsNumber: '485 777 3456', address: '14 Elm Grove, Didsbury', postcode: 'M20 2WX',
      phone: '0161 445 1122', emergencyContactName: 'John Thompson', emergencyContactPhone: '07811 223344', emergencyContactRelation: 'Son',
      needsMedication: true, needsMobility: true, needsPersonalCare: true, visitDuration: 45,
      careNotes: 'Early-stage dementia. Prompt and administer morning medication. Uses a Zimmer frame.',
      site: 0, pattern: ['M', 'L', 'T', 'B'],
    },
    {
      firstName: 'Albert', lastName: 'Singh', dateOfBirth: new Date('1944-07-29'),
      nhsNumber: '601 223 9087', address: '3 Brookfield Close, Burnage', postcode: 'M19 1FG',
      phone: '0161 432 7788', emergencyContactName: 'Priya Singh', emergencyContactPhone: '07922 556677', emergencyContactRelation: 'Daughter',
      needsMedication: true, needsMobility: false, needsPersonalCare: true, visitDuration: 30,
      careNotes: 'Diabetic — assist with insulin reminders. Prefers female carers.',
      site: 0, pattern: ['M', 'T'],
    },
    {
      firstName: 'Doris', lastName: 'Patel', dateOfBirth: new Date('1935-11-02'),
      nhsNumber: '742 118 4521', address: '27 Heaton Road, Stockport', postcode: 'SK4 4PZ',
      phone: '0161 480 9090', emergencyContactName: 'Raj Patel', emergencyContactPhone: '07700 998877', emergencyContactRelation: 'Son',
      needsMedication: true, needsMobility: true, needsPersonalCare: true, visitDuration: 60,
      careNotes: 'Double-handed call for hoist transfers. Catheter care required.',
      site: 1, pattern: ['Md', 'L', 'Bd'],
    },
    {
      firstName: 'George', lastName: 'Walsh', dateOfBirth: new Date('1949-01-17'),
      nhsNumber: '318 904 7765', address: '8 Mersey Bank Ave, Chorlton', postcode: 'M21 7NP',
      phone: '0161 861 2020', emergencyContactName: 'Linda Walsh', emergencyContactPhone: '07733 445566', emergencyContactRelation: 'Wife',
      needsMedication: false, needsMobility: true, needsPersonalCare: false, visitDuration: 30,
      careNotes: 'Welfare and medication prompt. Independent but unsteady on feet.',
      site: 0, pattern: ['M', 'B'],
    },
    {
      firstName: 'Edith', lastName: 'Robinson', dateOfBirth: new Date('1932-09-23'),
      nhsNumber: '559 661 2398', address: '41 Davenport Park Rd, Stockport', postcode: 'SK2 6JT',
      phone: '0161 456 3344', emergencyContactName: 'Susan Clarke', emergencyContactPhone: '07845 112233', emergencyContactRelation: 'Niece',
      needsMedication: true, needsMobility: false, needsPersonalCare: true, visitDuration: 45,
      careNotes: 'Sundowning in evenings — keep bed call calm and consistent carer where possible.',
      site: 1, pattern: ['M', 'L', 'B'],
    },
    {
      firstName: 'Frank', lastName: 'O’Connor', dateOfBirth: new Date('1941-05-08'),
      nhsNumber: '227 583 6610', address: '12 Kingsway, Levenshulme', postcode: 'M19 3PT',
      phone: '0161 224 5566', emergencyContactName: 'Mary O’Connor', emergencyContactPhone: '07966 778899', emergencyContactRelation: 'Daughter',
      needsMedication: true, needsMobility: true, needsPersonalCare: true, visitDuration: 45,
      careNotes: 'COPD — has home oxygen. Assist with personal care and medication.',
      site: 2, pattern: ['M', 'L', 'T', 'B'],
    },
  ];

  // Call pattern definitions: key -> { name, start, end, cover }
  const CALLS: Record<string, { name: string; start: string; end: string; cover: number }> = {
    M: { name: 'Morning Call', start: '08:00', end: '08:45', cover: 1 },
    Md: { name: 'Morning Call', start: '08:00', end: '09:00', cover: 2 }, // double-handed
    L: { name: 'Lunch Call', start: '12:00', end: '12:30', cover: 1 },
    T: { name: 'Tea Call', start: '16:30', end: '17:00', cover: 1 },
    B: { name: 'Bed Call', start: '21:00', end: '21:30', cover: 1 },
    Bd: { name: 'Bed Call', start: '20:30', end: '21:15', cover: 2 }, // double-handed
  };

  const clients = [];
  for (let i = 0; i < clientDefs.length; i++) {
    const c = clientDefs[i];
    // preferred caregivers: assign two carers in rotation
    const pref = [carers[i % carers.length].id, carers[(i + 1) % carers.length].id];
    const su = await prisma.serviceUser.create({
      data: {
        firstName: c.firstName, lastName: c.lastName, dateOfBirth: c.dateOfBirth,
        siteId: sites[c.site].id, nhsNumber: c.nhsNumber, address: c.address, postcode: c.postcode,
        phone: c.phone, emergencyContactName: c.emergencyContactName, emergencyContactPhone: c.emergencyContactPhone,
        emergencyContactRelation: c.emergencyContactRelation, needsMedication: c.needsMedication,
        needsMobility: c.needsMobility, needsPersonalCare: c.needsPersonalCare, careNotes: c.careNotes,
        visitDuration: c.visitDuration,
        preferredCaregivers: { connect: pref.map((id) => ({ id })) },
      },
    });
    clients.push({ ...su, def: c });
  }

  // ---- Medications (eMAR regimens) ----
  const REGIMENS: Record<string, { name: string; dose: string; route: string; instructions: string; times: string[] }[]> = {
    Margaret: [
      { name: 'Donepezil', dose: '10mg', route: 'Oral', instructions: 'Once at night', times: ['20:00'] },
      { name: 'Amlodipine', dose: '5mg', route: 'Oral', instructions: 'With breakfast', times: ['08:00'] },
    ],
    Albert: [
      { name: 'Metformin', dose: '500mg', route: 'Oral', instructions: 'With food', times: ['08:00', '16:30'] },
    ],
    Doris: [
      { name: 'Furosemide', dose: '40mg', route: 'Oral', instructions: 'Morning', times: ['08:00'] },
      { name: 'Paracetamol', dose: '1g', route: 'Oral', instructions: 'PRN — max QDS', times: [] },
    ],
    Edith: [
      { name: 'Levothyroxine', dose: '75mcg', route: 'Oral', instructions: 'Before breakfast', times: ['08:00'] },
      { name: 'Lorazepam', dose: '0.5mg', route: 'Oral', instructions: 'Evening if agitated', times: ['20:00'] },
    ],
    Frank: [
      { name: 'Salbutamol inhaler', dose: '2 puffs', route: 'Inhaled', instructions: 'When breathless', times: ['08:00', '12:00', '16:30', '21:00'] },
    ],
  };
  let createdMeds = 0;
  for (const client of clients) {
    const regimen = REGIMENS[client.def.firstName];
    if (!regimen) continue;
    for (const m of regimen) {
      await prisma.medication.create({
        data: {
          serviceUserId: client.id, name: m.name, dose: m.dose, route: m.route,
          instructions: m.instructions, times: JSON.stringify(m.times),
        },
      });
      createdMeds++;
    }
  }

  // ---- Generate calls (shifts) from 4 days ago to 13 days ahead ----
  let carerRot = 0;
  const nextCarer = () => carers[carerRot++ % carers.length];
  let createdShifts = 0;
  let createdLogs = 0;
  let createdClock = 0;
  const now = new Date();

  const logSnippets = [
    'Client in good spirits. Personal care completed, medication administered and signed. Ate a good breakfast.',
    'Assisted with wash and dressing. Medication prompted and taken. No concerns reported.',
    'Prepared light meal and drink. Client a little tired but settled. Fluids encouraged.',
    'Supported with transfer using hoist (two carers). Continence care given. Skin intact.',
    'Settled client for the night, medication given. Doors locked, call bell within reach.',
  ];

  for (const client of clients) {
    for (const key of client.def.pattern) {
      const call = CALLS[key];
      const seriesId = randomUUID();
      // pick a stable primary carer per series, plus a 2nd for double-cover
      const primary = nextCarer();
      const second = call.cover > 1 ? nextCarer() : null;

      for (let offset = -4; offset <= 13; offset++) {
        const day = dayAt(offset);
        const shift = await prisma.shift.create({
          data: {
            userId: primary.id,
            serviceUserId: client.id,
            seriesId,
            date: day,
            startTime: call.start,
            endTime: call.end,
            visitName: call.name,
            cover: call.cover,
            status: 'SCHEDULED',
            ...(second ? { coverCarers: { connect: [{ id: second.id }] } } : {}),
          },
        });
        createdShifts++;

        // For past calls, record a completed visit (clock in/out) + a call log
        const callStart = dateTimeAt(day, call.start);
        const callEnd = dateTimeAt(day, call.end);
        if (callEnd < now) {
          await prisma.clockRecord.create({
            data: {
              userId: primary.id,
              shiftId: shift.id,
              clockIn: new Date(callStart.getTime() + 2 * 60000), // arrived ~2 min after start
              clockOut: new Date(callEnd.getTime() - 3 * 60000),
            },
          });
          createdClock++;
          await prisma.callLog.create({
            data: {
              serviceUserId: client.id,
              shiftId: shift.id,
              userId: primary.id,
              note: logSnippets[(offset + 4 + createdLogs) % logSnippets.length],
            },
          });
          createdLogs++;
        }
      }
    }
  }

  console.log('\nSeed complete!');
  console.log(`  Staff: ${2 + carers.length} (1 manager, 1 coordinator, ${carers.length} carers)`);
  console.log(`  Sites: ${sites.length}`);
  console.log(`  Clients: ${clients.length}`);
  console.log(`  Medications: ${createdMeds}`);
  console.log(`  Calls scheduled: ${createdShifts}`);
  console.log(`  Completed visits (clock records): ${createdClock}`);
  console.log(`  Call logs: ${createdLogs}`);
  console.log('\nLogin credentials:');
  console.log('  Registered Manager (admin): admin@rotaapp.com   / admin123');
  console.log('  Care Coordinator (manager): manager@rotaapp.com / manager123');
  console.log('  Care Workers:               alice@rotaapp.com   / carer123  (also bob, carol, david, emma)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
