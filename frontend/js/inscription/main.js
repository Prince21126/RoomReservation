import FormManager from './FormManager.js';
import TarificationManager from './TarificationManager.js';
import ValidationManager from './ValidationManager.js';
import ApiManager from './ApiManager.js';
import { ImagesManager } from './ImagesManager.js'; // ← Ajouter cette ligne

class InscriptionApp {
    constructor() {
        this.formManager = new FormManager();
        this.tarificationManager = new TarificationManager();
        this.validationManager = new ValidationManager();
        this.apiManager = new ApiManager();
        this.imagesManager = new ImagesManager(); // ← Ajouter cette ligne
        
        this.init();
    }

    init() {
        this.formManager.init();
        this.tarificationManager.init();
        this.validationManager.init();
        this.imagesManager.init(); // ← Ajouter cette ligne
        
        this.setupFormSubmission();
    }

    setupFormSubmission() {
        const form = document.getElementById('registerForm');
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Validation globale
            const isFormValid = this.validationManager.validateAll();
            const isTarificationValid = this.tarificationManager.validateAll();
            const isImagesValid = this.imagesManager.validateImages(); // ← Ajouter cette ligne
            
            if (!isFormValid || !isTarificationValid || !isImagesValid) {
                Notification.show('Veuillez corriger les erreurs du formulaire', 'error');
                return;
            }

            // Récupération des données
            const formData = this.formManager.getFormData();
            const tarificationData = this.tarificationManager.getData();
            const images = this.imagesManager.getImages(); // ← Ajouter cette ligne

            const completeData = {
                ...formData,
                tarification: tarificationData,
                images: images // ← Ajouter cette ligne
            };

            // Soumission
            try {
                await this.apiManager.submitInscription(completeData);
                Notification.show('Inscription réussie ! Redirection...', 'success');
                
                // Nettoyer les URLs objets
                this.imagesManager.cleanup();
                
                // Redirection
                setTimeout(() => {
                    window.location.href = 'tableau-de-bord.html';
                }, 2000);
                
            } catch (error) {
                Notification.show(error.message, 'error');
            }
        });
    }
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    new InscriptionApp();
});