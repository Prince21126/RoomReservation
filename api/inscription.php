<?php
// DÉSACTIVER l'affichage des erreurs PHP
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

include_once 'cors.php';
setCorsHeaders();

// Gestion des erreurs globales
set_error_handler(function($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function($exception) {
    error_log("Exception non capturée: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erreur interne du serveur'
    ]);
    exit;
});

try {
    include_once 'config/database.php';

    class InscriptionManager {
        private $db;
        private $table_gestionnaire = "gestionnaires";
        private $table_salle = "salles";
        private $table_tarif = "tarifs";
        private $table_jours_tarif = "jours_tarif";
        private $table_salle_services = "salle_services";
        private $table_politiques = "politiques_annulation";

        public function __construct() {
            $database = new Database();
            $this->db = $database->getConnection();
        }

        public function inscrireGestionnaire($data) {
            // Validation des données requises
            $required_fields = ['prenom', 'nom', 'telephone', 'email', 'password', 'nomSalle', 'adresse', 'capacite'];
            foreach ($required_fields as $field) {
                if (empty($data[$field])) {
                    throw new Exception("Le champ $field est requis");
                }
            }

            $this->db->beginTransaction();

            try {
                // 1. Vérifier si l'email existe déjà
                $checkQuery = "SELECT id FROM " . $this->table_gestionnaire . " WHERE email = :email";
                $checkStmt = $this->db->prepare($checkQuery);
                $checkStmt->bindValue(":email", $data['email']);
                $checkStmt->execute();
                
                if ($checkStmt->rowCount() > 0) {
                    throw new Exception('Cet email est déjà utilisé');
                }

                // 2. Créer le gestionnaire
                $query = "INSERT INTO " . $this->table_gestionnaire . " 
                         (prenom, nom, telephone, telephone_secondaire, email, password_hash) 
                          VALUES (:prenom, :nom, :telephone, :telephone_secondaire, :email, :password_hash)";
                
                $stmt = $this->db->prepare($query);
                $password_hash = password_hash($data['password'], PASSWORD_DEFAULT);
                
                $stmt->bindValue(":prenom", $data['prenom']);
                $stmt->bindValue(":nom", $data['nom']);
                $stmt->bindValue(":telephone", $data['telephone']);
                $stmt->bindValue(":telephone_secondaire", $data['telephoneSecondaire'] ?? null);
                $stmt->bindValue(":email", $data['email']);
                $stmt->bindValue(":password_hash", $password_hash);
                
                if (!$stmt->execute()) {
                    throw new Exception('Erreur lors de la création du gestionnaire');
                }
                
                $gestionnaire_id = $this->db->lastInsertId();

                // 3. Créer la salle
                $query = "INSERT INTO " . $this->table_salle . " 
                         (gestionnaire_id, nom_salle, adresse, capacite, description) 
                          VALUES (:gestionnaire_id, :nom_salle, :adresse, :capacite, :description)";
                
                $stmt = $this->db->prepare($query);
                
                $stmt->bindValue(":gestionnaire_id", $gestionnaire_id);
                $stmt->bindValue(":nom_salle", $data['nomSalle']);
                $stmt->bindValue(":adresse", $data['adresse']);
                $stmt->bindValue(":capacite", $data['capacite']);
                $stmt->bindValue(":description", $data['description'] ?? '');
                
                if (!$stmt->execute()) {
                    throw new Exception('Erreur lors de la création de la salle');
                }
                
                $salle_id = $this->db->lastInsertId();

                // 4. Créer les tarifs
                if (!empty($data['tarifs']['semaine'])) {
                    $this->creerTarif($salle_id, 'semaine', $data['tarifs']['semaine']);
                }
                if (!empty($data['tarifs']['weekend'])) {
                    $this->creerTarif($salle_id, 'weekend', $data['tarifs']['weekend']);
                }

                // 5. Ajouter les services
                if (!empty($data['services'])) {
                    $this->ajouterServices($salle_id, $data['services']);
                }

                // 6. Ajouter la politique d'annulation
                if (!empty($data['conditions_annulation'])) {
                    $this->ajouterPolitiqueAnnulation($salle_id, $data['conditions_annulation']);
                }

                $this->db->commit();

                return [
                    'success' => true,
                    'message' => 'Inscription réussie',
                    'gestionnaire_id' => $gestionnaire_id,
                    'salle_id' => $salle_id
                ];

            } catch (Exception $e) {
                $this->db->rollBack();
                throw $e;
            }
        }

        private function creerTarif($salle_id, $type, $tarif_data) {
            if (empty($tarif_data['prix']) || floatval($tarif_data['prix']) <= 0) {
                throw new Exception("Le prix pour le tarif $type doit être supérieur à 0");
            }

            $query = "INSERT INTO " . $this->table_tarif . " 
                     (salle_id, type_tarif, prix) 
                      VALUES (:salle_id, :type_tarif, :prix)";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindValue(":salle_id", $salle_id);
            $stmt->bindValue(":type_tarif", $type);
            $stmt->bindValue(":prix", $tarif_data['prix']);
            
            if (!$stmt->execute()) {
                throw new Exception("Erreur lors de la création du tarif $type");
            }
            
            $tarif_id = $this->db->lastInsertId();

            // Insérer les jours
            if (!empty($tarif_data['jours'])) {
                foreach ($tarif_data['jours'] as $jour) {
                    $query = "INSERT INTO " . $this->table_jours_tarif . " 
                             (tarif_id, jour) 
                              VALUES (:tarif_id, :jour)";
                    
                    $stmt = $this->db->prepare($query);
                    $stmt->bindValue(":tarif_id", $tarif_id);
                    $stmt->bindValue(":jour", $jour);
                    $stmt->execute();
                }
            }
        }

        private function ajouterServices($salle_id, $services) {
            foreach ($services as $service_nom) {
                $query = "SELECT id FROM services WHERE nom = :nom";
                $stmt = $this->db->prepare($query);
                $stmt->bindValue(":nom", $service_nom);
                $stmt->execute();
                
                if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $service_id = $row['id'];
                    
                    $query = "INSERT INTO " . $this->table_salle_services . " 
                             (salle_id, service_id) 
                              VALUES (:salle_id, :service_id)";
                    
                    $stmt = $this->db->prepare($query);
                    $stmt->bindValue(":salle_id", $salle_id);
                    $stmt->bindValue(":service_id", $service_id);
                    $stmt->execute();
                }
            }
        }

        private function ajouterPolitiqueAnnulation($salle_id, $conditions) {
            $query = "INSERT INTO " . $this->table_politiques . " 
                     (salle_id, conditions) 
                      VALUES (:salle_id, :conditions)";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindValue(":salle_id", $salle_id);
            $stmt->bindValue(":conditions", $conditions);
            $stmt->execute();
        }
    }

    // Traitement de la requête
    if ($_SERVER['REQUEST_METHOD'] == 'POST') {
        $input = file_get_contents("php://input");
        $data = json_decode($input, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception('Données JSON invalides');
        }
        
        $inscriptionManager = new InscriptionManager();
        $result = $inscriptionManager->inscrireGestionnaire($data);
        
        http_response_code(201);
        echo json_encode($result);
        
    } else {
        http_response_code(405);
        echo json_encode([
            'success' => false,
            'message' => 'Méthode non autorisée. Utilisez POST.'
        ]);
    }

} catch (Exception $e) {
    error_log("Erreur inscription: " . $e->getMessage());
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}
?>