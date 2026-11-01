// src/app.ts

import express, { Application, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import session from 'express-session';
import passport from 'passport';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import MySQLStore from 'express-mysql-session';
import { Pool } from 'mysql2';
import { PrismaDb } from './config/database';
import { requireAdmin } from './middleware/auth.middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import resumeRoutes from './routes/resume.routes';
import resumePdfRoutes from './routes/resume-pdf.routes';
import interviewRoutes from './routes/interview.routes';
import jobRoutes from './routes/job.routes';
import groupRoutes from './routes/group.routes';
import moderatorRoutes from './routes/moderator.routes';
import noteRoutes from './routes/note.routes';
import offerRoutes from './routes/offer.routes';
import progressRoutes from './routes/progress.routes';
import candidateRoutes from './routes/candidate.routes';
import uploadRoutes, { uploadedFileRoutes } from './routes/upload.routes';
import csvRoutes from './routes/csv.routes';
import deleteRoutes from './routes/delete.routes';
import factsRoutes from './routes/facts.routes';

const routeCallCount: Record<string, number> = {};
const routeCallTimestamps: Record<string, number[]> = {};

export class App {
  public app: Application;
  public server: HTTPServer;
  public io: SocketIOServer;
  private sessionStore?: session.Store;
  public onlineStudents: Record<string, string> = {};

  constructor(
    private db: Pool,
    private prisma: PrismaDb
  ) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.REACT_APP_FRONT_URL,
        credentials: true,
      },
    });

    this.initializeMiddleware();
    this.initializeRoutes();
  }

  private initializeMiddleware(): void {
    this.app.set('trust proxy', 1);

    this.app.use(
      cors({
        origin: process.env.REACT_APP_FRONT_URL,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
    );

    // CREATE SESSION STORE FIRST
    const url = new URL(process.env.DATABASE_URL!);
    const SessionStore = MySQLStore(session);
    this.sessionStore = new SessionStore({
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
    });

    // Cross-site cookies need Secure, which browsers only honour over https.
    // Local http development sets COOKIE_SECURE=false; deployments leave it unset.
    const cookieSecure = process.env.COOKIE_SECURE !== 'false';

    // THEN CONFIGURE SESSION WITH THE STORE
    const sessionMiddleware = session({
      secret: process.env.SESSION_SECRET!,
      resave: false,
      // Every anonymous request used to get a session row: static PDF fetches,
      // health checks, and now every Socket.IO handshake, since the session
      // middleware runs on those too. The OAuth flow still gets one, because
      // passport writes its state into the session, which marks it modified.
      saveUninitialized: false,
      store: this.sessionStore, // Now this.sessionStore exists!
      cookie: {
        secure: cookieSecure,
        httpOnly: true,
        sameSite: cookieSecure ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      },
    });

    this.app.use(sessionMiddleware);

    // Body parser
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    // View engine setup
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(__dirname, '../views'));

    // Passport initialization
    this.app.use(passport.initialize());
    this.app.use(passport.session());

    // Run the same three on the Socket.IO handshake, so a socket knows who
    // opened it. Until this existed the socket layer had no identity at all:
    // there was no io.use anywhere, and socket.join() took whatever room string
    // the client sent, so any browser could join another group's room and watch
    // their votes. Engine-level middleware sees the handshake request, which
    // carries the same cookie the HTTP routes authenticate with.
    this.io.engine.use(sessionMiddleware);
    this.io.engine.use(passport.initialize());
    this.io.engine.use(passport.session());

    // Logging middleware
    this.app.use((req, res, next) => {
      const route = `${req.method} ${req.path}`;

      // Increment call count
      if (!routeCallCount[route]) {
        routeCallCount[route] = 0;
        routeCallTimestamps[route] = [];
      }
      routeCallCount[route]++;

      // Keep only the last hour. This array previously grew without bound, so a
      // multi-hour class leaked memory and /stats slowed down over time.
      const now = Date.now();
      const cutoff = now - 3600_000;
      const stamps = routeCallTimestamps[route];
      stamps.push(now);
      if (stamps.length > 64 && stamps[0] < cutoff) {
        routeCallTimestamps[route] = stamps.filter((t) => t >= cutoff);
      }

      // Warn if same route called many times in short period
      const recentCalls = routeCallTimestamps[route].filter(
        (timestamp) => Date.now() - timestamp < 60000 // Last minute
      );

      if (recentCalls.length > 50) {
        console.warn(
          `⚠️  WARNING: ${route} called ${recentCalls.length} times in the last minute!`
        );
      }

      next();
    });
  }

  private initializeRoutes(): void {
    // Health check
    this.app.get('/', (req, res) => {
      res.send('NUHire API is running');
    });

    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', port: process.env.BACKEND_PORT });
    });

    // Stats endpoint
    // Admin only: this exposes the full route map and call volumes.
    this.app.get('/stats', requireAdmin, (req, res) => {
      const stats = Object.entries(routeCallCount)
        .map(([route, count]) => {
          const timestamps = routeCallTimestamps[route];
          const lastMinute = timestamps.filter((t) => Date.now() - t < 60000).length;
          const lastHour = timestamps.filter((t) => Date.now() - t < 3600000).length;

          return {
            route,
            totalCalls: count,
            callsLastMinute: lastMinute,
            callsLastHour: lastHour,
            lastCall: new Date(timestamps[timestamps.length - 1]).toISOString(),
          };
        })
        .sort((a, b) => b.totalCalls - a.totalCalls);

      res.json({
        stats,
        topRoutes: stats.slice(0, 10),
        warnings: stats.filter((s) => s.callsLastMinute > 50),
      });
    });

    // API routes
    this.app.use('/auth', authRoutes(this.db));
    this.app.use('/users', userRoutes(this.db, this.io));
    this.app.use('/resume', resumeRoutes(this.db, this.io));
    this.app.use('/resume_pdf', resumePdfRoutes(this.db, this.io));
    this.app.use('/interview', interviewRoutes(this.db, this.io));
    this.app.use('/jobs', jobRoutes(this.db, this.io, this.onlineStudents));
    this.app.use('/groups', groupRoutes(this.db, this.io));
    this.app.use('/moderator', moderatorRoutes(this.db));
    this.app.use('/notes', noteRoutes(this.prisma));
    this.app.use('/offers', offerRoutes(this.db));
    this.app.use('/progress', progressRoutes(this.db, this.io));
    this.app.use('/candidates', candidateRoutes(this.db));
    this.app.use('/upload', uploadRoutes());
    // /uploads used to be express.static with no auth in front of it, which
    // made every resume public and let an uploaded .html execute as script on
    // this origin. Same URLs, but authenticated and served as bytes (SEC-9).
    this.app.use('/uploads', uploadedFileRoutes());
    this.app.use('/csv', csvRoutes(this.db, this.io));
    this.app.use('/facts', factsRoutes(this.prisma, this.io));
    this.app.use('/delete', deleteRoutes(this.db, this.io, this.onlineStudents));

    // Last. A throw inside a route used to become an unhandled rejection with
    // the request left hanging. Express only treats a handler as an error
    // handler when it has all four parameters, so keep the unused one.
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
      if (res.headersSent) return;
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  public listen(port: number): void {
    this.server.listen(port, () => {
      console.log(`🚀 Server running`);
    });
  }
}
