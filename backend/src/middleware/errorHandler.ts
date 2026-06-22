import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  if (err.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({ error: 'Database constraint violation' });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
}
