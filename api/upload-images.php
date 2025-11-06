<?php
include_once 'cors.php';
setCorsHeaders();

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée']);
        exit;
    }

    if (!isset($_POST['salle_id']) || empty($_POST['salle_id'])) {
        throw new Exception('Paramètre salle_id manquant');
    }

    $salle_id = intval($_POST['salle_id']);

    include_once 'config/database.php';
    $database = new Database();
    $db = $database->getConnection();

    if (!isset($_FILES['images'])) {
        throw new Exception('Aucun fichier reçu (champ images)');
    }

    $uploadDir = __DIR__ . '/uploads/images/';
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            throw new Exception('Impossible de créer le dossier d\'upload');
        }
    }

    $files = $_FILES['images'];
    $count = count($files['name']);
    $allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    $maxSize = 5 * 1024 * 1024; // 5MB

    // Helper pour obtenir le mime type de façon robuste
    function detect_mime_type($filePath, $clientType = null) {
        // 1) mime_content_type
        if (function_exists('mime_content_type')) {
            $m = @mime_content_type($filePath);
            if ($m) return $m;
        }

        // 2) finfo
        if (function_exists('finfo_file')) {
            $finfo = @finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $m = @finfo_file($finfo, $filePath);
                finfo_close($finfo);
                if ($m) return $m;
            }
        }

        // 3) getimagesize (bon pour les images)
        $gs = @getimagesize($filePath);
        if ($gs && !empty($gs['mime'])) {
            return $gs['mime'];
        }

        // 4) fallback sur le type envoyé par le client
        if (!empty($clientType)) return $clientType;

        return 'application/octet-stream';
    }

    $insertStmt = $db->prepare("INSERT INTO images_salle (salle_id, nom_fichier, chemin_fichier, est_principale, ordre_affichage) VALUES (:salle_id, :nom_fichier, :chemin_fichier, :est_principale, :ordre)");

    $saved = [];
    for ($i = 0; $i < $count; $i++) {
        if ($files['error'][$i] !== UPLOAD_ERR_OK) continue;

        $tmpName = $files['tmp_name'][$i];
        $origName = basename($files['name'][$i]);
        $size = $files['size'][$i];
    $type = detect_mime_type($tmpName, $files['type'][$i] ?? null);

    if ($size > $maxSize) continue;
    if (!in_array($type, $allowedTypes)) continue;

        // Générer un nom de fichier unique
        $ext = pathinfo($origName, PATHINFO_EXTENSION);
        $safeName = preg_replace('/[^A-Za-z0-9._-]/', '_', pathinfo($origName, PATHINFO_FILENAME));
        $newName = $safeName . '_' . time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $destPath = $uploadDir . $newName;

        if (!move_uploaded_file($tmpName, $destPath)) continue;

        $relativePath = 'uploads/images/' . $newName;

        $isPrimary = (count($saved) === 0) ? 1 : 0;
        $ordre = count($saved);

        $insertStmt->execute([
            ':salle_id' => $salle_id,
            ':nom_fichier' => $origName,
            ':chemin_fichier' => $relativePath,
            ':est_principale' => $isPrimary,
            ':ordre' => $ordre
        ]);

        $saved[] = ['nom' => $origName, 'chemin' => $relativePath];
    }

    echo json_encode(['success' => true, 'uploaded' => $saved]);

} catch (Exception $e) {
    http_response_code(400);
    error_log('Upload images error: ' . $e->getMessage());
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

?>
