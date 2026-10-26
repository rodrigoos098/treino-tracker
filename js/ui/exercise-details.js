import { esc, escAttr, openModal, closeModal } from '../utils.js';

export function setsRepsLabel(ex, countSets) {
  const reps = String(ex?.reps || '');
  if (reps.includes('×')) return reps;
  const n = typeof countSets === 'function' ? countSets(ex) : countSets;
  return n + '×' + reps;
}

export function planBadgesHtml(ex) {
  if (!ex) return '';
  const bits = [];
  if (ex.must) bits.push('<span class="badge inten">Clássico obrigatório</span>');
  if (ex.tier) bits.push('<span class="badge accent">Tier ' + esc(ex.tier) + '</span>');
  if (ex.intensityTechnique) bits.push('<span class="badge inten">' + esc(ex.intensityTechnique) + '</span>');
  if (ex.biSet) bits.push('<span class="badge">Bi-set antagonista opcional</span>');
  if (!bits.length) return '';
  return '<div class="ex-meta-row">' + bits.join('') + '</div>';
}

export function exerciseDetailsButton(ex) {
  if (!ex?.sections?.length) return '';
  return '<button type="button" class="ex-details-btn" data-action="ex-details" data-ex="' +
    escAttr(ex.id) + '">Detalhes do plano</button>';
}

function sectionHtml(section) {
  let body = '';
  if (section.text) body += '<p>' + esc(section.text) + '</p>';
  if (Array.isArray(section.items) && section.items.length) {
    body += '<ul>' + section.items.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>';
  }
  if (Array.isArray(section.pairs) && section.pairs.length) {
    body += section.pairs.map((pair) =>
      '<div class="sub-tier-row"><span>' + esc(pair.name) + '</span><b>Tier ' + esc(pair.tier || '') + '</b></div>'
    ).join('');
  }
  if (Array.isArray(section.links) && section.links.length) {
    const label = section.linksLabel ? esc(section.linksLabel) + ': ' : '';
    body += '<p class="detail-links">' + label + section.links.map((link) =>
      '<a href="' + escAttr(link.href) + '" target="_blank" rel="noopener">' + esc(link.label) + '</a>'
    ).join(' · ') + '</p>';
  }
  if (!body) return '';
  return '<section class="detail-section"><h4>' + esc(section.heading) + '</h4>' + body + '</section>';
}

export function showExerciseDetails(ex) {
  if (!ex?.sections?.length) return;
  const en = ex.nameEn ? '<p class="subtitle detail-en">' + esc(ex.nameEn) + '</p>' : '';
  openModal(
    '<h3>' + esc(ex.name) + '</h3>' +
    en +
    ex.sections.map(sectionHtml).join('') +
    '<button type="button" class="btn btn-secondary btn-block" id="ex-details-close">Fechar</button>'
  );
  const btn = document.getElementById('ex-details-close');
  if (btn) btn.onclick = closeModal;
}

export function substituteOptionLabel(sub) {
  if (!sub) return '';
  return sub.name + (sub.tier ? ' · Tier ' + sub.tier : '');
}
