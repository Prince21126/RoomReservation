import { ApiConfig } from './config/api.js';
import { createCalendar } from './calendar.js';
import { publishCalendarUpdate, subscribeCalendarUpdates } from './sync.js';
// Global session user for the manager dashboard
window.sessionUser = window.sessionUser || null;

// Ensure mobile menu toggles even if AuthManager hasn't run (hamburger must work on phones)
document.addEventListener('DOMContentLoaded', () => {
    const menuToggleEarly = document.getElementById('menuToggle');
    if (menuToggleEarly) {
        menuToggleEarly.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
        });
    }
    // Close sidebar when a link is clicked on small screens
    document.querySelectorAll('.sidebar a').forEach(a => {
        a.addEventListener('click', () => {
            if (window.innerWidth <= 900) document.body.classList.remove('sidebar-open');
        });
    });
});

// Add a delegated click listener as a resilient fallback in case the #menuToggle
// button is added/removed dynamically or event listeners fail to attach.
document.addEventListener('click', (e) => {
    try {
        const target = e.target && (e.target.id === 'menuToggle' ? e.target : e.target.closest && e.target.closest('#menuToggle'));
        if (target) {
            document.body.classList.toggle('sidebar-open');
        }
    } catch (err) {
        // no-op
    }
});

// Expose functions used by HTML inline onclick
window.afficherSection = function(name) {
    const sections = document.querySelectorAll('.dashboard-section');
    sections.forEach(s => s.classList.remove('active'));

    const idMap = {
        'infos': 'section-infos',
        'reservations': 'section-reservations',
        'calendrier': 'section-calendrier',
        'messages': 'section-messages',
        'photos': 'section-photos'
    };

    const el = document.getElementById(idMap[name]);
    if (el) el.classList.add('active');
    // If reservations section is shown, load reservations
    if (name === 'reservations') {
        loadReservations();
    }
    // If photos section is shown, ensure photos for selected salle are loaded
    if (name === 'photos') {
        const photosSelect = document.getElementById('photosSalleSelect');
        if (photosSelect && photosSelect.value) loadPhotosForSalle(photosSelect.value).catch(()=>{});
    }
};

// Listen for calendar update broadcasts from other tabs/pages
// React to calendar updates from other tabs (BroadcastChannel + localStorage fallback)
function handleCalendarUpdate(payload) {
    try {
        if (!payload || !payload.salle_id) return;
        const sel = document.getElementById('salleSelect');
        const current = sel ? String(sel.value) : null;
        if (current && String(payload.salle_id) === current) {
            const calSection = document.getElementById('section-calendrier');
            if (calSection && calSection.classList.contains('active')) {
                try { loadCalendarSection(); } catch (e) { console.warn('Could not reload calendar after update', e); }
            } else {
                document.body.dataset.calendarDirty = '1';
            }
        }
    } catch (e) { /* ignore */ }
}
window.addEventListener('storage', (e) => {
    if (!e || e.key !== 'roomReservation:calendarUpdate') return;
    try { const payload = JSON.parse(e.newValue || e.oldValue || '{}'); handleCalendarUpdate(payload); } catch (err) { }
});
subscribeCalendarUpdates(handleCalendarUpdate);

window.deconnexion = async function() {
    try { await ApiConfig.makeRequest('/logout.php', { method: 'POST' }); } catch (e) {}
    window.location.href = 'index.html';
};

document.addEventListener('DOMContentLoaded', async () => {
    // Récupérer le gestionnaire via la session serveur
    let sessionUser = null;
    try {
        const cu = await ApiConfig.makeRequest('/current_gestionnaire.php');
        if (cu && cu.success && cu.data && cu.data.user) sessionUser = cu.data.user;
    } catch (e) {}
    if (!sessionUser) { window.location.href = 'connexion_gestionnaire.html'; return; }
    // expose globally for other functions
    window.sessionUser = sessionUser;
    const user = window.sessionUser;

    document.querySelectorAll('.user-info').forEach(el => el.textContent = user.prenom + ' ' + user.nom);

    // Load gestionnaire salles
    await loadGestionnaireSalles(user.id);
    // Render gestionnaire info above salle infos (safe call in case function isn't available yet)
    if (typeof renderGestionnaireInfo === 'function') {
        renderGestionnaireInfo(user);
    } else if (typeof window.renderGestionnaireInfo === 'function') {
        window.renderGestionnaireInfo(user);
    } else {
        // retry shortly — this handles potential loading order issues
        setTimeout(() => {
            if (typeof renderGestionnaireInfo === 'function') renderGestionnaireInfo(user);
            else if (typeof window.renderGestionnaireInfo === 'function') window.renderGestionnaireInfo(user);
        }, 200);
    }
    // Show 'Informations Salle' by default on load (responsive-friendly default)
    window.afficherSection('infos');

    // Mobile menu toggle: toggle body.sidebar-open (matches CSS in dashboard.css)
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
        });
    }
    // Close sidebar after clicking a link on small screens
    document.querySelectorAll('.sidebar a').forEach(a => {
        a.addEventListener('click', () => {
            if (window.innerWidth <= 900) document.body.classList.remove('sidebar-open');
        });
    });
    // If dashboard loaded with ?edit=ID, open the edit view for that salle
    try {
        const params = new URLSearchParams(window.location.search);
        const editId = params.get('edit');
        if (editId) {
            // Wait until salles are loaded (window.gestionnaireSalles) or timeout, then open edit
            let tries = 0;
            const waiter = setInterval(() => {
                if (window.gestionnaireSalles && window.gestionnaireSalles.length) {
                    clearInterval(waiter);
                    openEditSalle(editId);
                } else if (++tries > 30) { // ~6s
                    clearInterval(waiter);
                    openEditSalle(editId);
                }
            }, 200);
        }
    } catch (e) { /* ignore */ }

    // Photo upload handling
    const uploadInput = document.getElementById('upload-photos');
    if (uploadInput) uploadInput.addEventListener('change', handlePhotoUpload);

    // Ensure static modal buttons (if modal exists in the HTML) have working handlers
    try {
        const modal = document.getElementById('managerReservationModal');
        if (modal) {
            const closeBtn = modal.querySelector('#modalCloseBtn');
            const cancelBtn = modal.querySelector('#modalCancel');
            if (closeBtn) closeBtn.addEventListener('click', () => closeManagerReservationModal());
            if (cancelBtn) cancelBtn.addEventListener('click', () => closeManagerReservationModal());
        }
    } catch (e) { /* ignore */ }
});

async function loadGestionnaireSalles(gestionnaireId) {
    try {
        const resp = await ApiConfig.makeRequest('/recherche-salles.php?gestionnaire_id=' + encodeURIComponent(gestionnaireId));
        if (!resp.success) throw new Error(resp.message || 'Erreur API');

        const salles = resp.data || [];
        // expose salles globally for calendar / messages / photos helpers
        window.gestionnaireSalles = salles;

        renderSallesList(salles);

        // Populate selects used by calendar, messages and photos
        const selectCal = document.getElementById('salleSelect');
        const selectMsgs = document.getElementById('salleSelectMsgs');
        const selectPhotos = document.getElementById('photosSalleSelect');
        [selectCal, selectMsgs, selectPhotos].forEach(sel => {
            if (!sel) return;
            sel.innerHTML = '';
            salles.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.nom || s.nom_salle || ('Salle ' + s.id);
                sel.appendChild(opt);
            });
        });

        // Load photos for first salle by default (so photos are visible before add/delete)
        if (selectPhotos && selectPhotos.options.length) {
            loadPhotosForSalle(selectPhotos.options[0].value).catch(() => {});
        }

        // If calendar section is active, initialize it now
        const calSection = document.getElementById('section-calendrier');
        if (calSection && calSection.classList.contains('active')) loadCalendarSection();
    } catch (err) {
        console.error('Erreur chargement salles:', err);
        const container = document.getElementById('section-infos');
        if (container) container.innerHTML = '<p>Impossible de charger les salles.</p>';
        showBanner('Erreur chargement salles: ' + (err.message || err), 'error');
    }
}

function renderSallesList(salles) {
    const container = document.getElementById('section-infos');
    if (!container) return;
    // Render header + ensure the edit form exists so openEditSalle can populate it
    container.innerHTML = '<h2>Informations de la Salle</h2><form id="form-infos-salle"></form>';

    // Create a simple gallery/list with cards
    const list = document.createElement('div');
    list.className = 'photos-gallery';

    salles.forEach(s => {
        const item = document.createElement('div');
        item.className = 'photo-item';
        const imgSrc = s.image_principale ? ApiConfig.getBaseUrl() + '/' + s.image_principale : 'https://via.placeholder.com/400x250?text=No+Image';
        item.innerHTML = `
            <img src="${imgSrc}" alt="${escapeHtml(s.nom)}">
            <div style="padding:12px">
                <h3 style="margin-bottom:6px">${escapeHtml(s.nom)}</h3>
                <div style="color:#666;font-size:0.95rem">${escapeHtml(s.adresse)}</div>
                <div style="margin-top:8px">Capacité: <strong>${escapeHtml(s.capacite)}</strong></div>
                    <div style="margin-top:8px;display:flex;gap:8px;margin-bottom:4px">
                    <a class="btn-primary" href="details-salle.html?id=${encodeURIComponent(s.id)}">Détails</a>
                    <button class="btn-edit-salle btn-edit" data-id="${s.id}">Éditer</button>
                </div>
            </div>
        `;
        list.appendChild(item);
    });

    // Append the list under the form header
    container.appendChild(list);

    // Attach edit handlers (after list appended)
    container.querySelectorAll('.btn-edit-salle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-id');
            openEditSalle(id);
        });
    });
}


