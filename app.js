// ===== STORAGE ADAPTER =====
// __STORAGE_ADAPTER__ placeholder is replaced at build time:
//  - preview build: in-memory object (chat demo, no persistence)
//  - deploy build: localStorage (real installed PWA)
const Storage = {
  key: "shiftmaster_edu_state_v1",
  _mem: null,
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  save(state) {
    try { localStorage.setItem(this.key, JSON.stringify(state)); }
    catch (e) { /* storage unavailable, continue in-memory only for this session */ }
  }
};

// ===== STATE =====
function defaultState() {
  return {
    courses: JSON.parse(JSON.stringify(SEED_COURSES)),
    progress: {}, // { courseId: { completedModules: [id,...], quizResults: { moduleId: {score, total, perfect, criticalOk} } } }
    xp: 0,
    badges: [],
    lastActiveDate: null,
    streak: 0,
    editMode: false
  };
}

let STATE = Storage.load() || defaultState();
// backfill in case seed grew since last save
SEED_COURSES.forEach(sc => {
  if (!STATE.courses.find(c => c.id === sc.id)) STATE.courses.push(JSON.parse(JSON.stringify(sc)));
});

function persist() { Storage.save(STATE); }

function courseProgress(courseId) {
  if (!STATE.progress[courseId]) STATE.progress[courseId] = { completedModules: [], quizResults: {} };
  return STATE.progress[courseId];
}

function getCourse(id) { return STATE.courses.find(c => c.id === id); }
function getModule(courseId, moduleId) { return getCourse(courseId).modules.find(m => m.id === moduleId); }

function levelForXp(xp) {
  let lvl = 1;
  for (let i = 0; i < LEVELS.length; i++) { if (xp >= LEVELS[i]) lvl = i + 1; }
  return lvl;
}
function xpForNextLevel(xp) {
  const lvl = levelForXp(xp);
  if (lvl >= LEVELS.length) return null;
  return LEVELS[lvl];
}

function touchStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (STATE.lastActiveDate === today) return;
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  STATE.streak = (STATE.lastActiveDate === y) ? STATE.streak + 1 : 1;
  STATE.lastActiveDate = today;
  if (STATE.streak >= 3) awardBadge("streak-3");
  if (STATE.streak >= 7) awardBadge("streak-7");
}

function awardBadge(id) {
  if (!STATE.badges.includes(id)) { STATE.badges.push(id); toast("Новый значок: " + BADGES.find(b => b.id === id).title, "badge"); }
}

function awardXp(n) { STATE.xp += n; }

function completeLesson(courseId, moduleId) {
  touchStreak();
  const p = courseProgress(courseId);
  if (!p.completedModules.includes(moduleId)) { p.completedModules.push(moduleId); awardXp(10); }
  checkCourseDone(courseId);
  persist();
}

function submitQuiz(courseId, moduleId, answers) {
  touchStreak();
  const mod = getModule(courseId, moduleId);
  let correct = 0;
  let criticalOk = true;
  mod.questions.forEach((q, i) => {
    const ok = answers[i] === q.correct;
    if (ok) correct++;
    if (q.critical && !ok) criticalOk = false;
  });
  const total = mod.questions.length;
  const perfect = correct === total;
  const first = !STATE.progress[courseId] || !courseProgress(courseId).quizResults[moduleId];

  const p = courseProgress(courseId);
  p.quizResults[moduleId] = { score: correct, total, perfect, criticalOk };
  if (!p.completedModules.includes(moduleId)) p.completedModules.push(moduleId);

  let xp = correct * 8;
  if (perfect) xp += 20;
  awardXp(xp);

  if (first) awardBadge("first-quiz");
  if (perfect) awardBadge("perfect");
  if (mod.critical && criticalOk) awardBadge("critical-clear");
  checkCourseDone(courseId);
  persist();
  return { score: correct, total, perfect, criticalOk };
}

function checkCourseDone(courseId) {
  const course = getCourse(courseId);
  const p = courseProgress(courseId);
  if (course.modules.every(m => p.completedModules.includes(m.id))) awardBadge("course-done");
}

// ===== TOAST =====
function toast(msg, kind) {
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = msg;
  document.getElementById("toasts").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2600);
}

// ===== ROUTER =====
function currentRoute() {
  const h = location.hash.slice(2) || "courses";
  return h.split("/");
}
window.addEventListener("hashchange", render);

