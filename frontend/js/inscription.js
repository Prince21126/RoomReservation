// Gestion de l'inscription gestionnaire
class InscriptionManager {
    constructor() {
        this.registerForm = document.getElementById('registerForm');
        
        // Vérifier que le formulaire existe
        if (!this.registerForm) {
            console.error('❌ Formulaire registerForm non trouvé!');
            return;
        }
        
        this.API_BASE_URL = 'http://localhost:8000';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupValidation();
        this.setupTarification();
        this.setupImagesUpload();
    }

    setupEventListeners() {
        this.registerForm.addEventListener('submit', (e) => this.handleInscription(e));
        
        // Validation en temps réel - UNIQUEMENT pour les inputs avec form-group
        const inputsWithFormGroup = this.registerForm.querySelectorAll('.form-group input, .form-group textarea, .form-group select');
        inputsWithFormGroup.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearValidation(input));
        });

        // Validation des mots de passe
        const password = document.getElementById('password');
        const confirmPassword = document.getElementById('confirmPassword');
        
        if (password) {
            password.addEventListener('input', () => this.validatePasswordStrength());
        }
        
        if (confirmPassword) {
            confirmPassword.addEventListener('input', () => this.validatePasswordMatch());
        }
    }

    setupValidation() {
        this.validatePasswordStrength();
    }

    setupTarification() {
        this.setDefaultJoursSelection();
        
        const prixSemaine = document.getElementById('prixSemaine');
        const prixWeekend = document.getElementById('prixWeekend');
        
        if (prixSemaine) {
            prixSemaine.addEventListener('blur', () => this.validateTarif('semaine'));
        }
        
        if (prixWeekend) {
            prixWeekend.addEventListener('blur', () => this.validateTarif('weekend'));
        }
        
        this.setupJoursExclusivite();
    }

    setDefaultJoursSelection() {
        const joursSemaineDefault = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
        const joursWeekendDefault = ['samedi', 'dimanche'];
        
        joursSemaineDefault.forEach(jour => {
            const checkbox = document.querySelector(`input[name="joursSemaine"][value="${jour}"]`);
            if (checkbox) checkbox.checked = true;
        });
        
        joursWeekendDefault.forEach(jour => {
            const checkbox = document.querySelector(`input[name="joursWeekend"][value="${jour}"]`);
            if (checkbox) checkbox.checked = true;
        });
    }

    setupJoursExclusivite() {
        const joursSemaineCheckboxes = document.querySelectorAll('input[name="joursSemaine"]');
        const joursWeekendCheckboxes = document.querySelectorAll('input[name="joursWeekend"]');
        
        joursSemaineCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const jour = e.target.value;
                    const correspondingWeekendCheckbox = document.querySelector(`input[name="joursWeekend"][value="${jour}"]`);
                    if (correspondingWeekendCheckbox) {
                        correspondingWeekendCheckbox.checked = false;
                        this.validateTarif('weekend');
                    }
                }
                this.validateTarif('semaine');
            });
        });
        
        joursWeekendCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const jour = e.target.value;
                    const correspondingSemaineCheckbox = document.querySelector(`input[name="joursSemaine"][value="${jour}"]`);
                    if (correspondingSemaineCheckbox) {
                        correspondingSemaineCheckbox.checked = false;
                        this.validateTarif('semaine');
                    }
                }
                this.validateTarif('weekend');
            });
        });
    }

    async handleInscription(e) {
        e.preventDefault();

        // Valider tous les champs requis AVEC form-group
        const requiredInputs = this.registerForm.querySelectorAll('.form-group [required]');
        let isValid = true;

        requiredInputs.forEach(input => {
            if (!this.validateField(input)) {
                isValid = false;
            }
        });

        if (!this.validatePasswordMatch()) {
            isValid = false;
        }

        if (!this.validateAllTarifs()) {
            isValid = false;
        }

        if (!this.images || this.images.length < 1) {
            this.showNotification('Veuillez télécharger au moins une image de la salle', 'error');
            if (this.imagesPreview) this.imagesPreview.classList.add('error');
            isValid = false;
        } else {
            if (this.imagesPreview) this.imagesPreview.classList.remove('error');
        }

        if (!isValid) {
            this.showNotification('Veuillez corriger les erreurs du formulaire', 'error');
            return;
        }

        await this.performInscription();
    }

    async performInscription() {
        const submitButton = this.registerForm.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;

        this.setButtonLoading(submitButton, true);

        try {
            const formData = this.getFormData();
            
            console.log('📤 Données envoyées:', formData);
            console.log('🔗 URL utilisée:', `${this.API_BASE_URL}/inscription.php`);
            
            const response = await fetch(`${this.API_BASE_URL}/inscription.php`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            console.log('📥 Statut HTTP:', response.status);
            
            // Lire la réponse comme texte d'abord pour debug
            const responseText = await response.text();
            console.log('📥 Réponse brute:', responseText);
            
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (e) {
                console.error('❌ Réponse non-JSON:', responseText);
                throw new Error('Le serveur a retourné une réponse invalide. Vérifiez que PHP fonctionne correctement.');
            }
            
            console.log('📥 Réponse JSON:', result);

            if (!result.success) {
                throw new Error(result.message);
            }

            this.showNotification('Inscription réussie !', 'success');

            // Si des images sont présentes, les uploader vers le serveur
            if (this.images && this.images.length > 0) {
                try {
                    await this.uploadImages(result.salle_id);
                } catch (err) {
                    console.error('Erreur lors de l\'upload des images:', err);
                    this.showNotification('Inscription OK, mais échec de l\'upload des images', 'error');
                }
            }

            // Sauvegarde des données utilisateur
            this.saveUserData({
                id: result.gestionnaire_id,
                email: formData.email,
                nom: formData.nom,
                prenom: formData.prenom,
                type: 'gestionnaire'
            });

            // Redirection vers le tableau de bord
            setTimeout(() => {
                window.location.href = 'tableau-de-bord.html';
            }, 2000);

        } catch (error) {
            console.error('❌ Erreur complète:', error);
            this.showNotification(error.message || 'Erreur de connexion au serveur', 'error');
        } finally {
            this.setButtonLoading(submitButton, false, originalText);
        }
    }

    getFormData() {
        const formData = new FormData(this.registerForm);
        const data = {
            services: [],
            tarifs: {
                semaine: { prix: 0, jours: [] },
                weekend: { prix: 0, jours: [] }
            }
        };
        
        // Récupérer les données du formulaire
        for (let [key, value] of formData.entries()) {
            if (key === 'services') {
                data.services.push(value);
            } else if (key === 'joursSemaine') {
                data.tarifs.semaine.jours.push(value);
            } else if (key === 'joursWeekend') {
                data.tarifs.weekend.jours.push(value);
            } else {
                data[key] = value;
            }
        }

        // Ajouter les prix
        const prixSemaine = document.getElementById('prixSemaine');
        const prixWeekend = document.getElementById('prixWeekend');
        
        if (prixSemaine) data.tarifs.semaine.prix = parseFloat(prixSemaine.value) || 0;
        if (prixWeekend) data.tarifs.weekend.prix = parseFloat(prixWeekend.value) || 0;

        // Ajouter les conditions d'annulation (contrat)
        const conditionsInput = document.getElementById('contrat');
        if (conditionsInput) {
            data.conditions_annulation = conditionsInput.value;
        }

        return data;
    }

    validateField(field) {
        const formGroup = field.closest('.form-group');
        
        // ✅ VÉRIFICATION CRITIQUE - si pas de form-group, on ne valide pas
        if (!formGroup) {
            return true;
        }
        
        const value = field.value.trim();

        if (field.hasAttribute('required') && !value) {
            this.showError(formGroup, 'Ce champ est obligatoire');
            return false;
        }

        // Validation spécifique par type de champ
        switch (field.type) {
            case 'email':
                if (!this.isValidEmail(value)) {
                    this.showError(formGroup, 'Veuillez entrer un email valide');
                    return false;
                }
                break;
            case 'tel':
                if (!this.isValidPhone(value)) {
                    this.showError(formGroup, 'Veuillez entrer un numéro de téléphone valide');
                    return false;
                }
                break;
            case 'number':
                if (field.hasAttribute('min') && parseFloat(value) < parseFloat(field.getAttribute('min'))) {
                    this.showError(formGroup, `La valeur doit être au moins ${field.getAttribute('min')}`);
                    return false;
                }
                break;
        }

        this.showSuccess(formGroup);
        return true;
    }

    validateTarif(type) {
        const prixInput = document.getElementById(`prix${type.charAt(0).toUpperCase() + type.slice(1)}`);
        const tarifSection = prixInput ? prixInput.closest('.tarif-section') : null;
        
        if (!tarifSection) {
            console.warn('Section tarif non trouvée pour:', type);
            return false;
        }
        
        const joursCheckboxes = document.querySelectorAll(`input[name="jours${type.charAt(0).toUpperCase() + type.slice(1)}"]:checked`);
        
        let isValid = true;
        
        // Vérifier qu'au moins un jour est sélectionné
        if (joursCheckboxes.length === 0) {
            this.showTarifError(tarifSection, `Veuillez sélectionner au moins un jour pour le tarif ${type}`);
            isValid = false;
        } else {
            this.clearTarifError(tarifSection);
        }
        
        // Vérifier que le prix est valide
        if (!prixInput || !prixInput.value || parseFloat(prixInput.value) <= 0) {
            this.showTarifError(tarifSection, `Le prix pour le tarif ${type} doit être supérieur à 0`);
            isValid = false;
        }
        
        if (isValid) {
            tarifSection.classList.add('success');
            tarifSection.classList.remove('error');
        }
        
        return isValid;
    }

    validateAllTarifs() {
        const isSemaineValid = this.validateTarif('semaine');
        const isWeekendValid = this.validateTarif('weekend');
        
        return isSemaineValid && isWeekendValid;
    }

    showTarifError(tarifSection, message) {
        if (!tarifSection) return;
        
        tarifSection.classList.add('error');
        tarifSection.classList.remove('success');
        
        let errorElement = tarifSection.querySelector('.tarif-error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message tarif-error-message';
            tarifSection.appendChild(errorElement);
        }
        
        errorElement.textContent = message;
    }

    clearTarifError(tarifSection) {
        if (!tarifSection) return;
        
        tarifSection.classList.remove('error');
        
        const errorElement = tarifSection.querySelector('.tarif-error-message');
        if (errorElement) {
            errorElement.remove();
        }
    }

    validatePasswordStrength() {
        const password = document.getElementById('password');
        const strengthBar = document.querySelector('.strength-bar');
        const strengthText = document.querySelector('.strength-text');

        if (!password || !strengthBar || !strengthText) {
            return;
        }

        const passwordValue = password.value;
        let strength = 0;

        if (passwordValue.length >= 8) strength += 1;
        if (/[A-Z]/.test(passwordValue)) strength += 1;
        if (/[0-9]/.test(passwordValue)) strength += 1;
        if (/[^A-Za-z0-9]/.test(passwordValue)) strength += 1;

        const strengthColors = ['#dc3545', '#ffc107', '#28a745', '#20c997'];
        const strengthMessages = ['Faible', 'Moyen', 'Fort', 'Très fort'];

        strengthBar.style.width = `${(strength / 4) * 100}%`;
        strengthBar.style.backgroundColor = strengthColors[strength - 1] || '#dc3545';
        strengthText.textContent = `Force du mot de passe: ${strengthMessages[strength - 1] || 'Faible'}`;
        strengthText.style.color = strengthColors[strength - 1] || '#dc3545';
    }

    validatePasswordMatch() {
        const password = document.getElementById('password');
        const confirmPassword = document.getElementById('confirmPassword');
        
        if (!password || !confirmPassword) return true;

        const formGroup = confirmPassword.closest('.form-group');
        if (!formGroup) return true;

        if (password.value !== confirmPassword.value) {
            this.showError(formGroup, 'Les mots de passe ne correspondent pas');
            return false;
        }

        this.showSuccess(formGroup);
        return true;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    isValidPhone(phone) {
        const phoneRegex = /^[\+]?[0-9\s\-\/\(\)]{8,}$/;
        return phoneRegex.test(phone);
    }

    showError(formGroup, message) {
        if (!formGroup) return;
        
        formGroup.classList.add('error');
        formGroup.classList.remove('success');

        let errorElement = formGroup.querySelector('.error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            formGroup.appendChild(errorElement);
        }

        errorElement.textContent = message;
    }

    showSuccess(formGroup) {
        if (!formGroup) return;
        
        formGroup.classList.remove('error');
        formGroup.classList.add('success');

        const errorElement = formGroup.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }
    }

    clearValidation(field) {
        const formGroup = field.closest('.form-group');
        
        if (!formGroup) return;
        
        formGroup.classList.remove('error', 'success');
        
        const errorElement = formGroup.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }
    }

    setButtonLoading(button, isLoading, originalText = 'S\'inscrire') {
        if (isLoading) {
            button.textContent = 'Inscription en cours...';
            button.classList.add('btn-loading');
            button.disabled = true;
        } else {
            button.textContent = originalText;
            button.classList.remove('btn-loading');
            button.disabled = false;
        }
    }

    showNotification(message, type = 'info') {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    saveUserData(user) {
        localStorage.setItem('roomReservationUser', JSON.stringify(user));
    }

    async uploadImages(salle_id) {
        if (!this.images || this.images.length === 0) return;

        const fd = new FormData();
        fd.append('salle_id', salle_id);

        this.images.forEach((file) => {
            fd.append('images[]', file);
        });

        try {
            const res = await fetch(`${this.API_BASE_URL}/upload-images.php`, {
                method: 'POST',
                body: fd
            });

            const text = await res.text();
            let json;
            try { json = JSON.parse(text); } catch (e) {
                console.error('Réponse non JSON upload images:', text);
                throw new Error('Réponse invalide du serveur lors de l\'upload des images');
            }

            if (!json.success) {
                throw new Error(json.message || 'Échec de l\'upload des images');
            }

            this.showNotification('Images uploadées avec succès', 'success');
            return json;

        } catch (error) {
            console.error('Erreur uploadImages:', error);
            throw error;
        }
    }

    /* Image upload helpers */
    setupImagesUpload() {
        this.uploadArea = document.getElementById('uploadArea');
        this.imageInput = document.getElementById('imageUpload');
        this.imagesPreview = document.getElementById('imagesPreview');
        this.imagesCountEl = document.getElementById('imagesCount');
        this.uploadProgress = document.getElementById('uploadProgress');

        if (!this.uploadArea || !this.imageInput) {
            console.warn('Zone d\'upload d\'images non trouvée');
            return;
        }

        const browseLink = this.uploadArea.querySelector('.browse-link');
        if (browseLink) {
            browseLink.addEventListener('click', () => this.imageInput.click());
        }

        this.uploadArea.addEventListener('click', (e) => {
            this.imageInput.click();
        });

        this.imageInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        ['dragenter', 'dragover'].forEach(evt => {
            this.uploadArea.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.uploadArea.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(evt => {
            this.uploadArea.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.uploadArea.classList.remove('drag-over');
            });
        });

        this.uploadArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files) {
                this.handleFiles(dt.files);
            }
        });

        this.images = [];
        this.MAX_IMAGES = 10;
        this.MIN_IMAGES = 3;
        this.MAX_SIZE = 5 * 1024 * 1024;
        this.updateImagesUI();
    }

    handleFiles(fileList) {
        const files = Array.from(fileList);
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            if (file.size > this.MAX_SIZE) {
                this.showNotification(`${file.name} dépasse la taille maximale de 5MB`, 'error');
                continue;
            }
            if (this.images.length >= this.MAX_IMAGES) {
                this.showNotification('Nombre maximal d\'images atteint', 'error');
                break;
            }

            this.images.push(file);
            this.addPreview(file);
        }

        this.updateImagesUI();
    }

    addPreview(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = file.name;
            img.className = 'preview-thumb';

            const container = document.createElement('div');
            container.className = 'preview-item';
            container.appendChild(img);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-image';
            removeBtn.textContent = 'Supprimer';
            removeBtn.addEventListener('click', () => {
                const idx = this.images.findIndex(f => f.name === file.name && f.size === file.size);
                if (idx > -1) this.images.splice(idx, 1);
                container.remove();
                this.updateImagesUI();
            });

            container.appendChild(removeBtn);
            if (this.imagesPreview) {
                this.imagesPreview.appendChild(container);
            }
        };
        reader.readAsDataURL(file);
    }

    updateImagesUI() {
        // Update count
        if (this.imagesCountEl) {
            this.imagesCountEl.textContent = `${this.images.length}/${this.MAX_IMAGES} images`;
        }

        // Update progress
        if (this.uploadProgress) {
            const pct = Math.round((this.images.length / this.MAX_IMAGES) * 100);
            this.uploadProgress.style.width = `${pct}%`;
        }

        // Simple validation state
        if (this.imagesPreview) {
            if (this.images.length < this.MIN_IMAGES) {
                this.imagesPreview.classList.add('needs-more');
            } else {
                this.imagesPreview.classList.remove('needs-more');
            }
        }
    }
}

// Initialisation avec vérification étendue
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔍 Vérification des éléments de la page...');
    
    const requiredElements = [
        'registerForm',
        'password', 
        'confirmPassword',
        'email',
        'prenom',
        'nom',
        'telephone',
        'nomSalle',
        'adresse',
        'capacite',
        'prixSemaine',
        'prixWeekend',
        'uploadArea',
        'imageUpload'
    ];
    
    requiredElements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`${id}:`, element ? '✅ Trouvé' : '❌ Manquant');
    });

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        new InscriptionManager();
        console.log('🚀 InscriptionManager initialisé avec succès');
    } else {
        console.error('❌ Formulaire d\'inscription non trouvé sur cette page');
    }
});