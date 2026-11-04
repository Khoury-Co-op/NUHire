// src/config/database.ts
//
// SINGLE REPLICA ONLY (API-1). This API cannot be scaled horizontally:
// config/socket.ts keeps `onlineStudents` in process memory, and Socket.IO is
// running without a room adapter. Run two replicas and a group's students land
// on different processes, so an emit to the group's room reaches only the
// students connected to the process that sent it. The barrier itself is in
// Step_Completion and is not the problem. The pool
// sizing below is also per-process, so N replicas open N * DB_POOL_SIZE
// connections against the same MySQL server.
//
// server.ts warns at boot when INSTANCE_COUNT is above 1. Keep the Coolify
// service at 1 replica until that state lives in MySQL (rule 2).

import mysql, { Pool, PoolOptions } from 'mysql2';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

/**
 * "Now" for the gate timestamps (`Users.present_at`, `Step_Completion.completed_at`,
 * `GroupConfirmations.confirmed_at`), from the API's clock: UTC, cut to whole
 * seconds. That is what MySQL's own clock writes into these TIMESTAMP(0)
 * columns on a UTC server, and what Prisma writes for a Date, since it formats
 * in UTC (MySQL would round the milliseconds Prisma sends, so they are dropped
 * here). The gates compare these columns with each other, so every write has to
 * come from one clock.
 *
 * It returns the literal rather than a Date on purpose: mysql2 formats a Date in
 * the API host's local time zone, which lands hours away from MySQL's clock on
 * any machine not running in UTC.
 */
export function dbNow(now: Date = new Date()): string {
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * mysql2 keeps its pool bookkeeping in these three queues. They are not in the
 * published types, so /health/db reads them through this shape rather than
 * through `any`.
 */
interface PoolQueues {
  _allConnections?: { length: number };
  _freeConnections?: { length: number };
  _connectionQueue?: { length: number };
}

export interface PoolStats {
  total: number;
  free: number;
  used: number;
  queued: number;
  connectionLimit: number;
  queueLimit: number;
}

/**
 * The database is unreachable or the pool is full. Both are transient and the
 * browser can act on them by retrying, so they get a 503 rather than a 500.
 */
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ER_CON_COUNT_ERROR',
  'ER_TOO_MANY_USER_CONNECTIONS',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
]);

/**
 * The same failures, numbered the way the mariadb driver behind Prisma numbers
 * them: MySQL's connection limits, a socket that closed or timed out, and
 * 45028, the pool failing to hand out a connection because it is full or the
 * server is unreachable.
 */
const PRISMA_UNAVAILABLE_CODES = new Set([
  '1040',
  '1203',
  '45001',
  '45009',
  '45012',
  '45026',
  '45028',
]);

/** Where Prisma keeps the driver's errno on a failed query. */
interface PrismaDriverError {
  meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
}

/**
 * Thrown instead of queueing once DB_POOL_SIZE + DB_POOL_QUEUE_LIMIT Prisma
 * queries are already running or waiting: Prisma's version of mysql2's
 * 'Queue limit reached.'.
 */
export class PrismaQueueFullError extends Error {
  constructor() {
    super('Prisma queue limit reached.');
    this.name = 'PrismaQueueFullError';
  }
}

/**
 * Status code for a failed query (API-15). Handlers must log the real error and
 * send a generic message: `err.message` from mysql2 names the table and column,
 * which is a free schema map for anyone with a browser.
 *
 * mysql2 reports a full acquire queue as a plain `Error('Queue limit reached.')`
 * with no `code`, so the message is the only thing there is to match on.
 */
export function dbErrorStatus(err: unknown): number {
  const asError = err as { code?: string; message?: string } | null | undefined;
  if (asError?.message === 'Queue limit reached.' || err instanceof PrismaQueueFullError) {
    return 503;
  }
  if (asError?.code && UNAVAILABLE_CODES.has(asError.code)) {
    return 503;
  }
  const driverCode = (err as PrismaDriverError | null | undefined)?.meta?.driverAdapterError?.cause
    ?.originalCode;
  if (driverCode && PRISMA_UNAVAILABLE_CODES.has(driverCode)) {
    return 503;
  }
  return 500;
}

const POOL_DEFAULTS = {
  connectionLimit: 25,
  queueLimit: 30,
  connectTimeoutMs: 10000,
  queryTimeoutMs: 15000,
};

/**
 * Tuning knobs are optional, but a typo in one must not silently halve the pool
 * in the middle of a class, so an unusable value is reported and ignored.
 */
function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`${name}="${raw}" is not a positive integer; falling back to ${fallback}`);
    return fallback;
  }
  return parsed;
}

function connectionFromEnv() {
  const url = new URL(process.env.DATABASE_URL!);
  return {
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  };
}

