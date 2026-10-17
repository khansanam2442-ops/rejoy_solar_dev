import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

const TEST_PORT = 3456;

function request(options: http.RequestOptions, bodyData?: string): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body
        });
      });
    });
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runProductionTests() {
  console.log('====================================================');
  console.log('REJOY SOLAR ERP - PRODUCTION ROUTING VERIFICATION');
  console.log('====================================================');

  // Verify production files existence
  const distDir = path.resolve(process.cwd(), 'dist');
  const indexHtml = path.join(distDir, 'index.html');
  const serverCjs = path.join(distDir, 'server.cjs');
  const htaccess = path.join(distDir, '.htaccess');
  const redirects = path.join(distDir, '_redirects');
  const vercelJson = path.resolve(process.cwd(), 'vercel.json');

  console.log('1. Checking static build outputs:');
  console.log(`   - dist/index.html: ${fs.existsSync(indexHtml) ? 'FOUND' : 'MISSING'}`);
  console.log(`   - dist/server.cjs: ${fs.existsSync(serverCjs) ? 'FOUND' : 'MISSING'}`);
  console.log(`   - dist/.htaccess (Apache / Hostinger SPA rules): ${fs.existsSync(htaccess) ? 'FOUND' : 'MISSING'}`);
  console.log(`   - dist/_redirects (Netlify / Cloudflare SPA rules): ${fs.existsSync(redirects) ? 'FOUND' : 'MISSING'}`);
  console.log(`   - vercel.json (Vercel SPA rewrite rules): ${fs.existsSync(vercelJson) ? 'FOUND' : 'MISSING'}`);

  if (!fs.existsSync(indexHtml) || !fs.existsSync(serverCjs)) {
    throw new Error('Production build missing! Please run npm run build.');
  }

  // Find a real static asset to test
  const assetsDir = path.join(distDir, 'assets');
  const assetFiles = fs.readdirSync(assetsDir);
  const realJsAsset = assetFiles.find(f => f.endsWith('.js'));
  const realCssAsset = assetFiles.find(f => f.endsWith('.css'));

  console.log('\n2. Starting production server on test port', TEST_PORT);
  const serverProcess: ChildProcess = spawn('node', [serverCjs], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      APP_PORT: String(TEST_PORT),
      NODE_ENV: 'production'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout?.on('data', d => {
    // console.log(`[prod-server] ${d}`);
  });
  serverProcess.stderr?.on('data', d => {
    // console.error(`[prod-server err] ${d}`);
  });

  // Wait for server to boot
  let started = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await request({ host: '127.0.0.1', port: TEST_PORT, path: '/api/health', method: 'GET' });
      if (res.statusCode === 200) {
        started = true;
        break;
      }
    } catch {
      // server still starting
    }
  }

  if (!started) {
    serverProcess.kill('SIGKILL');
    throw new Error('Production server failed to start within timeout.');
  }

  console.log('   Production server is up and listening on port', TEST_PORT);

  const testCases: { name: string; path: string; method?: string; expectedStatus: number; expectedContentType: string; checkBody?: (b: string) => boolean }[] = [
    // SPA direct access & refresh on valid frontend routes
    { name: 'Root path /', path: '/', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /customers', path: '/customers', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /employees', path: '/employees', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /projects', path: '/projects', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /quotations', path: '/quotations', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /inventory', path: '/inventory', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /settings', path: '/settings', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Nested route: /settings/database', path: '/settings/database', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Nested route: /settings/roles', path: '/settings/roles', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /leads', path: '/leads', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /finance', path: '/finance', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /services', path: '/services', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /reports', path: '/reports', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /customer-portal', path: '/customer-portal', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /live-tracking', path: '/live-tracking', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Frontend route: /login', path: '/login', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },
    { name: 'Route with Query Params: /customers?search=test&page=1', path: '/customers?search=test&page=1', expectedStatus: 200, expectedContentType: 'text/html', checkBody: b => b.includes('<div id="root">') },

    // Backend API endpoints (must NEVER return index.html)
    { name: 'API endpoint: /api/health', path: '/api/health', expectedStatus: 200, expectedContentType: 'application/json', checkBody: b => { const j = JSON.parse(b); return j.status === 'ONLINE'; } },
    { name: 'API endpoint: /api/db/status', path: '/api/db/status', expectedStatus: 200, expectedContentType: 'application/json', checkBody: b => { const j = JSON.parse(b); return 'connected' in j || 'success' in j; } },
    { name: 'Unknown API endpoint: /api/unknown-endpoint', path: '/api/unknown-endpoint', expectedStatus: 404, expectedContentType: 'application/json', checkBody: b => { const j = JSON.parse(b); return j.error === 'API endpoint not found' && !b.includes('<!doctype html>'); } },
    { name: 'Unknown nested API: /api/v1/missing/action', path: '/api/v1/missing/action', expectedStatus: 404, expectedContentType: 'application/json', checkBody: b => { const j = JSON.parse(b); return j.error === 'API endpoint not found'; } },
    { name: 'Unknown API root: /api', path: '/api', expectedStatus: 404, expectedContentType: 'application/json', checkBody: b => { const j = JSON.parse(b); return j.error === 'API endpoint not found'; } },

    // Static Assets
    ...(realJsAsset ? [{ name: `Static JS: /assets/${realJsAsset}`, path: `/assets/${realJsAsset}`, expectedStatus: 200, expectedContentType: 'application/javascript', checkBody: (b: string) => b.length > 50 && !b.includes('<!doctype html>') }] : []),
    ...(realCssAsset ? [{ name: `Static CSS: /assets/${realCssAsset}`, path: `/assets/${realCssAsset}`, expectedStatus: 200, expectedContentType: 'text/css', checkBody: (b: string) => b.length > 50 && !b.includes('<!doctype html>') }] : []),

    // Missing Static Assets (must return clean 404, NEVER index.html)
    { name: 'Missing JS Asset: /assets/missing-asset-123.js', path: '/assets/missing-asset-123.js', expectedStatus: 404, expectedContentType: 'text/plain', checkBody: b => b === 'Not Found' },
    { name: 'Missing Image Asset: /images/nonexistent.png', path: '/images/nonexistent.png', expectedStatus: 404, expectedContentType: 'text/plain', checkBody: b => b === 'Not Found' },
    { name: 'Missing Font Asset: /fonts/missing.woff2', path: '/fonts/missing.woff2', expectedStatus: 404, expectedContentType: 'text/plain', checkBody: b => b === 'Not Found' }
  ];

  console.log('\n3. Running routing test cases against production server:');
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    try {
      const res = await request({
        host: '127.0.0.1',
        port: TEST_PORT,
        path: tc.path,
        method: tc.method || 'GET'
      });

      const contentType = res.headers['content-type'] || '';
      const statusMatch = res.statusCode === tc.expectedStatus;
      const typeMatch = contentType.toLowerCase().includes(tc.expectedContentType.toLowerCase());
      const bodyMatch = tc.checkBody ? tc.checkBody(res.body) : true;

      if (statusMatch && typeMatch && bodyMatch) {
        console.log(`   [PASS] ${tc.name} -> HTTP ${res.statusCode} (${contentType.split(';')[0]})`);
        passed++;
      } else {
        console.error(`   [FAIL] ${tc.name}`);
        console.error(`          Expected HTTP ${tc.expectedStatus} ${tc.expectedContentType}, got HTTP ${res.statusCode} ${contentType}`);
        console.error(`          Body preview: ${res.body.slice(0, 100)}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`   [ERROR] ${tc.name}: ${err?.message || err}`);
      failed++;
    }
  }

  serverProcess.kill('SIGKILL');

  console.log('----------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL PRODUCTION ROUTING TESTS PASSED PERFECTLY!');
  }
}

runProductionTests().catch(err => {
  console.error('Test suite failure:', err);
  process.exit(1);
});
