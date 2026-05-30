import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Load environmental token secretly
const API_KEY = process.env.CENTRAL_CONTEXT_API_KEY;

export function authenticateApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKeyHeader = req.headers['x-api-key'];

  if (!API_KEY || API_KEY.length < 48) {
    console.error('Server Configuration Warning: Security token not properly set in .env (minimum 48 characters).');
    res.status(500).json({ error: 'Server authentication misconfigured.' });
    return;
  }

  if (!apiKeyHeader || apiKeyHeader !== API_KEY) {
    // Return unauthorized without exposing details or log of credentials
    res.status(401).json({ error: 'Unauthorized. Invalid or missing API key.' });
    return;
  }

  next();
}

// Basic Rate Limiting: 10000 requests per minute per IP for secure API protection (expanded for high-throughput scan ingestion)
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10000, // Limit each IP to 10000 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests. Please try again later.' }
});