// Open edit form for a salle inside the manager dashboard
async function openEditSalle(salleId) {
    try {
        const resp = await ApiConfig.makeRequest('/salle.php?id=' + encodeURIComponent(salleId));
        if (!resp.success) throw new Error(resp.message || 'Erreur API');
        const salle = resp.data;
        // ensure infos section visible
        window.afficherSection('infos');
    // show gestionnaire info above
    renderGestionnaireInfo(window.sessionUser);
        // populate form (improved layout similar to inscription)
        const form = document.getElementById('form-infos-salle');
    // normalize services and tarifs
    const currentServices = Array.isArray(salle.services) ? salle.services : (salle.services ? String(salle.services).split(',').map(s=>s.trim()) : []);
    // salle.tarifs is returned as an array from the API; normalize into types
    const tarifsArr = Array.isArray(salle.tarifs) ? salle.tarifs : [];
    const findTarif = (type) => tarifsArr.find(t => String(t.type || t.type_tarif || '').toLowerCase() === type);
    const semaineRaw = findTarif('semaine') || {};
    const weekendRaw = findTarif('weekend') || {};
    const semaine = { prix: (semaineRaw.prix != null ? semaineRaw.prix : (salle.prixSemaine || '')), jours: Array.isArray(semaineRaw.jours) ? semaineRaw.jours : (semaineRaw.jours ? String(semaineRaw.jours).split(',').map(x=>x.trim()) : []) };
    const weekend = { prix: (weekendRaw.prix != null ? weekendRaw.prix : (salle.prixWeekend || '')), jours: Array.isArray(weekendRaw.jours) ? weekendRaw.jours : (weekendRaw.jours ? String(weekendRaw.jours).split(',').map(x=>x.trim()) : []) };

        // helper to check weekdays
        const joursList = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
        const servicesOptions = ['climatisation','chauffage','wifi','projecteur','decoration','photographie','animation','service_traiteur','autres'];

        form.innerHTML = `
            <div class="salle-form">
                <section class="form-section">
                    <h3>Informations de la salle</h3>
                    <div class="form-row">
                        <div class="form-group"><label>Nom de la salle</label><input type="text" id="edit_nom" value="${escapeHtml(salle.nom || '')}"></div>
                        <div class="form-group"><label>Capacité</label><input type="number" id="edit_cap" value="${escapeHtml(salle.capacite || '')}"></div>
                    </div>
                    <div class="form-group"><label>Adresse</label><input type="text" id="edit_adresse" value="${escapeHtml(salle.adresse || '')}"></div>
                    <div class="form-group"><label>Description</label><textarea id="edit_desc">${escapeHtml(salle.description || '')}</textarea></div>
                </section>

                <section class="form-section">
                    <h3>Services inclus</h3>
                    <div class="services-grid" id="edit_services_grid">
                        ${servicesOptions.map(svc => {
                            const checked = currentServices.includes(svc) ? 'checked' : '';
                            return `<label class="service-checkbox"><input type="checkbox" name="services" value="${svc}" ${checked}><span class="checkmark"></span>${svc}</label>`;
                        }).join('')}
                    </div>
                </section>

                <section class="form-section">
                    <h3>Tarification</h3>
                    <div class="tarif-section">
                        <label>Prix Semaine (USD)</label>
                        <input class="price-field" type="number" id="edit_prix_semaine" step="0.01" value="${escapeHtml(semaine.prix || '')}">
                        <div class="jours-grid" id="edit_jours_semaine">
                            ${joursList.map(j => {
                                const ch = (semaine.jours || []).map(x=>x.toLowerCase()).includes(j) ? 'checked' : '';
                                return `<label class="jour-checkbox"><input type="checkbox" name="joursSemaine" value="${j}" ${ch}><span class="custom-checkbox"></span>${j.charAt(0).toUpperCase()+j.slice(1)}</label>`;
                            }).join('')}
                        </div>
                    </div>
                    <div class="tarif-section" style="margin-top:12px">
                        <label>Prix Weekend (USD)</label>
                        <input class="price-field" type="number" id="edit_prix_weekend" step="0.01" value="${escapeHtml(weekend.prix || '')}">
                        <div class="jours-grid" id="edit_jours_weekend">
                            ${joursList.map(j => {
                                const ch = (weekend.jours || []).map(x=>x.toLowerCase()).includes(j) ? 'checked' : '';
                                return `<label class="jour-checkbox"><input type="checkbox" name="joursWeekend" value="${j}" ${ch}><span class="custom-checkbox"></span>${j.charAt(0).toUpperCase()+j.slice(1)}</label>`;
                            }).join('')}
                        </div>
                    </div>
                </section>

                <section class="form-section">
                    <h3>Conditions et politique</h3>
                    <div class="form-group"><label>Politique d'annulation</label><textarea id="edit_conditions">${escapeHtml(salle.politique_annulation || '')}</textarea></div>
                </section>

                <div style="margin-top:12px;display:flex;gap:10px"><button id="saveSalleBtn" class="btn-edit btn-primary">Enregistrer</button><button id="cancelEditBtn" class="btn-secondary btn-cancel">Annuler</button></div>
            </div>
        `;
        // enforce mutual exclusion: a day can't be selected in both 'semaine' and 'weekend'
        (function enforceDayExclusion() {
            const semaineInputs = form.querySelectorAll('input[name="joursSemaine"]');
            const weekendInputs = form.querySelectorAll('input[name="joursWeekend"]');
            function onSemaineChange(e) {
                const val = e.target.value;
                if (e.target.checked) {
                    const other = form.querySelector(`input[name="joursWeekend"][value="${val}"]`);
                    if (other) other.checked = false;
                }
            }
            function onWeekendChange(e) {
                const val = e.target.value;
                if (e.target.checked) {
                    const other = form.querySelector(`input[name="joursSemaine"][value="${val}"]`);
                    if (other) other.checked = false;
                }
            }
            semaineInputs.forEach(i => i.addEventListener('change', onSemaineChange));
            weekendInputs.forEach(i => i.addEventListener('change', onWeekendChange));
        })();
        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            // restore infos section to default (render list again)
            if (window.sessionUser && window.sessionUser.id) {
                loadGestionnaireSalles(window.sessionUser.id).catch(()=>{});
            }
        });
        document.getElementById('saveSalleBtn').addEventListener('click', async () => {
            // collect services from checkboxes
            const servicesChecked = Array.from(document.querySelectorAll('input[name="services"]:checked')).map(i => i.value);
            // collect jours for semaine/weekend
            const joursSemaine = Array.from(document.querySelectorAll('input[name="joursSemaine"]:checked')).map(i => i.value);
            const joursWeekend = Array.from(document.querySelectorAll('input[name="joursWeekend"]:checked')).map(i => i.value);

            const payload = {
                salle_id: salleId,
                changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null,
                nom_salle: document.getElementById('edit_nom').value.trim(),
                adresse: document.getElementById('edit_adresse').value.trim(),
                capacite: document.getElementById('edit_cap').value ? parseInt(document.getElementById('edit_cap').value,10) : null,
                description: document.getElementById('edit_desc').value.trim(),
                // services: send as array of names
                services: servicesChecked,
                // tarifs structure expected by the API
                tarifs: {
                    semaine: {
                        prix: parseFloat(document.getElementById('edit_prix_semaine').value) || null,
                        jours: joursSemaine
                    },
                    weekend: {
                        prix: parseFloat(document.getElementById('edit_prix_weekend').value) || null,
                        jours: joursWeekend
                    }
                },
                conditions_annulation: document.getElementById('edit_conditions').value.trim()
            };
            try {
                const res = await ApiConfig.makeRequest('/salle_update.php', { method: 'POST', body: JSON.stringify(payload) });
                if (res && res.success) {
                    showBanner('Salle mise à jour', 'success');
                    if (window.sessionUser && window.sessionUser.id) {
                        await loadGestionnaireSalles(window.sessionUser.id);
                    }
                } else {
                    throw new Error(res && res.message ? res.message : 'Erreur mise à jour');
                }
            } catch (err) {
                console.error('Erreur mise à jour salle:', err);
                showBanner('Erreur mise à jour salle: ' + (err.message||err), 'error');
            }
        });

        // populate photos panel for this salle
        await loadPhotosForSalle(salleId);
    } catch (err) {
        console.error('Erreur openEditSalle:', err);
        showBanner('Impossible de charger les données de la salle', 'error');
    }
}

