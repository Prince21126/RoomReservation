<?php
include_once 'cors.php';
setCorsHeaders();

include_once 'config/database.php';

class SalleManager {
    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
    }

    public function getSalleDetail($id) {
        try {
            // Salle + gestionnaire
            $query = "SELECT s.id, s.nom_salle as nom, s.adresse, s.capacite, s.description, s.gestionnaire_id,
                             g.prenom, g.nom as nom_gestionnaire, g.telephone, g.email as email_gestionnaire
                      FROM salles s
                      INNER JOIN gestionnaires g ON s.gestionnaire_id = g.id
                      WHERE s.id = :id LIMIT 1";

            $stmt = $this->db->prepare($query);
            $stmt->bindValue(':id', $id);
            $stmt->execute();

            if ($stmt->rowCount() === 0) {
                return null;
            }

            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            $salle = [
                'id' => $row['id'],
                'nom' => $row['nom'],
                'adresse' => $row['adresse'],
                'capacite' => $row['capacite'],
                'description' => $row['description'],
                'gestionnaire' => [
                    'id' => $row['gestionnaire_id'],
                    'nom' => $row['prenom'] . ' ' . $row['nom_gestionnaire'],
                    'telephone' => $row['telephone'],
                    'email' => $row['email_gestionnaire']
                ]
            ];

            // Images
            $stmt = $this->db->prepare("SELECT id, chemin_fichier, est_principale FROM images_salle WHERE salle_id = :id ORDER BY est_principale DESC, id ASC");
            $stmt->bindValue(':id', $id);
            $stmt->execute();
            $images = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $salle['images'] = $images ?: [];

            // Services
            $stmt = $this->db->prepare("SELECT ser.id, ser.nom FROM salle_services ss INNER JOIN services ser ON ss.service_id = ser.id WHERE ss.salle_id = :id");
            $stmt->bindValue(':id', $id);
            $stmt->execute();
            $services = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $salle['services'] = array_map(function($s){ return $s['nom']; }, $services ?: []);

            // Tarifs et jours
            $stmt = $this->db->prepare("SELECT id, type_tarif, prix FROM tarifs WHERE salle_id = :id");
            $stmt->bindValue(':id', $id);
            $stmt->execute();
            $tarifsRaw = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $tarifs = [];
            foreach ($tarifsRaw as $t) {
                $stmt2 = $this->db->prepare("SELECT jour FROM jours_tarif WHERE tarif_id = :tarif_id");
                $stmt2->bindValue(':tarif_id', $t['id']);
                $stmt2->execute();
                $jours = $stmt2->fetchAll(PDO::FETCH_COLUMN);

                $tarifs[] = [
                    'id' => $t['id'],
                    'type' => $t['type_tarif'],
                    'prix' => $t['prix'],
                    'jours' => $jours ?: []
                ];
            }
            $salle['tarifs'] = $tarifs;

            // Politique d'annulation
            $stmt = $this->db->prepare("SELECT id, conditions FROM politiques_annulation WHERE salle_id = :id LIMIT 1");
            $stmt->bindValue(':id', $id);
            $stmt->execute();
            $pol = $stmt->fetch(PDO::FETCH_ASSOC);
            $salle['politique_annulation'] = $pol ? $pol['conditions'] : null;

            // Réservations de cette salle (pour calendrier détails)
            try {
                $this->db->exec("CREATE TABLE IF NOT EXISTS reservations (
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
            } catch (Exception $e) { /* ignore creation if already exists */ }

            try {
                $rs = $this->db->prepare('SELECT id, nom, prenom, email, telephone, date_reservation, type_evenement, invites, statut, created_at FROM reservations WHERE salle_id = :id ORDER BY created_at DESC');
                $rs->bindValue(':id', $id);
                $rs->execute();
                $reservations = $rs->fetchAll(PDO::FETCH_ASSOC);
                $salle['reservations'] = $reservations ?: [];
            } catch (Exception $e) {
                $salle['reservations'] = [];
            }

            return $salle;

        } catch (Exception $e) {
            error_log('Erreur getSalleDetail: ' . $e->getMessage());
            return null;
        }
    }
}

$id = $_GET['id'] ?? null;
if (empty($id)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Paramètre id requis']);
    exit;
}

$manager = new SalleManager();
$salle = $manager->getSalleDetail($id);

if (!$salle) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Salle non trouvée']);
    exit;
}

echo json_encode(['success' => true, 'data' => $salle]);

?>
