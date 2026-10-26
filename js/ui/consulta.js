import { pageHeader } from '../utils.js';

export function renderConsulta() {
  const el = document.getElementById('screen-consulta');
  if (!el || el.dataset.ready === '1') return;
  el.dataset.ready = '1';
  el.innerHTML = pageHeader('Consulta', 'Caderno completo do plano, no documento original') +
    '<iframe class="consulta-frame" title="Caderno anual do plano de treino" src="./consulta/plano-treino.html"></iframe>';
}
