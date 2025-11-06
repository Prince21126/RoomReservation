// Elegant responsive calendar component for details page
// Usage: import { createCalendar } from './calendar.js';
// const cal = createCalendar(container, { reservations: ['2025-10-30'], onDateSelect(dateIso) { ... } });

export function createCalendar(container, opts = {}) {
    const today = new Date();
        // Default timezone for Bukavu / South Kivu
        const timeZone = opts.timeZone || 'Africa/Lubumbashi';

        // Compute "today" in the target timezone as an ISO string (YYYY-MM-DD)
        // Using en-CA locale produces an ISO-like date string we can rely on.
        const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
        const [ty, tm, td] = todayIso.split('-').map(n => parseInt(n, 10));

        // Initialize current view to the month that contains "today" in the target timezone
        let current = new Date(ty, tm - 1, 1);
    const reservations = new Set((opts.reservations || []).map(d => String(d)));
    const pending = new Set((opts.pending || []).map(d => String(d)));
    const blocked = new Set((opts.blocked || []).map(d => String(d)));

    function buildHeader() {
        const header = document.createElement('div');
        header.className = 'calendar-header';

    const title = document.createElement('div');
    title.className = 'calendar-title';
    title.textContent = current.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

        const controls = document.createElement('div');
        controls.className = 'calendar-controls';

        const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'btn-small calendar-prev'; prev.setAttribute('aria-label', 'Mois précédent'); prev.innerHTML = '‹';
        const next = document.createElement('button'); next.type = 'button'; next.className = 'btn-small calendar-next'; next.setAttribute('aria-label', 'Mois suivant'); next.innerHTML = '›';
        const todayBtn = document.createElement('button'); todayBtn.type = 'button'; todayBtn.className = 'btn-small calendar-today'; todayBtn.textContent = 'Aujourd\'hui';

        controls.appendChild(prev);
        controls.appendChild(todayBtn);
        controls.appendChild(next);

        header.appendChild(title);
        header.appendChild(controls);

        prev.addEventListener('click', () => { current = new Date(current.getFullYear(), current.getMonth() - 1, 1); render(); });
        next.addEventListener('click', () => { current = new Date(current.getFullYear(), current.getMonth() + 1, 1); render(); });
        todayBtn.addEventListener('click', () => { current = new Date(today.getFullYear(), today.getMonth(), 1); render(); });

        return header;
    }

    function buildGrid() {
        const grid = document.createElement('div');
        grid.className = 'calendar-grid';

        const weekdays = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
        const weekRow = document.createElement('div');
        weekRow.className = 'calendar-weekdays';
        weekdays.forEach(w => {
            const el = document.createElement('div'); el.className = 'calendar-weekday'; el.textContent = w; weekRow.appendChild(el);
        });
        grid.appendChild(weekRow);

        const daysContainer = document.createElement('div');
        daysContainer.className = 'calendar-days';

    const firstDay = new Date(current.getFullYear(), current.getMonth(), 1).getDay();
    const offset = (firstDay + 6) % 7; // Monday-first
    const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();

        // create blanks
        for (let i = 0; i < offset; i++) {
            const blank = document.createElement('div'); blank.className = 'calendar-day empty'; daysContainer.appendChild(blank);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(current.getFullYear(), current.getMonth(), d);
                const year = current.getFullYear();
                const month = current.getMonth() + 1;
                const dd = d;
                const iso = `${year}-${String(month).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
            const day = document.createElement('button');
            day.type = 'button';
            day.className = 'calendar-day';
            day.dataset.date = iso;
            day.innerHTML = `<span class="date-num">${d}</span>`;
            if (reservations.has(iso)) day.classList.add('reserved');
            if (pending.has(iso)) day.classList.add('pending');
            if (blocked.has(iso)) day.classList.add('blocked');
                if (iso === todayIso) {
                day.classList.add('today');
                day.setAttribute('aria-current', 'date');
                day.setAttribute('title', "Aujourd'hui");
                    day.setAttribute('title', "Aujourd'hui (Bukavu)");
            }
            day.addEventListener('click', () => { if (opts.onDateSelect) opts.onDateSelect(iso); });
            daysContainer.appendChild(day);
        }

        grid.appendChild(daysContainer);
        return grid;
    }

    function render() {
        // Animated replace: create new card and fade it in
        const newCard = document.createElement('div'); newCard.className = 'calendar-card';
        newCard.appendChild(buildHeader());
        newCard.appendChild(buildGrid());
        // Replace previous card deterministically to avoid duplicates
        // Clear container and append the new card, then animate in
        container.innerHTML = '';
        container.appendChild(newCard);
        // trigger reflow then show new
        requestAnimationFrame(() => {
            newCard.classList.add('show');
        });
    }

    function setReservations(dates) {
        reservations.clear();
        (dates || []).forEach(d => reservations.add(String(d)));
        render();
    }

    function setPendingDates(dates) {
        pending.clear();
        (dates || []).forEach(d => pending.add(String(d)));
        render();
    }

        function setBlockedDates(dates) {
            blocked.clear();
            (dates || []).forEach(d => blocked.add(String(d)));
            render();
        }

    // initial
    render();

    return { setReservations, setPendingDates, setBlockedDates };
}
// (calendar implementation above is the active version)