function renderGestionnaireInfo(user) {
    if (!user) return;
    let header = document.getElementById('gestionnaireInfo');
    if (!header) {
        header = document.createElement('div');
        header.id = 'gestionnaireInfo';
        header.style.marginBottom = '12px';
        // Try to insert into the section-infos container. If it's not present yet
        // (different page or load order), fall back to .dashboard-content or document.body.
        const infos = document.getElementById('section-infos') || document.querySelector('.dashboard-content') || document.body;
        try {
            if (infos && infos.firstChild) infos.insertBefore(header, infos.firstChild);
            else infos.appendChild(header);
        } catch (e) {
            // As a last resort, prepend to body
            document.body.insertBefore(header, document.body.firstChild);
        }
    }
    header.innerHTML = `<div><strong>${escapeHtml(user.prenom||'')} ${escapeHtml(user.nom||'')}</strong><br><a href="mailto:${escapeHtml(user.email||'')}">${escapeHtml(user.email||'')}</a> • ${escapeHtml(user.telephone||'')}</div>`;
}

// Photos management
async function loadPhotosForSalle(salleId) {
    const galerie = document.getElementById('galerie-photos');
    if (!galerie) return;
    try {
        const resp = await ApiConfig.makeRequest('/salle.php?id=' + encodeURIComponent(salleId));
        if (!resp.success) throw new Error(resp.message || 'Erreur API');
        const salle = resp.data;
        galerie.innerHTML = '';
        const imgs = salle.images && salle.images.length ? salle.images : (salle.image_principale ? [{ chemin_fichier: salle.image_principale, id: null }] : []);
        imgs.forEach(img => {
            const div = document.createElement('div');
            div.className = 'photo-item';
            const imageUrl = ApiConfig.getBaseUrl() + '/' + (img.chemin_fichier || img.chemin || '');
            div.innerHTML = `<img src="${imageUrl}" style="width:100%;height:120px;object-fit:cover;border-radius:8px"><div style="margin-top:6px;display:flex;gap:8px"><button class="btn-secondary btn-delete-image" data-path="${escapeHtml(img.chemin_fichier||img.chemin||'')}">Supprimer</button></div>`;
            galerie.appendChild(div);
        });
        // attach delete handlers
        galerie.querySelectorAll('.btn-delete-image').forEach(btn => {
            btn.addEventListener('click', async () => {
                const path = btn.getAttribute('data-path');
                if (!confirm('Supprimer cette photo ?')) return;
                try {
                    const res = await ApiConfig.makeRequest('/delete-image.php', { method: 'POST', body: JSON.stringify({ salle_id: salleId, path: path, changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null }) });
                    if (res && res.success) {
                        showBanner('Image supprimée', 'success');
                        await loadPhotosForSalle(salleId);
                    } else throw new Error(res.message || 'Erreur suppression');
                } catch (err) {
                    console.error('Erreur suppression image:', err);
                    showBanner('Erreur suppression image', 'error');
                }
            });
        });
    } catch (err) {
        console.error('Erreur loadPhotosForSalle:', err);
        galerie.innerHTML = '<p>Impossible de charger les photos.</p>';
    }
}

// Calendar helpers for gestionnaire
async function loadCalendarSection() {
    const select = document.getElementById('salleSelect');
    const container = document.getElementById('managerCalendar');
    const details = document.getElementById('dayDetails');
    if (!select || !container) return;
    const salles = window.gestionnaireSalles || [];
    select.innerHTML = '';
    salles.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nom || s.nom_salle || ('Salle ' + s.id);
        select.appendChild(opt);
    });

    let currentCal = null;

    async function loadForSalle(salleId) {
        details.innerHTML = '';
        // fetch reservations for gestionnaire then filter by salle
        const user = window.sessionUser;
        if (!user) return;
        let reserved = [];
        let pendings = [];
        try {
            const resp = await ApiConfig.makeRequest('/reservation.php?gestionnaire_id=' + encodeURIComponent(user.id));
            const list = Array.isArray(resp.data) ? resp.data.filter(r => String(r.salle_id) === String(salleId)) : [];
            // Confirmed -> block (reserved) — robust to FR variants like "confirmée"
            reserved = list.filter(r => String((r.statut || '')).toLowerCase().includes('confirm')).map(r => r.date_reservation);
            // Pending -> marron encerclement (visuel uniquement)
            const isPending = (s) => {
                const x = String(s || '').toLowerCase();
                return !x || x === 'pending' || x === 'en_attente' || x === 'nouveau' || x === 'new' || x === 'requested' || x === 'demande' || x === 'submitted';
            };
            pendings = list.filter(r => isPending(r.statut)).map(r => r.date_reservation);
        } catch (err) {
            console.error('Erreur fetch reservations:', err);
            showBanner('Erreur chargement réservations: ' + (err.message || err), 'error');
        }

        // fetch blocked dates for salle
        let blocked = [];
        try {
            const bdResp = await ApiConfig.makeRequest('/blocked_dates.php?salle_id=' + encodeURIComponent(salleId));
            blocked = Array.isArray(bdResp.data) ? bdResp.data.map(b => b.date_blocked) : [];
        } catch (err) {
            console.error('Erreur fetch blocked_dates:', err);
            showBanner('Erreur chargement blocked_dates: ' + (err.message || err), 'error');
        }

        // create or update calendar (confirmed -> reserved, pending -> pending, plus blocked)
        if (!currentCal) {
            currentCal = createCalendar(container, { reservations: reserved, pending: pendings, blocked: blocked, onDateSelect: (iso) => showDayDetails(iso, salleId) });
        } else {
            if (currentCal.setReservations) currentCal.setReservations(reserved);
            if (currentCal.setPendingDates) currentCal.setPendingDates(pendings);
            if (currentCal.setBlockedDates) currentCal.setBlockedDates(blocked);
        }
        // also refresh messages for this salle if messages panel present
        if (document.getElementById('section-messages')) {
            loadMessages(salleId).catch(err => console.error(err));
        }
    }

    function showDayDetails(iso, salleId) {
        details.innerHTML = '<h3>Détails pour ' + iso + '</h3>';
        // show reservations on that date
        (async () => {
            const user = window.sessionUser;
            let list = [];
            try {
                const resp = await ApiConfig.makeRequest('/reservation.php?gestionnaire_id=' + encodeURIComponent(user.id));
                list = Array.isArray(resp.data) ? resp.data.filter(r => r.date_reservation === iso && String(r.salle_id) === String(salleId)) : [];
            } catch (err) {
                console.error('Erreur fetch reservations for day:', err);
                showBanner('Erreur chargement réservations pour le jour: ' + (err.message || err), 'error');
            }
            if (list.length === 0) {
                // No reservations: show message and open the modal for manager reservation creation
                details.innerHTML += '<p>Aucune réservation.</p>';
                const wrapper = document.createElement('div');
                wrapper.style.marginTop = '8px';
                wrapper.innerHTML = `<button id="openMgrRes" class="btn-primary">Créer une réservation</button>`;
                details.appendChild(wrapper);
                wrapper.querySelector('#openMgrRes').addEventListener('click', () => openManagerReservationModal(iso, salleId));
            } else {
                const ul = document.createElement('div');
                list.forEach(r => {
                    const div = document.createElement('div');
                    div.className = 'reservation-item';
                    div.innerHTML = `<strong>${escapeHtml(r.nom)} ${escapeHtml(r.prenom)}</strong> — ${escapeHtml(r.email)} • ${escapeHtml(r.telephone)}<br>Événement: ${escapeHtml(r.type || r.type_evenement || '')}
                                     <div class=\"reservation-status-line\"><span class=\"status-badge ${statusClass(r.statut)}\">${escapeHtml(statusFr(r.statut))}</span></div>
                                     <div style=\"margin-top:6px\"><button class=\"btn-primary\" data-id=\"${r.id}\" data-action=\"accept\">Accepter</button> <button class=\"btn-cancel\" data-id=\"${r.id}\" data-action=\"reject\">Refuser</button></div>`;
                    ul.appendChild(div);
                });
                details.appendChild(ul);
                // attach handlers
                details.querySelectorAll('button[data-action]').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const id = btn.getAttribute('data-id');
                        const action = btn.getAttribute('data-action');
                        try {
                            const res = await ApiConfig.makeRequest('/reservation_update.php', { method: 'POST', body: JSON.stringify({ reservation_id: id, action: action, changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null }) });
                            if (res && res.success) {
                                // broadcast update so other pages refresh
                                publishCalendarUpdate({ salle_id: salleId, action: 'reservation_status_changed' });
                            }
                        } catch (err) {
                            console.error('Erreur update reservation status:', err);
                            showBanner('Erreur mise à jour réservation', 'error');
                        }
                        // refresh
                        // After status change, refresh and also refresh messages/proofs
                        await loadForSalle(salleId);
                        try { await loadMessages(salleId); } catch (e) { }
                    });
                });
                // After rendering reservation list, for each reservation try to load payment proof and show validation button
                (async () => {
                    const items = ul.querySelectorAll('.reservation-item');
                    for (let i = 0; i < items.length; i++) {
                        const elem = items[i];
                        const btnAccept = elem.querySelector('button[data-action="accept"]');
                        const reservationId = btnAccept ? btnAccept.getAttribute('data-id') : null;
                        if (!reservationId) continue;
                        try {
                            const pResp = await ApiConfig.makeRequest('/payment_proofs.php?reservation_id=' + encodeURIComponent(reservationId));
                            if (pResp && pResp.success && Array.isArray(pResp.data) && pResp.data.length) {
                                const proof = pResp.data[0];
                                // show thumbnail and validate/request buttons (green styles)
                                const thumb = document.createElement('div');
                                thumb.style.marginTop = '8px';
                                const url = ApiConfig.getBaseUrl() + '/' + proof.chemin;
                                thumb.innerHTML = `<div style="display:flex;gap:8px;align-items:center">
                                    <img src="${url}" class="proof-thumb" style="height:72px;border-radius:6px;object-fit:cover;cursor:zoom-in">
                                    <div>
                                        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
                                            <button class="btn-approve" data-reservation-id="${reservationId}">Valider preuve</button>
                                            <button class="btn-request" data-reservation-id="${reservationId}" data-action="request-correct-proof">Demander une preuve correcte</button>
                                        </div>
                                        <div><small style="color:#666">Preuve uploadée: ${escapeHtml(proof.uploaded_at)}</small></div>
                                    </div>
                                </div>`;
                                elem.appendChild(thumb);
                                const thumbImg = thumb.querySelector('img.proof-thumb');
                                if (thumbImg) thumbImg.addEventListener('click', () => openLightbox(url));
                                const valBtn = thumb.querySelector('button.btn-approve[data-reservation-id]');
                                if (valBtn) {
                                    valBtn.addEventListener('click', async (ev) => {
                                        if (!confirm('Valider cette preuve et confirmer la réservation ?')) return;
                                        try {
                                            const res = await ApiConfig.makeRequest('/reservation_update.php', { method: 'POST', body: JSON.stringify({ reservation_id: reservationId, action: 'confirm_payment', changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null }) });
                                            if (res && res.success) {
                                                showBanner('Preuve validée. Réservation confirmée.', 'success');
                                                // broadcast calendar update so other tabs and details page refresh
                                                publishCalendarUpdate({ salle_id: salleId, date: null, action: 'reservation_confirmed', reservation_id: reservationId });
                                                // refresh UI
                                                await loadForSalle(salleId);
                                                await loadMessages(salleId);
                                            } else {
                                                throw new Error(res && res.message ? res.message : 'Erreur');
                                            }
                                        } catch (err) {
                                            console.error('Erreur validation preuve:', err);
                                            showBanner('Erreur validation preuve', 'error');
                                        }
                                    });
                                }
                                const reqBtn = thumb.querySelector('button.btn-request[data-action="request-correct-proof"]');
                                if (reqBtn) {
                                    reqBtn.addEventListener('click', async () => {
                                        const sujet = 'Preuve de paiement invalide';
                                        const message = 'Bonjour, la preuve de paiement envoyée n\'est pas valide. Merci de renvoyer une preuve correcte (lisible, montant 50%).';
                                        try {
                                            // Optionally set reservation status to proof_invalid if backend supports it
                                            try { await ApiConfig.makeRequest('/reservation_update.php', { method: 'POST', body: JSON.stringify({ reservation_id: reservationId, action: 'invalidate_proof', changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null }) }); } catch(e) {}
                                            await ApiConfig.makeRequest('/messages.php', { method: 'POST', body: JSON.stringify({
                                                salle_id: salleId,
                                                sender_type: 'gestionnaire',
                                                sender_user_id: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null,
                                                reservation_id: reservationId,
                                                sujet,
                                                message
                                            }) });
                                            showBanner('Demande de nouvelle preuve envoyée au client', 'success');
                                            await loadMessages(salleId);
                                        } catch (e) {
                                            console.error('Erreur lors de la demande de nouvelle preuve', e);
                                            showBanner('Erreur lors de la demande de nouvelle preuve', 'error');
                                        }
                                    });
                                }
                            }
                        } catch (e) { /* ignore per-reservation */ }
                    }
                })();
            }
        })();
    }

    select.addEventListener('change', () => loadForSalle(select.value));
    if (select.options.length) loadForSalle(select.options[0].value);

    // populate recipients select for messages: reservations for the selected salle
    const reservationSelect = document.getElementById('msgReservationSelect');
    const selectMsgs = document.getElementById('salleSelectMsgs');
    if (selectMsgs && reservationSelect) {
        selectMsgs.addEventListener('change', async () => {
            const sid = selectMsgs.value;
            if (!sid) return;
            try {
                const resp = await ApiConfig.makeRequest('/reservation.php?gestionnaire_id=' + encodeURIComponent((window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : ''));
                const all = Array.isArray(resp.data) ? resp.data.filter(r => String(r.salle_id) === String(sid)) : [];
                reservationSelect.innerHTML = '';
                if (all.length === 0) {
                    const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'Aucun demandeur disponible'; reservationSelect.appendChild(opt);
                } else {
                    all.forEach(r => {
                        const opt = document.createElement('option');
                        opt.value = r.id;
                        opt.textContent = `${r.nom} ${r.prenom} — ${r.email || r.telephone}`;
                        reservationSelect.appendChild(opt);
                    });
                }
            } catch (e) { console.error(e); }
        });
        // initialize for first
        if (selectMsgs.options.length) selectMsgs.dispatchEvent(new Event('change'));
    }
}

