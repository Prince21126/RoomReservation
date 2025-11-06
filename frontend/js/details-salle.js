import { ApiConfig } from './config/api.js';
import { createCalendar } from './calendar.js';
import { publishCalendarUpdate, subscribeCalendarUpdates } from './sync.js';

// Expose minimal auth utilities (AuthManager is defined in auth.js file - ensure it's loaded where needed)

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
        alert('Aucun ID de salle fourni.');
        window.location.href = 'recherche-salles.html';
        return;
    }

    const reserverBtn = document.getElementById('reserverBtn');
    const salleIdInput = document.getElementById('salleId');

    salleIdInput.value = id;

    try {
        const resp = await ApiConfig.makeRequest('/salle.php?id=' + encodeURIComponent(id));
        if (!resp.success) throw new Error(resp.message || 'Erreur API');

    const salle = resp.data;
    // Debug: log salle payload to help diagnose missing fields
    console.debug('Loaded salle detail:', salle);
    renderSalle(salle);
    // Adjust back button: if current user is gestionnaire and owner, send back to dashboard
    try {
        if (typeof AuthManager !== 'undefined') {
            const current = AuthManager.getCurrentUser();
            const backBtn = document.querySelector('.details-header .back-button');
            // Prefer to send user back to the actual referrer if any (same-origin), otherwise fall back to listing or dashboard when owner
            const ref = document.referrer;
            if (backBtn) {
                try {
                    const rUrl = new URL(ref);
                    if (rUrl.origin === window.location.origin && ref) {
                        backBtn.setAttribute('href', ref);
                    }
                } catch (e) { /* ignore */ }
            }

            // Prefer history.back() behavior but fall back to referrer or search page when unavailable.
            if (backBtn) {
                backBtn.addEventListener('click', (ev) => {
                    try {
                        ev.preventDefault();
                    } catch (e) {}
                    try {
                        const ref = document.referrer;
                        if (ref) {
                            try {
                                const rUrl = new URL(ref);
                                if (rUrl.origin === window.location.origin) {
                                    window.location.href = ref;
                                    return;
                                }
                            } catch (e) { /* ignore malformed referrer */ }
                        }
                    } catch (e) {}
                    if (window.history && window.history.length > 1) {
                        window.history.back();
                    } else {
                        window.location.href = 'recherche-salles.html';
                    }
                });
            }
            if (current && current.type === 'gestionnaire' && salle.gestionnaire && String(salle.gestionnaire.id) === String(current.id)) {
                if (backBtn) backBtn.setAttribute('href', 'tableau-bord-gestionnaire.html');
                // Also show an Edit button to jump to dashboard edit view
                const header = document.querySelector('.details-header');
                const editBtn = document.createElement('button');
                editBtn.className = 'btn-primary';
                editBtn.style.marginLeft = '12px';
                editBtn.textContent = 'Éditer cette salle';
                editBtn.addEventListener('click', () => {
                    // Navigate to dashboard with edit query param
                    window.location.href = 'tableau-bord-gestionnaire.html?edit=' + encodeURIComponent(id);
                });
                header.appendChild(editBtn);
            }
        }
    } catch (e) { console.warn('could not set back/edit button', e); }
    // Initialize calendar for this salle (responsive, elegant)
        const calContainer = document.getElementById('salleCalendar');
        const dayDetails = document.getElementById('dayDetailsPublic');
        if (calContainer) {
            // Sur la page Détails, seules les réservations CONFIRMÉES bloquent la date (après validation de la preuve)
            const getReservedDates = (s) => Array.isArray(s.reservations)
                ? s.reservations
                    .filter(r => String((r.statut || '')).toLowerCase().includes('confirm'))
                    .map(r => r.date_reservation)
                : [];
            const getPendingDates = (s) => Array.isArray(s.reservations)
                ? s.reservations
                    .filter(r => {
                        const x = String((r.statut || '')).toLowerCase();
                        return !x || x === 'pending' || x === 'en_attente' || x === 'nouveau' || x === 'new' || x === 'requested' || x === 'demande' || x === 'submitted';
                    })
                    .map(r => r.date_reservation)
                : [];
            const initialReserved = getReservedDates(salle);
            const initialPending = getPendingDates(salle);
            let blockedSet = new Set();
            let selectedDate = null;
            const cal = createCalendar(calContainer, {
                reservations: initialReserved,
                pending: initialPending,
                onDateSelect(dateIso) {
                    selectedDate = dateIso;
                    // Afficher les détails du jour; proposer la réservation si dispo
                    showDayDetails(dateIso);
                }
            });
            // expose setter to update reservations later if needed
            window.salleCalendar = cal;
            // helper to refresh (reservations + blocked dates)
            async function refreshCalendarDates() {
                try {
                    const [fresh, blockedResp] = await Promise.all([
                        ApiConfig.makeRequest('/salle.php?id=' + encodeURIComponent(id)),
                        ApiConfig.makeRequest('/blocked_dates.php?salle_id=' + encodeURIComponent(id))
                    ]);
                    if (fresh && fresh.success && window.salleCalendar && typeof window.salleCalendar.setReservations === 'function') {
                        const dates = getReservedDates(fresh.data || {});
                        window.salleCalendar.setReservations(dates);
                    }
                    if (fresh && fresh.success && window.salleCalendar && typeof window.salleCalendar.setPendingDates === 'function') {
                        const dates = getPendingDates(fresh.data || {});
                        window.salleCalendar.setPendingDates(dates);
                    }
                    if (blockedResp && blockedResp.success && window.salleCalendar && typeof window.salleCalendar.setBlockedDates === 'function') {
                        const blocked = Array.isArray(blockedResp.data) ? blockedResp.data.map(b => b.date_blocked) : [];
                        window.salleCalendar.setBlockedDates(blocked);
                        blockedSet = new Set(blocked);
                    }
                    // Rafraîchir les détails du jour sélectionné si besoin
                    if (selectedDate) showDayDetails(selectedDate);
                } catch (e) { /* ignore */ }
            }
            // Initial blocked dates load to match manager calendar view
            try { await refreshCalendarDates(); } catch (e) { /* ignore */ }

            // Affichage des détails du jour (lecture seule côté page détails)
            async function showDayDetails(iso) {
                if (!dayDetails) return;
                dayDetails.innerHTML = `<h3>Détails du ${iso}</h3>`;
                // Indication si jour bloqué
                if (blockedSet && blockedSet.has(iso)) {
                    const p = document.createElement('div');
                    p.className = 'day-meta';
                    p.textContent = 'Jour bloqué par le gestionnaire.';
                    dayDetails.appendChild(p);
                }
                try {
                    const fresh = await ApiConfig.makeRequest('/salle.php?id=' + encodeURIComponent(id));
                    const reservations = Array.isArray(fresh?.data?.reservations) ? fresh.data.reservations.filter(r => r.date_reservation === iso) : [];
                    if (!reservations.length) {
                        const wrap = document.createElement('div');
                        wrap.className = 'day-meta';
                        wrap.textContent = blockedSet.has(iso) ? 'Aucune réservation (mais la date est bloquée).' : 'Aucune réservation pour cette date.';
                        dayDetails.appendChild(wrap);
                        // Si la date n'est pas bloquée ni confirmée, proposer de réserver
                        if (!blockedSet.has(iso)) {
                            const actions = document.createElement('div');
                            actions.className = 'actions';
                            actions.innerHTML = `<button class="btn-reserve-day">Réserver cette date</button>`;
                            actions.querySelector('button').addEventListener('click', () => {
                                const input = document.getElementById('reservationDate');
                                if (input) input.value = iso;
                                const modal = document.getElementById('reservationModal');
                                if (modal) modal.classList.add('open');
                            });
                            dayDetails.appendChild(actions);
                        }
                        return;
                    }
                    // Lister les réservations de la journée (statut indicatif)
                    const list = document.createElement('div');
                    list.className = 'res-list';
                    // Message si confirmé
                    const confirmedOnThisDay = reservations.find(rr => String((rr.statut||'')).toLowerCase() === 'confirmed');
                    if (confirmedOnThisDay) {
                        const info = document.createElement('div');
                        info.className = 'day-meta';
                        const when = confirmedOnThisDay.updated_at || confirmedOnThisDay.status_changed_at || '';
                        info.innerHTML = `<strong>La date est déjà bloquée par une réservation confirmée.</strong><br>` +
                                         `${escapeHtml(confirmedOnThisDay.nom)} ${escapeHtml(confirmedOnThisDay.prenom)} • ` +
                                         `${escapeHtml(confirmedOnThisDay.date_reservation)} ` +
                                         `${when ? `• Confirmée le ${escapeHtml(when)}` : ''}`;
                        dayDetails.appendChild(info);
                    }
                    reservations.forEach(r => {
                        const item = document.createElement('div');
                        item.className = 'res-item';
                        item.innerHTML = `<div class="name">${escapeHtml(r.nom)} ${escapeHtml(r.prenom)}</div>
                                          <div>${escapeHtml(r.email || r.telephone || '')}</div>
                                          <div>Statut: ${escapeHtml(statusFr(r.statut))}</div>`;
                        list.appendChild(item);
                    });
                    dayDetails.appendChild(list);
                    // Si aucune réservation confirmée et pas bloqué, proposer un bouton de réservation
                    const hasConfirmed = reservations.some(rr => String((rr.statut||'')).toLowerCase() === 'confirmed');
                    if (!hasConfirmed && !blockedSet.has(iso)) {
                        const actions = document.createElement('div');
                        actions.className = 'actions';
                        actions.innerHTML = `<button class="btn-reserve-day">Réserver cette date</button>`;
                        actions.querySelector('button').addEventListener('click', () => {
                            const input = document.getElementById('reservationDate');
                            if (input) input.value = iso;
                            const modal = document.getElementById('reservationModal');
                            if (modal) modal.classList.add('open');
                        });
                        dayDetails.appendChild(actions);
                    }
                } catch (e) {
                    // minimal fallback message
                    const p = document.createElement('div');
                    p.className = 'day-meta';
                    p.textContent = 'Impossible de charger les détails de la journée.';
                    dayDetails.appendChild(p);
                }
            }
            // listen to calendar updates from manager dashboard or other tabs (BroadcastChannel + localStorage)
            window.addEventListener('storage', async (ev) => {
                if (!ev || ev.key !== 'roomReservation:calendarUpdate') return;
                try {
                    const payload = JSON.parse(ev.newValue || ev.oldValue || '{}');
                    if (!payload || String(payload.salle_id) !== String(id)) return;
                    await refreshCalendarDates();
                } catch (e) { /* ignore */ }
            });
            // Also subscribe via BroadcastChannel for instant updates
            try {
                subscribeCalendarUpdates(async (payload) => {
                    if (!payload || String(payload.salle_id) !== String(id)) return;
                    await refreshCalendarDates();
                });
            } catch (e) { /* ignore */ }
            // Optional polling fallback (handles cases where storage events don't propagate across origins)
            // Make it more responsive with a 5s interval while the tab is visible.
            let pollHandle = null;
            function startPolling() {
                if (pollHandle) return;
                pollHandle = setInterval(refreshCalendarDates, 5000);
            }
            function stopPolling() {
                if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
            }
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    refreshCalendarDates();
                    startPolling();
                } else {
                    stopPolling();
                }
            });
            // Also refresh on focus to catch quick tab switches
            window.addEventListener('focus', () => {
                refreshCalendarDates();
            });
            // start immediately when page is visible
            if (document.visibilityState === 'visible') startPolling();
        }
        // Apply capacity constraints to reservation form
        try { applyCapacityConstraint(salle); } catch (e) { console.warn('applyCapacityConstraint failed', e); }
    } catch (err) {
        console.error(err);
        document.getElementById('salleNom').textContent = 'Erreur lors du chargement';
        document.getElementById('salleGallery').innerHTML = '<div class="loading-gallery">Impossible de charger la salle.</div>';
    }

    // Reservation modal handlers
    window.ouvrirFormulaireReservation = function() {
        document.getElementById('reservationModal').classList.add('open');
    }
    window.fermerModal = function() {
        document.getElementById('reservationModal').classList.remove('open');
    }

    const reservationForm = document.getElementById('reservationForm');
    reservationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Collect values
        const salleId = document.getElementById('salleId').value;
        const nom = document.getElementById('reservationNom').value.trim();
        const prenom = document.getElementById('reservationPrenom').value.trim();
    const email = document.getElementById('reservationEmail').value.trim();
        const telephone = document.getElementById('reservationTelephone').value.trim();
    const date = document.getElementById('reservationDate').value;
        const type = document.getElementById('reservationType').value;
        const invites = parseInt(document.getElementById('reservationInvites').value, 10) || 0;
    const password = document.getElementById('reservationPassword') ? document.getElementById('reservationPassword').value : '';
    // Prefer the modal-local acceptance checkbox; fallback to page-level checkbox
    const acceptEl = document.getElementById('reservationAcceptConditions') || document.getElementById('acceptConditions');
    const accept = acceptEl && acceptEl.checked;

        // Basic validation
        if (!nom || !prenom || !telephone || !date || !type || !invites || !password) {
            alert('Merci de remplir tous les champs requis.');
            return;
        }

        // Capacity check (client-side); server will also validate
        const invitesInput = document.getElementById('reservationInvites');
        const max = invitesInput && invitesInput.max ? parseInt(invitesInput.max, 10) : null;
        if (max && invites > max) {
            alert(`Le nombre d'invités ne peut pas dépasser la capacité (${max}).`);
            return;
        }

        if (!accept) {
            alert('Vous devez accepter les conditions d\'annulation.');
            return;
        }

    const payload = { salle_id: salleId, nom, prenom, email, telephone, date, type, invites, password };

        try {
            const resp = await ApiConfig.makeRequest('/reservation.php', { method: 'POST', body: JSON.stringify(payload) });
            if (resp && resp.success) {
                // Si un compte a été créé côté serveur, informer l'utilisateur sans stocker en local
                try {
                    const acct = resp.data && resp.data.account ? resp.data.account : null;
                    if (acct && acct.tempPassword) {
                        alert(`Compte créé !
Email: ${acct.email}
Mot de passe temporaire: ${acct.tempPassword}\n\nVeuillez vous connecter et changer votre mot de passe.`);
                    }
                } catch (e) { console.warn('account info notice failed', e); }

                alert('Votre demande de réservation a été envoyée. Le gestionnaire sera notifié.');
                reservationForm.reset();
                window.fermerModal();
                // notify other tabs/pages (manager dashboard) to refresh calendars for this salle
                try {
                    publishCalendarUpdate({ salle_id: salleId, action: 'reservation_created' });
                } catch (e) {}
                // attempt to refresh local calendar immediately (réservations non annulées + jours bloqués)
                try {
                    // Reuse the same refresh routine to ensure filters are identical
                    if (typeof window.salleCalendar !== 'undefined') {
                        // Trigger the same refresh used by storage events
                        const fresh = await ApiConfig.makeRequest('/salle.php?id=' + encodeURIComponent(salleId));
                        if (fresh && fresh.success && typeof window.salleCalendar.setReservations === 'function') {
                            // Important: only CONFIRMED reservations should block the calendar
                            const dates = (Array.isArray(fresh.data && fresh.data.reservations) ? fresh.data.reservations : [])
                                .filter(r => String((r.statut || '')).toLowerCase() === 'confirmed')
                                .map(r => r.date_reservation);
                            window.salleCalendar.setReservations(dates);
                        }
                        if (fresh && fresh.success && typeof window.salleCalendar.setPendingDates === 'function') {
                            const pdates = (Array.isArray(fresh.data && fresh.data.reservations) ? fresh.data.reservations : [])
                                .filter(r => {
                                    const s = String((r.statut || '')).toLowerCase();
                                    return !s || s === 'pending' || s === 'en_attente' || s === 'nouveau' || s === 'new' || s === 'requested' || s === 'demande' || s === 'submitted';
                                })
                                .map(r => r.date_reservation);
                            window.salleCalendar.setPendingDates(pdates);
                        }
                        // Also refresh blocked dates for full sync
                        try {
                            const b = await ApiConfig.makeRequest('/blocked_dates.php?salle_id=' + encodeURIComponent(salleId));
                            if (b && b.success && typeof window.salleCalendar.setBlockedDates === 'function') {
                                const blocked = Array.isArray(b.data) ? b.data.map(x => x.date_blocked) : [];
                                window.salleCalendar.setBlockedDates(blocked);
                            }
                        } catch (e2) { /* ignore blocked refresh */ }
                    }
                } catch (e) { /* ignore */ }
            } else {
                throw new Error(resp && resp.message ? resp.message : 'Erreur lors de l\'envoi');
            }
        } catch (err) {
            console.error('Erreur envoi réservation:', err);
            alert('Erreur lors de l\'envoi de la réservation: ' + (err.message || err));
        }
    });
});

