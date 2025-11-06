<?php
include_once 'cors.php';
setCorsHeaders();

include_once 'config/database.php';

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non supportée']);
    exit;
}

$reservation_id = $_GET['reservation_id'] ?? null;
$salle_id = $_GET['salle_id'] ?? null;

try {
    if ($reservation_id) {
        $stmt = $db->prepare('SELECT * FROM payment_proofs WHERE reservation_id = :rid ORDER BY uploaded_at DESC');
        $stmt->bindValue(':rid', $reservation_id);
        $stmt->execute();
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        exit;
    }

    if ($salle_id) {
        // fetch proofs for reservations of this salle
        $stmt = $db->prepare('SELECT pp.* FROM payment_proofs pp INNER JOIN reservations r ON pp.reservation_id = r.id WHERE r.salle_id = :sid ORDER BY pp.uploaded_at DESC');
        $stmt->bindValue(':sid', $salle_id);
        $stmt->execute();
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        exit;
    }

    // otherwise list all proofs
    $stmt = $db->query('SELECT * FROM payment_proofs ORDER BY uploaded_at DESC');
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    exit;
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
    exit;
}

?>
