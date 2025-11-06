<?php
include_once 'cors.php';
setCorsHeaders();
include_once 'config/database.php';
$db = (new Database())->getConnection();

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data || (empty($data['user_id']) && empty($data['email']) && empty($data['telephone'])) || empty($data['token'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Paramètres manquants']);
    exit;
}

$userId = $data['user_id'] ?? null;
$email = $data['email'] ?? null;
$telephone = $data['telephone'] ?? null;
$token = $data['token'];

try {
    // find user id if not provided
    if (!$userId) {
        if ($email) {
            $stmt = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
            $stmt->bindValue(':email', $email);
            $stmt->execute();
            $u = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$u) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Utilisateur introuvable']); exit; }
            $userId = $u['id'];
        } else {
            $stmt = $db->prepare('SELECT id FROM users WHERE telephone = :tel LIMIT 1');
            $stmt->bindValue(':tel', $telephone);
            $stmt->execute();
            $u = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$u) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Utilisateur introuvable']); exit; }
            $userId = $u['id'];
        }
    }

    // check token
    $stmt = $db->prepare('SELECT id, token, expires_at FROM login_tokens WHERE user_id = :uid AND token = :token ORDER BY created_at DESC LIMIT 1');
    $stmt->bindValue(':uid', $userId);
    $stmt->bindValue(':token', $token);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) { http_response_code(401); echo json_encode(['success'=>false,'message'=>'Token invalide']); exit; }
    $now = new DateTime();
    $exp = new DateTime($row['expires_at']);
    if ($now > $exp) { http_response_code(401); echo json_encode(['success'=>false,'message'=>'Token expiré']); exit; }

    // return user info
    $stmt = $db->prepare('SELECT id, nom, prenom, email, telephone FROM users WHERE id = :uid LIMIT 1');
    $stmt->bindValue(':uid', $userId);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) { http_response_code(404); echo json_encode(['success'=>false,'message'=>'Utilisateur introuvable']); exit; }

    echo json_encode(['success' => true, 'data' => ['user' => $user]]);
    exit;
} catch (Exception $e) {
    error_log('user_verify_token error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
    exit;
}
?>