function renderSalle(salle) {
    document.getElementById('salleNom').textContent = salle.nom || '—';
    document.getElementById('salleAdresse').textContent = salle.adresse || '—';
    document.getElementById('salleCapacite').textContent = salle.capacite ? String(salle.capacite) + ' personnes' : '—';

    // Tarifs
    const tarifsNode = document.getElementById('salleTarifs');
    tarifsNode.innerHTML = '';
        if (Array.isArray(salle.tarifs) && salle.tarifs.length) {
        salle.tarifs.forEach(t => {
            const div = document.createElement('div');
            // show currency as USD
            div.innerHTML = `<strong>${escapeHtml(t.type)}</strong>: ${escapeHtml(t.prix)} USD` +
                (t.jours && t.jours.length ? `<div style="font-size:0.9rem;color:#666">Jours: ${t.jours.map(escapeHtml).join(', ')}</div>` : '');
            tarifsNode.appendChild(div);
        });
    } else {
        tarifsNode.textContent = 'Tarifs non renseignés';
    }

    // Gestionnaire
    const gestionNode = document.getElementById('salleGestionnaire');
    gestionNode.innerHTML = `${escapeHtml(salle.gestionnaire.nom)}<br>${escapeHtml(salle.gestionnaire.email)}<br>${escapeHtml(salle.gestionnaire.telephone)}`;

    // Services
    const servicesNode = document.getElementById('salleServices');
    servicesNode.innerHTML = '';
    // Normalize services: accept array of strings, array of objects, or comma-separated string
    let servicesArr = salle.services || [];
    if (!Array.isArray(servicesArr) && typeof servicesArr === 'string') {
        servicesArr = servicesArr.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (Array.isArray(servicesArr) && servicesArr.length) {
        servicesArr.forEach(s => {
            const name = (s && typeof s === 'object') ? (s.nom || s.name || s.label) : s;
            const span = document.createElement('span');
            span.className = 'service-tag';
            span.textContent = escapeHtml(name || 'Service');
            servicesNode.appendChild(span);
        });
    } else {
        servicesNode.textContent = 'Aucun service listé';
    }

    // Description
    document.getElementById('salleDescription').textContent = salle.description || 'Pas de description.';

    // Politique d'annulation
    const condNode = document.getElementById('conditionsAnnulation');
    const modalCond = document.getElementById('reservationConditions');
    const policy = salle.politique_annulation || 'Aucune politique renseignée.';
    if (condNode) condNode.textContent = policy;
    if (modalCond) modalCond.textContent = policy;

    // Galerie
    const gallery = document.getElementById('salleGallery');
    gallery.innerHTML = '';
    if (Array.isArray(salle.images) && salle.images.length) {
        salle.images.forEach(img => {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            const imageUrl = ApiConfig.getBaseUrl() + '/' + img.chemin_fichier;
            div.innerHTML = `<img src="${imageUrl}" alt="${escapeHtml(salle.nom)}">`;
            gallery.appendChild(div);
        });
    } else if (salle.image_principale) {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.innerHTML = `<img src="${ApiConfig.getBaseUrl()}/${salle.image_principale}" alt="${escapeHtml(salle.nom)}">`;
        gallery.appendChild(div);
    } else {
        gallery.innerHTML = '<div class="loading-gallery">Aucune photo disponible.</div>';
    }
}

// Update reservation form constraints based on salle capacity
function applyCapacityConstraint(salle) {
    const invitesInput = document.getElementById('reservationInvites');
    const capNote = document.getElementById('cap-note');
    if (!invitesInput) return;
    const cap = salle && salle.capacite ? parseInt(salle.capacite, 10) : null;
    if (cap && cap > 0) {
        invitesInput.max = cap;
        if (capNote) capNote.textContent = `(max: ${cap})`;
    } else {
        invitesInput.removeAttribute('max');
        if (capNote) capNote.textContent = `(capacité non renseignée)`;
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Traduction des statuts en français pour l'affichage
function statusFr(status) {
    const s = (status || '').toString().toLowerCase().trim();
    switch (s) {
        case 'pending':
        case 'en_attente':
        case 'nouveau':
        case 'new':
        case 'requested':
        case 'demande':
        case 'submitted':
            return 'En attente';
        case 'accepted':
        case 'accept':
        case 'approved':
            return 'Acceptée';
        case 'rejected':
        case 'reject':
        case 'refused':
            return 'Refusée';
        case 'confirmed':
        case 'confirm':
            return 'Confirmée';
        case 'cancelled':
        case 'canceled':
            return 'Annulée';
        case 'payment_requested':
            return 'Paiement demandé';
        case 'payment_pending':
            return 'Paiement en attente';
        case 'payment_received':
            return 'Paiement reçu';
        case 'proof_uploaded':
            return 'Preuve envoyée (en attente)';
        case 'proof_invalid':
            return 'Preuve invalide';
        default:
            if (!s) return '';
            return s.charAt(0).toUpperCase() + s.slice(1);
    }
}
