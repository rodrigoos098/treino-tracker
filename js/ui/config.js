import {
  state, KEYS, savePlan, saveLogs, saveCfg, saveSessions, saveMeta,
  isValidProgram, isValidLogs, idbDelete, getDefaultCfg, DATA_VERSION
} from '../store.js';
import { DEFAULT_PROGRAM } from '../defaults.js';
import { jumpToWeekDay, getWorkoutPlan } from '../plan.js';
import { pageHeader, toast, todayISO } from '../utils.js';
import { backfillPerformedMeta } from '../performed.js';

const BACKUP_REMINDER_DAYS = 7;

export function needsBackupReminder() {
  const last = state.cfg.lastBackupAt;
  if (!last) return true;
  const ms = Date.now() - new Date(last).getTime();
  return ms > BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000;
}

function toggleHtml(id, on, label) {
  return '<div class="toggle-row"><span>' + label + '</span><div class="toggle' +
    (on ? ' on' : '') + '" id="' + id + '" role="switch" aria-checked="' + !!on + '"></div></div>';
}

export function renderConfig() {
  const el = document.getElementById('screen-config');
  const rest = state.cfg.restSeconds || 90;
  const reminder = needsBackupReminder()
    ? '<div class="backup-banner">Backup há mais de 7 dias (ou nunca). Exporte um JSON para não perder o histórico.</div>'
    : '';
  const started = state.cfg.programStartedAt
    ? new Date(state.cfg.programStartedAt).toLocaleDateString('pt-BR')
    : '—';

  el.innerHTML = pageHeader('Configurações', 'Preferências e backup dos dados') +
    reminder +
    '<div class="config-section"><h3>Programa</h3>' +
    '<p class="about-text">BBTS Beginner · Semana ' + (state.cfg.currentWeek || 1) +
    '/12 · Dia: ' + (state.cfg.currentDay || 'upper') +
    '<br>Início: ' + started + '</p></div>' +
    '<div class="config-section"><h3>Aparência</h3>' +
    toggleHtml('toggle-theme', state.cfg.theme === 'light', 'Tema claro') +
    '</div>' +
    '<div class="config-section"><h3>Treino</h3>' +
    '<div class="form-group"><label>Descanso padrão (fallback, segundos)</label>' +
    '<input type="number" id="cfg-rest" min="30" max="600" step="15" value="' + rest + '"></div>' +
    toggleHtml('toggle-vibrate', !!state.cfg.vibrate, 'Vibração no fim do descanso') +
    toggleHtml('toggle-wakelock', !!state.cfg.wakeLock, 'Manter tela ligada na sessão') +
    '</div>' +
    '<div class="config-section"><h3>Dados</h3>' +
    '<p class="about-text">Armazenamento: IndexedDB + localStorage (backup local). Último export: ' +
    (state.cfg.lastBackupAt ? new Date(state.cfg.lastBackupAt).toLocaleString('pt-BR') : 'nunca') +
    '</p>' +
    '<div class="btn-group"><button class="btn btn-secondary btn-block" id="export-backup">Exportar backup</button></div>' +
    '<div class="btn-group"><button class="btn btn-secondary btn-block" id="import-backup">Importar backup</button></div>' +
    '<div class="btn-group"><button class="btn btn-danger btn-block" id="reset-data">Resetar dados</button></div></div>' +
    '<div class="config-section"><h3>Sobre</h3>' +
    '<p class="about-text">Treino Tracker v4 · Bodybuilding Transformation System (Beginner) · Offline-first. Atualizações do PWA não apagam seu histórico.</p></div>';
}

async function exportBackup() {
  const data = {
    version: DATA_VERSION,
    dataVersion: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    plan: state.plan,
    logs: state.logs,
    cfg: state.cfg,
    sessions: state.sessions,
    meta: state.meta
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const filename = 'treino-backup-' + todayISO() + '.json';

  let saved = false;
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      saved = true;
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn(err);
    }
  }

  if (!saved) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  state.cfg.lastBackupAt = new Date().toISOString();
  await saveCfg();
  toast('Backup exportado');
  renderConfig();
}

