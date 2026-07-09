import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

let io: Server;

// Any caremid.co.uk subdomain (portal, carer, family) plus the apex, matching
// the HTTP CORS policy in index.ts — so every frontend can open a socket.
const CAREMID_HOST = /^https:\/\/([a-z0-9-]+\.)*caremid\.co\.uk$/;
const devOrigins = [
  process.env.CLIENT_URL, process.env.CARER_APP_URL, process.env.FAMILY_PORTAL_URL,
  'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
].filter(Boolean) as string[];

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        callback(null, devOrigins.includes(origin) || CAREMID_HOST.test(origin));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      socket.data.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);
    // Also join a company-wide room so cross-user updates (e.g. another manager
    // changing the schedule) can be broadcast to everyone in the same company.
    try {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
      if (u?.companyId) socket.join(`company:${u.companyId}`);
    } catch { /* ignore — user just won't get company broadcasts */ }
    console.log(`Socket connected: ${userId}`);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${userId}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  try {
    getIO().to(`user:${userId}`).emit(event, data);
  } catch {
    // Socket not initialized yet, skip
  }
}

// Broadcast to every connected session of a company (all its managers/staff).
export function emitToCompany(companyId: string, event: string, data: unknown) {
  try {
    getIO().to(`company:${companyId}`).emit(event, data);
  } catch {
    // Socket not initialized yet, skip
  }
}