/**
 * The Prisma client, on its own mariadb pool with the same limits as the mysql2
 * pool. While Prisma is on trial only the notes and waiting-room facts
 * endpoints use it.
 */
function createPrismaClient(settings: typeof POOL_DEFAULTS) {
  const client = new PrismaClient({
    adapter: new PrismaMariaDb({
      ...connectionFromEnv(),
      connectionLimit: settings.connectionLimit,
      // The driver's default opens the whole pool at boot. This pool sits beside
      // the mysql2 one, which opens connections only as they are needed, so it
      // does the same.
      minimumIdle: 0,
      connectTimeout: settings.connectTimeoutMs,
      // The same server-side cap as the mysql2 pool. The driver's own
      // `queryTimeout` is MariaDB syntax that MySQL rejects. The value is an
      // integer from positiveIntFromEnv, so building the statement is safe.
      initSql: `SET SESSION max_execution_time = ${settings.queryTimeoutMs}`,
      ssl: {
        rejectUnauthorized: false,
      },
    }),
  });

  // The mariadb pool has no queueLimit. It queues every acquire and fails each
  // one only after its 10s acquireTimeout, which is the slow failure API-7 got
  // rid of. Counting the queries in flight gives the same immediate 503 instead.
  const maxInFlight = settings.connectionLimit + settings.queueLimit;
  let inFlight = 0;
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        if (inFlight >= maxInFlight) {
          throw new PrismaQueueFullError();
        }
        inFlight++;
        try {
          return await query(args);
        } finally {
          inFlight--;
        }
      },
    },
  });
}

export type PrismaDb = ReturnType<typeof createPrismaClient>;

export class DatabaseService {
  private pool: Pool | null = null;
  private prisma: PrismaDb | null = null;
  private readonly maxRetries = 30;

  // Filled in by createPool(), deliberately not by a field initialiser: those
  // run when server.ts imports this module, which is before its dotenv.config()
  // call has read .env, so every one of these would silently take its default
  // no matter what the file said. /health/db reports these same fields, so they
  // always describe the pool that was actually built.
  private connectionLimit = POOL_DEFAULTS.connectionLimit;
  private queueLimit = POOL_DEFAULTS.queueLimit;
  private connectTimeoutMs = POOL_DEFAULTS.connectTimeoutMs;
  private queryTimeoutMs = POOL_DEFAULTS.queryTimeoutMs;

  async connect(): Promise<Pool> {
    if (this.pool) {
      return this.pool;
    }

    let retryCount = 0;

    while (retryCount < this.maxRetries) {
      try {
        this.pool = await this.createPool();
        this.prisma = await this.connectPrisma();
        await this.initializeDatabase();
        console.info('Database connection pool established successfully');
        return this.pool;
      } catch (error) {
        retryCount++;
        console.error(`Database pool creation attempt ${retryCount} failed:`, error);
        await this.closeFailedAttempt();

        if (retryCount < this.maxRetries) {
          const delay = Math.min(10000, retryCount * 1000);
          console.warn(`Retrying in ${delay / 1000} seconds...`);
          await this.sleep(delay);
        } else {
          console.error('All database connection attempts failed. Exiting application.');
          process.exit(1);
        }
      }
    }

    throw new Error('Failed to establish database connection pool');
  }

  /**
   * An attempt can fail after the mysql2 pool or the Prisma client is already
   * open. Each holds connections, and thirty retries against a flapping server
   * would otherwise leave thirty of each behind.
   */
  private async closeFailedAttempt(): Promise<void> {
    const pool = this.pool;
    const prisma = this.prisma;
    this.pool = null;
    this.prisma = null;
    await prisma?.$disconnect().catch(() => undefined);
    if (pool) {
      await new Promise<void>((resolve) => pool.end(() => resolve()));
    }
  }

