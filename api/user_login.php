<?php
include_once 'cors.php';
setCorsHeaders();
// Start PHP session so we can maintain a server-side session for authenticated users
if (session_status() === PHP_SESSION_NONE) session_start();
include_once 'config/database.php';

$method = $_SERVER['REQUEST_METHOD'];
// Ensure DB connection errors are caught and logged so we don't return a blank 500
try {
    $db = (new Database())->getConnection();
} catch (Exception $e) {
    @file_put_contents(__DIR__ . '/login_debug.log', "DB_CONN_ERROR: " . $e->getMessage() . "\n", FILE_APPEND);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur de connexion à la base de données']);
    exit;
}

// -- DEBUG: log request method, headers and raw body to api/login_debug.log to help diagnose 405/500 issues
try {
    $raw_debug = file_get_contents('php://input');
    $debug_info = [
        'ts' => date('c'),
        'remote_addr' => isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : null,
        'method' => $method,
        'request_uri' => isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : null,
        'headers' => function_exists('getallheaders') ? getallheaders() : null,
        'raw_body' => $raw_debug,
    ];
    @file_put_contents(__DIR__ . '/login_debug.log', json_encode($debug_info, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND);
} catch (Exception $e) {
    // ignore logging failures
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non supportée']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
// Supporte aussi les formulaires POST classiques (application/x-www-form-urlencoded)
if ((!$data || !is_array($data)) && !empty($_POST)) {
    $data = $_POST;
}
if ($raw && $data === null && empty($_POST)) {
    // log JSON decode error
    $err = json_last_error_msg();
    @file_put_contents(__DIR__ . '/login_debug.log', "JSON_DECODE_ERROR: {$err} raw= " . substr($raw,0,1000) . "\n", FILE_APPEND);
}
// Accept either 'email' or 'identifier' which can be email or telephone
if (!$data || empty($data['password']) || (empty($data['email']) && empty($data['identifier']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Identifiant (email ou téléphone) et mot de passe requis']);
    exit;
}

$identifier = !empty($data['email']) ? $data['email'] : ($data['identifier'] ?? '');

try {
    // Ensure users table exists (lightweight migration - safe to run repeatedly)
    $createUsers = "CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nom VARCHAR(200),
        prenom VARCHAR(200),
        email VARCHAR(200) UNIQUE,
        telephone VARCHAR(100),
        password_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
    try {
        $db->exec($createUsers);
    } catch (Exception $e) {
        // non-fatal, continue and log
        @file_put_contents(__DIR__ . '/login_debug.log', "CREATE_USERS_ERROR: " . $e->getMessage() . "\n", FILE_APPEND);
    }

    // Some PDO drivers require distinct parameter names when the same named parameter
    // appears multiple times. Use two placeholders and bind both to avoid SQLSTATE[HY093].
    $stmt = $db->prepare('SELECT id, nom, prenom, email, telephone, password_hash FROM users WHERE email = :ident OR telephone = :ident2 LIMIT 1');
    $stmt->bindValue(':ident', $identifier);
    $stmt->bindValue(':ident2', $identifier);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Utilisateur introuvable']);
        exit;
    }

    // Protect against missing/NULL password_hash which on PHP 8+ would raise a TypeError in password_verify
    if (empty($user['password_hash']) || !is_string($user['password_hash'])) {
        // Log the condition for debugging
        @file_put_contents(__DIR__ . '/login_debug.log', "MISSING_PASSWORD_HASH for user id={$user['id']}\n", FILE_APPEND);
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Mot de passe non défini pour cet utilisateur']);
        exit;
    }

    if (!password_verify($data['password'], $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Mot de passe invalide']);
        exit;
    }

    // Return sanitized user info and set server session
    unset($user['password_hash']);
    // regenerate session id on login for safety
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_type'] = 'client';
    // Si on demande une redirection (cas dev: formulaire cross-origin), rediriger vers le tableau de bord
    $wantRedirect = isset($_GET['redirect']) || (isset($data['redirect']) && $data['redirect']);
    if ($wantRedirect) {
        // Redirection vers la page frontend (même origine que l'API)
        header('Location: /frontend/tableau-bord-utilisateur.html');
        http_response_code(302);
        exit;
    }

    echo json_encode(['success' => true, 'data' => ['user' => $user]]);
    exit;
} catch (Throwable $e) {
    // Log exception/error with full trace to debug file for easier diagnosis
    $err = "EXCEPTION: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine() . "\n" . $e->getTraceAsString() . "\n";
    @file_put_contents(__DIR__ . '/login_debug.log', $err, FILE_APPEND);
    error_log('Erreur user_login: ' . $e->getMessage());
    http_response_code(500);
    // Return a generic message to the client; full details are in login_debug.log
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
    exit;
}
?>