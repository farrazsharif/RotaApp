/**
 * Build the App Review demo company.
 *
 * Apple signs in to the carer app to review it. Pointing them at Care 24 means
 * the reviewer sees real people: the announcements screen carries company-wide
 * notices, the handover screen lists every active member of staff, and any
 * visit assigned to them opens that client's address, care plan, medication
 * and risk assessments. None of that can be avoided by being careful about
 * which visits get assigned — it is how a carer account works.
 *
 * So the reviewer gets their own company instead, with invented clients.
 * Caremid is multi-tenant; this is what that is for.
 *
 * Credentials come from the environment and are never written down here. Run:
 *
 *   DEMO_ADMIN_EMAIL=... DEMO_ADMIN_PASSWORD=... \
 *   DEMO_CARER_EMAIL=... DEMO_CARER_PASSWORD=... \
 *   npx tsx scripts/seedDemoCompany.ts --apply
 *
 * Without --apply it says what it would do and sends nothing.
 *
 * Afterwards, two things are still manual:
 *   1. Comp the company's subscription in the platform admin area. New
 *      companies get a 14-day trial, and if it lapses mid-review the reviewer
 *      is locked out. 1.0 once sat in the queue for nine days.
 *   2. Put the CARER's email and password into App Store Connect under
 *      App Review Information -> Sign-In Information. Not the admin's: the
 *      carer app is for carers, and an ADMIN account cannot work a visit.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Credentials come from backend/.env.demo, which the owner writes and nobody
// else needs to read — not this file, not the chat, not the commit (.env.* is
// gitignored). Shape, one per line:
//
//   DEMO_ADMIN_EMAIL=...
//   DEMO_ADMIN_PASSWORD=...
//   DEMO_CARER_EMAIL=...
//   DEMO_CARER_PASSWORD=...
//
// Real environment variables still win, so CI can set them instead.
const ENV_FILE = join(__dirname, '..', '.env.demo');
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

const API = process.env.DEMO_API || 'https://api.caremid.co.uk/api';
const APPLY = process.argv.includes('--apply');

const COMPANY = process.env.DEMO_COMPANY || 'Caremid Demo';
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || '';
const CARER_EMAIL = process.env.DEMO_CARER_EMAIL || '';
const CARER_PASSWORD = process.env.DEMO_CARER_PASSWORD || '';

// Invented people. Deliberately not plausible as anyone real: no address that
// resolves, no NHS number, nothing borrowed from a live record.
const CLIENTS = [
  {
    firstName: 'Margaret', lastName: 'Example', dateOfBirth: '1938-04-12',
    address: '1 Sample Street, Demoford', postcode: 'DE1 1AA',
    allergies: 'Penicillin', dnacprStatus: 'Not in place',
    meds: [
      { name: 'Blister Pack (MDS)', dose: '1', times: ['09:00', '18:00'] },
      { name: 'Paracetamol 500mg', dose: 'Two tablets', instructions: 'When required for pain', times: [] },
    ],
  },
  {
    firstName: 'Alan', lastName: 'Specimen', dateOfBirth: '1945-11-30',
    address: '2 Sample Street, Demoford', postcode: 'DE1 1AB',
    allergies: 'None known', dnacprStatus: 'Not in place',
    meds: [{ name: 'Atorvastatin 20mg', dose: 'One tablet', times: ['18:00'] }],
  },
  {
    firstName: 'Joan', lastName: 'Placeholder', dateOfBirth: '1951-02-19',
    address: '3 Sample Street, Demoford', postcode: 'DE1 1AC',
    allergies: 'None known', dnacprStatus: 'Not in place',
    meds: [],
  },
];

type Json = Record<string, unknown>;

let token = '';

async function call(method: string, path: string, body?: Json): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }
  return parsed;
}

function requireEnv() {
  const missing = [
    ['DEMO_ADMIN_EMAIL', ADMIN_EMAIL],
    ['DEMO_ADMIN_PASSWORD', ADMIN_PASSWORD],
    ['DEMO_CARER_EMAIL', CARER_EMAIL],
    ['DEMO_CARER_PASSWORD', CARER_PASSWORD],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`Set these first: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 8 || CARER_PASSWORD.length < 8) {
    console.error('Both passwords must be at least 8 characters — the API rejects shorter ones.');
    process.exit(1);
  }
}

async function main() {
  requireEnv();

  console.log(`API      ${API}`);
  console.log(`Company  ${COMPANY}`);
  console.log(`Admin    ${ADMIN_EMAIL}`);
  console.log(`Carer    ${CARER_EMAIL}`);
  console.log(`Clients  ${CLIENTS.map((c) => `${c.firstName} ${c.lastName}`).join(', ')}`);
  console.log(`Meds     ${CLIENTS.reduce((n, c) => n + c.meds.length, 0)} across those clients`);
  console.log('Visits   one permanent daily series per client, assigned to the carer');

  if (!APPLY) {
    console.log('\nDry run — nothing sent. Re-run with --apply.');
    return;
  }

  // 1. The company. Signup returns a token for the new ADMIN, so nothing else
  //    needs a separate login. If the company was already made by hand in the
  //    portal, signup comes back 409 on the email — sign in instead and carry
  //    on, so this can be re-run against a half-built demo without starting
  //    over.
  try {
    const signup = await call('POST', '/auth/signup', {
      companyName: COMPANY,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      firstName: 'Demo',
      lastName: 'Administrator',
    });
    token = signup.token;
    console.log(`\nCompany created: ${signup.company?.name} (${signup.company?.slug})`);
    console.log(`Trial ends ${signup.company?.trialEndsAt} — COMP THIS before review.`);
  } catch (e) {
    if (!/\b409\b/.test((e as Error).message)) throw e;
    const login = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    token = login.token;
    console.log('\nThat account already exists — signed in to it instead.');
    console.log(`Signed in as ${login.user?.firstName} ${login.user?.lastName} (${login.user?.role}).`);
    if (login.user?.role !== 'ADMIN') {
      throw new Error('That account is not an ADMIN of the demo company — the rest of this needs admin rights.');
    }
  }

  // SAFETY. Email is unique across ALL companies and deleting a user only
  // deactivates it, so an address used for a demo account in a real tenant
  // still belongs to that tenant. If this token turned out to be for Care 24,
  // everything below would write invented clients and visits into a live care
  // provider's records.
  //
  // Checked by SIZE rather than by name, because the name is the thing most
  // likely to be typed wrong: a demo company holds a handful of people, a real
  // one holds dozens. Anything populated, stop and say so.
  const me = await call('GET', '/auth/me');
  const [existingClients, existingStaff] = await Promise.all([
    call('GET', '/service-users'),
    call('GET', '/users'),
  ]);
  const clientCount = Array.isArray(existingClients) ? existingClients.length : 0;
  const staffCount = Array.isArray(existingStaff) ? existingStaff.length : 0;
  console.log(`Tenant ${me.companyId}: ${clientCount} client(s), ${staffCount} staff.`);
  const LIMIT = 5;
  if (clientCount > LIMIT || staffCount > LIMIT) {
    throw new Error(
      `This looks like a real company (${clientCount} clients, ${staffCount} staff), not a fresh demo one. `
      + 'Refusing to write. Check DEMO_ADMIN_EMAIL is the admin of Caremid Demo and not an account in a live tenant.',
    );
  }

  // 2. The carer. A password is set directly rather than emailing an invite,
  //    because the reviewer cannot pick up an invite email.
  let carer: any;
  try {
    carer = await call('POST', '/users', {
      email: CARER_EMAIL,
      password: CARER_PASSWORD,
      firstName: 'Demo',
      lastName: 'Carer',
      role: 'EMPLOYEE',
      staffRole: 'CARE',
      hourlyRate: 12,
      sendInvite: false,
    });
    console.log(`Carer created: ${carer.firstName} ${carer.lastName}`);
  } catch (e) {
    if (!/\b409\b/.test((e as Error).message)) throw e;
    // Already made by hand in the portal. Use it rather than failing — but it
    // has to be a carer, because an ADMIN cannot clock into a visit and the
    // reviewer would get no further than the rota.
    carer = (existingStaff as any[]).find(
      (u) => String(u.email).toLowerCase() === CARER_EMAIL.toLowerCase(),
    );
    if (!carer) throw new Error(`${CARER_EMAIL} is taken but not in this company — it belongs to another tenant.`);
    console.log(`Carer already existed: ${carer.firstName} ${carer.lastName} (${carer.role}).`);
    if (carer.role !== 'EMPLOYEE') {
      throw new Error(`${CARER_EMAIL} is ${carer.role}, not EMPLOYEE. Change the role to carer in Staff and re-run.`);
    }
  }

  // 3. Clients, their medication, and a visit each.
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const windows = [
    { startTime: '09:00', endTime: '10:00', visitName: 'Morning Call' },
    { startTime: '13:00', endTime: '13:45', visitName: 'Lunch Call' },
    { startTime: '18:00', endTime: '19:00', visitName: 'Tea Call' },
  ];

  for (let i = 0; i < CLIENTS.length; i += 1) {
    const c = CLIENTS[i];
    const su = await call('POST', '/service-users', {
      firstName: c.firstName, lastName: c.lastName, dateOfBirth: c.dateOfBirth,
      address: c.address, postcode: c.postcode, allergies: c.allergies,
      dnacprStatus: c.dnacprStatus, status: 'ACTIVE',
    });
    console.log(`Client: ${c.firstName} ${c.lastName}`);

    for (const m of c.meds) {
      await call('POST', '/medications', {
        serviceUserId: su.id, name: m.name, dose: m.dose,
        instructions: (m as any).instructions, times: m.times,
      });
      console.log(`  med: ${m.name}${m.times.length ? ` at ${m.times.join(', ')}` : ' (when required)'}`);
    }

    // A PERMANENT series, so the rota tops itself up and the demo never goes
    // stale between releases. An empty rota fails review as surely as a
    // missing login: the reviewer cannot get past step 2.
    const w = windows[i % windows.length];
    const made = await call('POST', '/shifts', {
      userId: carer.id, serviceUserId: su.id, date: dateStr,
      startTime: w.startTime, endTime: w.endTime, visitName: w.visitName,
      repeat: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], endType: 'permanent' },
    });
    // Creating a series returns the FIRST shift plus a count, not the list, so
    // the ids have to be read back rather than taken from the response.
    console.log(`  visits: ${made.createdCount ?? 1} created (${w.visitName}, daily, permanent)`);
  }

  // Carers only ever see PUBLISHED shifts — a draft rota looks empty, which is
  // indistinguishable from a broken account to somebody reviewing the app.
  // Published silently: there is nobody to notify on a demo tenant.
  const until = new Date(today);
  until.setMonth(until.getMonth() + 12);
  const toStr = `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, '0')}-${String(until.getDate()).padStart(2, '0')}`;
  const all = await call('GET', `/shifts?startDate=${dateStr}&endDate=${toStr}&userId=${carer.id}`);
  const ids = (Array.isArray(all) ? all : []).filter((s: any) => !s.published).map((s: any) => s.id);
  for (let i = 0; i < ids.length; i += 200) {
    await call('POST', '/shifts/publish-bulk', { ids: ids.slice(i, i + 200), notify: 'none' });
  }
  console.log(`\nPublished ${ids.length} visits.`);

  console.log('\nDone. Still to do by hand:');
  console.log('  1. Comp this company\'s subscription (platform admin) so the trial cannot lapse mid-review.');
  console.log('  2. Sign in to the carer app as the demo carer and check today shows visits.');
  console.log('  3. Put the CARER email + password into App Store Connect -> App Review Information.');
}

main().catch((e) => { console.error(`\nFailed: ${e.message}`); process.exit(1); });