function nav(path) { location.hash = "#/" + path; }

// ===== RENDER ROOT =====
function render() {
  const root = document.getElementById("app");
  const [page, a, b] = currentRoute();
  let html = "";
  if (page === "courses") html = renderCourseList();
  else if (page === "course") html = renderCourseDetail(a);
  else if (page === "lesson") html = renderLesson(a, b);
  else if (page === "quiz") html = renderQuiz(a, b);
  else if (page === "profile") html = renderProfile();
  else html = renderCourseList();

  root.innerHTML = html;
  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  window.scrollTo(0, 0);
  attachHandlers(page, a, b);
}

// ===== SCREENS =====
function renderTopStats() {
  const lvl = levelForXp(STATE.xp);
  const next = xpForNextLevel(STATE.xp);
  const prevThresh = LEVELS[lvl - 1] || 0;
  const pct = next ? Math.round(((STATE.xp - prevThresh) / (next - prevThresh)) * 100) : 100;
  return `
    <div class="topstats">
      <div class="lvl-badge">Ур. ${lvl}</div>
      <div class="xp-bar"><div class="xp-fill" style="width:${pct}%"></div></div>
      <div class="xp-num">${STATE.xp} XP</div>
      <div class="streak">🔥 ${STATE.streak}</div>
    </div>`;
}

function renderCourseList() {
  const cards = STATE.courses.map(c => {
    const p = courseProgress(c.id);
    const total = c.modules.length;
    const done = c.modules.filter(m => p.completedModules.includes(m.id)).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    return `
      <div class="course-card" style="--accent:${c.color}" data-open-course="${c.id}">
        <div class="course-icon">${c.icon}</div>
        <div class="course-info">
          <div class="course-title">${escapeHtml(c.title)}</div>
          <div class="course-sub">${escapeHtml(c.subtitle || "")}</div>
          <div class="course-progress"><div class="course-progress-fill" style="width:${pct}%"></div></div>
          <div class="course-progress-label">${done}/${total} модулей</div>
        </div>
        ${STATE.editMode ? `<button class="icon-btn" data-edit-course="${c.id}">✏️</button>` : `<div class="chev">›</div>`}
      </div>`;
  }).join("");

  return `
    ${renderTopStats()}
    <div class="screen-header">
      <h1>Курсы</h1>
      ${STATE.editMode ? `<button class="btn-ghost" data-add-course>+ Курс</button>` : ""}
    </div>
    <div class="course-list">${cards}</div>
  `;
}

function renderCourseDetail(courseId) {
  const c = getCourse(courseId);
  if (!c) return renderCourseList();
  const p = courseProgress(courseId);
  const stations = c.modules.map((m, i) => {
    const done = p.completedModules.includes(m.id);
    const locked = i > 0 && !p.completedModules.includes(c.modules[i - 1].id) && !STATE.editMode;
    const qr = m.type === "quiz" ? p.quizResults[m.id] : null;
    const critical = m.critical || (m.type === "quiz" && m.questions && m.questions.some(q => q.critical));
    let stateClass = done ? "done" : (locked ? "locked" : "current");
    return `
      <div class="station ${stateClass} ${critical ? "critical" : ""}" ${locked ? "" : `data-open-module="${m.id}"`}>
        <div class="station-dot">${done ? "✓" : (locked ? "🔒" : (m.type === "quiz" ? "?" : "•"))}</div>
        <div class="station-label">
          <div class="station-title">${escapeHtml(m.title)} ${critical ? '<span class="crit-flag">крит.</span>' : ""}</div>
          <div class="station-meta">${m.type === "quiz" ? (qr ? `Результат: ${qr.score}/${qr.total}` : (m.questions.length + " вопр.")) : "Урок"}</div>
        </div>
        ${STATE.editMode ? `<button class="icon-btn" data-edit-module="${courseId}|${m.id}">✏️</button>` : ""}
      </div>`;
  }).join(`<div class="belt-line"></div>`);

  return `
    <div class="screen-header">
      <button class="back-btn" data-back>‹</button>
      <h1>${escapeHtml(c.title)}</h1>
    </div>
    ${STATE.editMode ? `<button class="btn-ghost" data-add-module="${courseId}" style="margin:8px 20px;">+ Модуль</button>` : ""}
    <div class="belt">${stations}</div>
  `;
}

