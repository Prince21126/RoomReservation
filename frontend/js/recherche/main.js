import { SallesManager } from './SallesManager.js';
import { FiltersManager } from './FiltersManager.js';
import { SallesData } from './data/sallesData.js';

class RechercheApp {
    constructor() {
        this.sallesManager = new SallesManager();
        this.filtersManager = new FiltersManager();
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.filtersManager.init();
        await this.loadSalles();
        this.setupViewToggle();
    }

    setupEventListeners() {
        // Écouter les changements de filtres
        document.addEventListener('filtersChanged', (e) => {
            this.applyFiltersAndSort();
        });

        // Écouter le tri
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.applyFiltersAndSort();
            });
        }
    }

    async loadSalles() {
        this.showLoadingState();
        await this.sallesManager.loadSalles();
        this.applyFiltersAndSort();
    }

    applyFiltersAndSort() {
        const filters = this.filtersManager.getFilters();
    const sortElem = document.getElementById('sortSelect');
    const sortBy = sortElem ? sortElem.value : '';

        // Appliquer les filtres
        this.sallesManager.filterSalles(filters);
        
        // Appliquer le tri
        this.sallesManager.sortSalles(sortBy);
        
        // Afficher les résultats
        this.displayResults();
    }

    displayResults() {
        const container = document.getElementById('sallesContainer');
        const resultsCount = document.getElementById('resultsCount');

        const count = this.sallesManager.getResultsCount();
        if (resultsCount) {
            resultsCount.textContent = `${count} salle${count > 1 ? 's' : ''} trouvée${count > 1 ? 's' : ''}`;
        }

        this.sallesManager.renderSalles(container);
    }

    showLoadingState() {
        const container = document.getElementById('sallesContainer');
        container.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Chargement des salles...</p>
            </div>
        `;
    }

    setupViewToggle() {
        const viewButtons = document.querySelectorAll('.view-btn');
        const sallesContainer = document.getElementById('sallesContainer');

        viewButtons.forEach(btn => {
                const applyView = (ev) => {
                    // support click and pointer events; avoid double-handling
                    ev && ev.preventDefault && ev.preventDefault();
                    const view = btn.getAttribute('data-view');

                    // Mettre à jour les boutons actifs
                    viewButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Changer la vue
                    this.sallesManager.setView(view);
                    sallesContainer.classList.toggle('list-view', view === 'list');

                    // Re-rendre les salles avec la nouvelle vue
                    this.sallesManager.renderSalles(sallesContainer);
                };

                // listen both to pointerdown (touch) and click for best responsiveness on mobile
                btn.addEventListener('pointerdown', applyView);
                btn.addEventListener('click', applyView);
        });

            // set initial active state based on manager currentView
            try {
                const current = this.sallesManager.currentView || 'grid';
                viewButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-view') === current));
                const sallesContainer = document.getElementById('sallesContainer');
                if (sallesContainer) sallesContainer.classList.toggle('list-view', current === 'list');
            } catch (e) { /* ignore */ }
    }

    // Méthode pour voir les détails d'une salle
    static viewSalleDetails(salleId) {
        // Rediriger vers la page de détails
        window.location.href = `details-salle.html?id=${salleId}`;
    }

    // Méthode pour réinitialiser les filtres
    static resetFilters() {
        window.RechercheApp.filtersManager.resetFilters();
    }
}

// Initialiser l'application
const app = new RechercheApp();
window.RechercheApp = app;

// Exposer les méthodes globales
window.viewSalleDetails = RechercheApp.viewSalleDetails;
window.resetFilters = RechercheApp.resetFilters;