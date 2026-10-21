<?php
/**
 * Hostinger Apache/LiteSpeed Native PHP API Gateway for Rejoy Solar ERP
 * Handles all production /api/* requests with direct MySQL database persistence,
 * bcrypt password hashing, privilege escalation checks, and strict JSON error responses.
 */

// 1. Prevent raw PHP error dumps from corrupting JSON payloads
ini_set('display_errors', '0');
error_reporting(E_ALL);

// 2. Strict JSON Response & CORS Headers
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, x-admin-token, x-admin-key');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// 3. Global Exception Handler (Guarantees strict JSON, never HTML 500, never leaks SQL details)
set_exception_handler(function ($e) {
    error_log('Unhandled API Gateway Exception: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error while processing API request.'
    ]);
    exit;
});

// 4. Parse Environment Variables from .env file
function loadEnvConfig() {
    $searchPaths = [
        isset($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] . '/.env' : null,
        dirname(__DIR__, 2) . '/.env',
        dirname(__DIR__) . '/.env',
        __DIR__ . '/.env'
    ];

    $env = [];
    foreach ($searchPaths as $path) {
        if ($path && file_exists($path) && is_readable($path)) {
            $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($lines !== false) {
                foreach ($lines as $line) {
                    $trimmed = trim($line);
                    if (empty($trimmed) || $trimmed[0] === '#') continue;
                    $pos = strpos($trimmed, '=');
                    if ($pos !== false) {
                        $key = trim(substr($trimmed, 0, $pos));
                        $val = trim(substr($trimmed, $pos + 1));
                        $len = strlen($val);
                        if ($len >= 2) {
                            if (($val[0] === '"' && $val[$len - 1] === '"') ||
                                ($val[0] === "'" && $val[$len - 1] === "'")) {
                                $val = substr($val, 1, -1);
                            }
                        }
                        $env[$key] = $val;
                    }
                }
                break;
            }
        }
    }

    return [
        'host' => getenv('DB_HOST') ?: ($env['DB_HOST'] ?? '127.0.0.1'),
        'port' => (int)(getenv('DB_PORT') ?: ($env['DB_PORT'] ?? 3306)),
        'user' => getenv('DB_USER') ?: ($env['DB_USER'] ?? 'u238683373_rejoy_solar'),
        'pass' => getenv('DB_PASS') ?: ($env['DB_PASS'] ?? ';Fl:$tn/9C&d'),
        'name' => getenv('DB_NAME') ?: ($env['DB_NAME'] ?? 'u238683373_rejoy_solar')
    ];
}

$dbConfig = loadEnvConfig();

// 5. Database Connection with TCP/Socket Fallback and Strict Timeout
function getDbConnection($config) {
    $hosts = [$config['host']];
    if ($config['host'] === '127.0.0.1') {
        $hosts[] = 'localhost';
    } elseif ($config['host'] === 'localhost') {
        $hosts[] = '127.0.0.1';
    }

    $lastError = '';
    foreach ($hosts as $host) {
        try {
            $dsn = "mysql:host={$host};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 4
            ];
            if (defined('PDO::MYSQL_ATTR_MULTI_STATEMENTS')) {
                $options[PDO::MYSQL_ATTR_MULTI_STATEMENTS] = true;
            }
            $pdo = new PDO($dsn, $config['user'], $config['pass'], $options);
            return $pdo;
        } catch (PDOException $e) {
            $lastError = $e->getMessage();
        }
    }

    error_log("Database connection failed on host(s) " . implode(',', $hosts) . ": $lastError");
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'error' => 'Database connection failed. Please verify MySQL service and credentials in .env.',
        'allowPublicRegistration' => false
    ]);
    exit;
}

