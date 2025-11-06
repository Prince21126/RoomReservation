<?php
include_once 'cors.php';
setCorsHeaders();
if (session_status() === PHP_SESSION_NONE) session_start();
include_once 'config/database.php';

try {
    if (empty($_SESSION) || empty($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'message' => 'Not authenticated']);
        exit;
    }

    $db = (new Database())->getConnection();
    $stmt = $db->prepare('SELECT id, nom, prenom, email, telephone, created_at FROM users WHERE id = :id LIMIT 1');
    $stmt->bindValue(':id', $_SESSION['user_id']);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'Utilisateur introuvable']);
        exit;
    }
    echo json_encode(['success' => true, 'data' => ['user' => $user]]);
    exit;
} catch (Throwable $e) {
    @file_put_contents(__DIR__ . '/current_user_debug.log', $e->getMessage() . "\n" . $e->getTraceAsString() . "\n", FILE_APPEND);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
    exit;
}