async function importBackup(file, onRenderAll) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object') throw new Error('invalid');

      if (data.plan !== undefined) {
        if (!isValidProgram(data.plan) || data.plan.id !== 'bbts-beginner-2025') {
          // Always reinstall BBTS; keep logs if valid
          state.plan = structuredClone(DEFAULT_PROGRAM);
          toast('Plano antigo ignorado — programa BBTS reinstado');
        } else {
          state.plan = data.plan;
        }
        await savePlan();
      }
      if (data.logs !== undefined) {
        if (!isValidLogs(data.logs)) {
          toast('Backup inválido: histórico malformado');
          return;
        }
        state.logs = data.logs;
        await saveLogs();
      }
      if (data.cfg !== undefined) {
        if (!data.cfg || typeof data.cfg !== 'object' || Array.isArray(data.cfg)) {
          toast('Backup inválido: config malformada');
          return;
        }
        state.cfg = { ...getDefaultCfg(), ...data.cfg };
        if (!state.cfg.programStartedAt) state.cfg.programStartedAt = new Date().toISOString();
        await saveCfg();
      }
      if (data.sessions !== undefined) {
        if (!Array.isArray(data.sessions)) {
          toast('Backup inválido: sessões malformadas');
          return;
        }
        state.sessions = data.sessions;
        await saveSessions();
      }
      if (data.meta !== undefined && data.meta && typeof data.meta === 'object') {
        state.meta = { ...state.meta, ...data.meta, dataVersion: DATA_VERSION };
        await saveMeta();
      }

      jumpToWeekDay(state.cfg.currentWeek || 1, state.cfg.currentDay || 'upper');
      if (!getWorkoutPlan(state.selectedWorkout)) {
        jumpToWeekDay(1, 'upper');
      }
      if (backfillPerformedMeta(state.logs, state.sessions, state.plan)) {
        await saveLogs();
      }
      state.draftSets = {};
      state.substituteChoice = {};
      onRenderAll();
      toast('Backup importado com sucesso');
    } catch {
      toast('Arquivo inválido');
    }
  };
  reader.readAsText(file);
}

async function resetData(onRenderAll) {
  if (!confirm('Isso apaga histórico e configurações e reinstala o BBTS Beginner. Continuar?')) return;
  for (const key of Object.values(KEYS)) {
    localStorage.removeItem(key);
    await idbDelete(key);
  }
  state.plan = structuredClone(DEFAULT_PROGRAM);
  state.logs = {};
  state.cfg = {
    ...getDefaultCfg(),
    programStartedAt: new Date().toISOString()
  };
  state.sessions = [];
  state.meta = { dataVersion: DATA_VERSION, migratedAt: new Date().toISOString() };
  state.selectedWorkout = 'upper';
  state.browseWeek = 1;
  state.browseDay = 'upper';
  state.draftSets = {};
  state.substituteChoice = {};
  await Promise.all([savePlan(), saveLogs(), saveCfg(), saveSessions(), saveMeta()]);
  onRenderAll();
  toast('Dados resetados · BBTS Beginner');
}

export function bindConfigEvents(root, { onRenderAll }) {
  root.addEventListener('click', async (e) => {
    if (e.target.id === 'toggle-theme') {
      state.cfg.theme = state.cfg.theme === 'dark' ? 'light' : 'dark';
      await saveCfg();
      renderConfig();
      return;
    }
    if (e.target.id === 'toggle-vibrate') {
      state.cfg.vibrate = !state.cfg.vibrate;
      await saveCfg();
      renderConfig();
      return;
    }
    if (e.target.id === 'toggle-wakelock') {
      state.cfg.wakeLock = !state.cfg.wakeLock;
      await saveCfg();
      renderConfig();
      return;
    }
    if (e.target.id === 'export-backup') { await exportBackup(); return; }
    if (e.target.id === 'import-backup') {
      document.getElementById('import-file').click();
      return;
    }
    if (e.target.id === 'reset-data') await resetData(onRenderAll);
  });

  root.addEventListener('change', async (e) => {
    if (e.target.id === 'cfg-rest') {
      const v = Math.max(30, Math.min(600, parseInt(e.target.value, 10) || 90));
      state.cfg.restSeconds = v;
      e.target.value = v;
      await saveCfg();
      toast('Descanso padrão: ' + v + 's');
    }
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0], onRenderAll);
    e.target.value = '';
  });
}
