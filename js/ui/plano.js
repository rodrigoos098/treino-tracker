import { state, savePlan, saveCfg } from '../store.js';
import {
  findDay, getDraftKey, syncDraftLength, moveDay, moveExercise,
  nextWorkoutId, shortWorkoutName
} from '../plan.js';
import { esc, escAttr, pageHeader, toast, openModal, closeModal } from '../utils.js';

export function renderPlano() {
  const el = document.getElementById('screen-plano');
  let html = pageHeader('Plano', 'Edite treinos, exercícios, séries e repetições');

  state.plan.days.forEach((day, dayIdx) => {
    html += '<div class="plan-day" data-day-id="' + day.id + '">';
    html += '<div class="plan-day-header"><div class="plan-day-title">' + esc(day.name) + '</div>' +
      '<div class="plan-day-actions">' +
      '<button class="icon-btn" data-action="plan-up" data-day="' + day.id + '" ' + (dayIdx === 0 ? 'disabled' : '') + ' title="Subir plano">↑</button>' +
      '<button class="icon-btn" data-action="plan-down" data-day="' + day.id + '" ' + (dayIdx === state.plan.days.length - 1 ? 'disabled' : '') + ' title="Descer plano">↓</button>' +
      '<button class="icon-btn" data-action="plan-edit" data-day="' + day.id + '" title="Editar plano">✎</button>' +
      '<button class="icon-btn" data-action="plan-del" data-day="' + day.id + '" title="Remover plano">×</button>' +
      '</div></div>';
    html += '<div class="plan-day-meta">' + day.exercises.length + ' exercícios · ordem ' + (dayIdx + 1) + '</div>';
    day.exercises.forEach((ex, idx) => {
      html += '<div class="exercise-item" data-day="' + day.id + '" data-ex="' + ex.id + '">' +
        '<div class="exercise-info"><div class="exercise-name">' + esc(ex.name) + '</div>' +
        '<div class="exercise-meta">' + ex.sets + ' séries · ' + ex.reps + ' reps' +
        (ex.alternatives?.length ? ' · ' + ex.alternatives.length + ' alternativas' : '') + '</div></div>' +
        '<div class="exercise-actions">' +
        '<button class="icon-btn" data-action="up" data-day="' + day.id + '" data-ex="' + ex.id + '" ' + (idx === 0 ? 'disabled' : '') + ' title="Subir">↑</button>' +
        '<button class="icon-btn" data-action="down" data-day="' + day.id + '" data-ex="' + ex.id + '" ' + (idx === day.exercises.length - 1 ? 'disabled' : '') + ' title="Descer">↓</button>' +
        '<button class="icon-btn" data-action="alt" data-day="' + day.id + '" data-ex="' + ex.id + '" title="Alternativas">↔</button>' +
        '<button class="icon-btn" data-action="edit" data-day="' + day.id + '" data-ex="' + ex.id + '" title="Editar">✎</button>' +
        '<button class="icon-btn" data-action="del" data-day="' + day.id + '" data-ex="' + ex.id + '" title="Remover">×</button>' +
        '</div></div>';
    });
    html += '<button class="btn btn-secondary btn-sm btn-block" data-action="add" data-day="' + day.id + '" style="margin-top:12px">Adicionar exercício</button>';
    html += '</div>';
  });
  html += '<button class="btn btn-primary btn-block" data-action="plan-add" style="margin-top:8px">Adicionar plano</button>';
  el.innerHTML = html;
}