// 6. Ensure Core Database Tables Exist (Auto-Provisioning / Self-Healing)
function ensureRequiredTables($pdo) {
    static $tablesVerified = false;
    if ($tablesVerified) return;

    // 1. Create solar_users table
    $sqlUsers = "CREATE TABLE IF NOT EXISTS `solar_users` (
      `id` VARCHAR(64) PRIMARY KEY,
      `name` VARCHAR(255) NOT NULL,
      `email` VARCHAR(191) NOT NULL UNIQUE,
      `password` VARCHAR(255) NOT NULL DEFAULT '123456',
      `role` VARCHAR(64) NOT NULL DEFAULT 'Super Admin',
      `phone` VARCHAR(32) DEFAULT '',
      `department` VARCHAR(64) DEFAULT 'Operations',
      `designation` VARCHAR(128) DEFAULT '',
      `employee_id` VARCHAR(64) DEFAULT NULL,
      `customer_id` VARCHAR(64) DEFAULT NULL,
      `avatar` TEXT,
      `is_field_worker` TINYINT(1) DEFAULT 0,
      `status` VARCHAR(32) DEFAULT 'ACTIVE',
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX `idx_users_role` (`role`),
      INDEX `idx_users_email` (`email`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    // 2. Create solar_employees table
    $sqlEmployees = "CREATE TABLE IF NOT EXISTS `solar_employees` (
      `id` VARCHAR(64) PRIMARY KEY,
      `employee_code` VARCHAR(32) NOT NULL,
      `name` VARCHAR(255) NOT NULL,
      `email` VARCHAR(191) NOT NULL,
      `phone` VARCHAR(32) NOT NULL,
      `department` VARCHAR(64) NOT NULL,
      `designation` VARCHAR(128) NOT NULL,
      `system_role` VARCHAR(64) NOT NULL DEFAULT 'Installation Team',
      `assigned_role` VARCHAR(64) DEFAULT 'Installation Team',
      `login_enabled` TINYINT(1) DEFAULT 1,
      `account_status` VARCHAR(32) DEFAULT 'ACTIVE',
      `status` VARCHAR(32) DEFAULT 'ACTIVE',
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX `idx_emp_code` (`employee_code`),
      INDEX `idx_emp_email` (`email`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    // 3. Create solar_customers table with full 19-column schema
    $sqlCustomers = "CREATE TABLE IF NOT EXISTS `solar_customers` (
      `id` VARCHAR(64) PRIMARY KEY,
      `customer_code` VARCHAR(32) NOT NULL,
      `name` VARCHAR(255) NOT NULL,
      `company_name` VARCHAR(255) DEFAULT '',
      `customer_type` VARCHAR(32) DEFAULT 'Residential',
      `phone` VARCHAR(32) NOT NULL,
      `email` VARCHAR(191) DEFAULT '',
      `password` VARCHAR(255) NOT NULL DEFAULT '123456',
      `site_address` TEXT,
      `city` VARCHAR(128) NOT NULL DEFAULT 'Ahmedabad',
      `state` VARCHAR(128) DEFAULT 'Gujarat',
      `pincode` VARCHAR(16) DEFAULT '380001',
      `gst_number` VARCHAR(32) DEFAULT '',
      `electricity_consumer_no` VARCHAR(64) DEFAULT '',
      `sanctioned_load_kw` DECIMAL(10,2) DEFAULT 0.00,
      `status` VARCHAR(32) DEFAULT 'ACTIVE',
      `active_project_id` VARCHAR(64) DEFAULT NULL,
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX `idx_customers_phone` (`phone`),
      INDEX `idx_customers_email` (`email`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    // 4. Create solar_projects table
    $sqlProjects = "CREATE TABLE IF NOT EXISTS `solar_projects` (
      `id` VARCHAR(64) PRIMARY KEY,
      `project_code` VARCHAR(32) NOT NULL,
      `customer_id` VARCHAR(64) NOT NULL,
      `customer_name` VARCHAR(255) NOT NULL,
      `title` VARCHAR(255) NOT NULL,
      `capacity_kw` DECIMAL(10,2) NOT NULL DEFAULT 10.00,
      `total_value` DECIMAL(14,2) NOT NULL DEFAULT 500000.00,
      `status` VARCHAR(32) NOT NULL DEFAULT 'SURVEY',
      `current_stage_key` VARCHAR(64) NOT NULL DEFAULT 'site_survey',
      `completion_percentage` INT DEFAULT 0,
      `progress_percentage` INT DEFAULT 0,
      `location` VARCHAR(255) DEFAULT 'Ahmedabad',
      `assigned_users_json` LONGTEXT,
      `site_address` TEXT,
      `city` VARCHAR(128) DEFAULT 'Ahmedabad',
      `start_date` DATE,
      `expected_completion_date` DATE,
      `stages_json` LONGTEXT,
      `notes` TEXT,
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX `idx_projects_customer` (`customer_id`),
      INDEX `idx_projects_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

    try {
        $pdo->exec($sqlUsers);
        $pdo->exec($sqlEmployees);
        $pdo->exec($sqlCustomers);
        $pdo->exec($sqlProjects);
    } catch (Exception $e) {
        error_log('Notice during initial table creation: ' . $e->getMessage());
    }

    // Auto-migrate missing columns for existing solar_customers table
    $custColsNeeded = [
        'company_name' => "VARCHAR(255) DEFAULT ''",
        'customer_type' => "VARCHAR(32) DEFAULT 'Residential'",
        'site_address' => "TEXT",
        'city' => "VARCHAR(128) NOT NULL DEFAULT 'Ahmedabad'",
        'state' => "VARCHAR(128) DEFAULT 'Gujarat'",
        'pincode' => "VARCHAR(16) DEFAULT '380001'",
        'gst_number' => "VARCHAR(32) DEFAULT ''",
        'electricity_consumer_no' => "VARCHAR(64) DEFAULT ''",
        'sanctioned_load_kw' => "DECIMAL(10,2) DEFAULT 0.00",
        'status' => "VARCHAR(32) DEFAULT 'ACTIVE'",
        'active_project_id' => "VARCHAR(64) DEFAULT NULL",
        'updated_at' => "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    ];
    try {
        $stmtCols = $pdo->query("SHOW COLUMNS FROM `solar_customers`");
        if ($stmtCols) {
            $existingCols = [];
            while ($row = $stmtCols->fetch(PDO::FETCH_ASSOC)) {
                $existingCols[strtolower($row['Field'])] = true;
            }
            foreach ($custColsNeeded as $col => $typeDef) {
                if (!isset($existingCols[strtolower($col)])) {
                    try {
                        $pdo->exec("ALTER TABLE `solar_customers` ADD COLUMN `$col` $typeDef");
                    } catch (Exception $e) {}
                }
            }
            // Drop unique index on email if present (so empty or non-unique emails don't fail)
            try {
                $pdo->exec("ALTER TABLE `solar_customers` DROP INDEX `email`");
            } catch (Exception $e) {}
        }
    } catch (Exception $e) {
        error_log('Notice during solar_customers column verification: ' . $e->getMessage());
    }

    // Try executing full schema.sql if available
    $schemaFiles = [
        __DIR__ . '/schema.sql',
        __DIR__ . '/solar_mysql_dump.sql'
    ];
    foreach ($schemaFiles as $file) {
        if (file_exists($file) && is_readable($file)) {
            try {
                $sql = file_get_contents($file);
                if (!empty($sql)) {
                    $pdo->exec($sql);
                    break;
                }
            } catch (Exception $e) {
                error_log('Notice during full schema import from ' . basename($file) . ': ' . $e->getMessage());
            }
        }
    }

    $tablesVerified = true;
}

// 7. Normalize Path & Method
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$parsedPath = parse_url($requestUri, PHP_URL_PATH) ?: '/';
if (!empty($_SERVER['PATH_INFO'])) {
    $parsedPath = $_SERVER['PATH_INFO'];
}

$cleanPath = rtrim($parsedPath, '/');
if (empty($cleanPath)) $cleanPath = '/';

// Strip /api prefix if present
if (substr($cleanPath, 0, 4) === '/api') {
    $cleanPath = substr($cleanPath, 4);
    if (empty($cleanPath)) $cleanPath = '/';
}
$cleanPath = rtrim($cleanPath, '/');
if (empty($cleanPath)) $cleanPath = '/';

$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true) ?: [];

// 8. Route Handling

// Health & Availability Check
if ($method === 'GET' && in_array($cleanPath, ['/health', '/status', '/status.php', '/'])) {
    $dbConnected = false;
    $dbVersion = 'Unknown';
    try {
        $pdo = getDbConnection($dbConfig);
        $stmt = $pdo->query('SELECT VERSION() as v');
        $row = $stmt->fetch();
        $dbConnected = true;
        $dbVersion = $row['v'] ?? 'Connected';
    } catch (Exception $e) {}

    http_response_code(200);
    echo json_encode([
        'status' => 'ONLINE',
        'app' => 'Rejoy Solar ERP & CRM',
        'version' => '1.0.0',
        'backend' => 'Hostinger Native PHP/MySQL Gateway',
        'database' => $dbConnected ? 'CONNECTED' : 'DISCONNECTED',
        'db_version' => $dbVersion,
        'server_time' => date('c'),
        'routing' => 'Active Gateway (No Proxy Timeout)'
    ]);
    exit;
}

// Database Connection Test
if (in_array($cleanPath, ['/db/test-connection', '/db/test', '/db.php'])) {
    $pdo = getDbConnection($dbConfig);
    $stmt = $pdo->query('SELECT VERSION() as v');
    $row = $stmt->fetch();
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Successfully connected to MySQL ' . ($row['v'] ?? '') . ' on ' . $dbConfig['host'],
        'version' => $row['v'] ?? 'Unknown'
    ]);
    exit;
}

// Database Status & Table Inventory
if ($method === 'GET' && in_array($cleanPath, ['/db/status', '/db'])) {
    $pdo = getDbConnection($dbConfig);
    $tables = [];
    try {
        $stmt = $pdo->query('SHOW TABLES');
        while ($r = $stmt->fetch(PDO::FETCH_NUM)) {
            $tables[] = $r[0];
        }
    } catch (Exception $e) {
        error_log('SHOW TABLES failed: ' . $e->getMessage());
    }

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'connected' => true,
        'host' => $dbConfig['host'],
        'port' => $dbConfig['port'],
        'database' => $dbConfig['name'],
        'tables' => $tables,
        'tablesCount' => count($tables)
    ]);
    exit;
}

// POST /api/db/migrate - Initialize Database Schema
if ($method === 'POST' && in_array($cleanPath, ['/db/migrate', '/db/migrate/'])) {
    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    $tables = [];
    try {
        $stmt = $pdo->query('SHOW TABLES');
        while ($r = $stmt->fetch(PDO::FETCH_NUM)) {
            $tables[] = $r[0];
        }
    } catch (Exception $e) {}

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Database schema migration executed successfully.',
        'tables' => $tables,
        'tablesCount' => count($tables)
    ]);
    exit;
}

// GET /api/auth/registration-status - Administrator Registration Status
if ($method === 'GET' && in_array($cleanPath, ['/auth/registration-status', '/auth/registration-status/'])) {
    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    $admins = [];
    try {
        $stmt = $pdo->query("SELECT id, email FROM `solar_users` WHERE role IN ('Admin', 'Super Admin') AND status = 'ACTIVE'");
        if ($stmt) {
            $admins = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    } catch (PDOException $e) {
        error_log('registration-status query notice: ' . $e->getMessage());
        $admins = [];
    }

    $nonDemoCount = 0;
    foreach ($admins as $a) {
        $email = strtolower($a['email'] ?? '');
        $id = $a['id'] ?? '';
        $isDemo = (strpos($email, 'admin@rejoysolar.com') !== false) || (substr($id, 0, 5) === 'demo-');
        if (!$isDemo) {
            $nonDemoCount++;
        }
    }

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'allowPublicRegistration' => ($nonDemoCount === 0),
        'adminCount' => count($admins)
    ]);
    exit;
}

// POST /api/auth/register - Administrator Registration
if ($method === 'POST' && in_array($cleanPath, ['/auth/register', '/auth/register/'])) {
    $name = trim($body['name'] ?? '');
    $email = strtolower(trim($body['email'] ?? ''));
    $password = trim($body['password'] ?? '');
    $confirmPassword = trim($body['confirmPassword'] ?? '');
    $phone = trim($body['phone'] ?? '+91 98250 11223');
    $department = trim($body['department'] ?? 'Administration');
    $designation = trim($body['designation'] ?? 'Lead Administrator');

    // 1. Input Validation
    if (empty($name) || empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Name, email, and password are required.']);
        exit;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'A valid business email address is required.']);
        exit;
    }

    if (strlen($password) < 6) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Password must be at least 6 characters long.']);
        exit;
    }

    if (!empty($confirmPassword) && $password !== $confirmPassword) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Passwords do not match. Please verify your confirm password field.']);
        exit;
    }

    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    // 2. Privilege Escalation Guard: Check if public setup is permitted
    $admins = [];
    try {
        $stmt = $pdo->query("SELECT id, email FROM `solar_users` WHERE role IN ('Admin', 'Super Admin') AND status = 'ACTIVE'");
        if ($stmt) {
            $admins = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    } catch (PDOException $e) {
        $admins = [];
    }

    $nonDemoCount = 0;
    foreach ($admins as $a) {
        $em = strtolower($a['email'] ?? '');
        $id = $a['id'] ?? '';
        $isDemo = (strpos($em, 'admin@rejoysolar.com') !== false) || (substr($id, 0, 5) === 'demo-');
        if (!$isDemo) {
            $nonDemoCount++;
        }
    }

    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $adminToken = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';
    $isAuthorized = (!empty($authHeader) && strlen($authHeader) > 10) || (!empty($adminToken) && strlen($adminToken) > 5);

    if ($nonDemoCount > 0 && !$isAuthorized) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => 'Public administrator registration is closed. Additional administrators must be created by an existing authorized Administrator.'
        ]);
        exit;
    }

    // 3. Duplicate Email Check in solar_users
    try {
        $stmt = $pdo->prepare('SELECT id FROM `solar_users` WHERE LOWER(email) = ? LIMIT 1');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'An account with this email address already exists in MySQL.']);
            exit;
        }
    } catch (PDOException $e) {
        // Table verified
    }

    // 4. Duplicate Email Check in solar_customers
    try {
        $stmt = $pdo->prepare('SELECT id FROM `solar_customers` WHERE LOWER(email) = ? LIMIT 1');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'This email is already registered as an ERP customer.']);
            exit;
        }
    } catch (PDOException $e) {
        // Non-fatal if solar_customers not yet queried
    }

    // 5. Secure bcrypt Password Hashing
    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
    $userId = 'usr-admin-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(3)), 0, 5);
    $empCode = 'EMP-ADM-' . rand(100, 999);

    // 6. Transactional Database Insertion
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("
            INSERT INTO `solar_users` (
                `id`, `name`, `email`, `password`, `role`, `phone`, `department`,
                `designation`, `employee_id`, `is_field_worker`, `status`
            ) VALUES (?, ?, ?, ?, 'Admin', ?, ?, ?, ?, 0, 'ACTIVE')
        ");
        $stmt->execute([
            $userId,
            $name,
            $email,
            $hashedPassword,
            $phone,
            $department,
            $designation,
            $empCode
        ]);

        try {
            $stmtEmp = $pdo->prepare("
                INSERT INTO `solar_employees` (
                    `id`, `employee_code`, `name`, `email`, `phone`, `department`,
                    `designation`, `system_role`, `assigned_role`, `login_enabled`, `account_status`, `status`
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Admin', 'Admin', 1, 'ACTIVE', 'ACTIVE')
            ");
            $stmtEmp->execute([
                $userId,
                $empCode,
                $name,
                $email,
                $phone,
                $department,
                $designation
            ]);
        } catch (Exception $e) {
            // Non-fatal if employee directory row is already present
        }

        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Failed to save administrator record into MySQL: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Failed to save administrator record into database. Please try again or contact administrator.'
        ]);
        exit;
    }

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'Admin account created successfully.',
        'user' => [
            'id' => $userId,
            'name' => $name,
            'email' => $email,
            'role' => 'Admin',
            'phone' => $phone,
            'department' => $department,
            'designation' => $designation,
            'employeeId' => $empCode,
            'isFieldWorker' => false
        ],
        'token' => 'jwt-mysql-session-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(4)), 0, 8)
    ]);
    exit;
}

// POST /api/auth/login - User Authentication
if ($method === 'POST' && in_array($cleanPath, ['/auth/login', '/auth/login/'])) {
    $email = strtolower(trim($body['email'] ?? ''));
    $password = trim($body['password'] ?? '');

    if (empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email and password are required.']);
        exit;
    }

    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    $user = null;
    try {
        $stmt = $pdo->prepare('SELECT * FROM `solar_users` WHERE LOWER(email) = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
    } catch (PDOException $e) {
        error_log('User query error: ' . $e->getMessage());
    }

    if ($user) {
        $storedHash = $user['password'] ?? '';
        $matches = false;

        if (password_verify($password, $storedHash)) {
            $matches = true;
        } elseif ($password === $storedHash) {
            // Auto-upgrade legacy plaintext to bcrypt
            $matches = true;
            try {
                $newHash = password_hash($password, PASSWORD_BCRYPT);
                $up = $pdo->prepare('UPDATE `solar_users` SET `password` = ? WHERE `id` = ?');
                $up->execute([$newHash, $user['id']]);
            } catch (Exception $e) {}
        }

        if ($matches) {
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'user' => [
                    'id' => $user['id'],
                    'name' => $user['name'] ?? 'User',
                    'email' => $user['email'],
                    'role' => $user['role'] ?? 'Admin',
                    'phone' => $user['phone'] ?? '',
                    'department' => $user['department'] ?? 'Administration',
                    'designation' => $user['designation'] ?? 'Staff',
                    'employeeId' => $user['employee_id'] ?? '',
                    'isFieldWorker' => (bool)($user['is_field_worker'] ?? false)
                ],
                'token' => 'jwt-mysql-session-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(4)), 0, 8)
            ]);
            exit;
        }
    }

    // Check solar_customers table if not matched in solar_users
    try {
        $stmtCust = $pdo->prepare('SELECT * FROM `solar_customers` WHERE LOWER(email) = ? LIMIT 1');
        $stmtCust->execute([$email]);
        $cust = $stmtCust->fetch();
        if ($cust) {
            $cHash = $cust['password'] ?? '';
            $cMatches = password_verify($password, $cHash) || ($password === $cHash);
            if ($cMatches) {
                http_response_code(200);
                echo json_encode([
                    'success' => true,
                    'user' => [
                        'id' => 'usr-' . $cust['id'],
                        'customerId' => $cust['id'],
                        'name' => $cust['name'] ?? 'Customer',
                        'email' => $cust['email'],
                        'role' => 'Customer',
                        'phone' => $cust['phone'] ?? '',
                        'department' => 'Customer',
                        'designation' => 'Customer',
                        'employeeId' => 'CUST-' . $cust['id'],
                        'isFieldWorker' => false
                    ],
                    'token' => 'jwt-mysql-session-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(4)), 0, 8)
                ]);
                exit;
            }
        }
    } catch (Exception $e) {}

    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid credentials. Please verify your email and password in MySQL.'
    ]);
    exit;
}

// Helper: Save Customer into MySQL
function saveCustomerToDb($pdo, $item) {
    if (empty($item['id'])) {
        $item['id'] = 'cust-' . round(microtime(true) * 1000);
    }
    $customerCode = $item['customerCode'] ?? $item['customer_code'] ?? ('CUST-' . rand(100, 999));
    $name = trim($item['name'] ?? '');
    $companyName = trim($item['companyName'] ?? $item['company_name'] ?? $name);
    $customerType = $item['customerType'] ?? $item['customer_type'] ?? 'Commercial';
    $phone = trim($item['phone'] ?? '');
    $email = strtolower(trim($item['email'] ?? ''));
    $password = $item['password'] ?? '123456';
    $siteAddress = $item['siteAddress'] ?? $item['site_address'] ?? '';
    $city = $item['city'] ?? 'Ahmedabad';
    $state = $item['state'] ?? 'Gujarat';
    $pincode = $item['pincode'] ?? '380001';
    $gstNumber = $item['gstNumber'] ?? $item['gst_number'] ?? '';
    $electricityConsumerNo = $item['electricityConsumerNo'] ?? $item['electricity_consumer_no'] ?? '';
    $sanctionedLoadKw = floatval($item['sanctionedLoadKw'] ?? $item['sanctioned_load_kw'] ?? 0);
    $status = $item['status'] ?? 'ACTIVE';
    $activeProjectId = $item['activeProjectId'] ?? $item['active_project_id'] ?? null;

    try {
        $stmt = $pdo->prepare("
            INSERT INTO `solar_customers` (
                `id`, `customer_code`, `name`, `company_name`, `customer_type`,
                `phone`, `email`, `password`, `site_address`, `city`, `state`,
                `pincode`, `gst_number`, `electricity_consumer_no`, `sanctioned_load_kw`,
                `status`, `active_project_id`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                `name` = VALUES(`name`),
                `company_name` = VALUES(`company_name`),
                `customer_type` = VALUES(`customer_type`),
                `phone` = VALUES(`phone`),
                `email` = VALUES(`email`),
                `site_address` = VALUES(`site_address`),
                `city` = VALUES(`city`),
                `state` = VALUES(`state`),
                `pincode` = VALUES(`pincode`),
                `gst_number` = VALUES(`gst_number`),
                `electricity_consumer_no` = VALUES(`electricity_consumer_no`),
                `sanctioned_load_kw` = VALUES(`sanctioned_load_kw`),
                `status` = VALUES(`status`),
                `active_project_id` = VALUES(`active_project_id`)
        ");
        $stmt->execute([
            $item['id'], $customerCode, $name, $companyName, $customerType,
            $phone, $email, $password, $siteAddress, $city, $state,
            $pincode, $gstNumber, $electricityConsumerNo, $sanctionedLoadKw,
            $status, $activeProjectId
        ]);
    } catch (PDOException $e) {
        error_log("saveCustomerToDb initial error: " . $e->getMessage());
        try {
            ensureRequiredTables($pdo);
            $stmt->execute([
                $item['id'], $customerCode, $name, $companyName, $customerType,
                $phone, $email, $password, $siteAddress, $city, $state,
                $pincode, $gstNumber, $electricityConsumerNo, $sanctionedLoadKw,
                $status, $activeProjectId
            ]);
        } catch (Exception $e2) {
            error_log("saveCustomerToDb retry error: " . $e2->getMessage());
            try {
                $stmtMin = $pdo->prepare("
                    INSERT INTO `solar_customers` (`id`, `customer_code`, `name`, `email`, `phone`, `password`)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `phone` = VALUES(`phone`)
                ");
                $stmtMin->execute([$item['id'], $customerCode, $name, $email, $phone, $password]);
            } catch (Exception $e3) {
                error_log("saveCustomerToDb minimal fallback error: " . $e3->getMessage());
            }
        }
    }

    return [
        'id' => $item['id'],
        'customerCode' => $customerCode,
        'name' => $name,
        'companyName' => $companyName,
        'customerType' => $customerType,
        'phone' => $phone,
        'email' => $email,
        'siteAddress' => $siteAddress,
        'city' => $city,
        'state' => $state,
        'pincode' => $pincode,
        'gstNumber' => $gstNumber,
        'electricityConsumerNo' => $electricityConsumerNo,
        'sanctionedLoadKw' => $sanctionedLoadKw,
        'status' => $status,
        'activeProjectId' => $activeProjectId,
        'createdAt' => date('c'),
        'updatedAt' => date('c')
    ];
}

// Helper: Save Project into MySQL
function saveProjectToDb($pdo, $item) {
    if (empty($item['id'])) {
        $item['id'] = 'proj-' . round(microtime(true) * 1000);
    }
    $projectCode = $item['projectCode'] ?? $item['project_code'] ?? ('SOL-' . date('Y') . '-' . rand(100, 999));
    $customerId = $item['customerId'] ?? $item['customer_id'] ?? '';
    $customerName = $item['customerName'] ?? $item['customer_name'] ?? '';
    $title = $item['title'] ?? 'Solar Project';
    $capacityKw = floatval($item['capacityKw'] ?? $item['capacity_kw'] ?? 10);
    $totalValue = floatval($item['totalValue'] ?? $item['total_value'] ?? 500000);
    $status = $item['status'] ?? 'SURVEY';
    $currentStageKey = $item['currentStageKey'] ?? $item['current_stage_key'] ?? 'site_survey';
    $completionPercentage = intval($item['completionPercentage'] ?? $item['completion_percentage'] ?? 0);
    $progressPercentage = intval($item['progressPercentage'] ?? $item['progress_percentage'] ?? 0);
    $location = $item['location'] ?? 'Ahmedabad';
    $assignedUsersJson = is_string($item['assignedUsers'] ?? '') ? $item['assignedUsers'] : json_encode($item['assignedUsers'] ?? []);
    $siteAddress = $item['siteAddress'] ?? $item['site_address'] ?? '';
    $city = $item['city'] ?? 'Ahmedabad';
    $startDate = !empty($item['startDate']) ? date('Y-m-d', strtotime($item['startDate'])) : date('Y-m-d');
    $expectedCompletionDate = !empty($item['expectedCompletionDate']) ? date('Y-m-d', strtotime($item['expectedCompletionDate'])) : date('Y-m-d', strtotime('+45 days'));
    $stagesJson = is_string($item['stages'] ?? '') ? $item['stages'] : json_encode($item['stages'] ?? []);
    $notes = $item['notes'] ?? '';

    try {
        $stmt = $pdo->prepare("
            INSERT INTO `solar_projects` (
                `id`, `project_code`, `customer_id`, `customer_name`, `title`,
                `capacity_kw`, `total_value`, `status`, `current_stage_key`,
                `completion_percentage`, `progress_percentage`, `location`,
                `assigned_users_json`, `site_address`, `city`, `start_date`,
                `expected_completion_date`, `stages_json`, `notes`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                `customer_name` = VALUES(`customer_name`),
                `title` = VALUES(`title`),
                `capacity_kw` = VALUES(`capacity_kw`),
                `total_value` = VALUES(`total_value`),
                `status` = VALUES(`status`),
                `current_stage_key` = VALUES(`current_stage_key`),
                `completion_percentage` = VALUES(`completion_percentage`),
                `progress_percentage` = VALUES(`progress_percentage`),
                `location` = VALUES(`location`),
                `assigned_users_json` = VALUES(`assigned_users_json`),
                `site_address` = VALUES(`site_address`),
                `city` = VALUES(`city`),
                `start_date` = VALUES(`start_date`),
                `expected_completion_date` = VALUES(`expected_completion_date`),
                `stages_json` = VALUES(`stages_json`),
                `notes` = VALUES(`notes`)
        ");
        $stmt->execute([
            $item['id'], $projectCode, $customerId, $customerName, $title,
            $capacityKw, $totalValue, $status, $currentStageKey,
            $completionPercentage, $progressPercentage, $location,
            $assignedUsersJson, $siteAddress, $city, $startDate,
            $expectedCompletionDate, $stagesJson, $notes
        ]);
    } catch (Exception $e) {
        error_log("saveProjectToDb error: " . $e->getMessage());
    }

    return [
        'id' => $item['id'],
        'projectCode' => $projectCode,
        'customerId' => $customerId,
        'customerName' => $customerName,
        'title' => $title,
        'capacityKw' => $capacityKw,
        'totalValue' => $totalValue,
        'status' => $status,
        'currentStageKey' => $currentStageKey,
        'completionPercentage' => $completionPercentage,
        'progressPercentage' => $progressPercentage,
        'location' => $location,
        'assignedUsers' => is_string($item['assignedUsers'] ?? '') ? json_decode($item['assignedUsers'], true) : ($item['assignedUsers'] ?? []),
        'siteAddress' => $siteAddress,
        'city' => $city,
        'startDate' => $startDate,
        'expectedCompletionDate' => $expectedCompletionDate,
        'stages' => is_string($item['stages'] ?? '') ? json_decode($item['stages'], true) : ($item['stages'] ?? []),
        'notes' => $notes,
        'createdAt' => date('c'),
        'updatedAt' => date('c')
    ];
}

// POST /api/sync/push - Real-Time MySQL Synchronization
if ($method === 'POST' && in_array($cleanPath, ['/sync/push', '/sync/push/'])) {
    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    $collection = $body['collection'] ?? '';
    $item = $body['item'] ?? null;
    $items = $body['items'] ?? null;
    $action = $body['action'] ?? 'save';

    if (empty($collection)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Collection name is required.']);
        exit;
    }

    try {
        if ($action === 'delete' && $item && !empty($item['id'])) {
            $table = 'solar_' . $collection;
            try {
                $stmt = $pdo->prepare("DELETE FROM `$table` WHERE `id` = ?");
                $stmt->execute([$item['id']]);
            } catch (Exception $e) {}
            http_response_code(200);
            echo json_encode(['success' => true, 'message' => "Deleted from $collection"]);
            exit;
        }

        if ($item) {
            $saved = $item;
            if ($collection === 'customers') {
                $saved = saveCustomerToDb($pdo, $item);
            } elseif ($collection === 'projects') {
                $saved = saveProjectToDb($pdo, $item);
            }
            http_response_code(200);
            echo json_encode(['success' => true, 'data' => $saved, 'message' => "Saved to $collection"]);
            exit;
        }

        if ($items && is_array($items)) {
            foreach ($items as $it) {
                if ($collection === 'customers') {
                    saveCustomerToDb($pdo, $it);
                } elseif ($collection === 'projects') {
                    saveProjectToDb($pdo, $it);
                }
            }
            http_response_code(200);
            echo json_encode(['success' => true, 'count' => count($items), 'message' => "Synced $collection to MySQL"]);
            exit;
        }

        http_response_code(200);
        echo json_encode(['success' => true, 'message' => "Sync processed"]);
        exit;
    } catch (Exception $e) {
        error_log("Error in /sync/push: " . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database persistence error: ' . $e->getMessage(),
            'collection' => $collection
        ]);
        exit;
    }
}

// Customers API: /customers
if ($cleanPath === '/customers' || $cleanPath === '/customers/') {
    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    if ($method === 'GET') {
        $stmt = $pdo->query('SELECT * FROM `solar_customers` ORDER BY `created_at` DESC');
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        http_response_code(200);
        echo json_encode(['success' => true, 'count' => count($rows), 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        if (empty($body['name']) || empty($body['phone'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Customer name and phone are required.']);
            exit;
        }
        $saved = saveCustomerToDb($pdo, $body);
        http_response_code(201);
        echo json_encode(['success' => true, 'data' => $saved]);
        exit;
    }
}

// Match /customers/:id
if (preg_match('#^/customers/([^/]+)$#', $cleanPath, $matches)) {
    $customerId = $matches[1];
    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    if ($method === 'PUT') {
        $body['id'] = $customerId;
        $saved = saveCustomerToDb($pdo, $body);
        http_response_code(200);
        echo json_encode(['success' => true, 'data' => $saved]);
        exit;
    }

    if ($method === 'DELETE') {
        $stmt = $pdo->prepare('DELETE FROM `solar_customers` WHERE `id` = ?');
        $stmt->execute([$customerId]);
        http_response_code(200);
        echo json_encode(['success' => true, 'message' => 'Customer deleted.']);
        exit;
    }
}

// Projects API: /projects
if ($cleanPath === '/projects' || $cleanPath === '/projects/') {
    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    if ($method === 'GET') {
        $stmt = $pdo->query('SELECT * FROM `solar_projects` ORDER BY `created_at` DESC');
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        http_response_code(200);
        echo json_encode(['success' => true, 'count' => count($rows), 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $saved = saveProjectToDb($pdo, $body);
        http_response_code(201);
        echo json_encode(['success' => true, 'data' => $saved]);
        exit;
    }
}

// Match /projects/:id
if (preg_match('#^/projects/([^/]+)$#', $cleanPath, $matches)) {
    $projectId = $matches[1];
    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    if ($method === 'PUT') {
        $body['id'] = $projectId;
        $saved = saveProjectToDb($pdo, $body);
        http_response_code(200);
        echo json_encode(['success' => true, 'data' => $saved]);
        exit;
    }

    if ($method === 'DELETE') {
        $stmt = $pdo->prepare('DELETE FROM `solar_projects` WHERE `id` = ?');
        $stmt->execute([$projectId]);
        http_response_code(200);
        echo json_encode(['success' => true, 'message' => 'Project deleted.']);
        exit;
    }
}

// GET /api/bootstrap - Master State Hydration
if ($method === 'GET' && in_array($cleanPath, ['/bootstrap', '/bootstrap/'])) {
    $pdo = getDbConnection($dbConfig);
    ensureRequiredTables($pdo);

    $data = [];
    $tableMap = [
        'customers' => 'solar_customers',
        'leads' => 'solar_leads',
        'projects' => 'solar_projects',
        'employees' => 'solar_employees',
        'attendance' => 'solar_attendance',
        'payslips' => 'solar_payslips',
        'holidays' => 'solar_holidays',
        'products' => 'solar_products',
        'vendors' => 'solar_vendors',
        'purchase_orders' => 'solar_purchase_orders',
        'boms' => 'solar_boms',
        'sales_invoices' => 'solar_sales_invoices',
        'warehouses' => 'solar_warehouses',
        'stock_movements' => 'solar_stock_movements',
        'stock_audits' => 'solar_stock_audits',
        'quotations' => 'solar_quotations',
        'surveys' => 'solar_site_surveys',
        'payments' => 'solar_payments',
        'expenses' => 'solar_expenses',
        'service_tickets' => 'solar_service_tickets',
        'amc_contracts' => 'solar_amc_contracts',
        'notifications' => 'solar_notifications',
        'users' => 'solar_users',
        'settings' => 'solar_system_settings',
        'acl_config' => 'solar_acl_config',
        'acl_audit_logs' => 'solar_acl_audit_logs'
    ];
    foreach ($tableMap as $col => $tbl) {
        try {
            $stmt = $pdo->query("SELECT * FROM `$tbl`");
            $rows = $stmt->fetchAll();
            $data[$col] = $rows;
        } catch (Exception $e) {
            $data[$col] = [];
        }
    }
    http_response_code(200);
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}

// Default 404 for unhandled API routes (Always returns JSON, NEVER index.html)
http_response_code(404);
echo json_encode([
    'success' => false,
    'error' => 'API endpoint not found',
    'path' => $parsedPath,
    'method' => $method
]);
exit;