function renderLesson(courseId, moduleId) {
  const m = getModule(courseId, moduleId);
  const paragraphs = m.body.split("\n\n").map(t => `<p>${escapeHtml(t)}</p>`).join("");
  return `
    <div class="screen-header">
      <button class="back-btn" data-back-course="${courseId}">‹</button>
      <h1>${escapeHtml(m.title)}</h1>
    </div>
    <div class="lesson-body">${paragraphs}</div>
    <button class="btn-primary btn-block" data-complete-lesson="${courseId}|${moduleId}">Понятно, продолжить (+10 XP)</button>
  `;
}

function renderQuiz(courseId, moduleId) {
  const m = getModule(courseId, moduleId);
  const qs = m.questions.map((q, i) => `
    <div class="q-block" data-qi="${i}">
      <div class="q-text">${i + 1}. ${escapeHtml(q.q)} ${q.critical ? '<span class="crit-flag">крит.</span>' : ""}</div>
      <div class="q-options">
        ${q.options.map((o, oi) => `<label class="opt"><input type="radio" name="q${i}" value="${oi}"><span>${escapeHtml(o)}</span></label>`).join("")}
      </div>
    </div>`).join("");
  return `
    <div class="screen-header">
      <button class="back-btn" data-back-course="${courseId}">‹</button>
      <h1>${escapeHtml(m.title)}</h1>
    </div>
    <form id="quiz-form">
      ${qs}
      <button type="submit" class="btn-primary btn-block">Проверить ответы</button>
    </form>
  `;
}

