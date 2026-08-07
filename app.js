// ===== STORAGE ADAPTER (локальный кэш на устройстве) =====
const Storage = {
  key: "shiftmaster_edu_state_v2",
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
    userId: null,
    userName: null,
    courses: JSON.parse(JSON.stringify(SEED_COURSES)),
    portal: JSON.parse(JSON.stringify(SEED_PORTAL)),
    progress: {},
    xp: 0,
    badges: [],
    lastActiveDate: null,
    streak: 0,
    editMode: false
  };
}

let STATE = Storage.load() || defaultState();
SEED_COURSES.forEach(sc => {
  if (!STATE.courses.find(c => c.id === sc.id)) STATE.courses.push(JSON.parse(JSON.stringify(sc)));
});
if (!STATE.portal) STATE.portal = JSON.parse(JSON.stringify(SEED_PORTAL));

function persist() {
  Storage.save(STATE);
  if (cloudReady && STATE.userId) {
    cloudSaveUser(STATE.userId, {
      name: STATE.userName,
      xp: STATE.xp,
      badges: STATE.badges,
      streak: STATE.streak,
      lastActiveDate: STATE.lastActiveDate,
      progress: STATE.progress
    });
  }
}

function persistContent() {
  Storage.save(STATE);
  if (cloudReady && STATE.editMode) {
    cloudSaveContent(STATE.courses);
    cloudSavePortal(STATE.portal);
  }
}

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
  p.quizResults[moduleId] = { score: correct, total, perfect, criticalOk, at: Date.now() };
  if (!p.completedModules.includes(moduleId)) p.completedModules.push(moduleId);

  let xp = correct * 8;
  if (perfect) xp += 20;
  awardXp(xp);

  if (first) awardBadge("first-quiz");
  if (perfect) awardBadge("perfect");
  if (mod.critical && criticalOk) awardBadge("critical-clear");
  checkCourseDone(courseId);
  persist();

  if (mod.isFinalExam) sendExamToSheets(courseId, moduleId, { score: correct, total, perfect, criticalOk });

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
  if (!STATE.userId) { renderOnboarding(); return; }
  const root = document.getElementById("app");
  const [page, a, b] = currentRoute();
  let html = "";
  if (page === "courses") html = renderCourseList();
  else if (page === "course") html = renderCourseDetail(a);
  else if (page === "lesson") html = renderLesson(a, b);
  else if (page === "quiz") html = renderQuiz(a, b);
  else if (page === "portal") html = renderPortalList();
  else if (page === "article") html = renderArticle(a);
  else if (page === "profile") html = renderProfile();
  else if (page === "admin") html = renderAdminLoading();
  else html = renderCourseList();

  root.innerHTML = html;
  document.getElementById("bottomnav").style.display = "flex";
  document.querySelectorAll(".navbtn").forEach(btn => btn.classList.toggle("active", btn.dataset.page === page));
  const adminBtn = document.querySelector('.navbtn[data-page="admin"]');
  if (adminBtn) adminBtn.style.display = STATE.editMode ? "flex" : "none";
  window.scrollTo(0, 0);
  attachHandlers(page, a, b);

  if (page === "admin") loadAndRenderAdmin();
}

// ===== ONBOARDING (первый запуск — имя пользователя) =====
function renderOnboarding() {
  const root = document.getElementById("app");
  document.getElementById("bottomnav").style.display = "none";
  root.innerHTML = `
    <div class="onboard">
      <div class="onboard-emoji">🍕</div>
      <h1>Смена+</h1>
      <p class="onboard-sub">Обучение с геймификацией. Прежде чем начать — как вас зовут? Это нужно, чтобы наставник видел ваш прогресс.</p>
      <input id="f-username" placeholder="Имя и фамилия" class="onboard-input">
      <button class="btn-primary btn-block" data-start>Начать обучение</button>
    </div>`;
  document.getElementById("f-username").focus();
  const go = () => {
    const name = document.getElementById("f-username").value.trim();
    if (!name) { toast("Введите имя", "warn"); return; }
    STATE.userId = "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    STATE.userName = name;
    persist();
    syncFromCloud().then(render);
  };
  document.querySelector("[data-start]").addEventListener("click", go);
  document.getElementById("f-username").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
}

