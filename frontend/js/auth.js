// Gestion de l'authentification
class AuthManager {
    // Utiliser le serveur PHP intégré démarré sur le port 8000
    // Point to the PHP endpoints under /api so cors.php is executed
    static API_BASE_URL = 'http://localhost:8000/api';

    // Vérifier si l'utilisateur est connecté
    static isAuthenticated() {
        const user = localStorage.getItem('roomReservationUser');
        return user !== null && user !== undefined;
    }

    // Récupérer l'utilisateur courant
    static getCurrentUser() {
        const user = localStorage.getItem('roomReservationUser');
        return user ? JSON.parse(user) : null;
    }

    // Sauvegarder l'utilisateur
    static saveUser(user) {
        localStorage.setItem('roomReservationUser', JSON.stringify(user));
    }

    // Connexion (Note: Ceci semble être pour le GESTIONNAIRE via /connexion.php)
    static async login(email, password) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/connexion.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            if (result.success) {
                // Ceci sauvegarde le GESTIONNAIRE
                this.saveUser(result.gestionnaire);
                return { success: true, user: result.gestionnaire };
            } else {
                return { success: false, message: result.message };
            }
        } catch (error) {
            console.error('Erreur de connexion:', error);
            return { success: false, message: 'Erreur de connexion au serveur' };
        }
    }

    // Déconnexion
    static logout() {
        // Call server to destroy session and then redirect
        try {
            fetch(this.API_BASE_URL + '/logout.php', { method: 'POST', credentials: 'include' }).catch(()=>{});
        } catch(e) {}
        localStorage.removeItem('roomReservationUser');
        window.location.href = 'index.html';
    }

    // Vérifier l'accès aux pages protégées
    static requireAuth(redirectUrl = 'connexion_utilisateur.html') {
        if (!this.isAuthenticated()) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    }

    // Vérifier si l'utilisateur est un gestionnaire
    static isGestionnaire() {
        const user = this.getCurrentUser();
        // Vérifie si l'utilisateur a un rôle ou un type 'gestionnaire'
        return user && (user.type === 'gestionnaire' || user.role === 'gestionnaire');
    }

    // Rafraîchir les données utilisateur
    static async refreshUserData() {
        // Implémentez cette méthode si vous avez un endpoint pour récupérer les données utilisateur
        console.log('Rafraîchissement des données utilisateur');
    }
}

// -------------------------------------------------------------------
// CORRECTION : 
// La classe conflictuelle 'LoginManager' a été supprimée.
// L'initialisation automatique 'DOMContentLoaded' a été supprimée.
// -------------------------------------------------------------------