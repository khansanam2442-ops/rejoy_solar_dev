import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Resolve the pre-bundled production server path
const distServerPath = path.resolve(process.cwd(), 'dist', 'server.cjs');

// Determine if running under Vite development mode or production
const isRunningInDev = Boolean(
  process.env.VITE_DEV === 'true' ||
  process.env.npm_lifecycle_event === 'dev' ||
  (process.env.NODE_ENV !== 'production' && !fs.existsSync(distServerPath))
);

if (!isRunningInDev && fs.existsSync(distServerPath)) {
  // Production server runtime (`node server.ts`):
  // Run the pre-bundled CommonJS server created during `npm run build`.
  // This guarantees fast startup, native Node.js compatibility, and zero runtime TypeScript loader issues.
  console.log('[Server Runner] Launching production server from dist/server.cjs');
  const mod = await import(pathToFileURL(distServerPath).href);
  const start = mod.startServer || (mod.default && mod.default.startServer);
  if (typeof start === 'function') {
    await start();
  }
} else {
  // Development server runtime (`tsx server.ts`):
  // Run dynamically with Vite middleware for hot module replacement.
  console.log('[Server Runner] Launching development server with Vite middleware');
  const { startServer } = await import('./server/serverApp.ts');
  await startServer();
}
