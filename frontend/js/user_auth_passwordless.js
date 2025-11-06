import { ApiConfig } from './config/api.js';

document.addEventListener('DOMContentLoaded', () => {
    const sendEmail = document.getElementById('sendEmail');
    const sendTelephone = document.getElementById('sendTelephone');
    const sendTokenBtn = document.getElementById('sendTokenBtn');
    const stepSend = document.getElementById('stepSend');
    const stepVerify = document.getElementById('stepVerify');
    const sendNotice = document.getElementById('sendNotice');
    const tokenInput = document.getElementById('tokenInput');
    const verifyTokenBtn = document.getElementById('verifyTokenBtn');
    const createUserAccountLink = document.getElementById('createUserAccountLink');

    let currentUserId = null;

    // Helper to show temporary notices
    function showNotice(msg, isError = false) {
        if (!sendNotice) return;
        sendNotice.textContent = msg;
        sendNotice.style.color = isError ? '#a94442' : '#0c5460';
    }

    // Send token (step 1)
    sendTokenBtn.addEventListener('click', async () => {
        const email = sendEmail.value && sendEmail.value.trim();
        const telephone = sendTelephone.value && sendTelephone.value.trim();
        if (!email && !telephone) {
            showNotice('Veuillez fournir un email ou un téléphone', true);
            return;
        }

        sendTokenBtn.disabled = true;
        showNotice('Envoi du code...');

        try {
            const payload = { email: email || undefined, telephone: telephone || undefined };
            const resp = await ApiConfig.makeRequest('/user_send_token.php', { method: 'POST', body: JSON.stringify(payload) });
            if (resp && resp.success && resp.data) {
                // Store returned user_id to use on verification
                currentUserId = resp.data.user_id || null;
                // Show the returned token in dev mode so testers can proceed without email/SMS
                const token = resp.data.token;
                showNotice('Code envoyé. (dev) Code: ' + token);

                // Switch to verify step
                stepSend.style.display = 'none';
                stepVerify.style.display = '';
                tokenInput.focus();
            } else {
                showNotice('Impossible d\'envoyer le code', true);
            }
        } catch (err) {
            console.error(err);
            showNotice('Erreur lors de l\'envoi du code', true);
        } finally {
            sendTokenBtn.disabled = false;
        }
    });

    // Verify token (step 2)
    verifyTokenBtn.addEventListener('click', async () => {
        const token = tokenInput.value && tokenInput.value.trim();
        if (!token) {
            showNotice('Veuillez entrer le code reçu', true);
            return;
        }

        verifyTokenBtn.disabled = true;
        showNotice('Vérification...');

        try {
            const email = sendEmail.value && sendEmail.value.trim();
            const telephone = sendTelephone.value && sendTelephone.value.trim();
            const payload = { token };
            if (currentUserId) payload.user_id = currentUserId;
            else if (email) payload.email = email;
            else if (telephone) payload.telephone = telephone;

            const resp = await ApiConfig.makeRequest('/user_verify_token.php', { method: 'POST', body: JSON.stringify(payload) });
            if (resp && resp.success && resp.data && resp.data.user) {
                const user = resp.data.user;
                // Save minimal session info, include name when available
                const stored = { id: user.id, email: user.email || null, telephone: user.telephone || null, isLoggedIn: true };
                if (user.nom) stored.nom = user.nom;
                if (user.prenom) stored.prenom = user.prenom;
                if (user.nom && user.prenom) stored.fullName = `${user.prenom} ${user.nom}`;
                localStorage.setItem('roomReservationUser', JSON.stringify(stored));
                showNotice('Authentification réussie', false);
                // Redirect to the user dashboard
                setTimeout(() => { window.location.href = 'tableau-bord-utilisateur.html'; }, 500);
            } else {
                showNotice('Code invalide', true);
            }
        } catch (err) {
            console.error(err);
            showNotice('Erreur lors de la vérification', true);
        } finally {
            verifyTokenBtn.disabled = false;
        }
    });

    // Create account link: inform user to reserve a salle first then redirect to salle list
    if (createUserAccountLink) {
        createUserAccountLink.addEventListener('click', (e) => {
            e.preventDefault();
            // show a quick message then redirect
            alert('Vous devez réserver une salle de fête pour créer un compte utilisateur. Vous allez être redirigé vers la liste des salles.');
            window.location.href = 'recherche-salles.html';
        });
    }
});
