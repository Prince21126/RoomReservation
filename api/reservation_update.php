<?php
include_once 'cors.php';
setCorsHeaders();

include_once 'config/database.php';

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non supportée']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data || empty($data['reservation_id']) || empty($data['action'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Paramètres invalides']);
    exit;
}

$reservation_id = $data['reservation_id'];
$action = $data['action'];
$comment = $data['commentaire'] ?? null;
$changed_by = $data['changed_by'] ?? null;

try {
    // fetch existing and salle ownership
    $stmt = $db->prepare('SELECT statut, salle_id FROM reservations WHERE id = :id');
    $stmt->bindValue(':id', $reservation_id);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Réservation introuvable']);
        exit;
    }
    $old = $row['statut'];

    // verify that changed_by is the gestionnaire of the salle
    if (empty($changed_by)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Gestionnaire non spécifié']);
        exit;
    }
    $check = $db->prepare('SELECT gestionnaire_id FROM salles WHERE id = :sid LIMIT 1');
    $check->bindValue(':sid', $row['salle_id']);
    $check->execute();
    $s = $check->fetch(PDO::FETCH_ASSOC);
    if (!$s || $s['gestionnaire_id'] != $changed_by) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Non autorisé']);
        exit;
    }

    $newStatus = null;
    if ($action === 'accept') $newStatus = 'accepted';
    elseif ($action === 'reject') $newStatus = 'rejected';
    elseif ($action === 'cancel') $newStatus = 'cancelled';
    elseif ($action === 'pending') $newStatus = 'pending';
    elseif ($action === 'confirm_payment' || $action === 'confirm') $newStatus = 'confirmed';
    elseif ($action === 'invalidate_proof') $newStatus = 'proof_invalid';
    else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Action inconnue']);
        exit;
    }

    $upd = $db->prepare('UPDATE reservations SET statut = :statut WHERE id = :id');
    $upd->bindValue(':statut', $newStatus);
    $upd->bindValue(':id', $reservation_id);
    $upd->execute();

    // Ensure history table exists before inserting a record
    $db->exec("CREATE TABLE IF NOT EXISTS reservation_status_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id INT NOT NULL,
        old_status VARCHAR(50) NULL,
        new_status VARCHAR(50) NOT NULL,
        changed_by INT NULL,
        commentaire TEXT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $ins = $db->prepare('INSERT INTO reservation_status_history (reservation_id, old_status, new_status, changed_by, commentaire) VALUES (:rid, :old, :new, :by, :c)');
    $ins->bindValue(':rid', $reservation_id);
    $ins->bindValue(':old', $old);
    $ins->bindValue(':new', $newStatus);
    $ins->bindValue(':by', $changed_by);
    $ins->bindValue(':c', $comment);
    $ins->execute();

    echo json_encode(['success' => true]);
    exit;
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
    exit;
}

?>
