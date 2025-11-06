<?php
include_once 'cors.php';
setCorsHeaders();
if (session_status() === PHP_SESSION_NONE) session_start();
include_once 'config/database.php';

try {
    if (empty($_SESSION) || empty($_SESSION['gestionnaire_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Non authentifié']);
        exit;
    }

    $db = (new Database())->getConnection();
    $stmt = $db->prepare('SELECT id, nom, prenom, email, telephone FROM gestionnaires WHERE id = :id LIMIT 1');
    $stmt->bindValue(':id', $_SESSION['gestionnaire_id']);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Gestionnaire introuvable']);
        exit;
    }
    echo json_encode(['success' => true, 'data' => ['user' => $user]]);
    exit;
} catch (Throwable $e) {
    @file_put_contents(__DIR__ . '/current_gestionnaire_debug.log', $e->getMessage() . "\n" . $e->getTraceAsString() . "\n", FILE_APPEND);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
    exit;
}
?>