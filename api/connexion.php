<?php
// Gérer CORS proprement via cors.php (pré-requêtes OPTIONS)
include_once 'cors.php';
setCorsHeaders();
// Démarrer la session pour permettre l'authentification côté serveur
if (session_status() === PHP_SESSION_NONE) session_start();

include_once 'config/database.php';

class ConnexionManager {
    private $db;
    private $table_gestionnaire = "gestionnaires";

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
    }

    public function connecterGestionnaire($email, $password) {
        try {
            $query = "SELECT id, email, password_hash, nom, prenom, telephone 
                      FROM " . $this->table_gestionnaire . " 
                      WHERE email = :email";
            
            $stmt = $this->db->prepare($query);
            $stmt->bindParam(":email", $email);
            $stmt->execute();

            if ($stmt->rowCount() == 1) {
                $gestionnaire = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if (password_verify($password, $gestionnaire['password_hash'])) {
                    // Définir la session côté serveur pour le gestionnaire
                    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
                    session_regenerate_id(true);
                    $_SESSION['gestionnaire_id'] = $gestionnaire['id'];
                    $_SESSION['user_type'] = 'gestionnaire';

                    return [
                        'success' => true,
                        'message' => 'Connexion réussie',
                        'gestionnaire' => [
                            'id' => $gestionnaire['id'],
                            'email' => $gestionnaire['email'],
                            'nom' => $gestionnaire['nom'],
                            'prenom' => $gestionnaire['prenom'],
                            'telephone' => $gestionnaire['telephone']
                        ]
                    ];
                }
            }

            return [
                'success' => false,
                'message' => 'Email ou mot de passe incorrect'
            ];

        } catch (Exception $e) {
            error_log("Erreur connexion: " . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Erreur lors de la connexion'
            ];
        }
    }
}

// Traitement de la requête
if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $raw = file_get_contents("php://input");
    $data = json_decode($raw, true);
    // Supporte aussi le POST x-www-form-urlencoded
    if ((!$data || !is_array($data)) && !empty($_POST)) { $data = $_POST; }

    if (!empty($data['email']) && !empty($data['password'])) {
        $connexionManager = new ConnexionManager();
        $result = $connexionManager->connecterGestionnaire($data['email'], $data['password']);
        
        // En cas de redirection demandée, renvoyer directement vers le tableau de bord gestionnaire
        $wantRedirect = isset($_GET['redirect']) || (isset($data['redirect']) && $data['redirect']);
        if ($result['success'] && $wantRedirect) {
            header('Location: /frontend/tableau-bord-gestionnaire.html');
            http_response_code(302);
            exit;
        }

        http_response_code($result['success'] ? 200 : 401);
        echo json_encode($result);
    } else {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Email et mot de passe requis'
        ]);
    }
} else {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Méthode non autorisée'
    ]);
}
?>