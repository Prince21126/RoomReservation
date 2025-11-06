export class ApiConfig {
    static getBaseUrl() {
        // If the frontend is served by a static dev server (live-server, Vite, etc.)
        // we should prefer the PHP dev server which executes the .php files.
        const devPhpApi = 'http://localhost:8000/api';
        if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.protocol.indexOf('http') === 0) {
            const origin = window.location.origin;
            // Common static dev origins where PHP files would be served as static text
            const staticDevOrigins = [
                'http://127.0.0.1:5500',
                'http://localhost:5500',
                'http://localhost:3000',
                'http://127.0.0.1:3000'
            ];
            if (staticDevOrigins.includes(origin)) {
                // If the page is served by a static dev server, call the PHP server instead
                return devPhpApi;
            }
            try {
                // Otherwise assume API lives on the same origin under /api
                return origin + '/api';
            } catch (e) {
                // fallback to PHP dev server
                return devPhpApi;
            }
        }
        // Default fallback to PHP dev server
        return devPhpApi;
    }

    static async makeRequest(endpoint, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        // Construire une liste de bases STRICTEMENT "same-origin" d'abord
        let bases = [];
        if (typeof window !== 'undefined' && window.location && window.location.origin) {
            const sameOriginApi = window.location.origin + '/api';
            bases = [sameOriginApi];
        } else {
            bases = [this.getBaseUrl()];
        }
        // IMPORTANT: n'ajoutez PAS d'autres hôtes (localhost vs 127.0.0.1) ici,
        // sinon les cookies de session ne correspondront plus et vous aurez des 401.

        const method = (options.method || 'GET').toUpperCase();
        const maxRetries = typeof options.retries === 'number' ? options.retries : (method === 'GET' ? 2 : 1);

        let lastError = null;
        for (const base of bases) {
            const fullUrl = base.replace(/\/$/, '') + endpoint;
            let attempt = 0;
            while (attempt <= maxRetries) {
                try {
                    const fetchOptions = { mode: 'cors', credentials: 'include', ...defaultOptions, ...options };
                    console.debug('[ApiConfig] fetching', fullUrl, { ...fetchOptions, body: undefined }, 'attempt', attempt + 1);
                    const response = await fetch(fullUrl, fetchOptions);

                    const contentType = response.headers.get('content-type') || '';
                    const text = await response.text();

                    if (!text || text.trim().length === 0) {
                        return { success: response.ok, data: null, status: response.status };
                    }

                    if (contentType.indexOf('application/json') === -1) {
                        if (text.trim().startsWith('<?php') || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
                            console.error('[ApiConfig] Non-JSON response from', fullUrl, text.slice(0, 200));
                            throw new SyntaxError('Réponse non-JSON reçue depuis l\'API pour ' + fullUrl);
                        }
                    }

                    let data;
                    try { data = JSON.parse(text); } catch (e) {
                        if (response.ok) return { success: true, data: text, raw: text, status: response.status };
                        throw new SyntaxError('Réponse JSON invalide reçue depuis l\'API pour ' + fullUrl + ': ' + e.message);
                    }

                    if (!response.ok) throw new Error(data && data.message ? data.message : ('Erreur API, status=' + response.status));
                    return data;
                } catch (err) {
                    console.warn('[ApiConfig] fetch failed for', fullUrl, 'attempt', attempt + 1, err);
                    lastError = err;
                    const isNetwork = (err instanceof TypeError) || (err && String(err).toLowerCase().includes('failed to fetch'));
                    attempt++;
                    if (isNetwork && attempt <= maxRetries) {
                        await new Promise(r => setTimeout(r, 200 * attempt));
                        continue;
                    }
                    // Fallback DEV: si on est sur un serveur statique (port 5500/3000) et requête GET publique,
                    // réessayer sur le serveur PHP (localhost:8000) UNIQUEMENT pour certains endpoints non-authentifiés.
                    try {
                        const method = (options.method || 'GET').toUpperCase();
                        const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
                        const isStaticOrigin = origin.includes(':5500') || origin.includes(':3000');
                        const isPublicGet = method === 'GET' && (
                            endpoint.startsWith('/recherche-salles.php') ||
                            endpoint.startsWith('/salle.php') ||
                            endpoint.startsWith('/blocked_dates.php')
                        );
                        if (isStaticOrigin && isPublicGet) {
                            const devPhpApi = 'http://localhost:8000/api';
                            const altUrl = devPhpApi + endpoint;
                            console.warn('[ApiConfig] tentative fallback DEV vers', altUrl);
                            const r2 = await fetch(altUrl, { mode: 'cors', credentials: 'include', ...defaultOptions, ...options });
                            const ct2 = r2.headers.get('content-type') || '';
                            const t2 = await r2.text();
                            if (!t2 || t2.trim().length === 0) return { success: r2.ok, data: null, status: r2.status };
                            let d2;
                            try { d2 = (ct2.indexOf('application/json') !== -1) ? JSON.parse(t2) : JSON.parse(t2); } catch (e) { d2 = { success: false, message: 'Réponse invalide du fallback' }; }
                            if (!r2.ok) throw new Error(d2 && d2.message ? d2.message : ('Erreur API fallback, status=' + r2.status));
                            return d2;
                        }
                    } catch (fallbackErr) {
                        console.warn('[ApiConfig] fallback DEV échoué', fallbackErr);
                    }
                    // if network and no more attempts for this base, try next base
                    if (isNetwork) break;
                    // for non-network errors, rethrow immediately
                    throw err;
                }
            }
        }
        // if all bases failed
        const msg = `Impossible de joindre l'API. Bases essayées: ${bases.join(', ')} ; dernière erreur: ${lastError && lastError.message ? lastError.message : String(lastError)}`;
        throw new Error(msg);
    }
}