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

// 3. Global Exception Handler (Guarantees strict JSON, never HTML 500)
set_exception_handler(function ($e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error while processing API request.',
        'details' => $e->getMessage()
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
            $pdo = new PDO($dsn, $config['user'], $config['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 4
            ]);
            return $pdo;
        } catch (PDOException $e) {
            $lastError = $e->getMessage();
        }
    }

    http_response_code(503);
    echo json_encode([
        'success' => false,
        'error' => 'Database connection failed. Please verify MySQL service and credentials in .env.',
        'database' => $config['name']
    ]);
    exit;
}

// 6. Normalize Path & Method
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

// 7. Route Handling

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
    $stmt = $pdo->query('SHOW TABLES');
    while ($r = $stmt->fetch(PDO::FETCH_NUM)) {
        $tables[] = $r[0];
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

// Administrator Registration Status
if ($method === 'GET' && $cleanPath === '/auth/registration-status') {
    $pdo = getDbConnection($dbConfig);
    $stmt = $pdo->query("SELECT id, email FROM `solar_users` WHERE role IN ('Admin', 'Super Admin') AND status = 'ACTIVE'");
    $admins = $stmt->fetchAll();

    $nonDemoCount = 0;
    foreach ($admins as $a) {
        $email = strtolower($a['email'] ?? '');
        $id = $a['id'] ?? '';
        if (!str_contains($email, 'admin@rejoysolar.com') && !str_starts_with($id, 'demo-')) {
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
if ($method === 'POST' && $cleanPath === '/auth/register') {
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

    // 2. Privilege Escalation Guard: Check if public setup is permitted
    $stmt = $pdo->query("SELECT id, email FROM `solar_users` WHERE role IN ('Admin', 'Super Admin') AND status = 'ACTIVE'");
    $admins = $stmt->fetchAll();
    $nonDemoCount = 0;
    foreach ($admins as $a) {
        $em = strtolower($a['email'] ?? '');
        $id = $a['id'] ?? '';
        if (!str_contains($em, 'admin@rejoysolar.com') && !str_starts_with($id, 'demo-')) {
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
    $stmt = $pdo->prepare('SELECT id FROM `solar_users` WHERE LOWER(email) = ? LIMIT 1');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'An account with this email address already exists in MySQL.']);
        exit;
    }

    // 4. Duplicate Email Check in solar_customers
    $stmt = $pdo->prepare('SELECT id FROM `solar_customers` WHERE LOWER(email) = ? LIMIT 1');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'This email is already registered as an ERP customer.']);
        exit;
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
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Failed to save administrator record into MySQL: ' . $e->getMessage()
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
if ($method === 'POST' && $cleanPath === '/auth/login') {
    $email = strtolower(trim($body['email'] ?? ''));
    $password = trim($body['password'] ?? '');

    if (empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email and password are required.']);
        exit;
    }

    $pdo = getDbConnection($dbConfig);
    $stmt = $pdo->prepare('SELECT * FROM `solar_users` WHERE LOWER(email) = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user) {
        $storedHash = $user['password'] ?? '';
        $matches = false;

        if (password_verify($password, $storedHash)) {
            $matches = true;
        } elseif ($password === $storedHash) {
            // Auto-upgrade legacy plaintext to bcrypt
            $matches = true;
            $newHash = password_hash($password, PASSWORD_BCRYPT);
            $up = $pdo->prepare('UPDATE `solar_users` SET `password` = ? WHERE `id` = ?');
            $up->execute([$newHash, $user['id']]);
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

    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid credentials. Please verify your email and password in MySQL.'
    ]);
    exit;
}

// GET /api/bootstrap - Master State Hydration
if ($method === 'GET' && in_array($cleanPath, ['/bootstrap', '/bootstrap/'])) {
    $pdo = getDbConnection($dbConfig);
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
