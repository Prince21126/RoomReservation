<?php
include_once 'cors.php';
setCorsHeaders();
include_once 'config/database.php';

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée']);
        exit;
    }

    if (empty($_POST['reservation_id'])) {
        throw new Exception('Paramètre reservation_id manquant');
    }

    $reservation_id = intval($_POST['reservation_id']);

    if (!isset($_FILES['proof'])) {
        throw new Exception('Aucun fichier reçu (champ proof)');
    }

    $uploadDir = __DIR__ . '/uploads/payments/';
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            throw new Exception('Impossible de créer le dossier d\'upload');
        }
    }

    $file = $_FILES['proof'];
    if ($file['error'] !== UPLOAD_ERR_OK) throw new Exception('Erreur lors de l\'upload');

    $allowed = ['image/jpeg','image/png','image/webp'];
    $maxSize = 5 * 1024 * 1024;
    if ($file['size'] > $maxSize) throw new Exception('Fichier trop volumineux');

    $tmp = $file['tmp_name'];
    // Robust mime detection: prefer built-in functions when available, fall back to getimagesize or client-provided type
    $mime = null;
    if (function_exists('mime_content_type')) {
        $m = @mime_content_type($tmp);
        if ($m) $mime = $m;
    }
    if (!$mime && function_exists('finfo_open')) {
        $finfo = @finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $m = @finfo_file($finfo, $tmp);
            @finfo_close($finfo);
            if ($m) $mime = $m;
        }
    }
    if (!$mime) {
        $gs = @getimagesize($tmp);
        if ($gs && !empty($gs['mime'])) $mime = $gs['mime'];
    }
    if (!$mime) {
        $mime = $file['type'] ?? 'application/octet-stream';
    }
    if (!in_array($mime, $allowed)) throw new Exception('Type de fichier non supporté');

    $orig = basename($file['name']);
    $ext = pathinfo($orig, PATHINFO_EXTENSION);
    $safe = preg_replace('/[^A-Za-z0-9._-]/','_',pathinfo($orig, PATHINFO_FILENAME));
    $name = $safe.'_'.time().'_'.bin2hex(random_bytes(6)).'.'.$ext;
    $dest = $uploadDir . $name;

    if (!move_uploaded_file($tmp, $dest)) throw new Exception('Impossible de sauvegarder le fichier');

    $relative = 'uploads/payments/' . $name;

    $db = (new Database())->getConnection();

    // ensure table
    $db->exec("CREATE TABLE IF NOT EXISTS payment_proofs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id INT NOT NULL,
        chemin VARCHAR(500) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $ins = $db->prepare('INSERT INTO payment_proofs (reservation_id, chemin) VALUES (:rid, :chemin)');
    $ins->execute([':rid' => $reservation_id, ':chemin' => $relative]);

    // Update reservation status to 'proof_uploaded' (awaiting manager validation)
    $upd = $db->prepare('UPDATE reservations SET statut = :statut WHERE id = :rid');
    $upd->execute([':statut' => 'proof_uploaded', ':rid' => $reservation_id]);

    // Insert a message for the gestionnaire to review the proof
    try {
        $m = $db->prepare('INSERT INTO messages (reservation_id, salle_id, sender_type, sender_user_id, sujet, message, is_read) VALUES (:rid, :sid, :stype, :suid, :sujet, :message, 0)');
        $m->bindValue(':rid', $reservation_id);
        $m->bindValue(':sid', $data['salle_id'] ?? null);
        $m->bindValue(':stype', 'client');
        $m->bindValue(':suid', $data['user_id'] ?? null);
        $m->bindValue(':sujet', 'Preuve de paiement envoyée');
        $m->bindValue(':message', 'Le demandeur a envoyé une preuve de paiement pour la réservation #' . $reservation_id . '.');
        $m->execute();
    } catch (Exception $e) {
        // non-fatal
    }

    echo json_encode(['success' => true, 'path' => $relative]);

} catch (Exception $e) {
    http_response_code(400);
    error_log('upload_payment_proof error: '.$e->getMessage());
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

?>
