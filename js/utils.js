export const ICON_HISTORY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

export let toastTimer = null;

export function pageHeader(title, subtitle, badge) {
  let html = '<div class="page-header"><h1>' + title + '</h1>';
  if (subtitle) html += '<p class="subtitle">' + subtitle + '</p>';
  if (badge) html += '<div class="session-badge"><span class="dot"></span>' + badge + '</div>';
  return html + '</div>';
}

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  if (toastTimer) clearTimeout(toastTimer);
  el.textContent = msg;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    toastTimer = null;
  }, 2200);
}

/** Light haptic for important confirms (respects cfg.vibrate). */
export function lightHaptic() {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  } catch { /* ignore */ }
}

export function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y.slice(2);
}

export function epley1RM(kg, reps) {
  if (!kg || !reps) return 0;
  return kg * (1 + reps / 30);
}

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function openModal(html) {
  document.getElementById('modal-content').innerHTML = '<div class="modal-handle"></div>' + html;
  document.getElementById('modal-overlay').classList.add('open');
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}
