import { execSync, spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';

export function isPortOpen(port: number, host: string = '127.0.0.1', timeoutMs: number = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      isConnected = true;
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function ensureLocalMySqlRunning(host: string = '127.0.0.1', port: number = 3306): Promise<boolean> {
  // If host is a remote database (not localhost or 127.0.0.1), check if reachable
  const isLocalHost = host === '127.0.0.1' || host === 'localhost' || host === '::1' || !host;
  
  if (!isLocalHost) {
    return isPortOpen(port, host, 3000);
  }

  // Check if MySQL/MariaDB is already responding
  if (await isPortOpen(port, '127.0.0.1')) {
    console.log('[MySQL Supervisor] MySQL daemon already active on 127.0.0.1:3306');
    return true;
  }

  console.log('[MySQL Supervisor] Port 3306 not active. Launching local MySQL/MariaDB service...');

  const hasMysqld = fs.existsSync('/usr/sbin/mariadbd') || fs.existsSync('/usr/bin/mariadbd-safe') || fs.existsSync('/usr/bin/mysqld_safe') || fs.existsSync('/usr/sbin/mysqld');
  if (!hasMysqld) {
    console.warn('[MySQL Supervisor] No local mysqld binary found in system paths.');
    return false;
  }

  // Ensure datadir and runtime socket directory exist with correct permissions
  const datadir = '/var/lib/mysql';
  try {
    if (!fs.existsSync('/run/mysqld')) {
      fs.mkdirSync('/run/mysqld', { recursive: true });
    }
    if (!fs.existsSync(datadir)) {
      fs.mkdirSync(datadir, { recursive: true });
    }
    try {
      execSync('chown -R mysql:mysql /run/mysqld /var/lib/mysql', { stdio: 'ignore' });
    } catch {
      try { execSync('useradd -r -s /bin/false mysql', { stdio: 'ignore' }); } catch {}
      try { execSync('chown -R mysql:mysql /run/mysqld /var/lib/mysql', { stdio: 'ignore' }); } catch {}
    }
  } catch {}

  if (!fs.existsSync(path.join(datadir, 'mysql'))) {
    console.log('[MySQL Supervisor] Initializing MariaDB system tables in /var/lib/mysql...');
    try {
      if (fs.existsSync('/usr/bin/mariadb-install-db')) {
        execSync('mariadb-install-db --user=mysql --datadir=/var/lib/mysql', { stdio: 'inherit' });
      } else if (fs.existsSync('/usr/bin/mysql_install_db')) {
        execSync('mysql_install_db --user=mysql --datadir=/var/lib/mysql', { stdio: 'inherit' });
      }
    } catch (e: any) {
      console.warn('[MySQL Supervisor] Notice during system tables initialization:', e?.message || e);
    }
  }

  // Launch mysqld_safe / mariadbd-safe daemon
  const binary = fs.existsSync('/usr/bin/mariadbd-safe')
    ? '/usr/bin/mariadbd-safe'
    : (fs.existsSync('/usr/bin/mysqld_safe') ? '/usr/bin/mysqld_safe' : '/usr/sbin/mariadbd');

  console.log(`[MySQL Supervisor] Starting daemon using ${binary}...`);
  try {
    const args = binary.includes('safe')
      ? ['--user=mysql', '--datadir=/var/lib/mysql', '--nowatch']
      : ['--user=mysql', '--datadir=/var/lib/mysql'];
    const child = spawn(binary, args, {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } catch (err: any) {
    console.error('[MySQL Supervisor] Error spawning daemon:', err?.message || err);
  }

  // Poll until MySQL accepts connections (up to 15 seconds)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isPortOpen(port, '127.0.0.1')) {
      console.log(`[MySQL Supervisor] MySQL daemon successfully started and accepting connections on port ${port}!`);
      
      // Bootstrap database and privileges if needed using safe stdin (avoids shell character expansion on $ and &)
      try {
        const setupSql = [
          'CREATE DATABASE IF NOT EXISTS `u238683373_rejoy_solar` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
          "CREATE USER IF NOT EXISTS 'u238683373_rejoy_solar'@'localhost' IDENTIFIED BY ';Fl:$tn/9C&d';",
          "CREATE USER IF NOT EXISTS 'u238683373_rejoy_solar'@'127.0.0.1' IDENTIFIED BY ';Fl:$tn/9C&d';",
          "CREATE USER IF NOT EXISTS 'u238683373_rejoy_solar'@'%' IDENTIFIED BY ';Fl:$tn/9C&d';",
          "ALTER USER 'u238683373_rejoy_solar'@'localhost' IDENTIFIED BY ';Fl:$tn/9C&d';",
          "ALTER USER 'u238683373_rejoy_solar'@'127.0.0.1' IDENTIFIED BY ';Fl:$tn/9C&d';",
          "ALTER USER 'u238683373_rejoy_solar'@'%' IDENTIFIED BY ';Fl:$tn/9C&d';",
          "GRANT ALL PRIVILEGES ON `u238683373_rejoy_solar`.* TO 'u238683373_rejoy_solar'@'localhost';",
          "GRANT ALL PRIVILEGES ON `u238683373_rejoy_solar`.* TO 'u238683373_rejoy_solar'@'127.0.0.1';",
          "GRANT ALL PRIVILEGES ON `u238683373_rejoy_solar`.* TO 'u238683373_rejoy_solar'@'%';",
          'FLUSH PRIVILEGES;'
        ].join('\n');
        execSync('mysql', { input: setupSql, stdio: ['pipe', 'ignore', 'ignore'] });
        console.log('[MySQL Supervisor] Verified database & user permissions.');
      } catch (e: any) {
        console.warn('[MySQL Supervisor] Notice provisioning local DB user:', e?.message || e);
      }

      // Check if tables exist, if not import database.sql
      try {
        const dumpPath = path.join(process.cwd(), 'database.sql');
        if (fs.existsSync(dumpPath)) {
          execSync(`mysql u238683373_rejoy_solar < "${dumpPath}"`, { stdio: 'ignore' });
          console.log('[MySQL Supervisor] Baseline database.sql schema verified in MySQL.');
        }
      } catch (e: any) {
        console.warn('[MySQL Supervisor] Notice executing database.sql dump:', e?.message || e);
      }

      return true;
    }
  }

  console.error('[MySQL Supervisor] Timeout: MySQL daemon did not start within 15 seconds.');
  return false;
}