function showEditExercise(dayId, exId, onRender) {
  const day = findDay(dayId);
  const ex = day?.exercises.find(e => e.id === exId);
  if (!ex) return;
  openModal('<h3>Editar exercício</h3>' +
    '<div class="form-group"><label>Nome</label><input id="edit-name" value="' + escAttr(ex.name) + '"></div>' +
    '<div class="form-group"><label>Séries</label><input type="number" id="edit-sets" min="1" max="10" value="' + ex.sets + '"></div>' +
    '<div class="form-group"><label>Repetições (ex: 8-12)</label><input id="edit-reps" value="' + escAttr(ex.reps) + '"></div>' +
    '<div class="form-group"><label>Alternativas (uma por linha)</label><textarea id="edit-alts" rows="4">' + esc((ex.alternatives || []).join('\n')) + '</textarea></div>' +
    '<div class="btn-group"><button class="btn btn-primary" id="edit-save">Salvar</button><button class="btn btn-secondary" id="edit-cancel">Cancelar</button></div>');
  document.getElementById('edit-save').onclick = async () => {
    const oldSets = ex.sets;
    ex.name = document.getElementById('edit-name').value.trim() || ex.name;
    ex.sets = Math.max(1, parseInt(document.getElementById('edit-sets').value, 10) || ex.sets);
    ex.reps = document.getElementById('edit-reps').value.trim() || ex.reps;
    ex.alternatives = document.getElementById('edit-alts').value.split('\n').map(s => s.trim()).filter(Boolean);
    const draftKey = getDraftKey(dayId, exId);
    if (state.draftSets[draftKey] && ex.sets !== oldSets) {
      syncDraftLength(state.draftSets[draftKey], ex.sets, ex.bodyweight);
    }
    await savePlan();
    closeModal();
    onRender();
    toast('Exercício atualizado');
  };
  document.getElementById('edit-cancel').onclick = closeModal;
}

function showAlternatives(dayId, exId, onRender) {
  const day = findDay(dayId);
  const ex = day?.exercises.find(e => e.id === exId);
  if (!ex || !ex.alternatives?.length) {
    toast('Sem alternativas cadastradas');
    return;
  }
  openModal('<h3>Substituir por alternativa</h3><p class="subtitle" style="margin-bottom:14px">Atual: ' + esc(ex.name) + '</p>' +
    '<ul class="alt-list">' + ex.alternatives.map(alt =>
      '<li data-alt="' + escAttr(alt) + '">' + esc(alt) + '</li>'
    ).join('') + '</ul>' +
    '<button class="btn btn-secondary btn-block" id="alt-cancel" style="margin-top:12px">Cancelar</button>');
  document.querySelectorAll('.alt-list li').forEach(li => {
    li.onclick = async () => {
      ex.name = li.dataset.alt;
      await savePlan();
      closeModal();
      onRender();
      toast('Exercício substituído');
    };
  });
  document.getElementById('alt-cancel').onclick = closeModal;
}

function showAddExercise(dayId, onRender) {
  openModal('<h3>Adicionar exercício</h3>' +
    '<div class="form-group"><label>Nome</label><input id="add-name" placeholder="Nome do exercício"></div>' +
    '<div class="form-group"><label>Séries</label><input type="number" id="add-sets" min="1" value="3"></div>' +
    '<div class="form-group"><label>Repetições</label><input id="add-reps" value="8-12"></div>' +
    '<div class="btn-group"><button class="btn btn-primary" id="add-save">Adicionar</button><button class="btn btn-secondary" id="add-cancel">Cancelar</button></div>');
  document.getElementById('add-save').onclick = async () => {
    const name = document.getElementById('add-name').value.trim();
    if (!name) { toast('Informe o nome'); return; }
    const day = findDay(dayId);
    day.exercises.push({
      id: 'custom-' + Date.now(),
      name,
      sets: Math.max(1, parseInt(document.getElementById('add-sets').value, 10) || 3),
      reps: document.getElementById('add-reps').value.trim() || '8-12',
      alternatives: []
    });
    await savePlan();
    closeModal();
    onRender();
    toast('Exercício adicionado');
  };
  document.getElementById('add-cancel').onclick = closeModal;
}