// Messages UI (chat-style with threads)
async function loadMessages(salleId) {
    const list = document.getElementById('messagesList');
    const selectMsgs = document.getElementById('salleSelectMsgs');
    if (!list || !selectMsgs) return;
    try {
        const resp = await ApiConfig.makeRequest('/messages.php?salle_id=' + encodeURIComponent(salleId));
        list.innerHTML = '';
        // Hide legacy composer if present (we render a chat composer inside the panel)
        try { const legacy = document.getElementById('messageComposer'); if (legacy) legacy.style.display = 'none'; } catch (e) {}
        const msgs = Array.isArray(resp.data) ? resp.data : [];
        // Fetch reservations for this salle to enrich and group threads
        let reservations = [];
        try {
            const rresp = await ApiConfig.makeRequest('/reservation.php?gestionnaire_id=' + encodeURIComponent((window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : ''));
            reservations = Array.isArray(rresp.data) ? rresp.data.filter(r => String(r.salle_id) === String(salleId)) : [];
        } catch (e) { console.warn('Could not fetch reservations to enrich messages', e); }
        const resMap = {};
        reservations.forEach(r => { resMap[String(r.id)] = { label: `${r.nom || ''} ${r.prenom || ''}`.trim(), contact: r.email || r.telephone || '' }; });

        // Group messages by reservation_id (thread), use 'general' for null
        const threads = {};
        msgs.forEach(m => {
            const key = m.reservation_id ? String(m.reservation_id) : 'general';
            if (!threads[key]) threads[key] = [];
            threads[key].push(m);
        });
        const threadKeys = Object.keys(threads).sort((a,b)=>{
            const la = new Date(threads[a][threads[a].length-1]?.created_at || 0).getTime();
            const lb = new Date(threads[b][threads[b].length-1]?.created_at || 0).getTime();
            return lb - la;
        });

        // Build chat layout
    const wrap = document.createElement('div');
        wrap.className = 'chat-layout';

        const sidebar = document.createElement('div');
        sidebar.className = 'chat-sidebar';
        sidebar.innerHTML = `
            <div class="chat-toolbar">
                <div class="toolbar-title">Conversations <span id="totalUnread" class="total-unread" style="display:none">0</span></div>
                <button id="btnNewConv" class="btn-new-conv">Nouvelle conversation</button>
            </div>
            <div class="chat-search"><input type="text" placeholder="Rechercher..." id="chatSearch"></div>
            <div class="thread-list" id="threadList"></div>
        `;
        const threadList = sidebar.querySelector('#threadList');
        const totalUnreadEl = sidebar.querySelector('#totalUnread');

    const panel = document.createElement('div');
    panel.className = 'chat-panel';
    panel.innerHTML = `<div class="chat-header">
            <button class="chat-back" id="chatBack" title="Retour" aria-label="Retour">◀</button>
            <div class="chat-title" id="chatTitle">Messages</div>
        </div>
        <div class="chat-messages" id="chatMessages"></div>
        <div class="chat-composer" id="chatComposer">
            <input type="text" id="chatSujet" placeholder="Sujet" class="chat-input" aria-label="Sujet">
            <textarea id="chatBody" rows="2" placeholder="Votre message" class="chat-text" aria-label="Votre message"></textarea>
            <input type="file" id="chatImage" accept="image/*" class="visually-hidden" aria-hidden="true">
            <label for="chatImage" class="icon-btn" title="Joindre un fichier" aria-label="Joindre un fichier">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M21.44 11.05L12 20.49a6 6 0 11-8.49-8.49l9.43-9.44a4.5 4.5 0 116.36 6.36l-9.19 9.2a3 3 0 11-4.24-4.25l8.13-8.12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </label>
            <button id="chatSendBtn" class="icon-btn btn-send" title="Envoyer" aria-label="Envoyer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
        </div>`;
        const chatTitle = panel.querySelector('#chatTitle');
        const chatMessages = panel.querySelector('#chatMessages');
    const chatSujet = panel.querySelector('#chatSujet');
    const chatBody = panel.querySelector('#chatBody');
    const chatImage = panel.querySelector('#chatImage');
    const chatSendBtn = panel.querySelector('#chatSendBtn');

        // Render thread items
    const makeThreadName = (k) => k === 'general' ? 'Général' : (resMap[k]?.label || ('Client #' + k));
        const makePreview = (list) => (list[list.length-1]?.message || list[list.length-1]?.sujet || '').slice(0,80);
        // Unread counters using localStorage lastSeen timestamps per thread
        const unreadStoreKey = `roomReservation:unread:${salleId}`;
        function getUnreadMap(){ try { return JSON.parse(localStorage.getItem(unreadStoreKey) || '{}'); } catch { return {}; } }
        function setUnreadMap(map){ try { localStorage.setItem(unreadStoreKey, JSON.stringify(map)); } catch(e){} }

        function countUnreadFor(key){
            const map = getUnreadMap();
            const lastSeen = map[key] ? new Date(map[key]).getTime() : 0;
            const arr = threads[key] || [];
            let c = 0;
            for (const m of arr) {
                const t = new Date(m.created_at || 0).getTime();
                const fromClient = String((m.sender_type||'').toLowerCase()) !== 'gestionnaire';
                if (fromClient && (!lastSeen || t > lastSeen)) c++;
            }
            return c;
        }

        function computeTotalUnread(){
            let total = 0; threadKeys.forEach(k => total += countUnreadFor(k));
            if (totalUnreadEl) { totalUnreadEl.textContent = String(total); totalUnreadEl.style.display = total>0 ? 'inline-flex' : 'none'; }
            // Also update sidebar badge
            try {
                const b = document.getElementById('badge-messages');
                if (b) { b.textContent = String(total); b.style.display = total>0 ? 'inline-flex' : 'none'; }
            } catch (e) { /* ignore */ }
        }

        function renderThreads(filter=''){
            threadList.innerHTML = '';
            threadKeys.forEach(k => {
                const arr = threads[k];
                const name = makeThreadName(k);
                if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return;
                const item = document.createElement('div');
                item.className = 'thread-item';
                item.dataset.key = k;
                const initials = name.split(' ').map(s=>s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
                const time = arr[arr.length-1]?.created_at || '';
                const unread = countUnreadFor(k);
                item.innerHTML = `<div class="thread-avatar">${initials}</div><div class="thread-meta"><div class="thread-name">${escapeHtml(name)}${unread>0?` <span class=\"thread-unread\">${unread}</span>`:''}</div><div class="thread-preview">${escapeHtml(makePreview(arr))}</div></div><div class="thread-time">${escapeHtml(time)}</div>`;
                item.addEventListener('click', ()=> selectThread(k));
                threadList.appendChild(item);
            });
            computeTotalUnread();
        }
        renderThreads();

        // Thread selection / chat render
        let currentKey = threadKeys[0] || 'general';
        function selectThread(key){
            currentKey = key;
            threadList.querySelectorAll('.thread-item').forEach(el => el.classList.toggle('active', el.dataset.key === key));
            chatTitle.textContent = makeThreadName(key) + (resMap[key]?.contact ? ' • ' + resMap[key].contact : '');
            renderChat(key);
            // On mobile, show chat panel only
            panel.classList.add('active');
            // mark as read now
            const map = getUnreadMap();
            map[key] = new Date().toISOString();
            setUnreadMap(map);
            renderThreads();
        }
        function renderChat(key){
            chatMessages.innerHTML = '';
            const arr = (threads[key] || []).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
            arr.forEach(m => {
                const me = String((m.sender_type||'').toLowerCase()) === 'gestionnaire';
                const b = document.createElement('div');
                b.className = 'bubble ' + (me ? 'me' : 'them');
                const textRaw = m.message || '';
                // detect image URL in message (very simple heuristic)
                const imageUrl = (textRaw.match(/https?:[^\s]+\.(?:png|jpg|jpeg|gif|webp)/i) || [])[0];
                const text = escapeHtml(textRaw);
                const sujet = m.sujet ? `<div style=\"font-weight:800;margin-bottom:4px\">${escapeHtml(m.sujet)}</div>` : '';
                b.innerHTML = `${sujet}${imageUrl?`<div style=\"margin-bottom:6px\"><img src=\"${imageUrl}\" alt=\"image\" style=\"max-width:100%\"></div>`:''}<div>${text}</div><div class=\"meta\">${escapeHtml(m.created_at || '')}</div>`;
                chatMessages.appendChild(b);
                // lightbox on image click
                const im = b.querySelector('img');
                if (im) im.addEventListener('click', ()=> openLightbox(imageUrl));
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        // On desktop, open the latest thread by default; on mobile, keep the list visible first
        if (window.innerWidth > 980) {
            selectThread(currentKey);
        }

        // Search filter
        const search = sidebar.querySelector('#chatSearch');
        search.addEventListener('input', () => renderThreads(search.value));

        // Back button (mobile)
        panel.querySelector('#chatBack').addEventListener('click', () => {
            panel.classList.remove('active');
        });
        // If user rotates/resizes to desktop, ensure panel is visible with a selection
        window.addEventListener('resize', () => {
            if (window.innerWidth > 980 && !panel.classList.contains('active')) {
                selectThread(currentKey);
            }
        });

        // Send message from chat composer
        async function uploadImageForSalle(file, salleId){
            const fd = new FormData();
            fd.append('images[]', file);
            fd.append('salle_id', salleId);
            const url = ApiConfig.getBaseUrl() + '/upload-images.php';
            const res = await fetch(url, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data && data.message ? data.message : 'Erreur téléversement image');
            // API returns a list; try to read first path
            const path = (data.data && (data.data[0]?.chemin_fichier || data.data[0]?.chemin)) || (data.path || data.chemin_fichier || data.chemin);
            if (!path) throw new Error('Chemin image non reçu');
            return ApiConfig.getBaseUrl() + '/' + path;
        }
        chatSendBtn.addEventListener('click', async () => {
            const sujet = chatSujet.value || null;
            let body = chatBody.value || '';
            const imgFile = chatImage.files && chatImage.files[0] ? chatImage.files[0] : null;
            try {
                if (imgFile) {
                    const imgUrl = await uploadImageForSalle(imgFile, salleId);
                    body = body ? (body + "\n" + imgUrl) : imgUrl;
                }
                if (!body.trim() && !sujet) { alert('Le message est vide'); return; }
                const payload = {
                    salle_id: salleId,
                    sender_type: 'gestionnaire',
                    sender_user_id: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null,
                    reservation_id: currentKey === 'general' ? null : currentKey,
                    sujet: sujet,
                    message: body
                };
                await ApiConfig.makeRequest('/messages.php', { method: 'POST', body: JSON.stringify(payload) });
                chatSujet.value = '';
                chatBody.value = '';
                if (chatImage) chatImage.value = '';
                await loadMessages(salleId);
                // re-open current thread after reload
                setTimeout(() => {
                    const items = list.querySelectorAll('.thread-item');
                    items.forEach(el => { if (el.dataset.key === String(currentKey)) el.click(); });
                }, 50);
            } catch (err) {
                console.error('Erreur envoi message (chat):', err);
                alert('Erreur envoi message');
            }
        });

        wrap.appendChild(sidebar); wrap.appendChild(panel);
        list.appendChild(wrap);

        // New conversation modal setup
        function ensureNewConvModal(){
            if (document.getElementById('newConvModal')) return;
            const modal = document.createElement('div');
            modal.id = 'newConvModal';
            modal.className = 'new-conv-modal';
            modal.innerHTML = `
                <div class="new-conv-overlay" data-close="1"></div>
                <div class="new-conv-content" role="dialog" aria-modal="true">
                    <div class="new-conv-header">
                        <div class="new-conv-title">Nouvelle conversation</div>
                        <button class="new-conv-close" data-close="1">✕</button>
                    </div>
                    <div class="new-conv-body">
                        <div class="form-row">
                            <label for="newConvSelect">Destinataire (demandeur)</label>
                            <select id="newConvSelect"></select>
                        </div>
                        <div class="form-row">
                            <label for="newConvSujet">Sujet (optionnel)</label>
                            <input type="text" id="newConvSujet" placeholder="Sujet">
                        </div>
                        <div class="form-row">
                            <label for="newConvBody">Message (optionnel)</label>
                            <textarea id="newConvBody" rows="3" placeholder="Votre message..."></textarea>
                        </div>
                        <div class="form-row">
                            <label for="newConvImage">Pièce jointe (image - optionnel)</label>
                            <input type="file" id="newConvImage" accept="image/*">
                        </div>
                        <div class="form-row"><small style="color:#6b7280">Au moins un des champs Sujet, Message ou Image est requis.</small></div>
                    </div>
                    <div class="new-conv-actions">
                        <button class="btn-cancel" data-close="1">Annuler</button>
                        <button id="newConvSend" class="btn-approve">Créer et envoyer</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', ()=> closeNewConv()));
        }
        function openNewConv(){
            ensureNewConvModal();
            const modal = document.getElementById('newConvModal');
            const select = modal.querySelector('#newConvSelect');
            const sujet = modal.querySelector('#newConvSujet');
            const bodyInput = modal.querySelector('#newConvBody');
            const imageInput = modal.querySelector('#newConvImage');
            // populate destinataires (reservations for this salle)
            select.innerHTML = '';
            if (reservations.length === 0) {
                const opt = document.createElement('option'); opt.value=''; opt.textContent='Aucun demandeur disponible'; select.appendChild(opt);
            } else {
                reservations.forEach(r => { const opt = document.createElement('option'); opt.value = r.id; opt.textContent = `${r.nom} ${r.prenom} — ${r.email || r.telephone}`; select.appendChild(opt); });
            }
            sujet.value = '';
            bodyInput.value = '';
            imageInput.value = '';
            modal.classList.add('open');
            modal.setAttribute('aria-hidden','false');
            const sendBtn = modal.querySelector('#newConvSend');
            sendBtn.onclick = async () => {
                const resId = select.value;
                if (!resId) { alert('Veuillez choisir un destinataire'); return; }
                const subj = sujet.value || null;
                let body = bodyInput.value || '';
                const file = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
                try {
                    if (!subj && !body.trim() && !file) { alert('Veuillez saisir au moins un Sujet, Message ou Image.'); return; }
                    if (file) {
                        const imgUrl = await (async function upload(){
                            const fd = new FormData(); fd.append('images[]', file); fd.append('salle_id', salleId);
                            const url = ApiConfig.getBaseUrl() + '/upload-images.php';
                            const res = await fetch(url, { method: 'POST', body: fd });
                            const data = await res.json(); if (!res.ok) throw new Error(data.message||'Erreur upload');
                            const path = (data.data && (data.data[0]?.chemin_fichier || data.data[0]?.chemin)) || (data.path || data.chemin_fichier || data.chemin);
                            if (!path) throw new Error('Chemin image non reçu');
                            return ApiConfig.getBaseUrl() + '/' + path;
                        })();
                        body = body ? (body + "\n" + imgUrl) : imgUrl;
                    }
                    const payload = {
                        salle_id: salleId,
                        sender_type: 'gestionnaire',
                        sender_user_id: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null,
                        reservation_id: resId,
                        sujet: subj,
                        message: body
                    };
                    await ApiConfig.makeRequest('/messages.php', { method: 'POST', body: JSON.stringify(payload) });
                    closeNewConv();
                    await loadMessages(salleId);
                    // auto-ouvrir le fil nouvellement créé
                    setTimeout(() => {
                        const items = list.querySelectorAll('.thread-item');
                        items.forEach(el => { if (el.dataset.key === String(resId)) el.click(); });
                    }, 50);
                } catch (e) {
                    console.error('Erreur création conversation:', e);
                    alert('Erreur lors de l\'envoi du message');
                }
            };
        }
        function closeNewConv(){
            const modal = document.getElementById('newConvModal');
            if (!modal) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden','true');
        }

        const btnNew = sidebar.querySelector('#btnNewConv');
        if (btnNew) btnNew.addEventListener('click', openNewConv);

        // Pending proofs quick-actions list (kept, but with clickable thumbs + green buttons)
        try {
            const rresp = await ApiConfig.makeRequest('/reservation.php?gestionnaire_id=' + encodeURIComponent((window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : ''));
            const pending = Array.isArray(rresp.data)
                ? rresp.data.filter(r => String(r.salle_id) === String(salleId) && String((r.statut || '')).toLowerCase() !== 'confirmed')
                : [];
            if (pending.length) {
                const actions = document.createElement('div');
                actions.className = 'message-actions-panel';
                actions.innerHTML = `<h4 style="margin:8px 0">Preuves de paiement en attente</h4>`;
                list.appendChild(actions);
                for (const r of pending) {
                    try {
                        const p = await ApiConfig.makeRequest('/payment_proofs.php?reservation_id=' + encodeURIComponent(r.id));
                        if (p && p.success && Array.isArray(p.data) && p.data.length) {
                            const proof = p.data[0];
                            const row = document.createElement('div');
                            const url = ApiConfig.getBaseUrl() + '/' + proof.chemin;
                            row.className = 'proof-row';
                            row.innerHTML = `<img src="${url}" class="proof-thumb" style="height:52px;width:52px;object-fit:cover;border-radius:6px;cursor:zoom-in">
                                <div style="flex:1"><div><strong>${escapeHtml(r.nom)} ${escapeHtml(r.prenom)}</strong> — ${escapeHtml(r.email || r.telephone || '')}</div>
                                <small style="color:#666">Réservation du ${escapeHtml(r.date_reservation)}</small></div>
                                <div style="display:flex;gap:8px;align-items:center">
                                    <button class="btn-approve" data-res-id="${escapeHtml(r.id)}">Valider preuve</button>
                                    <button class="btn-request" data-res-id="${escapeHtml(r.id)}" data-action="request-correct-proof">Demander une preuve correcte</button>
                                </div>`;
                            const img = row.querySelector('img.proof-thumb');
                            if (img) img.addEventListener('click', () => openLightbox(url));
                            const btn = row.querySelector('button.btn-approve[data-res-id]');
                            btn.addEventListener('click', async () => {
                                if (!confirm('Valider cette preuve et confirmer la réservation ?')) return;
                                try {
                                    const resu = await ApiConfig.makeRequest('/reservation_update.php', { method: 'POST', body: JSON.stringify({ reservation_id: r.id, action: 'confirm_payment', changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null }) });
                                    if (resu && resu.success) {
                                        showBanner('Preuve validée. Réservation confirmée.', 'success');
                                        publishCalendarUpdate({ salle_id: salleId, action: 'reservation_confirmed', reservation_id: r.id });
                                        await loadMessages(salleId);
                                    } else {
                                        throw new Error(resu && resu.message ? resu.message : 'Erreur');
                                    }
                                } catch (err) {
                                    console.error('Erreur validation depuis Messages:', err);
                                    showBanner('Erreur validation preuve', 'error');
                                }
                            });
                            const btnWarn = row.querySelector('button.btn-request[data-action="request-correct-proof"]');
                            if (btnWarn) {
                                btnWarn.addEventListener('click', async () => {
                                    const sujet = 'Preuve de paiement invalide';
                                    const message = 'Bonjour, la preuve de paiement envoyée n\'est pas valide. Merci de renvoyer une preuve correcte (lisible, montant 50%).';
                                    try {
                                        // Optionally set reservation status to proof_invalid if backend supports it
                                        try { await ApiConfig.makeRequest('/reservation_update.php', { method: 'POST', body: JSON.stringify({ reservation_id: r.id, action: 'invalidate_proof', changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null }) }); } catch(e) {}
                                        await ApiConfig.makeRequest('/messages.php', { method: 'POST', body: JSON.stringify({
                                            salle_id: salleId,
                                            sender_type: 'gestionnaire',
                                            sender_user_id: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null,
                                            reservation_id: r.id,
                                            sujet,
                                            message
                                        }) });
                                        showBanner('Demande de nouvelle preuve envoyée au client', 'success');
                                        await loadMessages(salleId);
                                    } catch (e) {
                                        console.error('Erreur envoi demande nouvelle preuve', e);
                                        showBanner('Erreur lors de la demande de nouvelle preuve', 'error');
                                    }
                                });
                            }
                            list.appendChild(row);
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        } catch (e) { /* ignore */ }
    } catch (err) {
        console.error('Erreur chargement messages:', err);
        list.innerHTML = '<p>Erreur chargement messages.</p>';
    }
}

async function sendMessageForSalle(salleId) {
    const sujet = document.getElementById('msgSujet').value || null;
    const body = document.getElementById('msgBody').value || '';
    const reservationSelect = document.getElementById('msgReservationSelect');
    const reservationId = reservationSelect ? reservationSelect.value : null;
    if (!body.trim()) {
        alert('Le message est vide');
        return;
    }
    try {
        const payload = {
            salle_id: salleId,
            sender_type: 'gestionnaire',
            sender_user_id: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null,
            reservation_id: reservationId || null,
            sujet: sujet,
            message: body
        };
        await ApiConfig.makeRequest('/messages.php', { method: 'POST', body: JSON.stringify(payload) });
        document.getElementById('msgSujet').value = '';
        document.getElementById('msgBody').value = '';
        await loadMessages(salleId);
        alert('Message envoyé');
    } catch (err) {
        console.error('Erreur envoi message:', err);
        alert('Erreur envoi message');
    }
}

async function handlePhotoUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Prefer the photos salle select if present
    const photosSelect = document.getElementById('photosSalleSelect');
    const salleId = photosSelect && photosSelect.value ? photosSelect.value : prompt('Entrez l\'ID de la salle pour laquelle téléverser les photos:');
    if (!salleId) {
        alert('Aucune salle sélectionnée');
        return;
    }

    const fd = new FormData();
    for (const f of files) fd.append('images[]', f);
    fd.append('salle_id', salleId);

    try {
        const url = ApiConfig.getBaseUrl() + '/upload-images.php';
        const res = await fetch(url, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Erreur upload');
        alert('Photos téléversées avec succès');
    } catch (err) {
        console.error(err);
        alert('Erreur lors du téléversement des photos');
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
        default:
            if (!s) return '';
            return s.charAt(0).toUpperCase() + s.slice(1);
    }
}

function statusClass(status) {
    const s = (status || '').toString().toLowerCase();
    if (s.includes('confirm')) return 'confirmed';
    if (s.includes('accept') || s === 'approved') return 'accepted';
    if (s.includes('refus') || s.includes('reject')) return 'rejected';
    return 'pending';
}

// UI banner for errors / info (visible at top of the page)
function showBanner(message, type = 'info') {
    let existing = document.getElementById('apiBanner');
    if (!existing) {
        existing = document.createElement('div');
        existing.id = 'apiBanner';
        existing.style.position = 'fixed';
        existing.style.top = '10px';
        existing.style.left = '50%';
        existing.style.transform = 'translateX(-50%)';
        existing.style.zIndex = 9999;
        existing.style.padding = '10px 16px';
        existing.style.borderRadius = '6px';
        existing.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
        existing.style.fontWeight = '600';
        document.body.appendChild(existing);
    }
    existing.textContent = message;
    if (type === 'error') {
        existing.style.background = '#e74c3c';
        existing.style.color = '#fff';
    } else if (type === 'success') {
        existing.style.background = '#2ecc71';
        existing.style.color = '#fff';
    } else {
        existing.style.background = '#3498db';
        existing.style.color = '#fff';
    }
    // auto-hide after 8s
    clearTimeout(existing._timeout);
    existing._timeout = setTimeout(() => { try { existing.remove(); } catch (e){} }, 8000);
}

// Image Lightbox (zoom & pan) for proof images
function openLightbox(src) {
    const lb = document.getElementById('imgLightbox'); if (!lb) return;
    const img = document.getElementById('lightboxImg'); if (!img) return;
    const canvas = lb.querySelector('.lightbox-canvas');
    let scale = 1, originX = 0, originY = 0, isDown = false, startX = 0, startY = 0;
    img.src = src;
    img.style.transform = 'translate(0px,0px) scale(1)';
    lb.classList.add('open');
    lb.setAttribute('aria-hidden','false');

    function apply() {
        img.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
    }
    function onWheel(e){ e.preventDefault(); const delta = e.deltaY < 0 ? 0.1 : -0.1; scale = Math.min(5, Math.max(0.2, scale + delta)); apply(); }
    function onDown(e){ isDown = true; canvas.style.cursor = 'grabbing'; startX = e.clientX - originX; startY = e.clientY - originY; }
    function onMove(e){ if (!isDown) return; originX = e.clientX - startX; originY = e.clientY - startY; apply(); }
    function onUp(){ isDown = false; canvas.style.cursor = 'grab'; }

    canvas.addEventListener('wheel', onWheel, { passive:false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    const zoomIn = document.getElementById('lbZoomIn');
    const zoomOut = document.getElementById('lbZoomOut');
    const zoomReset = document.getElementById('lbZoomReset');
    if (zoomIn) zoomIn.onclick = () => { scale = Math.min(5, scale + 0.2); apply(); };
    if (zoomOut) zoomOut.onclick = () => { scale = Math.max(0.2, scale - 0.2); apply(); };
    if (zoomReset) zoomReset.onclick = () => { scale = 1; originX = 0; originY = 0; apply(); };

    const closeEls = lb.querySelectorAll('[data-close]');
    closeEls.forEach(el => el.onclick = closeLightbox);
    function onEsc(e){ if (e.key === 'Escape') closeLightbox(); }
    document.addEventListener('keydown', onEsc);

    function closeLightbox(){
        lb.classList.remove('open');
        lb.setAttribute('aria-hidden','true');
        // cleanup listeners
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('mousedown', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.removeEventListener('keydown', onEsc);
    }
}

// Manager reservation modal helpers
function ensureManagerReservationModal() {
    if (document.getElementById('managerReservationModal')) return;
    // If modal not present (older pages), create minimal structure dynamically
    const div = document.createElement('div');
    div.id = 'managerReservationModal';
    div.style.display = 'none';
    div.innerHTML = `
        <div class="modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:2000"></div>
        <div class="modal-content" role="dialog" aria-modal="true" style="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;padding:18px;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.2);z-index:2001;max-width:520px;width:94%">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <h3 style="margin:0;font-size:1.1rem">Créer une réservation (Gestionnaire)</h3>
                <button id="modalCloseBtn" aria-label="Fermer" style="background:none;border:none;font-size:20px">✕</button>
            </div>
            <form id="modalReservationForm" style="display:flex;flex-direction:column;gap:8px">
                <input type="hidden" id="modal_salle_id">
                <input type="hidden" id="modal_date">
                <input id="modal_nom" placeholder="Nom" required style="padding:8px;border:1px solid #e0e0e0;border-radius:6px">
                <input id="modal_prenom" placeholder="Prénom" style="padding:8px;border:1px solid #e0e0e0;border-radius:6px">
                <input id="modal_email" placeholder="Email" style="padding:8px;border:1px solid #e0e0e0;border-radius:6px">
                <input id="modal_telephone" placeholder="Téléphone" style="padding:8px;border:1px solid #e0e0e0;border-radius:6px">
                <div style="position:relative">
                    <input id="modal_password" type="password" minlength="6" placeholder="Mot de passe du client (min 6)" style="padding:8px 38px 8px 8px;border:1px solid #e0e0e0;border-radius:6px;width:100%">
                    <button type="button" class="password-toggle" data-target="modal_password" aria-label="Afficher le mot de passe" title="Afficher / masquer" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:1.1rem;">👁️</button>
                </div>
                <select id="modal_type" style="padding:8px;border:1px solid #e0e0e0;border-radius:6px">
                    <option value="">Type d'événement</option>
                    <option>Mariage</option>
                    <option>Réunion</option>
                    <option>Conférence</option>
                    <option>Anniversaire</option>
                    <option>Autre</option>
                </select>
                <input id="modal_invites" type="number" min="1" placeholder="Nombre d'invités" style="padding:8px;border:1px solid #e0e0e0;border-radius:6px">
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
                    <button type="button" id="modalCancel" class="btn-secondary">Annuler</button>
                    <button type="button" id="modalSubmit" class="btn-primary">Créer réservation</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(div);
    // attach handlers
    div.querySelector('#modalCloseBtn').addEventListener('click', () => closeManagerReservationModal());
    div.querySelector('#modalCancel').addEventListener('click', () => closeManagerReservationModal());
    const overlay = div.querySelector('.modal-overlay');
    if (overlay) overlay.addEventListener('click', () => closeManagerReservationModal());
}

function openManagerReservationModal(iso, salleId) {
    ensureManagerReservationModal();
    const modal = document.getElementById('managerReservationModal');
    if (!modal) return;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    // prefill
    const get = (id) => modal.querySelector('#' + id);
    if (get('modal_salle_id')) get('modal_salle_id').value = salleId;
    if (get('modal_date')) get('modal_date').value = iso;
    // prefills with current user contact if available
    const user = window.sessionUser || {};
    if (get('modal_nom')) get('modal_nom').value = user.nom || '';
    if (get('modal_prenom')) get('modal_prenom').value = user.prenom || '';
    if (get('modal_email')) get('modal_email').value = user.email || '';
    if (get('modal_telephone')) get('modal_telephone').value = user.telephone || '';

    // Bind eye toggle for password field if present
    try {
        const pwdToggle = modal.querySelector('.password-toggle[data-target="modal_password"]');
        const pwdInput = modal.querySelector('#modal_password');
        if (pwdToggle && pwdInput) {
            pwdToggle.onclick = () => {
                if (pwdInput.type === 'password') { pwdInput.type = 'text'; pwdToggle.textContent = '🙈'; }
                else { pwdInput.type = 'password'; pwdToggle.textContent = '👁️'; }
            };
        }
    } catch (e) { /* ignore */ }

    // Allow clicking overlay to close the modal for the static version
    const overlay = modal.querySelector('.modal-overlay');
    if (overlay) overlay.addEventListener('click', () => closeManagerReservationModal());

    // attach submit handler (replace previous)
    const submit = modal.querySelector('#modalSubmit');
    submit.onclick = async () => {
        const payload = {
            salle_id: get('modal_salle_id').value,
            nom: (get('modal_nom').value || '').trim(),
            prenom: (get('modal_prenom').value || '').trim(),
            email: (get('modal_email').value || '').trim() || (user.email || ''),
            telephone: (get('modal_telephone').value || '').trim() || (user.telephone || ''),
            date: get('modal_date').value,
            type: (get('modal_type').value || 'Autre'),
            invites: parseInt(get('modal_invites').value, 10) || 1,
            password: (get('modal_password') && get('modal_password').value) ? get('modal_password').value : undefined,
            // Hints to backend that this reservation is created by manager and should be confirmed immediately
            created_by: 'gestionnaire',
            auto_confirm: true
        };
        try {
            const resp = await ApiConfig.makeRequest('/reservation.php', { method: 'POST', body: JSON.stringify(payload) });
            if (!resp || !resp.success) throw new Error(resp && resp.message ? resp.message : 'Erreur création');

            // Try to immediately mark the reservation as confirmed
            async function confirmById(resId) {
                const attempts = ['confirm', 'confirm_payment'];
                for (const action of attempts) {
                    try {
                        const r = await ApiConfig.makeRequest('/reservation_update.php', { method: 'POST', body: JSON.stringify({ reservation_id: resId, action, changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null }) });
                        if (r && r.success) return true;
                    } catch (e) { /* try next */ }
                }
                return false;
            }

            let confirmed = false;
            // If API returned the new reservation id, confirm directly
            const newId = resp.data && (resp.data.id || resp.data.reservation_id);
            if (newId) {
                confirmed = await confirmById(newId);
            } else {
                // Fallback: resolve reservation by salle_id + date + contact
                try {
                    const list = await ApiConfig.makeRequest('/reservation.php?gestionnaire_id=' + encodeURIComponent((window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : ''));
                    const arr = Array.isArray(list.data) ? list.data : [];
                    // Find latest matching reservation for that day and salle
                    const match = arr.filter(r => String(r.salle_id) === String(payload.salle_id) && String(r.date_reservation) === String(payload.date))
                                     .sort((a,b)=> new Date(b.created_at||b.id||0) - new Date(a.created_at||a.id||0))[0];
                    if (match && match.id) {
                        confirmed = await confirmById(match.id);
                    }
                } catch (e) { /* ignore */ }
            }

            // Close modal and broadcast updates
            showBanner(confirmed ? 'Réservation créée et confirmée' : 'Réservation créée', 'success');
            closeManagerReservationModal();

            // broadcast calendar update so other tabs/pages (details page) can refresh
            try { publishCalendarUpdate({ salle_id: payload.salle_id, action: confirmed ? 'reservation_confirmed' : 'reservation_created' }); } catch (e) { }
            // refresh calendar section
            try { loadCalendarSection(); } catch (e) { location.reload(); }
        } catch (err) {
            console.error('Erreur création réservation manager (modal):', err);
            showBanner('Erreur création réservation: ' + (err.message || err), 'error');
        }
    };
}

function closeManagerReservationModal() {
    const modal = document.getElementById('managerReservationModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

async function loadReservations() {
    // user already defined via session
    try {
        const user = window.sessionUser;
        if (!user || !user.id) return;
        const resp = await ApiConfig.makeRequest('/reservation.php?gestionnaire_id=' + encodeURIComponent(user.id));
        if (!resp.success) throw new Error(resp.message || 'Erreur API');
        const list = document.getElementById('liste-reservations');
        const hist = document.getElementById('historique-reservations');
        if (!list) return;
        list.innerHTML = '';

        const all = Array.isArray(resp.data) ? resp.data : [];
        const isPending = (s) => {
            const x = String(s || '').toLowerCase();
            return !x || x === 'pending' || x === 'en_attente' || x === 'nouveau' || x === 'new' || x === 'requested' || x === 'demande' || x === 'submitted';
        };
        const pendings = all.filter(r => isPending(r.statut));
        const nonPendings = all.filter(r => !isPending(r.statut));

    if (pendings.length) {
            pendings.forEach(r => {
                // Build a framed, clickable reservation card
                const card = document.createElement('div');
                card.className = 'reservation-item card-clickable';

                const header = document.createElement('div');
                header.className = 'reservation-header';
                header.innerHTML = `<h4>${escapeHtml(r.nom)} ${escapeHtml(r.prenom)} — ${escapeHtml(r.salle_nom || 'Salle')}</h4>
                    <span class="status-badge ${statusClass(r.statut)}">${escapeHtml(statusFr(r.statut))}</span>`;

                const info = document.createElement('div');
                info.className = 'reservation-info';
                info.innerHTML = `Date: <strong>${escapeHtml(r.date_reservation)}</strong> — Invités: <strong>${escapeHtml(r.invites)}</strong>`;

                const contact = document.createElement('div');
                contact.className = 'reservation-contact';
                contact.innerHTML = `${escapeHtml(r.email)} • ${escapeHtml(r.telephone)}`;

                // Actions hidden by default, revealed when clicking the card
                const actions = document.createElement('div');
                actions.className = 'reservation-actions';
                actions.innerHTML = `<button class="btn-primary btn-accept-request" data-id="${escapeHtml(r.id)}">Accepter & demander preuve</button> <button class="btn-secondary btn-reject" data-id="${escapeHtml(r.id)}">Refuser</button>`;

                card.appendChild(header);
                card.appendChild(info);
                card.appendChild(contact);
                card.appendChild(actions);

                // Toggle actions visibility when card clicked
                card.addEventListener('click', (ev) => {
                    // If click is inside actions buttons, don't toggle (buttons handle their own events)
                    if (ev.target && (ev.target.closest('.reservation-actions'))) return;
                    card.classList.toggle('active');
                });

                // Accept & request proof handler
                actions.querySelector('.btn-accept-request').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = e.currentTarget.getAttribute('data-id');
                    try {
                        // 1) Update reservation status to accepted
                        await ApiConfig.makeRequest('/reservation_update.php', { method: 'POST', body: JSON.stringify({ reservation_id: id, action: 'accept', changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null }) });
                        // 2) Send a message to the requester asking for payment proof
                        const msg = {
                            reservation_id: id,
                            salle_id: r.salle_id || null,
                            sender_type: 'gestionnaire',
                            sender_user_id: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null,
                            sujet: 'Preuve de paiement requise',
                            message: 'Bonjour, votre réservation a été acceptée sous réserve de réception d\'une preuve de paiement. Merci de téléverser votre preuve de paiement ou de répondre à ce message.'
                        };
                        await ApiConfig.makeRequest('/messages.php', { method: 'POST', body: JSON.stringify(msg) });
                        showBanner('Réservation acceptée et demande de preuve envoyée', 'success');
                        // Retirer immédiatement la carte de la liste pour un retour visuel rapide
                        card.remove();
                        // refresh list (met à jour aussi l'historique)
                        await loadReservations();
                    } catch (err) {
                        console.error('Erreur accept/request proof:', err);
                        showBanner('Erreur lors de l\'acceptation ou envoi de la demande de preuve', 'error');
                    }
                });

                // Reject handler
                actions.querySelector('.btn-reject').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = e.currentTarget.getAttribute('data-id');
                    if (!confirm('Confirmer le refus de cette réservation ?')) return;
                    try {
                        await ApiConfig.makeRequest('/reservation_update.php', { method: 'POST', body: JSON.stringify({ reservation_id: id, action: 'reject', changed_by: (window.sessionUser && window.sessionUser.id) ? window.sessionUser.id : null }) });
                        showBanner('Réservation refusée', 'success');
                        card.remove();
                        await loadReservations();
                    } catch (err) {
                        console.error('Erreur rejection:', err);
                        showBanner('Erreur lors du refus', 'error');
                    }
                });

                list.appendChild(card);
            });
        } else {
            list.innerHTML = '<p>Aucune demande de réservation.</p>';
        }

        // Rendre l'historique des actions sous la liste
        if (hist) {
            hist.innerHTML = '';
            const title = document.createElement('h3');
            title.textContent = 'Historique des actions';
            hist.appendChild(title);
            if (nonPendings.length === 0) {
                const p = document.createElement('p'); p.textContent = 'Aucune action pour le moment.'; hist.appendChild(p);
            } else {
                // Trier par date (updated_at si dispo, sinon date_reservation)
                const sorted = nonPendings.slice().sort((a,b) => {
                    const da = Date.parse(a.updated_at || a.status_changed_at || a.date_reservation || '');
                    const db = Date.parse(b.updated_at || b.status_changed_at || b.date_reservation || '');
                    return isNaN(db) - isNaN(da) || db - da;
                });
                const ul = document.createElement('div'); ul.className = 'history-list';
                sorted.forEach(r => {
                    const s = String(r.statut || '').toLowerCase();
                    const item = document.createElement('div');
                    item.className = 'history-item ' + (s.includes('confirm') ? 'confirmed' : s.includes('accept') ? 'accepted' : s.includes('refus') || s.includes('reject') ? 'rejected' : '');
                    const when = r.updated_at || r.status_changed_at || r.date_reservation || '';
                    item.innerHTML = `<div class="title">${escapeHtml(r.nom)} ${escapeHtml(r.prenom)} • ${escapeHtml(r.salle_nom || 'Salle')}</div>
                                      <div class="meta">${escapeHtml(statusFr(r.statut))} — ${escapeHtml(when)}</div>`;
                    ul.appendChild(item);
                });
                hist.appendChild(ul);
            }
        }

        // Update sidebar badge for pending reservations
        try {
            const badge = document.getElementById('badge-reservations');
            if (badge) {
                const count = pendings.length;
                badge.textContent = String(count);
                badge.style.display = count > 0 ? 'inline-flex' : 'none';
            }
        } catch (e) { /* ignore */ }
    } catch (err) {
        console.error('Erreur chargement reservations:', err);
        const list = document.getElementById('liste-reservations');
        if (list) list.innerHTML = '<p>Impossible de charger les réservations.</p>';
    }
}

// When showing calendar section, initialize it
const originalAfficher = window.afficherSection;
window.afficherSection = function(name) {
    originalAfficher(name);
    if (name === 'calendrier') {
        loadCalendarSection();
    }
    if (name === 'messages') {
        // populate select if needed and load messages for first salle
        const sel = document.getElementById('salleSelectMsgs');
        if (sel && sel.options.length) {
            const first = sel.options[0].value;
            loadMessages(first).catch(err => console.error(err));
        }
        // attach send handler
        const sendBtn = document.getElementById('sendMsgBtn');
        if (sendBtn) {
            sendBtn.onclick = () => {
                const selMsgs = document.getElementById('salleSelectMsgs');
                if (!selMsgs) return alert('Aucune salle sélectionnée');
                sendMessageForSalle(selMsgs.value);
            };
            const selMsgs = document.getElementById('salleSelectMsgs');
            if (selMsgs) selMsgs.onchange = () => loadMessages(selMsgs.value).catch(err => console.error(err));
        }
    }
};
