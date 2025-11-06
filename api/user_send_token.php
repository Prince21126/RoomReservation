<?php
include_once 'cors.php';
setCorsHeaders();
include_once 'config/database.php';
$db = (new Database())->getConnection();

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data || (empty($data['email']) && empty($data['telephone']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email ou téléphone requis']);
    exit;
}

$email = $data['email'] ?? null;
$telephone = $data['telephone'] ?? null;

try {
    // Ensure users table exists
    $createUsers = "CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nom VARCHAR(200),
        prenom VARCHAR(200),
        email VARCHAR(200) UNIQUE,
        telephone VARCHAR(100),
        password_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
    $db->exec($createUsers);

    // Ensure tokens table exists
    $createTokens = "CREATE TABLE IF NOT EXISTS login_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(16) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX(user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
    $db->exec($createTokens);

    // Find or create user
    if ($email) {
        $stmt = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->bindValue(':email', $email);
        $stmt->execute();
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            $ins = $db->prepare('INSERT INTO users (email) VALUES (:email)');
            $ins->bindValue(':email', $email);
            $ins->execute();
            $userId = $db->lastInsertId();
        } else {
            $userId = $user['id'];
        }
    } else {
        $stmt = $db->prepare('SELECT id FROM users WHERE telephone = :tel LIMIT 1');
        $stmt->bindValue(':tel', $telephone);
        $stmt->execute();
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            $ins = $db->prepare('INSERT INTO users (telephone) VALUES (:tel)');
            $ins->bindValue(':tel', $telephone);
            $ins->execute();
            $userId = $db->lastInsertId();
        } else {
            $userId = $user['id'];
        }
    }

    // generate 6-digit token
    $token = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $expires = (new DateTime('+10 minutes'))->format('Y-m-d H:i:s');

    $insT = $db->prepare('INSERT INTO login_tokens (user_id, token, expires_at) VALUES (:uid, :token, :exp)');
    $insT->bindValue(':uid', $userId);
    $insT->bindValue(':token', $token);
    $insT->bindValue(':exp', $expires);
    $insT->execute();

    // In production, send token via email/SMS. For local dev we return it in response.
    echo json_encode(['success' => true, 'data' => ['user_id' => $userId, 'token' => $token, 'expires_at' => $expires]]);
    exit;
} catch (Exception $e) {
    error_log('user_send_token error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
    exit;
}
?>