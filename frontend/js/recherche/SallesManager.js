import { SallesData } from './data/sallesData.js';
import { ApiConfig } from '../config/api.js';

export class SallesManager {
    constructor() {
        this.salles = [];
        this.filteredSalles = [];
        this.currentView = 'grid';
    }

    async loadSalles(filters = {}) {
        try {
            this.salles = await SallesData.getSalles(filters);
            this.filteredSalles = [...this.salles];
            return this.salles;
        } catch (error) {
            console.error('Erreur chargement salles:', error);
            return [];
        }
    }

    // Appliquer des filtres côté client (certains filtres peuvent aussi être passés à l'API)
    filterSalles(filters = {}) {
        // Les clés attendues par FiltersManager: searchText, minPrice, maxPrice, minCapacity, services
        this.filteredSalles = this.salles.filter(salle => {
            // Recherche texte
            if (filters.searchText) {
                const q = filters.searchText.toLowerCase();
                const haystack = `${salle.nom} ${salle.adresse} ${salle.description}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }

            // Capacité
            if (filters.minCapacity && salle.capacite < filters.minCapacity) return false;

            // Prix min/max — utiliser prixSemaine si présent sinon prixWeekend
            const prix = salle.prixSemaine || salle.prixWeekend || 0;
            if (filters.minPrice && prix < filters.minPrice) return false;
            if (filters.maxPrice && prix > filters.maxPrice) return false;

            // Services — vérifier que tous les services demandés sont présents
            if (filters.services && filters.services.length > 0) {
                const lowerServices = salle.services.map(s => s.toLowerCase());
                for (const svc of filters.services) {
                    if (!lowerServices.includes(svc.toLowerCase())) return false;
                }
            }

            return true;
        });
    }

    sortSalles(sortBy = '') {
        switch (sortBy) {
            case 'prix-croissant':
                this.filteredSalles.sort((a, b) => (a.prixSemaine || a.prixWeekend || 0) - (b.prixSemaine || b.prixWeekend || 0));
                break;
            case 'prix-decroissant':
                this.filteredSalles.sort((a, b) => (b.prixSemaine || b.prixWeekend || 0) - (a.prixSemaine || a.prixWeekend || 0));
                break;
            case 'capacite-croissant':
                this.filteredSalles.sort((a, b) => a.capacite - b.capacite);
                break;
            case 'capacite-decroissant':
                this.filteredSalles.sort((a, b) => b.capacite - a.capacite);
                break;
            default:
                this.filteredSalles.sort((a, b) => a.nom.localeCompare(b.nom));
        }
    }

    getResultsCount() {
        return this.filteredSalles.length;
    }

    setView(view) {
        this.currentView = view;
    }

    renderSalles(container) {
        if (!container) return;

        if (this.filteredSalles.length === 0) {
            container.innerHTML = '<p class="no-results">Aucune salle trouvée.</p>';
            return;
        }

        const isList = this.currentView === 'list';
        const html = this.filteredSalles.map(salle => {
            const prix = salle.prixSemaine || salle.prixWeekend || '—';
            const imageUrl = salle.image_principale ? `${ApiConfig.getBaseUrl()}/${salle.image_principale}` : null;
            return `
                <div class="salle-card" data-id="${salle.id}">
                    <div class="card-body">
                        ${imageUrl ? `<img class="salle-thumb" src="${imageUrl}" alt="${salle.nom}"/>` : `<div class="salle-thumb placeholder"></div>`}

                        <div class="salle-info">
                            <h3 class="salle-title">${salle.nom}</h3>
                            <p class="salle-meta">${salle.adresse}</p>

                            <div class="salle-details">
                                <div class="salle-detail"><strong>Capacité:</strong> ${salle.capacite}</div>
                                <div class="salle-prices">
                                    <div class="salle-detail"><strong>Prix Semaine:</strong> ${salle.prixSemaine ? salle.prixSemaine + ' USD' : '—'}</div>
                                    <div class="salle-detail"><strong>Prix Weekend:</strong> ${salle.prixWeekend ? salle.prixWeekend + ' USD' : '—'}</div>
                                </div>
                            </div>

                            <!-- services intentionally hidden in list/grid preview; visible on details page -->
                        </div>
                    </div>

                    <div class="card-footer">
                        <button class="btn btn-primary" onclick="window.viewSalleDetails(${salle.id})">Détails</button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<div class="salles-grid ${isList ? 'list' : 'grid'}">${html}</div>`;
    }
}