// ===== CLOUD SYNC ON LOAD =====
async function syncFromCloud() {
  if (!cloudReady) return;
  try {
    const [cloudCourses, cloudPortal, cloudUser] = await Promise.all([
      cloudLoadContent(),
      cloudLoadPortal(),
      STATE.userId ? cloudLoadUser(STATE.userId) : null
    ]);
    if (cloudCourses && cloudCourses.length) STATE.courses = cloudCourses;
    else cloudSaveContent(STATE.courses);

    if (cloudPortal && cloudPortal.length) STATE.portal = cloudPortal;
    else cloudSavePortal(STATE.portal);

    if (cloudUser) {
      STATE.xp = cloudUser.xp ?? STATE.xp;
      STATE.badges = cloudUser.badges ?? STATE.badges;
      STATE.streak = cloudUser.streak ?? STATE.streak;
      STATE.lastActiveDate = cloudUser.lastActiveDate ?? STATE.lastActiveDate;
      STATE.progress = cloudUser.progress ?? STATE.progress;
      if (cloudUser.name) STATE.userName = cloudUser.name;
    }
    Storage.save(STATE);
  } catch (e) { console.warn("syncFromCloud failed:", e); }
}

// ===== SCREENS: курсы =====
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
    <div class="hello-row">Здравствуйте, ${escapeHtml(STATE.userName)}${cloudReady ? '<span class="sync-dot" title="Синхронизировано">●</span>' : ""}</div>
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
          <div class="station-title">${escapeHtml(m.title)} ${critical ? '<span class="crit-flag">крит.</span>' : ""} ${m.isFinalExam ? '<span class="crit-flag" style="background:rgba(255,107,53,.15);color:var(--accent)">экзамен</span>' : ""}</div>
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
    ${m.isFinalExam ? `<div class="demo-banner">Итоговый экзамен: проходной балл 85%, критические вопросы (ОТ/ХАССП/стоп-факторы) — только 100%. Результат передаётся наставнику.</div>` : ""}
    <form id="quiz-form">
      ${qs}
      <button type="submit" class="btn-primary btn-block">Проверить ответы</button>
    </form>
  `;
}

// ===== SCREENS: информационный портал =====
function renderPortalList() {
  const cats = {};
  STATE.portal.forEach(a => { (cats[a.category] = cats[a.category] || []).push(a); });
  const blocks = Object.keys(cats).map(cat => `
    <h2 class="section-title">${escapeHtml(cat)}</h2>
    <div class="course-list">
      ${cats[cat].map(a => `
        <div class="course-card portal-card" data-open-article="${a.id}">
          <div class="course-icon">${a.icon || "📄"}</div>
          <div class="course-info">
            <div class="course-title">${escapeHtml(a.title)}</div>
            <div class="course-sub">${escapeHtml(a.summary || "")}</div>
          </div>
          ${STATE.editMode ? `<button class="icon-btn" data-edit-article="${a.id}">✏️</button>` : `<div class="chev">›</div>`}
        </div>`).join("")}
    </div>
  `).join("");
  return `
    <div class="screen-header">
      <h1>Портал</h1>
      ${STATE.editMode ? `<button class="btn-ghost" data-add-article>+ Материал</button>` : ""}
    </div>
    <p class="hint" style="text-align:left;margin-bottom:6px;">Справочные материалы, чек-листы и регламенты — не курсы, а быстрый поиск нужной информации.</p>
    ${blocks || `<p class="hint">Материалов пока нет.</p>`}
  `;
}

function renderArticle(articleId) {
  const a = STATE.portal.find(x => x.id === articleId);
  if (!a) return renderPortalList();
  const paragraphs = a.body.split("\n\n").map(t => {
    if (t.startsWith("- ")) {
      return "<ul>" + t.split("\n").map(li => `<li>${escapeHtml(li.replace(/^- /, ""))}</li>`).join("") + "</ul>";
    }
    return `<p>${escapeHtml(t)}</p>`;
  }).join("");
  return `
    <div class="screen-header">
      <button class="back-btn" data-back-portal>‹</button>
      <h1>${escapeHtml(a.title)}</h1>
    </div>
    <div class="lesson-body">${paragraphs}</div>
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
    <div class="hello-row">${escapeHtml(STATE.userName)} · ${cloudReady ? "прогресс синхронизирован" : "локальный режим (без общего облака)"}</div>
    <div class="profile-stats">
      <div class="stat"><div class="stat-num">${STATE.xp}</div><div class="stat-label">Опыт (XP)</div></div>
      <div class="stat"><div class="stat-num">${lvl}</div><div class="stat-label">Уровень</div></div>
      <div class="stat"><div class="stat-num">${STATE.streak}</div><div class="stat-label">Дней подряд</div></div>
    </div>
    <h2 class="section-title">Значки</h2>
    <div class="badge-grid">${badgeGrid}</div>
    <h2 class="section-title">Режим администратора</h2>
    <div class="edit-toggle-row">
      <span>${STATE.editMode ? ("Включён" + (currentAdmin ? " — вход как " + escapeHtml(currentAdmin.email) : " (локально, без входа)")) : "Выключен"}</span>
      <button class="btn-ghost" data-toggle-edit>${STATE.editMode ? "Выключить" : "Включить"}</button>
    </div>
    ${!cloudReady || !authReady ? `<p class="hint" style="text-align:left;margin-top:8px;">Вход администратора не настроен — используется временный PIN-код. Для защищённого входа по email настройте Firebase Authentication (см. README).</p>` : ""}
    ${STATE.editMode ? `<button class="btn-ghost btn-block" data-goto-admin style="margin-top:10px;">📊 Прогресс всех пользователей</button>` : ""}
    <button class="btn-ghost btn-block" data-reset style="margin-top:24px;color:var(--danger)">Сбросить мой прогресс</button>
    <button class="btn-ghost btn-block" data-logout-user style="margin-top:10px;">🚪 Выйти из профиля (сменить пользователя)</button>
  `;
}

// ===== ADMIN: прогресс всех пользователей =====
function renderAdminLoading() {
  return `
    <div class="screen-header">
      <button class="back-btn" data-back>‹</button>
      <h1>Прогресс пользователей</h1>
    </div>
    <div id="admin-body"><p class="hint">Загрузка…</p></div>
  `;
}

async function loadAndRenderAdmin() {
  const body = document.getElementById("admin-body");
  if (!body) return;
  if (!cloudReady) {
    body.innerHTML = `<p class="hint">Облако не подключено, поэтому видно только это устройство.<br><br>Чтобы видеть прогресс всех пользователей, настройте Firebase — см. README_установка.md.</p>`;
    return;
  }
  const users = await cloudLoadAllUsers();
  if (!users.length) { body.innerHTML = `<p class="hint">Пока никто не начал обучение.</p>`; return; }

  users.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const rows = users.map(u => {
    const lvl = levelForXp(u.xp || 0);
    const courseSummaries = STATE.courses.map(c => {
      const p = (u.progress && u.progress[c.id]) || { completedModules: [] };
      const done = c.modules.filter(m => p.completedModules.includes(m.id)).length;
      return `${escapeHtml(c.icon)} ${done}/${c.modules.length}`;
    }).join(" · ");
    const lastSeen = u.updatedAt ? new Date(u.updatedAt).toLocaleString("ru-RU") : "—";
    return `
      <div class="admin-user-card" data-user-detail="${u.id}">
        <div class="admin-user-top">
          <span class="admin-user-name">${escapeHtml(u.name || "Без имени")}</span>
          <span class="lvl-badge small">Ур. ${lvl}</span>
        </div>
        <div class="admin-user-meta">${courseSummaries}</div>
        <div class="admin-user-meta dim">${u.xp || 0} XP · 🔥 ${u.streak || 0} · значков: ${(u.badges || []).length} · был(а): ${lastSeen}</div>
      </div>`;
  }).join("");

  body.innerHTML = `<div class="admin-list">${rows}</div>`;
  document.querySelectorAll("[data-user-detail]").forEach(el => el.addEventListener("click", () => {
    const u = users.find(x => x.id === el.dataset.userDetail);
    showUserDetail(u);
  }));
}

function showUserDetail(u) {
  const modal = document.getElementById("modal");
  const courseBlocks = STATE.courses.map(c => {
    const p = (u.progress && u.progress[c.id]) || { completedModules: [], quizResults: {} };
    const moduleRows = c.modules.map(m => {
      const done = p.completedModules.includes(m.id);
      const qr = m.type === "quiz" ? p.quizResults[m.id] : null;
      let status = done ? "✓" : "—";
      let detail = "";
      if (qr) detail = `${qr.score}/${qr.total}${qr.criticalOk === false ? " ⚠️ критич. ошибка" : ""}`;
      return `<div class="admin-mod-row"><span>${status} ${escapeHtml(m.title)}</span><span class="dim">${detail}</span></div>`;
    }).join("");
    return `<div class="admin-course-block"><div class="admin-course-title">${c.icon} ${escapeHtml(c.title)}</div>${moduleRows}</div>`;
  }).join("");

  modal.innerHTML = `
    <div class="modal-card modal-card-wide">
      <h2>${escapeHtml(u.name || "Без имени")}</h2>
      <p class="hint" style="text-align:left;margin-bottom:14px;">XP: ${u.xp || 0} · Уровень: ${levelForXp(u.xp || 0)} · Серия: ${u.streak || 0} дн. · Значков: ${(u.badges || []).length}</p>
      ${courseBlocks}
      <div class="modal-actions" style="margin-top:14px;">
        <button class="btn-ghost" data-export-user="${u.id}">📤 Выгрузить в Таблицу</button>
        <button class="btn-primary" data-close-modal>Закрыть</button>
      </div>
    </div>`;
  modal.classList.add("show");
  modal.querySelector("[data-close-modal]").addEventListener("click", closeModal);
  modal.querySelector("[data-export-user]").addEventListener("click", () => exportUserToSheets(u));
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
  document.querySelectorAll("[data-back-portal]").forEach(el => el.addEventListener("click", () => nav("portal")));

  document.querySelectorAll("[data-open-module]").forEach(el => el.addEventListener("click", e => {
    if (e.target.closest("[data-edit-module]")) return;
    const [, courseId] = currentRoute();
    const moduleId = el.dataset.openModule;
    const m = getModule(courseId, moduleId);
    nav((m.type === "quiz" ? "quiz/" : "lesson/") + courseId + "/" + moduleId);
  }));

  document.querySelectorAll("[data-open-article]").forEach(el => el.addEventListener("click", e => {
    if (e.target.closest("[data-edit-article]")) return;
    nav("article/" + el.dataset.openArticle);
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
  document.querySelectorAll("[data-goto-admin]").forEach(el => el.addEventListener("click", () => nav("admin")));
  document.querySelectorAll("[data-reset]").forEach(el => el.addEventListener("click", () => {
    if (confirm("Сбросить ваш прогресс, XP и значки? (Курсы и портал останутся)")) {
      const keepName = STATE.userName, keepId = STATE.userId, keepCourses = STATE.courses, keepPortal = STATE.portal;
      STATE = defaultState();
      STATE.userName = keepName; STATE.userId = keepId; STATE.courses = keepCourses; STATE.portal = keepPortal;
      persist(); render();
    }
  }));

  document.querySelectorAll("[data-logout-user]").forEach(el => el.addEventListener("click", logoutUser));

  document.querySelectorAll("[data-add-course]").forEach(el => el.addEventListener("click", () => openCourseEditor()));
  document.querySelectorAll("[data-edit-course]").forEach(el => el.addEventListener("click", e => { e.stopPropagation(); openCourseEditor(el.dataset.editCourse); }));
  document.querySelectorAll("[data-add-module]").forEach(el => el.addEventListener("click", () => openModuleEditor(el.dataset.addModule)));
  document.querySelectorAll("[data-edit-module]").forEach(el => el.addEventListener("click", e => {
    e.stopPropagation();
    const [courseId, moduleId] = el.dataset.editModule.split("|");
    openModuleEditor(courseId, moduleId);
  }));

  document.querySelectorAll("[data-add-article]").forEach(el => el.addEventListener("click", () => openArticleEditor()));
  document.querySelectorAll("[data-edit-article]").forEach(el => el.addEventListener("click", e => { e.stopPropagation(); openArticleEditor(el.dataset.editArticle); }));
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

function logoutUser() {
  const msg = cloudReady
    ? "Выйти из профиля? Ваш прогресс сохранён в облаке под именем «" + STATE.userName + "» и виден администратору. На этом устройстве откроется экран входа для нового пользователя."
    : "Выйти из профиля? Прогресс на этом устройстве без облака не связан с именем — при следующем входе под тем же именем начнётся заново.";
  if (!confirm(msg)) return;
  if (authReady && currentAdmin) adminSignOut();
  const keepCourses = STATE.courses, keepPortal = STATE.portal;
  STATE = defaultState();
  STATE.courses = keepCourses; STATE.portal = keepPortal;
  Storage.save(STATE);
  render();
}

function toggleEditMode() {
  if (STATE.editMode) {
    // выключение: если вошли через Firebase — полноценный выход, иначе просто снимаем локальный флаг
    if (authReady && currentAdmin) { adminSignOut(); }
    STATE.editMode = false;
    persist(); render();
    return;
  }
  if (cloudReady && authReady) {
    openAdminLogin();
  } else {
    // облако/вход не настроены — временный локальный PIN (см. предупреждение в профиле)
    const pin = prompt("Вход администратора не настроен (см. README). Временный PIN (по умолчанию 1234):");
    if (pin !== "1234") { toast("Неверный PIN", "warn"); return; }
    STATE.editMode = true;
    persist(); render();
  }
}

function openAdminLogin() {
  const modal = document.getElementById("modal");
  modal.innerHTML = `
    <div class="modal-card">
      <h2>Вход администратора</h2>
      <label>Email<input id="f-admin-email" type="email" autocomplete="username"></label>
      <label>Пароль<input id="f-admin-pass" type="password" autocomplete="current-password"></label>
      <p class="hint" id="admin-login-error" style="color:var(--danger);text-align:left;"></p>
      <div class="modal-actions">
        <button class="btn-ghost" data-close-modal>Отмена</button>
        <button class="btn-primary" data-do-admin-login>Войти</button>
      </div>
    </div>`;
  modal.classList.add("show");
  modal.querySelector("[data-close-modal]").addEventListener("click", closeModal);
  const go = async () => {
    const email = document.getElementById("f-admin-email").value.trim();
    const pass = document.getElementById("f-admin-pass").value;
    const errEl = document.getElementById("admin-login-error");
    if (!email || !pass) { errEl.textContent = "Заполните email и пароль"; return; }
    errEl.textContent = "Проверка…";
    const res = await adminSignIn(email, pass);
    if (!res.ok) { errEl.textContent = res.error; return; }
    closeModal();
    // STATE.editMode проставится автоматически через onAdminAuthChange
  };
  modal.querySelector("[data-do-admin-login]").addEventListener("click", go);
  modal.querySelector("#f-admin-pass").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
}

// Вызывается из cloud.js при изменении статуса входа Firebase Auth
function onAdminAuthChange(user) {
  const wasEdit = STATE.editMode;
  STATE.editMode = !!user;
  if (STATE.editMode !== wasEdit) {
    persist();
    if (document.getElementById("app")) render();
    if (user) toast("Вход выполнен: " + user.email, "badge");
  }
}

// ===== EDIT MODALS: курсы и модули =====
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
    persistContent(); closeModal(); render();
  });
  const delBtn = modal.querySelector("[data-del-course]");
  if (delBtn) delBtn.addEventListener("click", () => {
    if (confirm("Удалить курс со всеми модулями?")) {
      STATE.courses = STATE.courses.filter(x => x.id !== c.id);
      delete STATE.progress[c.id];
      persistContent(); closeModal(); nav("courses");
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
      <label><input type="checkbox" id="f-final-exam" ${m && m.isFinalExam ? "checked" : ""} style="width:auto;display:inline-block;margin-right:6px;">Это итоговый экзамен (результат уходит в Таблицу)</label>
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
    const isFinalExam = document.getElementById("f-final-exam").checked;
    let newMod;
    if (mtype === "lesson") {
      newMod = { id: m ? m.id : "mod" + Date.now(), type: "lesson", title, body: document.getElementById("f-body").value.trim(), isFinalExam };
    } else {
      let questions;
      try { questions = JSON.parse(document.getElementById("f-questions").value); }
      catch (e) { toast("Ошибка в JSON вопросов", "warn"); return; }
      newMod = { id: m ? m.id : "mod" + Date.now(), type: "quiz", title, questions, isFinalExam };
    }
    if (m) {
      const idx = c.modules.findIndex(x => x.id === m.id);
      c.modules[idx] = newMod;
    } else {
      c.modules.push(newMod);
    }
    persistContent(); closeModal(); render();
  });

  const delBtn = modal.querySelector("[data-del-module]");
  if (delBtn) delBtn.addEventListener("click", () => {
    if (confirm("Удалить модуль?")) {
      c.modules = c.modules.filter(x => x.id !== m.id);
      persistContent(); closeModal(); nav("course/" + courseId);
    }
  });
}

// ===== EDIT MODALS: портал =====
function openArticleEditor(articleId) {
  const a = articleId ? STATE.portal.find(x => x.id === articleId) : null;
  const modal = document.getElementById("modal");
  modal.innerHTML = `
    <div class="modal-card modal-card-wide">
      <h2>${a ? "Редактировать материал" : "Новый материал"}</h2>
      <label>Категория<input id="f-cat" value="${a ? escapeHtml(a.category) : "Общее"}"></label>
      <label>Название<input id="f-atitle" value="${a ? escapeHtml(a.title) : ""}"></label>
      <label>Иконка (эмодзи)<input id="f-aicon" value="${a ? a.icon : "📄"}"></label>
      <label>Краткое описание<input id="f-asummary" value="${a ? escapeHtml(a.summary || "") : ""}"></label>
      <label>Текст (абзацы через пустую строку; список — строки, начинающиеся с "- ")<textarea id="f-abody" rows="8">${a ? escapeHtml(a.body) : ""}</textarea></label>
      <div class="modal-actions">
        ${a ? `<button class="btn-ghost" style="color:var(--danger)" data-del-article="${a.id}">Удалить</button>` : ""}
        <button class="btn-primary" data-save-article="${a ? a.id : ""}">Сохранить</button>
      </div>
    </div>`;
  modal.classList.add("show");
  modal.querySelector("[data-save-article]").addEventListener("click", () => {
    const title = document.getElementById("f-atitle").value.trim();
    if (!title) { toast("Укажите название", "warn"); return; }
    const data = {
      id: a ? a.id : "art" + Date.now(),
      category: document.getElementById("f-cat").value.trim() || "Общее",
      title,
      icon: document.getElementById("f-aicon").value.trim() || "📄",
      summary: document.getElementById("f-asummary").value.trim(),
      body: document.getElementById("f-abody").value.trim()
    };
    if (a) {
      const idx = STATE.portal.findIndex(x => x.id === a.id);
      STATE.portal[idx] = data;
    } else {
      STATE.portal.push(data);
    }
    persistContent(); closeModal(); render();
  });
  const delBtn = modal.querySelector("[data-del-article]");
  if (delBtn) delBtn.addEventListener("click", () => {
    if (confirm("Удалить материал?")) {
      STATE.portal = STATE.portal.filter(x => x.id !== a.id);
      persistContent(); closeModal(); nav("portal");
    }
  });
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.remove("show"); modal.innerHTML = "";
}

// ===== GOOGLE SHEETS EXPORT =====
// Отправляем через GET (данные в параметре URL), а не POST — Apps Script на
// адресе /exec сначала отвечает переадресацией, и при ней браузер иногда
// теряет тело POST-запроса. У GET-запроса такой проблемы нет: данные едут
// прямо в адресе и не зависят от переадресации.
function sheetsSend(rows) {
  if (typeof SHEETS_WEBHOOK_URL === "undefined" || !SHEETS_WEBHOOK_URL) return Promise.resolve(false);
  const url = SHEETS_WEBHOOK_URL + "?data=" + encodeURIComponent(JSON.stringify({ rows }));
  return fetch(url, { method: "GET", mode: "no-cors" }).then(() => true).catch(e => { console.warn(e); return false; });
}

async function exportUserToSheets(u) {
  if (typeof SHEETS_WEBHOOK_URL === "undefined" || !SHEETS_WEBHOOK_URL) {
    toast("Таблица не подключена — см. README", "warn");
    return;
  }
  const rows = [];
  STATE.courses.forEach(c => {
    const p = (u.progress && u.progress[c.id]) || { completedModules: [], quizResults: {} };
    c.modules.filter(m => m.type === "quiz").forEach(m => {
      const qr = p.quizResults[m.id];
      if (qr) rows.push({
        name: u.name || "", course: c.title, module: m.title,
        score: qr.score, total: qr.total, criticalOk: qr.criticalOk, date: qr.at ? new Date(qr.at).toISOString() : ""
      });
    });
  });
  if (!rows.length) { toast("У пользователя пока нет результатов тестов", "warn"); return; }
  const ok = await sheetsSend(rows);
  toast(ok ? "Отправлено в Таблицу" : "Не удалось отправить в Таблицу", ok ? "badge" : "warn");
}

async function sendExamToSheets(courseId, moduleId, result) {
  if (typeof SHEETS_WEBHOOK_URL === "undefined" || !SHEETS_WEBHOOK_URL) return;
  const c = getCourse(courseId); const m = getModule(courseId, moduleId);
  await sheetsSend([{ name: STATE.userName, course: c.title, module: m.title, score: result.score, total: result.total, criticalOk: result.criticalOk, date: new Date().toISOString() }]);
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
  initCloud();
  document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  render();
  if (STATE.userId) await syncFromCloud();
  render();
});
