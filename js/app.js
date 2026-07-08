import { state, loadAll, saveMeta } from './store.js';
import { nextWorkoutId, getWorkoutPlan } from './plan.js';
import { closeModal } from './utils.js';
import { renderHoje, bindHojeEvents } from './ui/hoje.js';
import { renderPlano, bindPlanoEvents } from './ui/plano.js';
import { renderEvolucao, bindEvolucaoEvents } from './ui/evolucao.js';
import { renderHistorico, bindHistoricoEvents } from './ui/historico.js';
import { renderConfig, bindConfigEvents } from './ui/config.js';

function renderAll() {
  renderHoje();
  renderPlano();
  renderEvolucao();
  renderHistorico();
  renderConfig();
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('#nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('screen-' + tab);
  if (screen) screen.classList.add('active');
  if (tab === 'historico') renderHistorico();
  if (tab === 'evolucao') renderEvolucao();
  if (tab === 'config') renderConfig();
  if (tab === 'hoje') renderHoje();
  if (tab === 'plano') renderPlano();
}

function bindNav() {
  document.getElementById('nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    setActiveTab(btn.dataset.tab);
  });
}

function bindModal() {
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function showUpdateBanner(reg) {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.classList.add('show');
  const btn = document.getElementById('update-reload');
  if (!btn) return;
  btn.onclick = () => {
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.update().catch(() => {});

    if (reg.waiting) showUpdateBanner(reg);

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(reg);
        }
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  } catch {
    /* ignore */
  }
}

async function init() {
  await loadAll();
  state.selectedWorkout = nextWorkoutId(state.cfg.lastWorkoutId);
  if (!getWorkoutPlan(state.selectedWorkout) && state.plan.days.length) {
    state.selectedWorkout = state.plan.days[0].id;
  }
  if (state.meta && !state.meta.migratedAt) {
    state.meta.migratedAt = new Date().toISOString();
    await saveMeta();
  }

  const onRenderAll = () => renderAll();

  bindNav();
  bindModal();
  bindHojeEvents(document.getElementById('screen-hoje'), { onRenderAll });
  bindPlanoEvents(document.getElementById('screen-plano'), { onRenderAll });
  bindEvolucaoEvents(document.getElementById('screen-evolucao'));
  bindHistoricoEvents(document.getElementById('screen-historico'));
  bindConfigEvents(document.getElementById('screen-config'), { onRenderAll });

  renderAll();
  setActiveTab(state.activeTab || 'hoje');
  registerSW();
}

init().catch((err) => {
  console.error(err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = '<div class="empty-state" style="padding:40px 20px">Erro ao carregar. Recarregue a página.<br><small>' +
      String(err?.message || err) + '</small></div>';
  }
});
