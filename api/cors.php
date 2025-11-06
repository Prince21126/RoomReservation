<?php
function setCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    // Reflect dynamic Origin in both dev and production for session-based requests
    if (!empty($origin)) {
        header("Access-Control-Allow-Origin: $origin");
    } else if (php_sapi_name() === 'cli-server') {
        // When using PHP built-in server in dev without Origin, fall back to localhost:8000
        header("Access-Control-Allow-Origin: http://localhost:8000");
    }

    header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Access-Control-Allow-Headers");
    header("Access-Control-Allow-Credentials: true");
    header("Content-Type: application/json; charset=UTF-8");

    // Preflight
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit();
    }
}
?>
