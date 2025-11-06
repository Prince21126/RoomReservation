<?php
include_once 'cors.php';
setCorsHeaders();

if (session_status() === PHP_SESSION_NONE) session_start();

include_once 'config/database.php';

// Simple reservation endpoint
// POST: create reservation
// GET: list reservations (optionally ?gestionnaire_id=)

$method = $_SERVER['REQUEST_METHOD'];
$db = (new Database())->getConnection();

if ($method === 'POST') {
    // Read JSON
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!$data) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Corps JSON invalide']);
        exit;
    }

    // Require a password so the requester can use email/telephone + password to log in
    // Email devient optionnel (compte peut être créé via téléphone)
    $required = ['salle_id','nom','prenom','telephone','date','type','invites','password'];
    foreach ($required as $r) {
        if (empty($data[$r])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Champs requis manquant: $r"]);
            exit;
        }
    }

    // Ensure reservations table exists (lightweight migration)
    $createSql = "CREATE TABLE IF NOT EXISTS reservations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        salle_id INT NOT NULL,
        nom VARCHAR(200) NOT NULL,
        prenom VARCHAR(200) NOT NULL,
        email VARCHAR(200) NOT NULL,
        telephone VARCHAR(100) NOT NULL,
        date_reservation DATE NOT NULL,
        type_evenement VARCHAR(100) NOT NULL,
        invites INT NOT NULL,
        statut VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

    try {
        $db->exec($createSql);
    } catch (Exception $e) {
        error_log('Erreur creation table reservations: '.$e->getMessage());
    }

    // Ensure users table exists for clients
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
        error_log('Erreur creation table users: '.$e->getMessage());
    }

    // Capacity check and ownership: get salle.capacite and gestionnaire_id
    $stmt = $db->prepare('SELECT capacite, gestionnaire_id FROM salles WHERE id = :id');
    $stmt->bindValue(':id', $data['salle_id']);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && !empty($row['capacite'])) {
        $cap = (int)$row['capacite'];
        if ((int)$data['invites'] > $cap) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Nombre d'invités supérieur à la capacité ({$cap})"]);
            exit;
        }
    }

    // Determine if this creation is performed by an authenticated gestionnaire for their own salle
    $autoConfirm = false;
    $gestionnaireSessionId = isset($_SESSION['gestionnaire_id']) ? (int)$_SESSION['gestionnaire_id'] : null;
    if ($gestionnaireSessionId && $row && isset($row['gestionnaire_id']) && (int)$row['gestionnaire_id'] === $gestionnaireSessionId) {
        $autoConfirm = true;
    }

    // Insert reservation
    $ins = $db->prepare('INSERT INTO reservations (salle_id, nom, prenom, email, telephone, date_reservation, type_evenement, invites) VALUES (:salle_id, :nom, :prenom, :email, :telephone, :date_reservation, :type_evenement, :invites)');
    $ins->bindValue(':salle_id', $data['salle_id']);
    $ins->bindValue(':nom', $data['nom']);
    $ins->bindValue(':prenom', $data['prenom']);
    $emailVal = isset($data['email']) ? trim((string)$data['email']) : '';
    $ins->bindValue(':email', $emailVal); // colonne NOT NULL; valeur vide acceptable
    $ins->bindValue(':telephone', $data['telephone']);
    $ins->bindValue(':date_reservation', $data['date']);
    $ins->bindValue(':type_evenement', $data['type']);
    $ins->bindValue(':invites', $data['invites']);

    try {
        $ins->execute();
        $id = $db->lastInsertId();
        $result = ['id' => $id];

        // If created by the gestionnaire owning the salle, auto-confirm the reservation immediately
        if ($autoConfirm) {
            try {
                // Update status to confirmed
                $upd = $db->prepare('UPDATE reservations SET statut = :statut WHERE id = :id');
                $upd->bindValue(':statut', 'confirmed');
                $upd->bindValue(':id', $id);
                $upd->execute();

                // Ensure history table exists then insert a history line
                $db->exec("CREATE TABLE IF NOT EXISTS reservation_status_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    reservation_id INT NOT NULL,
                    old_status VARCHAR(50) NULL,
                    new_status VARCHAR(50) NOT NULL,
                    changed_by INT NULL,
                    commentaire TEXT NULL,
                    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $hist = $db->prepare('INSERT INTO reservation_status_history (reservation_id, old_status, new_status, changed_by, commentaire) VALUES (:rid, :old, :new, :by, :c)');
                $hist->bindValue(':rid', $id);
                // We assume it would have been pending by default
                $hist->bindValue(':old', 'pending');
                $hist->bindValue(':new', 'confirmed');
                $hist->bindValue(':by', $gestionnaireSessionId);
                $hist->bindValue(':c', 'Auto-confirmation par le gestionnaire lors de la création');
                $hist->execute();

                $result['statut'] = 'confirmed';
            } catch (Exception $ie) {
                // Non-fatal: if history insert fails, we still have a confirmed reservation
                $result['statut'] = 'confirmed';
            }
        }

        // Create a user account for this requester if not exists
        $existing = null;
        if ($emailVal !== '') {
            $userStmt = $db->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
            $userStmt->bindValue(':email', $emailVal);
            $userStmt->execute();
            $existing = $userStmt->fetch(PDO::FETCH_ASSOC);
        } else {
            // Pas d'email: on tente de retrouver par téléphone
            $userStmt = $db->prepare('SELECT id FROM users WHERE telephone = :tel ORDER BY id DESC LIMIT 1');
            $userStmt->bindValue(':tel', $data['telephone']);
            $userStmt->execute();
            $existing = $userStmt->fetch(PDO::FETCH_ASSOC);
        }
        if (!$existing) {
            // Use provided password (required) when creating the account; otherwise fall back to generated temp
            $provided = isset($data['password']) && strlen(trim($data['password'])) > 0 ? $data['password'] : null;
            if ($provided) {
                $hash = password_hash($provided, PASSWORD_DEFAULT);
                $tempPass = null;
            } else {
                $tempPass = substr(str_shuffle('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'), 0, 8);
                $hash = password_hash($tempPass, PASSWORD_DEFAULT);
            }

            $insUser = $db->prepare('INSERT INTO users (nom, prenom, email, telephone, password_hash) VALUES (:nom, :prenom, :email, :telephone, :hash)');
            $insUser->bindValue(':nom', $data['nom']);
            $insUser->bindValue(':prenom', $data['prenom']);
            if ($emailVal !== '') { $insUser->bindValue(':email', $emailVal); }
            else { $insUser->bindValue(':email', null, PDO::PARAM_NULL); }
            $insUser->bindValue(':telephone', $data['telephone']);
            $insUser->bindValue(':hash', $hash);
            try {
                $insUser->execute();
                $userId = $db->lastInsertId();
                $acct = ['id' => $userId, 'email' => ($emailVal !== '' ? $emailVal : null)];
                if ($tempPass) $acct['tempPassword'] = $tempPass;
                $result['account'] = $acct;
            } catch (Exception $e) {
                error_log('Erreur creation user: ' . $e->getMessage());
            }
        } else {
            $result['account'] = ['id' => $existing['id'], 'email' => ($emailVal !== '' ? $emailVal : null)];
        }

        echo json_encode(['success' => true, 'data' => $result]);
        // Optionally: notify gestionnaire by email (not implemented)
    } catch (Exception $e) {
        http_response_code(500);
        error_log('Erreur insert reservation: '.$e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Erreur serveur lors de l\'enregistrement']);
    }
    exit;
}

if ($method === 'GET') {
    // Simple listing: if gestionnaire_id provided, list reservations for that gestionnaire's salles
    $gestionnaire_id = $_GET['gestionnaire_id'] ?? null;
    if ($gestionnaire_id) {
        $query = 'SELECT r.*, s.nom_salle as salle_nom, s.id as salle_id FROM reservations r INNER JOIN salles s ON r.salle_id = s.id WHERE s.gestionnaire_id = :gid ORDER BY r.created_at DESC';
        $stmt = $db->prepare($query);
        $stmt->bindValue(':gid', $gestionnaire_id);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    // otherwise list all
    $stmt = $db->query('SELECT r.*, s.nom_salle as salle_nom FROM reservations r LEFT JOIN salles s ON r.salle_id = s.id ORDER BY r.created_at DESC');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'data' => $rows]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Méthode non supportée']);

?>