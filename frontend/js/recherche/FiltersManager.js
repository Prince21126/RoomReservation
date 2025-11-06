export class FiltersManager {
    constructor() {
        this.filters = {
            searchText: '',
            minPrice: null,
            maxPrice: null,
            minCapacity: null,
            services: []
        };
    }

    init() {
        this.setupSearch();
        this.setupFiltersToggle();
        this.setupAdvancedFilters();
    }

    setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchButton = document.querySelector('.search-button');

        const performSearch = () => {
            this.filters.searchText = searchInput.value.trim();
            this.onFiltersChange();
        };

        searchInput.addEventListener('input', this.debounce(performSearch, 300));
        searchButton.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });
    }

    setupFiltersToggle() {
        const filterButton = document.getElementById('filterButton');
        const advancedFilters = document.getElementById('advancedFilters');

        filterButton.addEventListener('click', () => {
            const isVisible = advancedFilters.style.display === 'block';
            advancedFilters.style.display = isVisible ? 'none' : 'block';
            filterButton.classList.toggle('active', !isVisible);
        });
    }

    setupAdvancedFilters() {
        const minPrice = document.getElementById('minPrice');
        const maxPrice = document.getElementById('maxPrice');
        const minCapacity = document.getElementById('minCapacity');
        const serviceCheckboxes = document.querySelectorAll('input[name="services"]');
        const applyButton = document.getElementById('applyFilters');
        const resetButton = document.getElementById('resetFilters');

        // Écouteurs pour les filtres
        minPrice.addEventListener('input', this.debounce(() => {
            this.filters.minPrice = minPrice.value ? parseInt(minPrice.value) : null;
        }, 300));

        maxPrice.addEventListener('input', this.debounce(() => {
            this.filters.maxPrice = maxPrice.value ? parseInt(maxPrice.value) : null;
        }, 300));

        minCapacity.addEventListener('input', this.debounce(() => {
            this.filters.minCapacity = minCapacity.value ? parseInt(minCapacity.value) : null;
        }, 300));

        serviceCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateServicesFilters();
            });
        });

        applyButton.addEventListener('click', () => {
            this.onFiltersChange();
        });

        resetButton.addEventListener('click', () => {
            this.resetFilters();
        });
    }

    updateServicesFilters() {
        const serviceCheckboxes = document.querySelectorAll('input[name="services"]:checked');
        this.filters.services = Array.from(serviceCheckboxes).map(cb => cb.value);
    }

    resetFilters() {
        // Réinitialiser les valeurs des inputs
        document.getElementById('minPrice').value = '';
        document.getElementById('maxPrice').value = '';
        document.getElementById('minCapacity').value = '';
        
        const serviceCheckboxes = document.querySelectorAll('input[name="services"]');
        serviceCheckboxes.forEach(cb => cb.checked = false);

        // Réinitialiser les filtres
        this.filters = {
            searchText: '',
            minPrice: null,
            maxPrice: null,
            minCapacity: null,
            services: []
        };

        // Masquer les filtres avancés
        document.getElementById('advancedFilters').style.display = 'none';
        document.getElementById('filterButton').classList.remove('active');

        this.onFiltersChange();
    }

    onFiltersChange() {
        // Cet événement sera écouté par le main.js
        const event = new CustomEvent('filtersChanged', { 
            detail: { filters: this.filters } 
        });
        document.dispatchEvent(event);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    getFilters() {
        return { ...this.filters };
    }
}