  private createPool(): Promise<Pool> {
    return new Promise((resolve, reject) => {
      this.connectionLimit = positiveIntFromEnv('DB_POOL_SIZE', POOL_DEFAULTS.connectionLimit);
      this.queueLimit = positiveIntFromEnv('DB_POOL_QUEUE_LIMIT', POOL_DEFAULTS.queueLimit);
      this.connectTimeoutMs = positiveIntFromEnv(
        'DB_CONNECT_TIMEOUT_MS',
        POOL_DEFAULTS.connectTimeoutMs
      );
      this.queryTimeoutMs = positiveIntFromEnv('DB_QUERY_TIMEOUT_MS', POOL_DEFAULTS.queryTimeoutMs);

      const poolConfig: PoolOptions = {
        ...connectionFromEnv(),
        connectionLimit: this.connectionLimit,
        waitForConnections: true,
        // `queueLimit: 0` meant an unbounded acquire queue with no timeout: once
        // all connections were busy every further request waited forever, so 30
        // laptops spun while the logs stayed completely clean. A finite queue
        // makes mysql2 fail the acquire immediately, and dbErrorStatus turns
        // that into a 503 the frontend can actually surface (API-7).
        queueLimit: this.queueLimit,
        // Without this a MySQL host that accepts the TCP connection and then
        // stalls holds the boot retry loop, and later every acquire, open until
        // the OS gives up.
        connectTimeout: this.connectTimeoutMs,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        ssl: {
          rejectUnauthorized: false,
        },
      };

      console.info(
        `Creating pool: host=${poolConfig.host}, port=${poolConfig.port}, database=${poolConfig.database}, connectionLimit=${poolConfig.connectionLimit}, queueLimit=${poolConfig.queueLimit}`
      );

      const pool = mysql.createPool(poolConfig);

      // Before the test acquire below, not after. mysql2 emits 'connection'
      // when a connection is created, so attaching afterwards missed the very
      // first one entirely: under classroom load that connection is the one
      // that gets reused, and it would have been the only one in the pool
      // running without the query timeout set.
      this.setupErrorHandling(pool);

      // Test the pool with a connection
      pool.getConnection((err, connection) => {
        if (err) {
          console.error('Database pool connection test failed:', err.message);
          reject(err);
        } else {
          connection.release(); // Release test connection back to pool
          resolve(pool);
        }
      });
    });
  }

  /**
   * Runs after createPool(), which has read the pool settings. Connecting here
   * makes a bad setting fail the boot retry loop rather than a student's first
   * note.
   */
  private async connectPrisma(): Promise<PrismaDb> {
    const prisma = createPrismaClient({
      connectionLimit: this.connectionLimit,
      queueLimit: this.queueLimit,
      connectTimeoutMs: this.connectTimeoutMs,
      queryTimeoutMs: this.queryTimeoutMs,
    });
    try {
      await prisma.$connect();
    } catch (error) {
      await prisma.$disconnect().catch(() => undefined);
      throw error;
    }
    return prisma;
  }