function renderProfile() {
  const lvl = levelForXp(STATE.xp);
  const badgeGrid = BADGES.map(b => {
    const got = STATE.badges.includes(b.id);
    return `<div class="badge ${got ? "" : "locked"}"><div class="badge-icon">${b.icon}</div><div class="badge-title">${b.title}</div></div>`;
  }).join("");
  return `
    ${renderTopStats()}
    <div class="screen-header"><h1>Профиль</h1></div>
    <div class="profile-stats">
      <div class="stat"><div class="stat-num">${STATE.xp}</div><div class="stat-label">Опыт (XP)</div></div>
      <div class="stat"><div class="stat-num">${lvl}</div><div class="stat-label">Уровень</div></div>
      <div class="stat"><div class="stat-num">${STATE.streak}</div><div class="stat-label">Дней подряд</div></div>
    </div>
    <h2 class="section-title">Значки</h2>
    <div class="badge-grid">${badgeGrid}</div>
    <h2 class="section-title">Режим редактирования</h2>
    <div class="edit-toggle-row">
      <span>${STATE.editMode ? "Включён — можно редактировать курсы" : "Выключен"}</span>
      <button class="btn-ghost" data-toggle-edit>${STATE.editMode ? "Выключить" : "Включить"}</button>
    </div>
    <button class="btn-ghost btn-block" data-reset style="margin-top:24px;color:var(--danger)">Сбросить прогресс</button>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ===== EVENT HANDLERS =====
function attachHandlers(page) {
  document.querySelectorAll("[data-open-course]").forEach(el =>
    el.addEventListener("click", e => { if (e.target.closest("[data-edit-course]")) return; nav("course/" + el.dataset.openCourse); }));

  document.querySelectorAll("[data-back]").forEach(el => el.addEventListener("click", () => nav("courses")));
  document.querySelectorAll("[data-back-course]").forEach(el => el.addEventListener("click", () => nav("course/" + el.dataset.backCourse)));

  document.querySelectorAll("[data-open-module]").forEach(el => el.addEventListener("click", e => {
    if (e.target.closest("[data-edit-module]")) return;
    const [page0, courseId] = currentRoute();
    const moduleId = el.dataset.openModule;
    const m = getModule(courseId, moduleId);
    nav((m.type === "quiz" ? "quiz/" : "lesson/") + courseId + "/" + moduleId);
  }));

  document.querySelectorAll("[data-complete-lesson]").forEach(el => el.addEventListener("click", () => {
    const [courseId, moduleId] = el.dataset.completeLesson.split("|");
    completeLesson(courseId, moduleId);
    toast("+10 XP", "xp");
    nav("course/" + courseId);
  }));

  const quizForm = document.getElementById("quiz-form");
  if (quizForm) quizForm.addEventListener("submit", e => {
    e.preventDefault();
    const [, courseId, moduleId] = currentRoute();
    const m = getModule(courseId, moduleId);
    const answers = m.questions.map((q, i) => {
      const checked = quizForm.querySelector(`input[name="q${i}"]:checked`);
      return checked ? parseInt(checked.value) : -1;
    });
    if (answers.includes(-1)) { toast("Ответьте на все вопросы", "warn"); return; }
    const result = submitQuiz(courseId, moduleId, answers);
    showQuizResult(courseId, moduleId, result);
  });

  document.querySelectorAll(".navbtn").forEach(el => el.addEventListener("click", () => nav(el.dataset.page)));

  document.querySelectorAll("[data-toggle-edit]").forEach(el => el.addEventListener("click", toggleEditMode));
  document.querySelectorAll("[data-reset]").forEach(el => el.addEventListener("click", () => {
    if (confirm("Сбросить весь прогресс, XP и значки?")) { STATE = defaultState(); persist(); render(); }
  }));

  document.querySelectorAll("[data-add-course]").forEach(el => el.addEventListener("click", openCourseEditor));
  document.querySelectorAll("[data-edit-course]").forEach(el => el.addEventListener("click", e => { e.stopPropagation(); openCourseEditor(el.dataset.editCourse); }));
  document.querySelectorAll("[data-add-module]").forEach(el => el.addEventListener("click", () => openModuleEditor(el.dataset.addModule)));
  document.querySelectorAll("[data-edit-module]").forEach(el => el.addEventListener("click", e => {
    e.stopPropagation();
    const [courseId, moduleId] = el.dataset.editModule.split("|");
    openModuleEditor(courseId, moduleId);
  }));
}

function showQuizResult(courseId, moduleId, r) {
  const modal = document.getElementById("modal");
  const pct = Math.round(r.score / r.total * 100);
  modal.innerHTML = `
    <div class="modal-card">
      <div class="result-emoji">${r.perfect ? "🏆" : r.criticalOk ? "✅" : "⚠️"}</div>
      <h2>${r.perfect ? "Отлично, без ошибок!" : r.criticalOk ? "Тест пройден" : "Есть критические ошибки"}</h2>
      <p>Правильных ответов: ${r.score} из ${r.total} (${pct}%)</p>
      ${!r.criticalOk ? `<p class="warn-text">Ошибка в критическом вопросе (ОТ/ХАССП) — по регламенту требуется отдельный разбор с наставником перед допуском, независимо от процента.</p>` : ""}
      <button class="btn-primary btn-block" data-close-modal>Продолжить</button>
    </div>`;
  modal.classList.add("show");
  modal.querySelector("[data-close-modal]").addEventListener("click", () => {
    modal.classList.remove("show"); modal.innerHTML = "";
    nav("course/" + courseId);
  });
}

function toggleEditMode() {
  if (!STATE.editMode) {
    const pin = prompt("Введите PIN редактора (по умолчанию 1234):");
    if (pin !== "1234") { toast("Неверный PIN", "warn"); return; }
  }
  STATE.editMode = !STATE.editMode;
  persist();
  render();
}

// ===== EDIT MODALS =====
function openCourseEditor(courseId) {
  const c = courseId ? getCourse(courseId) : null;
  const modal = document.getElementById("modal");
  modal.innerHTML = `
    <div class="modal-card">
      <h2>${c ? "Редактировать курс" : "Новый курс"}</h2>
      <label>Название<input id="f-title" value="${c ? escapeHtml(c.title) : ""}"></label>
      <label>Подзаголовок<input id="f-sub" value="${c ? escapeHtml(c.subtitle || "") : ""}"></label>
      <label>Иконка (эмодзи)<input id="f-icon" value="${c ? c.icon : "📘"}"></label>
      <label>Цвет акцента<input id="f-color" type="color" value="${c ? c.color : "#FF6B35"}"></label>
      <div class="modal-actions">
        ${c ? `<button class="btn-ghost" style="color:var(--danger)" data-del-course="${c.id}">Удалить курс</button>` : ""}
        <button class="btn-primary" data-save-course="${c ? c.id : ""}">Сохранить</button>
      </div>
    </div>`;
  modal.classList.add("show");
  modal.querySelector("[data-save-course]").addEventListener("click", () => {
    const title = document.getElementById("f-title").value.trim();
    if (!title) { toast("Укажите название", "warn"); return; }
    if (c) {
      c.title = title; c.subtitle = document.getElementById("f-sub").value.trim();
      c.icon = document.getElementById("f-icon").value.trim() || "📘";
      c.color = document.getElementById("f-color").value;
    } else {
      STATE.courses.push({ id: "c" + Date.now(), title, subtitle: document.getElementById("f-sub").value.trim(), icon: document.getElementById("f-icon").value.trim() || "📘", color: document.getElementById("f-color").value, modules: [] });
    }
    persist(); closeModal(); render();
  });
  const delBtn = modal.querySelector("[data-del-course]");
  if (delBtn) delBtn.addEventListener("click", () => {
    if (confirm("Удалить курс со всеми модулями?")) {
      STATE.courses = STATE.courses.filter(x => x.id !== c.id);
      delete STATE.progress[c.id];
      persist(); closeModal(); nav("courses");
    }
  });
}

function openModuleEditor(courseId, moduleId) {
  const c = getCourse(courseId);
  const m = moduleId ? getModule(courseId, moduleId) : null;
  const modal = document.getElementById("modal");
  const type = m ? m.type : "lesson";
  modal.innerHTML = `
    <div class="modal-card modal-card-wide">
      <h2>${m ? "Редактировать модуль" : "Новый модуль"}</h2>
      <label>Название<input id="f-mtitle" value="${m ? escapeHtml(m.title) : ""}"></label>
      <label>Тип
        <select id="f-mtype">
          <option value="lesson" ${type === "lesson" ? "selected" : ""}>Урок (текст)</option>
          <option value="quiz" ${type === "quiz" ? "selected" : ""}>Тест</option>
        </select>
      </label>
      <div id="f-lesson-fields" style="${type === "lesson" ? "" : "display:none"}">
        <label>Текст урока (абзацы через пустую строку)<textarea id="f-body" rows="6">${m && m.type === "lesson" ? escapeHtml(m.body) : ""}</textarea></label>
      </div>
      <div id="f-quiz-fields" style="${type === "quiz" ? "" : "display:none"}">
        <label>Вопросы (JSON-формат)
          <textarea id="f-questions" rows="8">${m && m.type === "quiz" ? escapeHtml(JSON.stringify(m.questions, null, 2)) : escapeHtml(JSON.stringify([{ q: "Текст вопроса", options: ["Вариант 1", "Вариант 2", "Вариант 3"], correct: 0, critical: false }], null, 2))}</textarea>
        </label>
        <p class="hint">correct — индекс правильного варианта (с 0). critical: true — вопрос по ОТ/ХАССП/стоп-факторам.</p>
      </div>
      <div class="modal-actions">
        ${m ? `<button class="btn-ghost" style="color:var(--danger)" data-del-module="${courseId}|${m.id}">Удалить</button>` : ""}
        <button class="btn-primary" data-save-module="${courseId}|${m ? m.id : ""}">Сохранить</button>
      </div>
    </div>`;
  modal.classList.add("show");

  const typeSel = document.getElementById("f-mtype");
  typeSel.addEventListener("change", () => {
    document.getElementById("f-lesson-fields").style.display = typeSel.value === "lesson" ? "" : "none";
    document.getElementById("f-quiz-fields").style.display = typeSel.value === "quiz" ? "" : "none";
  });

  modal.querySelector("[data-save-module]").addEventListener("click", () => {
    const title = document.getElementById("f-mtitle").value.trim();
    if (!title) { toast("Укажите название", "warn"); return; }
    const mtype = typeSel.value;
    let newMod;
    if (mtype === "lesson") {
      newMod = { id: m ? m.id : "mod" + Date.now(), type: "lesson", title, body: document.getElementById("f-body").value.trim() };
    } else {
      let questions;
      try { questions = JSON.parse(document.getElementById("f-questions").value); }
      catch (e) { toast("Ошибка в JSON вопросов", "warn"); return; }
      newMod = { id: m ? m.id : "mod" + Date.now(), type: "quiz", title, questions };
    }
    if (m) {
      const idx = c.modules.findIndex(x => x.id === m.id);
      c.modules[idx] = newMod;
    } else {
      c.modules.push(newMod);
    }
    persist(); closeModal(); render();
  });

  const delBtn = modal.querySelector("[data-del-module]");
  if (delBtn) delBtn.addEventListener("click", () => {
    if (confirm("Удалить модуль?")) {
      c.modules = c.modules.filter(x => x.id !== m.id);
      persist(); closeModal(); nav("course/" + courseId);
    }
  });
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.remove("show"); modal.innerHTML = "";
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  render();
});
