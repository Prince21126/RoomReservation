<?php
include_once 'cors.php';
setCorsHeaders();

include_once 'config/database.php';

// Buffer output and suppress direct PHP warnings to ensure we always return clean JSON
if (!headers_sent()) {
    ini_set('display_errors', '0');
}
ob_start();

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non supportée']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data || empty($data['salle_id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Paramètres invalides']);
    exit;
}

 $salle_id = $data['salle_id'];
// verify that the request comes from the gestionnaire who owns the salle
if (empty($data['changed_by'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Gestionnaire non spécifié']);
    exit;
}
try {
    $chk = $db->prepare('SELECT gestionnaire_id FROM salles WHERE id = :id LIMIT 1');
    $chk->bindValue(':id', $salle_id);
    $chk->execute();
    $rowChk = $chk->fetch(PDO::FETCH_ASSOC);
    if (!$rowChk || $rowChk['gestionnaire_id'] != $data['changed_by']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Non autorisé']);
        exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erreur serveur']);
    exit;
}

// allowed fields to update
$fields = ['nom_salle','adresse','capacite','description','gestionnaire_id','telephone','telephone_secondaire','heure_ouverture','heure_fermeture'];
$set = [];
foreach ($fields as $f) {
    if (isset($data[$f])) $set[$f] = $data[$f];
}

if (empty($set)) {
    echo json_encode(['success' => false, 'message' => 'Aucun champ à mettre à jour']);
    exit;
}

$sqlParts = [];
foreach ($set as $k => $v) $sqlParts[] = "`$k` = :$k";
$sql = 'UPDATE salles SET ' . implode(', ', $sqlParts) . ' WHERE id = :id';

try {
    $stmt = $db->prepare($sql);
    foreach ($set as $k => $v) $stmt->bindValue(':' . $k, $v);
    $stmt->bindValue(':id', $salle_id);
    $stmt->execute();
    // After updating the main salles table, handle related entities if provided
    // 1) Tarifs (tarifs + jours_tarif)
    if (isset($data['tarifs']) && is_array($data['tarifs'])) {
        // Remove existing tarifs for this salle (simple strategy)
        $del = $db->prepare('DELETE FROM tarifs WHERE salle_id = :salle_id');
        $del->bindValue(':salle_id', $salle_id);
        $del->execute();
        // Insert new tarifs
        $insTarif = $db->prepare('INSERT INTO tarifs (salle_id, type_tarif, prix) VALUES (:salle_id, :type_tarif, :prix)');
        $insJour = $db->prepare('INSERT INTO jours_tarif (tarif_id, jour) VALUES (:tarif_id, :jour)');
        foreach ($data['tarifs'] as $type => $t) {
            if (empty($t) || !isset($t['prix'])) continue;
            $insTarif->bindValue(':salle_id', $salle_id);
            $insTarif->bindValue(':type_tarif', $type);
            $insTarif->bindValue(':prix', $t['prix']);
            $insTarif->execute();
            $tarif_id = $db->lastInsertId();
            if (!empty($t['jours']) && is_array($t['jours'])) {
                foreach ($t['jours'] as $jour) {
                    $insJour->bindValue(':tarif_id', $tarif_id);
                    $insJour->bindValue(':jour', $jour);
                    $insJour->execute();
                }
            }
        }
    }

    // 2) Services (salle_services)
    if (isset($data['services']) && is_array($data['services'])) {
        // Remove existing mappings
        $delS = $db->prepare('DELETE FROM salle_services WHERE salle_id = :salle_id');
        $delS->bindValue(':salle_id', $salle_id);
        $delS->execute();
        // Insert mappings; create service if not exists
        $selSvc = $db->prepare('SELECT id FROM services WHERE nom = :nom LIMIT 1');
        $insSvc = $db->prepare('INSERT INTO services (nom) VALUES (:nom)');
        $insMap = $db->prepare('INSERT INTO salle_services (salle_id, service_id) VALUES (:salle_id, :service_id)');
        foreach ($data['services'] as $svcName) {
            $svcName = trim($svcName);
            if ($svcName === '') continue;
            $selSvc->bindValue(':nom', $svcName);
            $selSvc->execute();
            $row = $selSvc->fetch(PDO::FETCH_ASSOC);
            if ($row && isset($row['id'])) {
                $sid = $row['id'];
            } else {
                $insSvc->bindValue(':nom', $svcName);
                $insSvc->execute();
                $sid = $db->lastInsertId();
            }
            $insMap->bindValue(':salle_id', $salle_id);
            $insMap->bindValue(':service_id', $sid);
            $insMap->execute();
        }
    }

    // 3) Politique d'annulation
    if (isset($data['conditions_annulation'])) {
        // Try update if exists, otherwise insert
        $chkPol = $db->prepare('SELECT id FROM politiques_annulation WHERE salle_id = :salle_id LIMIT 1');
        $chkPol->bindValue(':salle_id', $salle_id);
        $chkPol->execute();
        $pol = $chkPol->fetch(PDO::FETCH_ASSOC);
        if ($pol && isset($pol['id'])) {
            $updPol = $db->prepare('UPDATE politiques_annulation SET conditions = :conditions WHERE id = :id');
            $updPol->bindValue(':conditions', $data['conditions_annulation']);
            $updPol->bindValue(':id', $pol['id']);
            $updPol->execute();
        } else {
            $insPol = $db->prepare('INSERT INTO politiques_annulation (salle_id, conditions) VALUES (:salle_id, :conditions)');
            $insPol->bindValue(':salle_id', $salle_id);
            $insPol->bindValue(':conditions', $data['conditions_annulation']);
            $insPol->execute();
        }
    }
    // Clean any accidental output and return strict JSON
    if (ob_get_length() !== false) ob_clean();
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['success' => true]);
    exit;
} catch (Exception $e) {
    http_response_code(500);
    if (ob_get_length() !== false) ob_clean();
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['success' => false, 'message' => 'Erreur mise à jour salle']);
    exit;
}

?>
