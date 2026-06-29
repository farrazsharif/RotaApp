import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { initSocket } from './lib/socket';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import shiftRoutes from './routes/shifts';
import shiftTradeRoutes from './routes/shiftTrades';
import timeOffRoutes from './routes/timeOff';
import clockRoutes from './routes/clock';
import reportRoutes from './routes/reports';
import notificationRoutes from './routes/notifications';
import serviceUserRoutes from './routes/serviceUsers';
import siteRoutes from './routes/sites';
import callLogRoutes from './routes/callLogs';
import medicationRoutes from './routes/medications';
import carePlanRoutes from './routes/carePlans';
import servicePlanRoutes from './routes/servicePlans';
import adminRoutes from './routes/admin';
import pushRoutes from './routes/push';
import familyRoutes from './routes/family';
import familyLinkRoutes from './routes/familyLinks';
import { startShiftReminders } from './lib/shiftReminders';

const app = express();
const server = http.createServer(app);

initSocket(server);

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  process.env.CARER_APP_URL || 'http://localhost:5174',
  process.env.FAMILY_PORTAL_URL || 'http://localhost:5175',
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/shift-trades', shiftTradeRoutes);
app.use('/api/time-off', timeOffRoutes);
app.use('/api/clock', clockRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/service-users', serviceUserRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/call-logs', callLogRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/care-plans', carePlanRoutes);
app.use('/api/service-plans', servicePlanRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/family-links', familyLinkRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`RotaApp API running on http://localhost:${PORT}`);
  startShiftReminders();
});

// Safety net: keep the server alive if a controller's promise rejects without
// being forwarded to the error handler (Express 4 does not auto-catch async throws).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
