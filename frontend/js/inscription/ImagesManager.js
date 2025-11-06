export class ImagesManager {
    constructor() {
        this.imagesInput = document.getElementById('salleImages');
        this.uploadArea = document.getElementById('uploadArea');
        this.imagesPreview = document.getElementById('imagesPreview');
        this.selectedImages = [];
        this.maxFiles = 10;
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Clic sur la zone d'upload
        this.uploadArea.addEventListener('click', () => {
            this.imagesInput.click();
        });

        // Changement de fichier
        this.imagesInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files);
        });

        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            this.handleFileSelection(e.dataTransfer.files);
        });
    }

    handleFileSelection(files) {
        const newFiles = Array.from(files);
        
        // Vérifier la limite de fichiers
        if (this.selectedImages.length + newFiles.length > this.maxFiles) {
            this.showError(`Maximum ${this.maxFiles} images autorisées`);
            return;
        }

        newFiles.forEach(file => {
            this.validateAndAddImage(file);
        });

        this.updatePreview();
        this.validateImages();
    }

    validateAndAddImage(file) {
        // Vérifier le type de fichier
        if (!this.allowedTypes.includes(file.type)) {
            this.showError(`Type de fichier non supporté: ${file.name}. Formats acceptés: JPG, PNG, WEBP`);
            return;
        }

        // Vérifier la taille du fichier
        if (file.size > this.maxFileSize) {
            this.showError(`Fichier trop volumineux: ${file.name}. Maximum 5MB par image`);
            return;
        }

        // Ajouter l'image à la sélection
        this.selectedImages.push({
            file: file,
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            url: URL.createObjectURL(file)
        });
    }

    updatePreview() {
        this.imagesPreview.innerHTML = '';

        this.selectedImages.forEach((image, index) => {
            const previewItem = this.createPreviewItem(image, index);
            this.imagesPreview.appendChild(previewItem);
        });

        // Mettre à jour le texte de la zone d'upload
        if (this.selectedImages.length > 0) {
            this.uploadArea.querySelector('.upload-title').textContent = 
                `${this.selectedImages.length} image${this.selectedImages.length > 1 ? 's' : ''} sélectionnée${this.selectedImages.length > 1 ? 's' : ''}`;
            
            const remaining = this.maxFiles - this.selectedImages.length;
            this.uploadArea.querySelector('.upload-subtitle').textContent = 
                `Vous pouvez ajouter ${remaining} image${remaining > 1 ? 's' : ''} supplémentaire${remaining > 1 ? 's' : ''}`;
        } else {
            this.uploadArea.querySelector('.upload-title').textContent = 'Cliquez pour ajouter des images';
            this.uploadArea.querySelector('.upload-subtitle').textContent = 
                'Formats supportés: JPG, PNG, WEBP (Max 5MB par image)';
        }
    }

    createPreviewItem(image, index) {
        const item = document.createElement('div');
        item.className = 'image-preview-item';
        item.innerHTML = `
            <img src="${image.url}" alt="Aperçu" class="image-preview">
            <button type="button" class="image-remove" data-index="${index}">×</button>
            <div class="image-info">
                ${this.formatFileSize(image.size)}
            </div>
        `;

        // Écouteur pour le bouton de suppression
        const removeBtn = item.querySelector('.image-remove');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeImage(index);
        });

        return item;
    }

    removeImage(index) {
        // Libérer l'URL de l'objet
        URL.revokeObjectURL(this.selectedImages[index].url);
        
        // Retirer l'image du tableau
        this.selectedImages.splice(index, 1);
        
        // Mettre à jour l'aperçu
        this.updatePreview();
        this.validateImages();
        
        // Réinitialiser l'input file
        this.imagesInput.value = '';
    }

    validateImages() {
        const container = this.imagesInput.closest('.images-upload-container');
        const formGroup = this.imagesInput.closest('.form-group');

        // Réinitialiser les états
        container.classList.remove('error', 'success');
        this.clearError(formGroup);

        // Validation minimum 3 images
        if (this.selectedImages.length < 3) {
            this.showError('Minimum 3 images requises');
            container.classList.add('error');
            return false;
        }

        // Validation réussie
        container.classList.add('success');
        return true;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showError(message) {
        const formGroup = this.imagesInput.closest('.form-group');
        this.clearError(formGroup);

        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        formGroup.appendChild(errorElement);

        this.imagesInput.closest('.images-upload-container').classList.add('error');
    }

    clearError(formGroup) {
        const errorElement = formGroup.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }
    }

    getImages() {
        return this.selectedImages;
    }

    getImagesCount() {
        return this.selectedImages.length;
    }

    // Préparer les images pour l'envoi (FormData)
    prepareImagesForUpload(formData) {
        this.selectedImages.forEach((image, index) => {
            formData.append(`images[${index}]`, image.file);
        });
        return formData;
    }

    // Nettoyer les URLs objets
    cleanup() {
        this.selectedImages.forEach(image => {
            URL.revokeObjectURL(image.url);
        });
    }
}