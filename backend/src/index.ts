import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { initSocket } from './lib/socket';
import { errorHandler } from './middleware/errorHandler';
import { broadcastChanges } from './middleware/broadcast';
import { prisma } from './lib/prisma';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import shiftRoutes from './routes/shifts';
import timeOffRoutes from './routes/timeOff';
import clockRoutes from './routes/clock';
import reportRoutes from './routes/reports';
import notificationRoutes from './routes/notifications';
import serviceUserRoutes from './routes/serviceUsers';
import siteRoutes from './routes/sites';
import callLogRoutes from './routes/callLogs';
import medicationRoutes from './routes/medications';
import carePlanRoutes from './routes/carePlans';
import likesDislikesRoutes from './routes/likesDislikes';
import servicePlanRoutes from './routes/servicePlans';
import adminRoutes from './routes/admin';
import pushRoutes from './routes/push';
import familyRoutes from './routes/family';
import familyLinkRoutes from './routes/familyLinks';
import trainingRoutes from './routes/training';
import importantDateRoutes from './routes/importantDates';
import reviewRoutes from './routes/reviews';
import settingsRoutes from './routes/settings';
import roleRoutes from './routes/roles';
import auditRoutes from './routes/audit';
import funderRoutes from './routes/funders';
import fundingRoutes from './routes/funding';
import invoiceRoutes from './routes/invoices';
import bankHolidayRoutes from './routes/bankHolidays';
import paymentRoutes from './routes/payments';
import billingRoutes from './routes/billing';
import platformRoutes from './routes/platform';
import documentRoutes from './routes/documents';
import supervisionRoutes from './routes/supervision';
import noteRoutes from './routes/notes';
import { backfillAllCompanyRoles } from './lib/defaultRoles';
import { normalizeVisitNames } from './lib/normalizeVisitNames';
import { handleWebhook } from './controllers/billingController';
import { startShiftReminders } from './lib/shiftReminders';

const app = express();
const server = http.createServer(app);

initSocket(server);

// Explicitly-configured origins (env) plus local dev ports.
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CARER_APP_URL,
  process.env.FAMILY_PORTAL_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
].filter(Boolean) as string[];

// Allow the manager app, carer app and family portal — all served from
// *.caremid.co.uk — plus the apex domain, regardless of which subdomain each
// ends up on. This keeps CORS working when a frontend moves domains (as the
// app did to portal.caremid.co.uk) without needing an env change per deploy.
const CAREMID_HOST = /^https:\/\/([a-z0-9-]+\.)*caremid\.co\.uk$/;

app.use(cors({
  origin(origin, callback) {
    // Same-origin / non-browser requests (curl, health checks) send no Origin.
    if (!origin) return callback(null, true);
    const ok = allowedOrigins.includes(origin) || CAREMID_HOST.test(origin);
    callback(null, ok);
  },
  credentials: true,
}));

// Stripe webhook must receive the RAW body for signature verification, so it is
// mounted before the JSON body parser.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleWebhook);

app.use(express.json());

// Broadcast every successful write to the acting company's open sessions, so
// all managers/staff see live data without refreshing. Mounted before the
// routes; it reads req.user (set by each router's auth) when the response ends.
app.use(broadcastChanges);

// Health check that also verifies database connectivity, so uptime monitors
// (e.g. UptimeRobot) go red on a DB outage, not just a web-server crash.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'down', timestamp: new Date().toISOString() });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/time-off', timeOffRoutes);
app.use('/api/clock', clockRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/service-users', serviceUserRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/call-logs', callLogRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/care-plans', carePlanRoutes);
app.use('/api/likes-dislikes', likesDislikesRoutes);
app.use('/api/service-plans', servicePlanRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/family-links', familyLinkRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/important-dates', importantDateRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/funders', funderRoutes);
app.use('/api/funding', fundingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/bank-holidays', bankHolidayRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/supervision', supervisionRoutes);
app.use('/api/notes', noteRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Caremid API running on http://localhost:${PORT}`);
  const transport = process.env.BREVO_API_KEY ? 'Brevo API (HTTPS)' : process.env.SMTP_HOST ? 'SMTP' : 'console (no email configured)';
  console.log(`Email transport: ${transport}`);
  startShiftReminders();
  backfillAllCompanyRoles(prisma).catch((e) => console.error('Role backfill failed:', e));
  normalizeVisitNames(prisma).catch((e) => console.error('Visit-name normalisation failed:', e));
});

// Safety net: keep the server alive if a controller's promise rejects without
// being forwarded to the error handler (Express 4 does not auto-catch async throws).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
