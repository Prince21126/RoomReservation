<?php
// config/database.php (version simplifiée sans logique Heroku)
class Database {
    private $host = "localhost";
    private $db_name = "room_reservation_system";
    private $username = "Prince";
    private $password = "@Emmanuel2112";
    public $conn;

    public function getConnection() {
        $this->conn = null;
        try {
            $dsn = "mysql:host={$this->host};dbname={$this->db_name};charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            $this->conn = new PDO($dsn, $this->username, $this->password, $options);
        } catch (Exception $exception) {
            throw new Exception("Erreur de connexion: " . $exception->getMessage());
        }
        return $this->conn;
    }
}
?>
