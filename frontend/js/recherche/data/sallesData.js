import { ApiConfig } from '../../config/api.js';

export class SallesData {
    static async getSalles(filters = {}) {
        try {
            // Construire les paramètres de requête
            const params = new URLSearchParams();
            Object.keys(filters).forEach(key => {
                if (filters[key]) {
                    params.append(key, filters[key]);
                }
            });

            const response = await ApiConfig.makeRequest(`/recherche-salles.php?${params}`);
            
            if (response.success) {
                return response.data;
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            console.error('Erreur chargement salles:', error);
            return this.getDefaultSalles();
        }
    }

    static getDefaultSalles() {
        // Retourner un tableau vide ou des données par défaut
        return [];
    }
}