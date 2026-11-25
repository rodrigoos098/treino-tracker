import { weeksTotal } from '../plan.js';
import { state } from '../store.js';

export function restartCardHtml() {
  if (!state.cfg.awaitingCycleRestart) return '';
  return '<div class="card cycle-card">' +
    '<div class="card-title">Fim do ciclo</div>' +
    '<p class="subtitle">A semana ' + weeksTotal() + ' terminou. O próximo passo é recomeçar o bloco, se você quiser.</p>' +
    '<button type="button" class="btn btn-primary btn-block" data-action="restart-cycle">Voltar para a semana 1</button>' +
    '</div>';
}
