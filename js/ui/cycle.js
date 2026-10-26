import { state } from '../store.js';
import { esc } from '../utils.js';
import { isDeloadWeek, weeksTotal } from '../plan.js';

export function deloadCardHtml(week) {
  const rule = state.plan?.deload;
  if (!rule) return '';
  const active = isDeloadWeek(week);
  const marked = Number(state.cfg.deloadWeek);
  const btnLabel = active
    ? 'Tirar o deload da semana ' + week
    : 'Marcar a semana ' + week + ' como deload';
  const status = active
    ? '<p class="subtitle"><strong>Semana ' + week + ' é a semana de deload.</strong></p>'
    : (marked
      ? '<p class="subtitle">Deload marcado na semana ' + marked + '.</p>'
      : '');
  return '<div class="card cycle-card">' +
    '<div class="card-title">Deload</div>' +
    '<p class="subtitle">' + esc(rule.when) + '. O caderno não fixa o número da semana.</p>' +
    '<p class="subtitle">Nessa semana: ' + esc(rule.sets) + ' e ' + esc(rule.effort) + '. ' + esc(rule.load) + '.</p>' +
    status +
    '<button type="button" class="btn btn-secondary btn-block" data-action="toggle-deload" data-week="' + week + '">' +
      esc(btnLabel) + '</button>' +
    '</div>';
}

export function restartCardHtml() {
  if (!state.cfg.awaitingCycleRestart) return '';
  return '<div class="card cycle-card">' +
    '<div class="card-title">Fim do ciclo</div>' +
    '<p class="subtitle">A semana ' + weeksTotal() + ' terminou. O próximo passo é recomeçar o bloco, se você quiser.</p>' +
    '<button type="button" class="btn btn-primary btn-block" data-action="restart-cycle">Voltar para a semana 1</button>' +
    '</div>';
}
