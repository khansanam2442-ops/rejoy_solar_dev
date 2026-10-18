<?php
/**
 * Hostinger Apache/LiteSpeed PHP API Router & Gateway for SolarPulse ERP
 * Provides zero-dependency native PHP execution against MySQL database
 * u238683373_rejoy_solar for Hostinger Shared Hosting environments.
 */

// 1. Strict JSON Response & CORS Headers
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, x-admin-token, x-admin-key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// 2. Parse Environment Variables from .env file
function loadEnvConfig() {
    $searchPaths = [
        dirname(__DIR__, 2) . '/.env',
        dirname(__DIR__) . '/.env',
        __DIR__ . '/.env',
        isset($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] . '/.env' : null
    ];

    $env = [];
    foreach ($searchPaths as $path) {
        if ($path && file_exists($path) && is_readable($path)) {
            $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if (empty($trimmed) || strpos($trimmed, '#') === 0) continue;
                $parts = explode('=', $trimmed, 2);
                if (count($parts) === 2) {
                    $key = trim($parts[0]);
                    $val = trim($parts[1]);
                    // Strip enclosing quotes
                    if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                        (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
                        $val = substr($val, 1, -1);
                    }
                    $env[$key] = $val;
                }
            }
            break;
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

// 3. Database Connection Helper
function getDbConnection($config) {
    try {
        $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
        $pdo = new PDO($dsn, $config['user'], $config['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]);
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Database connection failed: ' . $e->getMessage(),
            'database' => $config['name']
        ]);
        exit;
    }
}

// 4. Resolve Request Method and Path
$method = $_SERVER['REQUEST_METHOD'];
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$parsedUrl = parse_url($requestUri, PHP_URL_PATH);

// Normalize path: strip query parameters, trailing slash, and leading base
$path = rtrim($parsedUrl, '/');
if (empty($path)) $path = '/';

// Support path both with and without /api prefix
$cleanPath = $path;
if (str_starts_with($cleanPath, '/api')) {
    $cleanPath = substr($cleanPath, 4);
    if (empty($cleanPath)) $cleanPath = '/';
}

$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true) ?: [];

// 5. Route Handling

// Health / Status Check
if ($method === 'GET' && in_array($cleanPath, ['/health', '/status', '/status.php', '/'])) {
    http_response_code(200);
    echo json_encode([
        'status' => 'ONLINE',
        'app' => 'SolarPulse EPC ERP & CRM',
        'version' => '1.0.0',
        'backend' => 'Hostinger Native PHP/MySQL Router',
        'server_time' => date('c'),
        'features' => [
            'database' => $dbConfig['name'],
            'spa_routing' => true,
            'auth' => true
        ]
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

// Database Status Check
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

// Admin Registration Status Check
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

    // Input Validation
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

    // Check existing admins to verify if public setup is allowed
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

    // Check for authorization headers
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

    // Check duplicate email in solar_users
    $stmt = $pdo->prepare('SELECT id FROM `solar_users` WHERE LOWER(email) = ? LIMIT 1');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'An account with this email address already exists in MySQL.']);
        exit;
    }

    // Check duplicate email in solar_customers
    $stmt = $pdo->prepare('SELECT id FROM `solar_customers` WHERE LOWER(email) = ? LIMIT 1');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'This email is already registered as an ERP customer.']);
        exit;
    }

    // Hash password with bcrypt
    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
    $userId = 'usr-admin-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(3)), 0, 5);
    $empCode = 'EMP-ADM-' . rand(100, 999);

    // Insert into solar_users
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

    // Insert into solar_employees for workforce directory
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
        // Non-fatal if employee directory row fails
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

// POST /api/auth/login - Administrator & Team Login
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

// Default 404 for unhandled API routes (Always returns JSON, NEVER index.html)
http_response_code(404);
echo json_encode([
    'success' => false,
    'error' => 'API endpoint not found',
    'path' => $path,
    'cleanPath' => $cleanPath,
    'method' => $method
]);
exit;
