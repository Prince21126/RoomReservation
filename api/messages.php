<?php
include_once 'cors.php';
setCorsHeaders();

include_once 'config/database.php';

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $gestionnaire_id = $_GET['gestionnaire_id'] ?? null;
    $salle_id = $_GET['salle_id'] ?? null;
    $reservation_id = $_GET['reservation_id'] ?? null;

    try {
        if ($reservation_id) {
            $stmt = $db->prepare('SELECT * FROM messages WHERE reservation_id = :rid ORDER BY created_at');
            $stmt->bindValue(':rid', $reservation_id);
            $stmt->execute();
            echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            exit;
        }

        if ($salle_id) {
            $stmt = $db->prepare('SELECT * FROM messages WHERE salle_id = :sid ORDER BY created_at');
            $stmt->bindValue(':sid', $salle_id);
            $stmt->execute();
            echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            exit;
        }

        if ($gestionnaire_id) {
            $stmt = $db->prepare('SELECT m.* FROM messages m INNER JOIN salles s ON m.salle_id = s.id WHERE s.gestionnaire_id = :gid ORDER BY m.created_at');
            $stmt->bindValue(':gid', $gestionnaire_id);
            $stmt->execute();
            echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            exit;
        }

        $stmt = $db->query('SELECT * FROM messages ORDER BY created_at');
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
        exit;
    }
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'JSON invalide']);
        exit;
    }

    // if sender is gestionnaire and salle_id is provided, verify ownership
    if (($data['sender_type'] ?? '') === 'gestionnaire' && !empty($data['salle_id'])) {
        if (empty($data['sender_user_id'])) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Gestionnaire non spécifié']);
            exit;
        }
        $check = $db->prepare('SELECT gestionnaire_id FROM salles WHERE id = :sid LIMIT 1');
        $check->bindValue(':sid', $data['salle_id']);
        $check->execute();
        $row = $check->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row['gestionnaire_id'] != $data['sender_user_id']) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Non autorisé']);
            exit;
        }
    }

    try {
        // If receiver_user_id not provided but reservation_id is, try to resolve the user id from the reservation
        $receiver_user_id = $data['receiver_user_id'] ?? null;
        if (empty($receiver_user_id) && !empty($data['reservation_id'])) {
            try {
                $rstmt = $db->prepare('SELECT email FROM reservations WHERE id = :rid LIMIT 1');
                $rstmt->bindValue(':rid', $data['reservation_id']);
                $rstmt->execute();
                $rrow = $rstmt->fetch(PDO::FETCH_ASSOC);
                if ($rrow && !empty($rrow['email'])) {
                    $ustmt = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
                    $ustmt->bindValue(':email', $rrow['email']);
                    $ustmt->execute();
                    $urow = $ustmt->fetch(PDO::FETCH_ASSOC);
                    if ($urow) $receiver_user_id = $urow['id'];
                }
            } catch (Exception $e) { /* ignore resolution errors */ }
        }

        $ins = $db->prepare('INSERT INTO messages (reservation_id, salle_id, sender_type, sender_user_id, receiver_user_id, sujet, message, is_read) VALUES (:reservation_id, :salle_id, :sender_type, :sender_user_id, :receiver_user_id, :sujet, :message, 0)');
        $ins->bindValue(':reservation_id', $data['reservation_id'] ?? null);
        $ins->bindValue(':salle_id', $data['salle_id'] ?? null);
        $ins->bindValue(':sender_type', $data['sender_type'] ?? 'client');
        $ins->bindValue(':sender_user_id', $data['sender_user_id'] ?? null);
        $ins->bindValue(':receiver_user_id', $receiver_user_id ?? null);
        $ins->bindValue(':sujet', $data['sujet'] ?? null);
        $ins->bindValue(':message', $data['message'] ?? '');
        $ins->execute();
        echo json_encode(['success' => true, 'id' => $db->lastInsertId()]);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Erreur insertion message']);
        exit;
    }
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Méthode non supportée']);

?>
