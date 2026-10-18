# Hostinger Deployment Guide for Rejoy Solar ERP

This guide provides step-by-step instructions to deploy the Rejoy Solar ERP application on **Hostinger** (Shared Hosting or Cloud/VPS Node.js) with authoritative MySQL database persistence and secure Administrator Registration.

---

## 1. Architecture Overview & Root Cause of API 404

### Root Cause of `POST /api/auth/register` 404 on Hostinger
When deploying to Hostinger Apache / LiteSpeed (e.g. `https://test.adduglobal.com`):
1. Previous `.htaccess` configurations had `RewriteRule ^api/ - [L]`, which instructed Apache **not** to rewrite `/api/*` to the SPA index, but rather look for physical files or proxy the request.
2. In Hostinger Shared Hosting, if Node.js was not running on a local port or reverse proxy was unconfigured, and no PHP API router was present in `public_html/api/`, Apache defaulted to its static HTML 404 error page (`This Page Does Not Exist`).
3. **The Solution**: 
   - A universal `.htaccess` configuration with both **Node.js reverse-proxy** support (via `mod_proxy` to `http://127.0.0.1:3000/api/`) AND a native **PHP API Gateway** (`api/index.php`) for shared hosting environments.
   - Both gateways query the exact same MySQL database (`u238683373_rejoy_solar`), execute bcrypt password hashing, validate uniqueness, and return strict JSON with appropriate HTTP status codes (400, 401, 403, 404, 409, 500) — never HTML.

---

## 2. Quick Deployment Steps (Hostinger hPanel)

### Step 1: Run the Production Build
In the project directory, run:
```bash
npm run build
```
This generates the optimized `dist/` directory containing:
```
dist/
├── index.html           <-- Single Page Application HTML entry point
├── .htaccess            <-- Pre-configured Apache reverse-proxy and API gateway rules
├── assets/              <-- Optimized JS, CSS, and vendor bundles
├── api/
│   ├── index.php        <-- Server-side PHP API Gateway (MySQL, bcrypt, auth, CRUD)
│   ├── schema.sql       <-- Complete MySQL database schema
│   └── solar_mysql_dump.sql
└── server.cjs           <-- Compiled Node.js backend server (for Node.js hosting)
```

### Step 2: Upload Files to Hostinger `public_html`
1. Log in to **Hostinger hPanel**.
2. Go to **Websites** → select `test.adduglobal.com` → **File Manager**.
3. Open the **`public_html`** directory (or your target subdomain directory).
4. Upload all files and folders **from inside the `dist/` directory** directly into `public_html/`:
   * Upload `index.html`
   * Upload `.htaccess` (ensure hidden files are shown)
   * Upload `assets/` folder
   * Upload `api/` folder (including `api/index.php`)
   * Upload `server.cjs` (if running Node.js)

### Step 3: Configure Server-Side `.env` Credentials in `public_html`
In Hostinger File Manager, create or edit `.env` in `public_html/.env`:
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=u238683373_rejoy_solar
DB_USER=u238683373_rejoy_solar
DB_PASS=";Fl:$tn/9C&d"
```
*(Protected automatically: `.htaccess` blocks public web downloads of `.env`).*

---

## 3. Deployment Modes

### Mode A: Hostinger Shared Hosting (Standard Apache + PHP + MySQL)
* Zero Node.js process dependency.
* Apache uses `.htaccess` to route all `/api/*` requests directly to `public_html/api/index.php`.
* Native PHP connects to MySQL database `u238683373_rejoy_solar` using PDO and handles:
  - `POST /api/auth/register` (bcrypt hashing, duplicate validation, initial admin lock)
  - `POST /api/auth/login` (bcrypt verification, user profile generation)
  - `GET /api/auth/registration-status`
  - `POST /api/db/test-connection`
  - `GET /api/health`

### Mode B: Hostinger Node.js Application / VPS
* In Hostinger hPanel → **Node.js**:
  - Application Root: `/home/u.../domains/test.adduglobal.com/public_html`
  - Application Startup File: `server.cjs` (or `server.ts` with tsx)
  - Node.js Version: 18.x, 20.x, or 22.x
* `.htaccess` automatically reverse-proxies `/api/(.*)` requests to `http://127.0.0.1:3000/api/$1`.

---

## 4. Verification & Testing

Test your deployment via `curl` or browser DevTools:

1. **Health Check**:
   ```bash
   curl -i https://test.adduglobal.com/api/health
   # Returns HTTP 200 {"status":"ONLINE","app":"SolarPulse EPC ERP & CRM", ...}
   ```

2. **Database Connectivity**:
   ```bash
   curl -i -X POST https://test.adduglobal.com/api/db/test-connection -H "Content-Type: application/json"
   # Returns HTTP 200 {"success":true,"message":"Successfully connected to MySQL..."}
   ```

3. **Admin Registration**:
   ```bash
   curl -i -X POST https://test.adduglobal.com/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Vikram Patel",
       "email": "admin@rejoysolar.com",
       "password": "SecurePassword123",
       "confirmPassword": "SecurePassword123"
     }'
   # Returns HTTP 201 Created or 409 Conflict if already registered
   ```

4. **Admin Login**:
   ```bash
   curl -i -X POST https://test.adduglobal.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@rejoysolar.com",
       "password": "SecurePassword123"
     }'
   # Returns HTTP 200 with authenticated user and session token
   ```
