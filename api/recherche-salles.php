<?php
include_once 'cors.php';
setCorsHeaders();

include_once 'config/database.php';

class RechercheManager {
    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
    }

    public function rechercherSalles($filters = []) {
        try {
            $query = "
                SELECT 
                    s.id,
                    s.nom_salle as nom,
                    s.adresse,
                    s.capacite,
                    s.description,
                    g.prenom,
                    g.nom as nom_gestionnaire,
                    g.telephone,
                    g.email as email_gestionnaire,
                    GROUP_CONCAT(DISTINCT ser.nom) as services,
                    MAX(ts.prix) as prix_semaine,
                    MAX(tw.prix) as prix_weekend,
                    MAX(img.chemin_fichier) as image_principale
                FROM salles s
                INNER JOIN gestionnaires g ON s.gestionnaire_id = g.id
                LEFT JOIN salle_services ss ON s.id = ss.salle_id
                LEFT JOIN services ser ON ss.service_id = ser.id
                LEFT JOIN tarifs ts ON (s.id = ts.salle_id AND ts.type_tarif = 'semaine')
                LEFT JOIN tarifs tw ON (s.id = tw.salle_id AND tw.type_tarif = 'weekend')
                LEFT JOIN images_salle img ON (s.id = img.salle_id AND img.est_principale = 1)
                WHERE 1=1
            ";

            $params = [];

            // Filtre par recherche texte
            if (!empty($filters['search'])) {
                $query .= " AND (s.nom_salle LIKE :search OR s.adresse LIKE :search OR s.description LIKE :search)";
                $params[':search'] = '%' . $filters['search'] . '%';
            }

            // Filtre par capacité
            if (!empty($filters['capacite'])) {
                $query .= " AND s.capacite >= :capacite";
                $params[':capacite'] = $filters['capacite'];
            }

            // Filtre par id de salle (détail)
            if (!empty($filters['id'])) {
                $query .= " AND s.id = :id";
                $params[':id'] = $filters['id'];
            }

            // Filtre par gestionnaire (pour le tableau de bord)
            if (!empty($filters['gestionnaire_id'])) {
                $query .= " AND s.gestionnaire_id = :gestionnaire_id";
                $params[':gestionnaire_id'] = $filters['gestionnaire_id'];
            }

            $query .= " GROUP BY s.id";

            // Tri
            if (!empty($filters['tri'])) {
                switch ($filters['tri']) {
                    case 'prix-croissant':
                        $query .= " ORDER BY COALESCE(ts.prix, tw.prix) ASC";
                        break;
                    case 'prix-decroissant':
                        $query .= " ORDER BY COALESCE(ts.prix, tw.prix) DESC";
                        break;
                    case 'capacite-croissant':
                        $query .= " ORDER BY s.capacite ASC";
                        break;
                    case 'capacite-decroissant':
                        $query .= " ORDER BY s.capacite DESC";
                        break;
                    default:
                        $query .= " ORDER BY s.nom_salle ASC";
                }
            } else {
                $query .= " ORDER BY s.nom_salle ASC";
            }

            $stmt = $this->db->prepare($query);
            $stmt->execute($params);

            $salles = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $salles[] = [
                    'id' => $row['id'],
                    'nom' => $row['nom'],
                    'adresse' => $row['adresse'],
                    'capacite' => $row['capacite'],
                    'description' => $row['description'],
                    'image_principale' => $row['image_principale'],
                    'prixSemaine' => $row['prix_semaine'],
                    'prixWeekend' => $row['prix_weekend'],
                    'services' => $row['services'] ? explode(',', $row['services']) : [],
                    'gestionnaire' => [
                        'nom' => $row['prenom'] . ' ' . $row['nom_gestionnaire'],
                        'telephone' => $row['telephone'],
                        'email' => $row['email_gestionnaire']
                    ]
                ];
            }

            return $salles;

        } catch (Exception $e) {
            error_log("Erreur recherche: " . $e->getMessage());
            return [];
        }
    }
}

// Traitement de la requête
try {
    $filters = $_GET;
    $rechercheManager = new RechercheManager();
    $salles = $rechercheManager->rechercherSalles($filters);

    echo json_encode([
        'success' => true,
        'data' => $salles,
        'total' => count($salles)
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erreur lors de la recherche',
        'error' => $e->getMessage()
    ]);
}
?>