  private setupErrorHandling(pool: Pool): void {
    pool.on('connection', (connection) => {
      // A server-side cap is the only query timeout mysql2 exposes. Without it
      // one pathological SELECT holds a pooled connection, and therefore a slot
      // in the now-bounded queue, for as long as MySQL is willing to run it.
      // Text protocol, not execute(), because MySQL rejects a placeholder in a
      // prepared SET; mysql2 escapes the value into the statement instead.
      // MySQL applies this to read-only SELECTs only, and a server that does
      // not know the variable just errors, so failure here is not fatal.
      connection.query('SET SESSION max_execution_time = ?', [this.queryTimeoutMs], (err) => {
        if (err) {
          console.error('Could not set max_execution_time on pooled connection:', err.code);
        }
      });
    });

    pool.on('error', (err) => {
      console.error('Database pool error:', err);
      if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.warn('Database connection lost. Pool will reconnect automatically.');
      } else {
        console.error('Unexpected pool error:', err);
      }
    });
  }

  private async initializeDatabase(): Promise<void> {
    const crn = 1; // Default CRN for initialization

    const queries = [
      "INSERT IGNORE INTO `Moderator` (`admin_email`, `crn`) VALUES ('labit.z@northeastern.edu', 1)",
    ];

    // Execute initial queries
    for (const query of queries) {
      try {
        await this.executeQuery(query);
      } catch (error) {
        console.error(`Error executing query: ${query.substring(0, 60)}...`, error);
      }
    }

    // Seed job descriptions
    const jobDescriptions = [
      { title: 'Carbonite', file_path: 'uploads/jobdescription/carbonite-jobdes.pdf' },
      {
        title: 'Cygilant',
        file_path: 'uploads/jobdescription/Cygilant Security Research Job Description.pdf',
      },
      {
        title: 'Motionlogic',
        file_path: 'uploads/jobdescription/QA Coop Motionlogic (Berlin, Germany).pdf',
      },
      { title: 'Source One', file_path: 'uploads/jobdescription/SourceOneJobDescription.pdf' },
      {
        title: 'Two Six Labs',
        file_path:
          'uploads/jobdescription/Two Six Labs Data Visualization Co-op Job Description.pdf',
      },
    ];

    for (const job of jobDescriptions) {
      try {
        await this.executeQuery(
          'INSERT IGNORE INTO job_descriptions (title, file_path, class_id) VALUES (?, ?, ?)',
          [job.title, job.file_path, crn]
        );
      } catch (error) {
        console.error(`Error seeding job description ${job.title}:`, error);
      }
    }

    // Seed resume PDFs
    const resumePdfs = [
      { title: 'sample1', file_path: 'uploads/resumes/sample1.pdf' },
      { title: 'sample2', file_path: 'uploads/resumes/sample2.pdf' },
      { title: 'sample3', file_path: 'uploads/resumes/sample3.pdf' },
      { title: 'sample4', file_path: 'uploads/resumes/sample4.pdf' },
      { title: 'sample5', file_path: 'uploads/resumes/sample5.pdf' },
      { title: 'sample6', file_path: 'uploads/resumes/sample6.pdf' },
      { title: 'sample7', file_path: 'uploads/resumes/sample7.pdf' },
      { title: 'sample8', file_path: 'uploads/resumes/sample8.pdf' },
      { title: 'sample9', file_path: 'uploads/resumes/sample9.pdf' },
      { title: 'sample10', file_path: 'uploads/resumes/sample10.pdf' },
    ];

    for (const resume of resumePdfs) {
      try {
        await this.executeQuery(
          'INSERT IGNORE INTO Resume_pdfs (title, file_path, class_id) VALUES (?, ?, ?)',
          [resume.title, resume.file_path, crn]
        );
      } catch (error) {
        console.error(`Error seeding resume PDF ${resume.title}:`, error);
      }
    }

    const candidates = [
      {
        resume_id: 1,
        interview: 'https://www.youtube.com/embed/aA7k6WM4_7A?si=ahwZZpSKUow0-dG2',
        f_name: 'Aisha',
        l_name: 'Patel',
      },
      {
        resume_id: 2,
        interview: 'https://www.youtube.com/embed/4d6v7p0N9Sg?si=nax_IkG0gk3zNae-',
        f_name: 'Casey',
        l_name: 'Fisch',
      },
      {
        resume_id: 3,
        interview: 'https://www.youtube.com/embed/typ4aN11feI?si=7jFsNwhB9ZkKyuo9',
        f_name: 'Ethan',
        l_name: 'Martinez',
      },
      {
        resume_id: 4,
        interview: 'https://www.youtube.com/embed/ySKRfElNPCY?si=2B1cl7djMtE1GLJL',
        f_name: 'Jason',
        l_name: 'Jones',
      },
      {
        resume_id: 5,
        interview: 'https://www.youtube.com/embed/_KGOo1WGKZU?si=aTLlkNgS7di69Sga',
        f_name: 'Lucas',
        l_name: 'Nyugen',
      },
      {
        resume_id: 6,
        interview: 'https://www.youtube.com/embed/AhJrqbDTn1Y?si=_XjOXZJBzSvpN_aM',
        f_name: 'Maya',
        l_name: 'Collins',
      },
      {
        resume_id: 7,
        interview: 'https://www.youtube.com/embed/1dIhJmX4uLo?si=aAna0LIIsxRu8E0K',
        f_name: 'Paula',
        l_name: 'McCartney',
      },
      {
        resume_id: 8,
        interview: 'https://www.youtube.com/embed/cnIv3Zf5nJo?si=aa3ObgHLN5BBP-tp',
        f_name: 'Alex',
        l_name: 'Johnson',
      },
      {
        resume_id: 9,
        interview: 'https://www.youtube.com/embed/0aVcquEhOtQ?si=gzDkWve3Izy9uTFx',
        f_name: 'Jordan',
        l_name: 'Lee',
      },
      {
        resume_id: 10,
        interview: 'https://www.youtube.com/embed/HS3ShcKt288?si=uWmWIVKtNJRvqSu_',
        f_name: 'Zhiyuan',
        l_name: 'Yang',
      },
    ];

    for (const candidate of candidates) {
      try {
        await this.executeQuery(
          'INSERT IGNORE INTO Candidates (resume_id, f_name, l_name, interview) VALUES (?, ?, ?, ?)',
          [candidate.resume_id, candidate.f_name, candidate.l_name, candidate.interview]
        );
      } catch (error) {
        console.error(`Error seeding candidate ${candidate.f_name}:`, error);
      }
    }
  }

  private executeQuery(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.pool) {
        reject(new Error('Database pool not established'));
        return;
      }

      this.pool.query(query, params, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getConnection(): Pool {
    if (!this.pool) {
      throw new Error('Database pool not established');
    }
    return this.pool;
  }

  getPrisma(): PrismaDb {
    if (!this.prisma) {
      throw new Error('Prisma client not established');
    }
    return this.prisma;
  }

  /**
   * Backs /health/db. `queued` above zero means requests are already waiting on
   * a connection, which is the state that used to be invisible: the process
   * looked healthy right up to the point where every student's page hung.
   */
  getPoolStats(): PoolStats {
    if (!this.pool) {
      throw new Error('Database pool not established');
    }

    const queues = this.pool as unknown as PoolQueues;
    const total = queues._allConnections?.length ?? 0;
    const free = queues._freeConnections?.length ?? 0;

    return {
      total,
      free,
      used: total - free,
      queued: queues._connectionQueue?.length ?? 0,
      connectionLimit: this.connectionLimit,
      queueLimit: this.queueLimit,
    };
  }
}

export const databaseService = new DatabaseService();
