<?php
include_once 'cors.php';
setCorsHeaders();

ini_set('display_errors', 0);
error_reporting(0);

header('Content-Type: application/json');

try {
    // Test de connexion MySQL de base
    $host = "localhost";
    $username = "Prince";
    $password = "@Emmanuel2112";
    
    // Test 1: Connexion à MySQL sans base spécifique
    try {
        $pdo = new PDO("mysql:host=$host", $username, $password);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $mysql_connected = true;
    } catch (Exception $e) {
        $mysql_connected = false;
        $mysql_error = $e->getMessage();
    }
    
    // Test 2: Vérifier si la base existe
    if ($mysql_connected) {
        try {
            $stmt = $pdo->query("SHOW DATABASES LIKE 'room_reservation_system'");
            $db_exists = $stmt->rowCount() > 0;
        } catch (Exception $e) {
            $db_exists = false;
        }
    } else {
        $db_exists = false;
    }
    
    // Test 3: Connexion à la base spécifique
    if ($db_exists) {
        try {
            include_once 'config/database.php';
            $database = new Database();
            $conn = $database->getConnection();
            $db_connected = true;
            
            // Test des tables
            $tables = ['gestionnaires', 'salles', 'tarifs', 'jours_tarif', 'services', 'salle_services', 'politiques_annulation'];
            $tables_status = [];
            
            foreach ($tables as $table) {
                try {
                    $stmt = $conn->query("SELECT 1 FROM $table LIMIT 1");
                    $tables_status[$table] = ['exists' => true, 'rows' => $stmt->rowCount()];
                } catch (Exception $e) {
                    $tables_status[$table] = ['exists' => false, 'error' => $e->getMessage()];
                }
            }
            
        } catch (Exception $e) {
            $db_connected = false;
            $db_error = $e->getMessage();
        }
    } else {
        $db_connected = false;
    }
    
    echo json_encode([
        'success' => true,
        'diagnostic' => [
            'mysql_connected' => $mysql_connected,
            'mysql_error' => $mysql_error ?? null,
            'database_exists' => $db_exists,
            'database_connected' => $db_connected ?? false,
            'database_error' => $db_error ?? null,
            'tables_status' => $tables_status ?? []
        ],
        'next_steps' => !$mysql_connected ? "Démarrez MySQL (XAMPP/WAMP)" : (
                       !$db_exists ? "Créez la base 'room_reservation_system'" : (
                       !$db_connected ? "Vérifiez les identifiants de connexion" : 
                       "Tout fonctionne correctement!"))
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erreur de diagnostic: ' . $e->getMessage()
    ]);
}
?>