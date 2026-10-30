import * as dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  const eqMatch = args.find((a) => a.startsWith(`${flag}=`));
  return eqMatch ? eqMatch.slice(flag.length + 1) : undefined;
}

function resolvePort(): number {
  const envPort = Number.parseInt(process.env.PORT || '', 10);
  if (Number.isFinite(envPort) && envPort > 0) {
    return envPort;
  }
  const cliPort = Number.parseInt(resolveCliArg('--port') || '', 10);
  if (Number.isFinite(cliPort) && cliPort > 0) {
    return cliPort;
  }
  return 3000;
}

function resolveHost(): string {
  return process.env.HOST || resolveCliArg('--host') || '0.0.0.0';
}

const PORT = resolvePort();
const HOST = resolveHost();
const STARTUP_TIMEOUT_MS =
  Number.parseInt(process.env.STARTUP_TIMEOUT_MS || '120000', 10) || 120000;

const app = express();
const httpServer = createHttpServer(app);

// Configure HTTP server timeouts above Cloud Run load balancer idle timeout (60s)
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 66_000;
httpServer.requestTimeout = 300_000;
httpServer.timeout = 300_000;

app.use(express.json({ limit: '25mb' }));

let backendInitialized = false;
let backendInitError: Error | null = null;

// Non-blocking startup/liveness health check endpoints (zero DB or AI SDK dependency)
app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/_ah/health', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/readyz', (_req, res) => {
  if (backendInitError) {
    return res.status(503).json({ status: 'error', error: backendInitError.message });
  }
  res.status(200).json({ status: 'ok', initialized: backendInitialized });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: backendInitError ? 'degraded' : 'ok',
    initialized: backendInitialized,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

const apiRouter = express.Router();

const distPath = path.join(__dirname, 'dist');
const distIndexHtml = path.join(distPath, 'index.html');
const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.npm_lifecycle_event === 'start' ||
  (process.env.NODE_ENV !== 'development' && fs.existsSync(distIndexHtml));

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Start asynchronous backend module loading immediately while binding TCP port without delay
const backendReadyPromise = (async () => {
  try {
    const { registerAppRoutes } = await import('./src/server/appRoutes.ts');
    registerAppRoutes(apiRouter, httpServer);
    backendInitialized = true;
  } catch (err: any) {
    backendInitError = err instanceof Error ? err : new Error(String(err));
    console.error('Backend route initialization error:', backendInitError);
    throw backendInitError;
  }
})();

// Hold early cold-start /api/* requests until routes finish mounting (within STARTUP_TIMEOUT_MS)
app.use('/api', async (_req, res, next) => {
  if (backendInitialized) {
    return next();
  }
  try {
    await withTimeout(backendReadyPromise, STARTUP_TIMEOUT_MS, 'Backend initialization');
    next();
  } catch (err: any) {
    res.status(503).json({
      error: err?.message || 'Service is still initializing. Please retry shortly.',
    });
  }
});

app.use(apiRouter);

if (isProduction) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(distIndexHtml);
  });
} else {
  const devRouter = express.Router();
  const viteReadyPromise = (async () => {
    const { createServer: createViteServer } = await import('vite');
    const hmrEnabled = process.env.DISABLE_HMR !== 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: hmrEnabled ? { server: httpServer } : false,
        watch: hmrEnabled ? {} : null,
      },
      appType: 'spa',
    });
    devRouter.use(vite.middlewares);
  })();

  app.use(async (_req, res, next) => {
    try {
      await withTimeout(viteReadyPromise, STARTUP_TIMEOUT_MS, 'Vite dev server initialization');
      next();
    } catch (err: any) {
      res.status(503).send(err?.message || 'Dev server initializing...');
    }
  });
  app.use(devRouter);
}

// Bind 0.0.0.0:$PORT immediately so Cloud Run startup probes succeed in milliseconds
httpServer.listen(PORT, HOST, () => {
  console.log(
    `Sahayak server listening on http://${HOST}:${PORT} (mode=${isProduction ? 'production' : 'development'}, startupTimeoutMs=${STARTUP_TIMEOUT_MS})`
  );
});

const shutdown = (signal: string) => {
  console.log(`Received ${signal}, closing HTTP server gracefully...`);
  httpServer.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
