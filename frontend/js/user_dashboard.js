import { ApiConfig } from './config/api.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Try to fetch current user from the server-side session ONLY
        let user = null;
        try {
            const current = await ApiConfig.makeRequest('/current_user.php');
            if (current && current.success && current.data && current.data.user) {
                user = current.data.user;
            }
        } catch (e) {
            console.warn('[USER_DASH] current_user.php failed', e && e.message ? e.message : e);
        }

        if (!user) {
            // No active session -> redirect to login
            window.location.href = 'connexion_utilisateur.html';
            return;
        }
        const userEmail = user.email || null;
        const userTel = user.telephone || null;

    // Elements
    const totalReservations = document.getElementById('totalReservations');
    const pendingReservations = document.getElementById('pendingReservations');
    const acceptedReservations = document.getElementById('acceptedReservations');
    const activitiesList = document.getElementById('activitiesList');
    const reservationsList = document.getElementById('reservationsList');
    const notificationsList = document.getElementById('notificationsList');
    // Support both possible IDs to avoid UI desync
    const notificationCountBadge = document.getElementById('notificationCountBadge') || document.getElementById('notification-count');

    // Display user info in sidebar only (nom, prenom, email, telephone)
    const sidebarNomEl = document.getElementById('sidebarNom');
    const sidebarPrenomEl = document.getElementById('sidebarPrenom');
    const sidebarEmailEl = document.getElementById('sidebarEmail');
    const sidebarTelEl = document.getElementById('sidebarTelephone');

    if (sidebarNomEl) sidebarNomEl.textContent = user.nom || '-';
    if (sidebarPrenomEl) sidebarPrenomEl.textContent = user.prenom || '-';
    if (sidebarEmailEl) sidebarEmailEl.textContent = userEmail || '-';
    if (sidebarTelEl) sidebarTelEl.textContent = userTel || '-';

    // Wire sidebar logout button
    async function doLogout() {
        try {
            await ApiConfig.makeRequest('/logout.php', { method: 'POST' });
        } catch (e) { /* ignore */ }
        window.location.href = 'index.html';
    }
    const sidebarLogoutBtn = document.getElementById('logoutBtn');
    if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', doLogout);

    // Helper to render a reservation item
    function renderReservationItem(r) {
        const div = document.createElement('div');
        div.className = 'reservation-item';
        const statusFr = mapStatusToFrench(r.statut || 'pending');
        const s = String(r.statut || 'pending').toLowerCase();
        const isAccepted = s === 'accepted' || s === 'payment_requested';
        const isConfirmed = s === 'confirmed';
        const isProofInvalid = s === 'proof_invalid';
        div.innerHTML = `
            <div class="reservation-info">
                <h4>${r.salle_nom || ('Salle #' + (r.salle_id || '?'))}</h4>
                <div class="reservation-details">Date: ${r.date_reservation || r.date || 'N/A'} • Invités: ${r.invites || r.invites}</div>
                <div class="reservation-details">Statut: <strong>${statusFr}</strong></div>
            </div>
            <div class="reservation-actions">
                <button class="btn-action" onclick="window.location.href='details-salle.html?id=${r.salle_id || r.salle_id}'">Voir la salle</button>
                ${(!isConfirmed && (isAccepted || isProofInvalid)) ? `<button class="btn-action" data-reservation-id="${r.id}" data-salle-id="${r.salle_id}" onclick="handleSendProof(event, ${r.id}, ${r.salle_id})">${isProofInvalid ? 'Renvoyer une preuve valide (50%)' : 'Envoyer preuve de paiement (50%)'}</button>` : ''}
            </div>
        `;
        return div;
    }

    // Map status English -> French
    function mapStatusToFrench(st) {
        const s = String(st || '').toLowerCase();
        switch (s) {
            case 'pending': return 'en attente';
            case 'proof_uploaded': return 'preuve envoyée (en attente)';
            case 'proof_invalid': return 'preuve invalide';
            case 'accepted': return 'acceptée';
            case 'rejected': return 'refusée';
            case 'cancelled':
            case 'canceled': return 'annulée';
            case 'confirmed': return 'confirmée';
            default: return s || '—';
        }
    }

    // Handle proof upload button (global so inline onclick above can call it)
    window.handleSendProof = async function(ev, reservationId, salleId) {
        ev && ev.preventDefault && ev.preventDefault();
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async () => {
                if (!input.files || input.files.length === 0) return;
                const f = input.files[0];
                const fd = new FormData();
                fd.append('reservation_id', reservationId);
                fd.append('proof', f);
                try {
                    // Use the API base URL to avoid relative path issues
                    const url = (typeof ApiConfig !== 'undefined' && ApiConfig.getBaseUrl) ? ApiConfig.getBaseUrl() + '/upload_payment_proof.php' : '/api/upload_payment_proof.php';
                    const r = await fetch(url, { method: 'POST', body: fd });
                    // Safely parse JSON, handle non-JSON responses
                    let j = null;
                    const ct = r.headers.get('Content-Type') || '';
                    if (ct.indexOf('application/json') !== -1) {
                        try { j = await r.json(); } catch (e) { j = null; }
                    } else {
                        const txt = await r.text();
                        try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { success: false, message: txt || 'Réponse non valide du serveur' }; }
                    }

                    if (r.ok && j && j.success) {
                        // Notify the manager via message so they can validate from Messages
                        try {
                            const msg = {
                                salle_id: salleId || null,
                                reservation_id: reservationId,
                                sender_type: 'client',
                                sender_user_id: user.id,
                                sujet: 'Preuve de paiement envoyée',
                                message: 'Bonjour, j\'ai téléversé la preuve de paiement pour ma réservation.'
                            };
                            await ApiConfig.makeRequest('/messages.php', { method: 'POST', body: JSON.stringify(msg) });
                        } catch (e) { /* ignore */ }
                        alert('Preuve envoyée. Attendez la validation du gestionnaire (vous verrez la confirmation dans Notifications).');
                        window.location.reload();
                    } else {
                        const msg = (j && j.message) ? j.message : `Erreur serveur (${r.status})`;
                        alert('Erreur envoi preuve: ' + msg);
                    }
                } catch (err) {
                    console.error(err);
                    alert('Erreur réseau lors de l\'envoi');
                }
            };
            input.click();
        } catch (e) { console.error(e); alert('Impossible d\'ouvrir le sélecteur de fichier'); }
    };

    // Fetch reservations and filter for this user
    try {
        const resp = await ApiConfig.makeRequest('/reservation.php');
        if (resp && resp.success && Array.isArray(resp.data)) {
            const all = resp.data;
            // Filter by email or telephone
            const me = all.filter(r => (userEmail && r.email && r.email.toLowerCase() === userEmail.toLowerCase()) || (userTel && r.telephone && r.telephone === userTel));

            totalReservations.textContent = me.length;
            const pending = me.filter(r => (r.statut || 'pending') === 'pending').length;
            const accepted = me.filter(r => (r.statut || 'pending') === 'accepted').length;
            pendingReservations.textContent = pending;
            acceptedReservations.textContent = accepted;

            // Recent activities = latest 6 reservations
            const recent = me.slice(0, 6);
            activitiesList.innerHTML = '';
            recent.forEach(r => {
                const item = document.createElement('div');
                item.className = 'activity-item';
                item.innerHTML = `<div class="activity-icon">R</div><div class="activity-content"><div class="activity-title">Réservation ${r.salle_nom || r.salle_id}</div><div class="activity-time">Statut: ${(r.statut||'pending')}</div></div>`;
                activitiesList.appendChild(item);
            });

            // Reservations list
            reservationsList.innerHTML = '';
            if (me.length === 0) {
                reservationsList.innerHTML = '<p>Aucune réservation trouvée.</p>';
            } else {
                me.forEach(r => reservationsList.appendChild(renderReservationItem(r)));
            }

            // Notifications: include messages + status changes
            notificationsList.innerHTML = '';
            const reservationIds = new Set(me.map(r => String(r.id)));
            const salleIds = Array.from(new Set(me.map(r => String(r.salle_id))));
            const notifItems = [];

            // Status-based notifications
            me.forEach(r => {
                const title = `Réservation ${r.salle_nom || r.salle_id}`;
                const status = String(r.statut || 'pending').toLowerCase();
                if (status === 'confirmed') {
                    notifItems.push({ ts: r.updated_at || r.date_reservation || '', title, body: `Confirmation reçue pour le ${r.date_reservation || r.date}` });
                } else {
                    notifItems.push({ ts: r.updated_at || r.date_reservation || '', title, body: `Statut: ${mapStatusToFrench(r.statut || 'pending')}` });
                }
            });

            // Messages-based notifications per salle
            for (const sid of salleIds) {
                try {
                    const mresp = await ApiConfig.makeRequest('/messages.php?salle_id=' + encodeURIComponent(sid));
                    const msgs = Array.isArray(mresp.data) ? mresp.data : [];
                    msgs.forEach(m => {
                        if (m.reservation_id && reservationIds.has(String(m.reservation_id))) {
                            notifItems.push({ ts: m.created_at || '', title: m.sujet || 'Message', body: m.message || '' });
                        }
                    });
                } catch (e) { /* ignore */ }
            }

            // Sort and render
            notifItems.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
            notifItems.forEach(n => {
                const el = document.createElement('div');
                el.className = 'activity-item';
                el.innerHTML = `<div class="activity-icon">🔔</div><div class="activity-content"><div class="activity-title">${n.title}</div><div class="activity-time">${n.body}</div></div>`;
                notificationsList.appendChild(el);
            });

            const notifCount = notifItems.length;
            if (notificationCountBadge) {
                notificationCountBadge.style.display = notifCount ? 'inline-flex' : 'none';
                notificationCountBadge.textContent = notifCount;
            }
            // Update sidebar badges
            try {
                const bRes = document.getElementById('badge-user-reservations');
                if (bRes) { bRes.textContent = String(pending); bRes.style.display = pending > 0 ? 'inline-flex' : 'none'; }
                const bNot = document.getElementById('badge-user-notifs');
                if (bNot) { bNot.textContent = String(notifCount); bNot.style.display = notifCount > 0 ? 'inline-flex' : 'none'; }
            } catch (e) { /* ignore */ }
        }
    } catch (err) {
        console.error('Erreur initialisation user dashboard', err);
        try { alert('Une erreur est survenue. Veuillez vous reconnecter.'); } catch(e){}
        window.location.href = 'connexion_utilisateur.html';
    }

    // Simple navigation between sections
    document.querySelectorAll('.nav-link').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
            a.classList.add('active');
            const section = a.getAttribute('data-section');
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
            document.getElementById('section-' + section).classList.add('active');
        });
    });

    // logoutLink (header) intentionally not bound here; logout is handled via sidebar logout button only

    // Sidebar toggle for mobile
    const hamburger = document.getElementById('hamburgerBtn');
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
        });
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('sidebar-open')) return;
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        if (!sidebar.contains(e.target) && !e.target.closest('#hamburgerBtn')) {
            document.body.classList.remove('sidebar-open');
        }
    });
    } catch (err) {
        console.error('Erreur initialisation user dashboard', err);
        try { alert('Une erreur est survenue. Veuillez vous reconnecter.'); } catch(e){}
        window.location.href = 'connexion_utilisateur.html';
    }
});
