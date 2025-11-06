<?php
include_once 'cors.php';
setCorsHeaders();

include_once 'config/database.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = (new Database())->getConnection();

if ($method === 'GET') {
    $gestionnaire_id = $_GET['gestionnaire_id'] ?? null;
    $salle_id = $_GET['salle_id'] ?? null;

    try {
        if ($salle_id) {
            $stmt = $db->prepare('SELECT id, salle_id, date_blocked, reason, created_at FROM blocked_dates WHERE salle_id = :sid ORDER BY date_blocked');
            $stmt->bindValue(':sid', $salle_id);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'data' => $rows]);
            exit;
        }

        if ($gestionnaire_id) {
            $stmt = $db->prepare('SELECT bd.id, bd.salle_id, bd.date_blocked, bd.reason, bd.created_at FROM blocked_dates bd INNER JOIN salles s ON bd.salle_id = s.id WHERE s.gestionnaire_id = :gid ORDER BY bd.date_blocked');
            $stmt->bindValue(':gid', $gestionnaire_id);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'data' => $rows]);
            exit;
        }

        // otherwise return all (admin)
        $stmt = $db->query('SELECT id, salle_id, date_blocked, reason, created_at FROM blocked_dates ORDER BY date_blocked');
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
        exit;
    }
}

if ($method === 'POST') {
    // create or delete depending on action
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'JSON invalide']);
        exit;
    }

    $action = $data['action'] ?? 'create';

    if ($action === 'create') {
        if (empty($data['salle_id']) || empty($data['date_blocked'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Paramètres manquants']);
            exit;
        }
        // verify the gestionnaire owns the salle
        if (empty($data['created_by'])) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Gestionnaire non spécifié']);
            exit;
        }
        try {
            $check = $db->prepare('SELECT gestionnaire_id FROM salles WHERE id = :sid LIMIT 1');
            $check->bindValue(':sid', $data['salle_id']);
            $check->execute();
            $row = $check->fetch(PDO::FETCH_ASSOC);
            if (!$row || $row['gestionnaire_id'] != $data['created_by']) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Non autorisé']);
                exit;
            }

            $ins = $db->prepare('INSERT INTO blocked_dates (salle_id, date_blocked, reason, created_by) VALUES (:salle_id, :date_blocked, :reason, :created_by)');
            $ins->bindValue(':salle_id', $data['salle_id']);
            $ins->bindValue(':date_blocked', $data['date_blocked']);
            $ins->bindValue(':reason', $data['reason'] ?? null);
            $ins->bindValue(':created_by', $data['created_by']);
            $ins->execute();
            echo json_encode(['success' => true, 'id' => $db->lastInsertId()]);
            exit;
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur lors de la création']);
            exit;
        }
    }

    if ($action === 'delete') {
        if (empty($data['id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'ID manquant']);
            exit;
        }
        // verify ownership before deletion
        if (empty($data['requested_by'])) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Gestionnaire non spécifié']);
            exit;
        }
        try {
            $stmt = $db->prepare('SELECT salle_id FROM blocked_dates WHERE id = :id');
            $stmt->bindValue(':id', $data['id']);
            $stmt->execute();
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Entrée introuvable']);
                exit;
            }
            $check = $db->prepare('SELECT gestionnaire_id FROM salles WHERE id = :sid LIMIT 1');
            $check->bindValue(':sid', $row['salle_id']);
            $check->execute();
            $s = $check->fetch(PDO::FETCH_ASSOC);
            if (!$s || $s['gestionnaire_id'] != $data['requested_by']) {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Non autorisé']);
                exit;
            }

            $del = $db->prepare('DELETE FROM blocked_dates WHERE id = :id');
            $del->bindValue(':id', $data['id']);
            $del->execute();
            echo json_encode(['success' => true]);
            exit;
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur suppression']);
            exit;
        }
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Action inconnue']);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Méthode non supportée']);

?>