function showAddPlan(onRender) {
  openModal('<h3>Adicionar plano</h3>' +
    '<div class="form-group"><label>Nome</label><input id="plan-name" placeholder="Ex: Full Body"></div>' +
    '<div class="form-group"><label>Nome curto (opcional)</label><input id="plan-short" placeholder="Ex: Full"></div>' +
    '<div class="btn-group"><button class="btn btn-primary" id="plan-save">Criar plano</button><button class="btn btn-secondary" id="plan-cancel">Cancelar</button></div>');
  document.getElementById('plan-save').onclick = async () => {
    const name = document.getElementById('plan-name').value.trim();
    if (!name) { toast('Informe o nome do plano'); return; }
    const short = document.getElementById('plan-short').value.trim() || name.split(' ')[0];
    const id = 'plan-' + Date.now();
    state.plan.days.push({ id, name, short, exercises: [] });
    await savePlan();
    if (!state.selectedWorkout) state.selectedWorkout = id;
    closeModal();
    onRender();
    toast('Plano criado');
  };
  document.getElementById('plan-cancel').onclick = closeModal;
}

function showEditPlan(dayId, onRender) {
  const day = findDay(dayId);
  if (!day) return;
  openModal('<h3>Editar plano</h3>' +
    '<div class="form-group"><label>Nome</label><input id="plan-name" value="' + escAttr(day.name) + '"></div>' +
    '<div class="form-group"><label>Nome curto</label><input id="plan-short" value="' + escAttr(day.short || shortWorkoutName(day)) + '"></div>' +
    '<div class="btn-group"><button class="btn btn-primary" id="plan-save">Salvar</button><button class="btn btn-secondary" id="plan-cancel">Cancelar</button></div>');
  document.getElementById('plan-save').onclick = async () => {
    day.name = document.getElementById('plan-name').value.trim() || day.name;
    day.short = document.getElementById('plan-short').value.trim() || day.name.split(' ')[0];
    await savePlan();
    closeModal();
    onRender();
    toast('Plano atualizado');
  };
  document.getElementById('plan-cancel').onclick = closeModal;
}

async function deletePlan(dayId, onRender) {
  if (state.plan.days.length <= 1) {
    toast('Mantenha pelo menos 1 plano');
    return;
  }
  const day = findDay(dayId);
  if (!day) return;
  if (!confirm('Remover o plano "' + day.name + '"?')) return;
  state.plan.days = state.plan.days.filter(d => d.id !== dayId);
  Object.keys(state.draftSets).forEach(key => {
    if (key.startsWith(dayId + '::')) delete state.draftSets[key];
  });
  if (state.cfg.lastWorkoutId === dayId) {
    state.cfg.lastWorkoutId = null;
    await saveCfg();
  }
  if (state.selectedWorkout === dayId) {
    state.selectedWorkout = nextWorkoutId(state.cfg.lastWorkoutId);
  }
  await savePlan();
  onRender();
  toast('Plano removido');
}

async function deleteExercise(dayId, exId, onRender) {
  if (!confirm('Remover este exercício do plano?')) return;
  const day = findDay(dayId);
  day.exercises = day.exercises.filter(e => e.id !== exId);
  delete state.draftSets[getDraftKey(dayId, exId)];
  await savePlan();
  onRender();
  toast('Exercício removido');
}

export function bindPlanoEvents(root, { onRenderAll }) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, day, ex } = btn.dataset;
    if (action === 'edit') showEditExercise(day, ex, onRenderAll);
    else if (action === 'alt') showAlternatives(day, ex, onRenderAll);
    else if (action === 'add') showAddExercise(day, onRenderAll);
    else if (action === 'del') await deleteExercise(day, ex, onRenderAll);
    else if (action === 'up') {
      if (moveExercise(day, ex, -1)) { await savePlan(); onRenderAll(); }
    } else if (action === 'down') {
      if (moveExercise(day, ex, 1)) { await savePlan(); onRenderAll(); }
    } else if (action === 'plan-add') showAddPlan(onRenderAll);
    else if (action === 'plan-edit') showEditPlan(day, onRenderAll);
    else if (action === 'plan-del') await deletePlan(day, onRenderAll);
    else if (action === 'plan-up') {
      if (moveDay(day, -1)) { await savePlan(); onRenderAll(); }
    } else if (action === 'plan-down') {
      if (moveDay(day, 1)) { await savePlan(); onRenderAll(); }
    }
  });
}
