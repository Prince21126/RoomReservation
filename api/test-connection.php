<?php
include_once 'cors.php';
setCorsHeaders();

ini_set('display_errors', 0);
error_reporting(0);

try {
    include_once 'config/database.php';
    
    $database = new Database();
    $conn = $database->getConnection();
    
    // Test des tables
    $tables = ['gestionnaires', 'salles', 'tarifs', 'jours_tarif', 'services', 'salle_services', 'politiques_annulation'];
    $existing_tables = [];
    
    foreach ($tables as $table) {
        try {
            $stmt = $conn->query("SELECT 1 FROM $table LIMIT 1");
            $existing_tables[$table] = true;
        } catch (Exception $e) {
            $existing_tables[$table] = false;
        }
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Connexion à la base de données réussie',
        'database' => 'room_reservation_system',
        'tables' => $existing_tables
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erreur de connexion: ' . $e->getMessage()
    ]);
}
?>