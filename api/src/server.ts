// src/server.ts

import dotenv from 'dotenv';
import { Request, Response } from 'express';
import { App } from './app';
import { databaseService, dbErrorStatus } from './config/database';
import { configurePassport } from './config/passport';
import { initializeSocketHandlers } from './config/socket';
import { backfillPdfText } from './config/pdfText';
import { createPdfTextRepository } from './repository/pdfText.repository';

// Load environment variables
dotenv.config();

/**
 * SESSION_SECRET is read with `!` in app.ts, so an unset value produced a
 * running app signing cookies with `undefined`: every session forgeable, and
 * nothing in the logs to say so (SEC-12b). Boot is the only place this can
 * still be caught, and the length floor matches the generator in .env.example.
 */
const MIN_SESSION_SECRET_LENGTH = 32;

function assertRequiredEnv(): void {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    console.error('SESSION_SECRET is not set. Refusing to start with forgeable sessions.');
    console.error(
      "   Generate one: node -e \"console.log(require('crypto')" +
        ".randomBytes(32).toString('hex'))\""
    );
    process.exit(1);
  }

  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    console.error(
      `SESSION_SECRET is ${secret.length} characters; at least ${MIN_SESSION_SECRET_LENGTH} are required.`
    );
    process.exit(1);
  }
}

/**
 * See the header of config/database.ts: the socket layer's online-student map
 * is per-process and there is no Socket.IO room adapter, so a second replica
 * splits a group in half and each half misses the other's events. Coolify
 * makes scaling up a one-click accident, so say so loudly at boot (API-1).
 */
function warnIfScaledOut(): void {
  const raw = process.env.INSTANCE_COUNT;
  if (!raw) {
    return;
  }

  const instances = Number.parseInt(raw, 10);
  if (Number.isFinite(instances) && instances > 1) {
    console.error(
      `INSTANCE_COUNT=${instances}. This API only works as a single replica: group ` +
        'membership lives in process memory and there is no Socket.IO adapter, so a ' +
        'group split across replicas misses its own events. Scale back to 1.'
    );
  }
}

async function bootstrap() {
  try {
    assertRequiredEnv();
    warnIfScaledOut();

    const db = await databaseService.connect();
    configurePassport(db);
    const app = new App(db, databaseService.getPrisma());

    // Mounted here, not in app.ts, because the pool and its limits belong to
    // databaseService. Express only dispatches the four-argument error handler
    // app.ts registers last when something threw, so a route added after
    // construction is still matched normally.
    app.app.get('/health/db', (_req: Request, res: Response) => {
      // Sampled before the probe below: our own query would take a free
      // connection and understate how close the pool is to saturation.
      const pool = databaseService.getPoolStats();

      db.query('SELECT 1', (err) => {
        if (err) {
          console.error('/health/db probe failed:', err);
          res.status(dbErrorStatus(err)).json({ status: 'error', pool });
          return;
        }

        // Anything queued means requests are already waiting on a connection.
        // Reporting that as healthy is the exact lie this endpoint exists to
        // stop telling, so it fails the check while the pool is still alive.
        const saturated = pool.queued > 0;
        res.status(saturated ? 503 : 200).json({
          status: saturated ? 'saturated' : 'ok',
          pool,
        });
      });
    });

    app.onlineStudents = initializeSocketHandlers(app.io, db);

    const PORT = parseInt(process.env.BACKEND_PORT || '10000', 10);
    app.listen(PORT);

    // Not awaited: reading every class's PDFs must not hold up the healthcheck.
    void backfillPdfText(createPdfTextRepository(databaseService.getPrisma()));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// An unhandled rejection used to call process.exit(1). Several controllers use
// callback-style db.query inside async methods, where a throw becomes exactly
// that, so a single bad query could kill the API mid-class and drop every
// socket. Log and keep serving instead.
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// An uncaught exception genuinely leaves the process in an undefined state, so
// exiting is correct. Drain briefly first so in-flight responses can finish.
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception, shutting down in 5s:', error);
  setTimeout(() => process.exit(1), 5000).unref();
});

// Start the application
bootstrap();
