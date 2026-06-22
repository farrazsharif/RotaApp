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

const app = express();
const server = http.createServer(app);

initSocket(server);

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
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

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`RotaApp API running on http://localhost:${PORT}`);
});

// Safety net: keep the server alive if a controller's promise rejects without
// being forwarded to the error handler (Express 4 does not auto-catch async throws).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
