export const ICON_HISTORY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
export const ICON_PLAY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5"/></svg>';
export const ICON_CARET = '<svg class="yt-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const ytOpenKeys = new Set();

/** Extract a YouTube video id from watch / youtu.be / embed / shorts URLs. */
export function youtubeVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    let id = null;
    if (host === 'youtu.be') {
      id = u.pathname.split('/').filter(Boolean)[0] || null;
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v');
      if (!id) {
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'v') {
          id = parts[1] || null;
        }
      }
    }
    if (id) {
      id = decodeURIComponent(id).split('?')[0].split('&')[0];
      if (YT_ID_RE.test(id)) return id;
    }
  } catch { /* ignore invalid URLs */ }
  return null;
}

export function youtubeEmbedUrl(videoId) {
  if (!videoId || !YT_ID_RE.test(videoId)) return null;
  return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) + '?rel=0&modestbranding=1';
}

function youtubeIframeHtml(videoId) {
  const src = youtubeEmbedUrl(videoId);
  if (!src) return '';
  return '<iframe src="' + escAttr(src) +
    '" title="Vídeo do exercício"' +
    ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"' +
    ' allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
}

function mountYoutubeEmbed(details) {
  const slot = details.querySelector('.yt-embed');
  const id = details.dataset.ytId;
  if (!slot || !id || slot.querySelector('iframe')) return;
  slot.innerHTML = youtubeIframeHtml(id);
}

/** Collapsed <details> with a lazy YouTube embed. Falls back to an external link if the URL cannot be parsed. */
export function youtubeDropdownHtml(url, key) {
  if (!url) return '';
  const id = youtubeVideoId(url);
  if (!id) {
    return '<a class="chip-btn youtube-link" href="' + escAttr(url) + '" target="_blank" rel="noopener">YouTube</a>';
  }
  const isOpen = ytOpenKeys.has(key);
  return '<details class="ex-youtube"' + (isOpen ? ' open' : '') +
    ' data-yt-id="' + escAttr(id) + '" data-yt-key="' + escAttr(key) + '">' +
    '<summary>' + ICON_PLAY + ' Vídeo' + ICON_CARET + '</summary>' +
    '<div class="yt-embed"></div>' +
    '</details>';
}

/** Inject iframes into already-open dropdowns after an innerHTML re-render. */
export function hydrateYoutubeEmbeds(root) {
  if (!root) return;
  root.querySelectorAll('details.ex-youtube[open]').forEach(mountYoutubeEmbed);
}

/** Listen for open/close so the player loads only when shown and stops when hidden. */
export function bindYoutubeDropdown(root) {
  if (!root || root.dataset.ytBound) return;
  root.dataset.ytBound = '1';
  root.addEventListener('toggle', (e) => {
    const details = e.target;
    if (!(details instanceof HTMLDetailsElement) || !details.classList.contains('ex-youtube')) return;
    const key = details.dataset.ytKey;
    if (details.open) {
      if (key) ytOpenKeys.add(key);
      mountYoutubeEmbed(details);
    } else {
      if (key) ytOpenKeys.delete(key);
      const slot = details.querySelector('.yt-embed');
      if (slot) slot.innerHTML = '';
    }
  }, true);
}

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
