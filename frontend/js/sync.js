// Lightweight cross-tab sync helpers for calendar updates
// - Uses BroadcastChannel when available for instant updates across tabs
// - Mirrors to localStorage as a fallback and to notify other listeners

let bc = null;
function getChannel() {
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      if (!bc) bc = new BroadcastChannel('roomReservation:calendar');
      return bc;
    }
  } catch (e) { /* ignore */ }
  return null;
}

export function publishCalendarUpdate(data) {
  const payload = { ...data, ts: data && data.ts ? data.ts : Date.now() };
  // BroadcastChannel
  try {
    const ch = getChannel();
    if (ch) ch.postMessage({ type: 'calendarUpdate', payload });
  } catch (e) { /* ignore */ }
  // localStorage fallback (and for legacy listeners)
  try {
    localStorage.setItem('roomReservation:calendarUpdate', JSON.stringify(payload));
  } catch (e) { /* ignore */ }
}

export function subscribeCalendarUpdates(handler) {
  // BroadcastChannel listener
  const ch = getChannel();
  const onMessage = (ev) => {
    try {
      const msg = ev && ev.data;
      if (msg && msg.type === 'calendarUpdate' && msg.payload) handler(msg.payload);
    } catch (e) { /* ignore */ }
  };
  if (ch) ch.addEventListener('message', onMessage);

  // localStorage listener (fallback / legacy)
  const onStorage = (e) => {
    if (!e || e.key !== 'roomReservation:calendarUpdate') return;
    try {
      const payload = JSON.parse(e.newValue || e.oldValue || '{}');
      if (payload) handler(payload);
    } catch (err) { /* ignore */ }
  };
  window.addEventListener('storage', onStorage);

  // return unsubscribe
  return () => {
    try { if (ch) ch.removeEventListener('message', onMessage); } catch {}
    try { window.removeEventListener('storage', onStorage); } catch {}
  };
}
