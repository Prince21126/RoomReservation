<?php
include_once 'cors.php';
setCorsHeaders();

include_once 'config/database.php';

$db = (new Database())->getConnection();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data || empty($data['salle_id']) || empty($data['path']) || empty($data['changed_by'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Paramètres invalides']);
    exit;
}

$salle_id = intval($data['salle_id']);
$path = $data['path'];
$changed_by = intval($data['changed_by']);

try {
    // verify ownership
    $chk = $db->prepare('SELECT gestionnaire_id FROM salles WHERE id = :id LIMIT 1');
    $chk->bindValue(':id', $salle_id);
    $chk->execute();
    $row = $chk->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['gestionnaire_id'] != $changed_by) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Non autorisé']);
        exit;
    }

    // delete db entry
    $stmt = $db->prepare('DELETE FROM images_salle WHERE chemin_fichier = :path AND salle_id = :sid');
    $stmt->bindValue(':path', $path);
    $stmt->bindValue(':sid', $salle_id);
    $stmt->execute();

    // attempt to delete file from disk
    $file = __DIR__ . '/' . $path;
    if (file_exists($file)) @unlink($file);

    echo json_encode(['success' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
}

?>
