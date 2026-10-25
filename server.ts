import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';
import { ensureLocalMySqlRunning } from './server/mysqlDaemon';

// Ensure local MySQL / MariaDB daemon is active before server starts
try {
  await ensureLocalMySqlRunning();
} catch (daemonErr) {
  console.warn('[Server Runner] MySQL daemon startup notice:', daemonErr);
}

// Resolve the pre-bundled production server path
const distDir = path.resolve(process.cwd(), 'dist');
const distServerPath = path.resolve(distDir, 'server.cjs');
const distIndexPath = path.resolve(distDir, 'index.html');

// Determine if running under Vite development mode or production
const isRunningInDev = Boolean(
  process.env.VITE_DEV === 'true' ||
  process.env.npm_lifecycle_event === 'dev' ||
  (process.env.NODE_ENV !== 'production' && !process.env.npm_lifecycle_event?.includes('start')) ||
  process.argv.some(a => a.includes('tsx')) ||
  process.execPath.includes('tsx') ||
  process.env._?.includes('tsx')
);

if (!isRunningInDev) {
  // Production server runtime (`node server.ts` or `npm start`):
  // If dist/server.cjs or dist/index.html is missing, automatically build it first!
  if (!fs.existsSync(distServerPath) || !fs.existsSync(distIndexPath)) {
    console.log('[Server Runner] Production artifacts missing. Triggering auto-build...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log('[Server Runner] Build completed successfully.');
    } catch (buildErr) {
      console.error('[Server Runner] Auto-build failed:', buildErr);
    }
  }

  if (fs.existsSync(distServerPath)) {
    console.log('[Server Runner] Launching production server from dist/server.cjs');
    const mod = await import(pathToFileURL(distServerPath).href);
    const start = mod.startServer || (mod.default && mod.default.startServer);
    if (typeof start === 'function') {
      await start();
    }
  } else {
    console.error('[Server Runner] Fatal: dist/server.cjs could not be found or built.');
    process.exit(1);
  }
} else {
  // Development server runtime (`tsx server.ts`):
  // Run dynamically with Vite middleware for hot module replacement.
  console.log('[Server Runner] Launching development server with Vite middleware');
  const { startServer } = await import('./server/serverApp.ts');
  await startServer();
}

