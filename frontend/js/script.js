// Gestion des interactions de la page d'accueil
document.addEventListener('DOMContentLoaded', function() {
    // Récupération des éléments
    const searchRoomBtn = document.getElementById('searchRoomBtn');
    const manageRoomBtn = document.getElementById('manageRoomBtn');
    const userLoginBtn = document.getElementById('userLoginBtn');
    
    // Gestion du bouton "Je cherche une salle"
    searchRoomBtn.addEventListener('click', function() {
        // Animation du bouton
        animateButton(this);
        
        // Redirection vers la page de recherche
        setTimeout(() => {
            window.location.href = 'recherche-salles.html';
        }, 300);
    });
    
    // Gestion du bouton "Je gère une salle"
// Dans le fichier js/script.js existant
manageRoomBtn.addEventListener('click', function() {
    // Animation du bouton
    animateButton(this);
    
    // Redirection vers la page de connexion gestionnaire
    setTimeout(() => {
        window.location.href = 'connexion_gestionnaire.html';
    }, 300);
});

    // User login / account button: if user already logged in, link to dashboard; otherwise go to login
    if (userLoginBtn) {
        // Le bouton mène toujours vers la page de connexion utilisateur (session côté serveur)
        userLoginBtn.textContent = 'Connexion utilisateur';
        userLoginBtn.addEventListener('click', function() {
            animateButton(this);
            setTimeout(() => { window.location.href = 'connexion_utilisateur.html'; }, 200);
        });
    }
    
    // Animation des statistiques au scroll
    const statsSection = document.querySelector('.stats');
    const statNumbers = document.querySelectorAll('.stat-number');
    
    // Observer pour l'animation des statistiques
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateStats();
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    
    if (statsSection) {
        observer.observe(statsSection);
    }
    
    // Fonction d'animation des boutons
    function animateButton(button) {
        button.style.transform = 'scale(0.95)';
        setTimeout(() => {
            button.style.transform = '';
        }, 150);
    }
    
    // Fonction d'animation des statistiques
    function animateStats() {
        statNumbers.forEach((stat, index) => {
            const finalValue = stat.textContent;
            const isPercentage = finalValue.includes('%');
            const numericValue = parseInt(finalValue);
            
            let startValue = 0;
            const duration = 2000;
            const increment = numericValue / (duration / 16);
            
            const timer = setInterval(() => {
                startValue += increment;
                if (startValue >= numericValue) {
                    stat.textContent = finalValue;
                    clearInterval(timer);
                } else {
                    stat.textContent = Math.floor(startValue) + (isPercentage ? '%' : '+');
                }
            }, 16);
        });
    }
    
    // Ajout d'effets de hover sur les features
    const features = document.querySelectorAll('.feature');
    features.forEach(feature => {
        feature.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#f8f9ff';
        });
        
        feature.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '';
        });
    });
    
    // Fonction pour gérer les erreurs
    window.addEventListener('error', function(e) {
        console.error('Erreur JavaScript:', e.error);
    });
});

// Fonctions utilitaires pour l'application
const RoomReservation = {
    // Stockage des données utilisateur
    userData: null,
    
    // Initialisation de l'application
    init: function() {
        console.log('Application Room Reservation initialisée');
        this.loadUserData();
    },
    
    // Chargement des données utilisateur
    loadUserData: function() {
        const savedData = localStorage.getItem('roomReservationUser');
        if (savedData) {
            this.userData = JSON.parse(savedData);
            console.log('Données utilisateur chargées:', this.userData);
        }
    },
    
    // Sauvegarde des données utilisateur
    saveUserData: function(data) {
        this.userData = { ...this.userData, ...data };
        localStorage.setItem('roomReservationUser', JSON.stringify(this.userData));
    },
    
    // Vérification de la connexion
    isUserLoggedIn: function() {
        return this.userData && this.userData.isLoggedIn;
    },
    
    // Redirection vers une page
    redirectTo: function(page) {
        window.location.href = page;
    },
    
    // Affichage de notification
    showNotification: function(message, type = 'info') {
        // Création d'une notification simple
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'error' ? '#f8d7da' : type === 'success' ? '#d4edda' : '#d1ecf1'};
            color: ${type === 'error' ? '#721c24' : type === 'success' ? '#155724' : '#0c5460'};
            border: 1px solid ${type === 'error' ? '#f5c6cb' : type === 'success' ? '#c3e6cb' : '#bee5eb'};
            border-radius: 5px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
};

// Initialisation de l'application au chargement
document.addEventListener('DOMContentLoaded', function() {
    RoomReservation.init();
});

// Styles pour les animations de notification
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .notification {
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
`;
document.head.appendChild(style);