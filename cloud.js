// ===== CLOUD SYNC (Supabase) =====
const CLOUD_BUILD_ENABLED = true;

let _sb = null;
let cloudReady = false;
let authReady = false;
let currentAdmin = null;
let currentAuthUser = null;

function loginToEmail(login) {
  const L = String(login || "").trim().toLowerCase();
  if (!L) return "";
  if (L.includes("@")) return L;
  return L.replace(/[^a-z0-9._+-]/g, "") + "@smena.users";
}

function initCloud() {
  if (!CLOUD_BUILD_ENABLED) { cloudReady = false; return; }
  if (typeof SUPABASE_CONFIG === "undefined" || !SUPABASE_CONFIG || !SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    cloudReady = false;
    return;
  }
  if (typeof supabase === "undefined") {
    console.warn("Supabase SDK not loaded");
    cloudReady = false;
    return;
  }
  try {
    _sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    cloudReady = true;
  } catch (e) {
    console.warn("Supabase init failed:", e);
    cloudReady = false;
  }
  initAuth();
}

function initAuth() {
  if (!cloudReady || !_sb) { authReady = false; return; }
  authReady = true;
  // getSession отдельно
  _sb.auth.getSession().then(({ data }) => {
    setTimeout(() => handleSession(data.session || null), 0);
  }).catch(e => console.warn("getSession", e));

  // ВАЖНО: внутри onAuthStateChange нельзя сразу ходить в БД —
  // у Supabase это вызывает deadlock (вход «зависает» без ошибки).
  _sb.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => handleSession(session), 0);
  });
}

async function handleSession(session) {
  currentAuthUser = session && session.user ? session.user : null;
  currentAdmin = null;
  if (currentAuthUser) {
    try {
      const role = await ensureUserProfileAndRole(currentAuthUser);
      if (role === "admin") currentAdmin = currentAuthUser;
    } catch (e) {
      console.warn("role resolve failed:", e);
    }
  }
  if (typeof onAuthStateChange === "function") onAuthStateChange(currentAuthUser, currentAdmin);
  if (typeof onAdminAuthChange === "function") onAdminAuthChange(currentAdmin);
}

async function ensureUserProfileAndRole(user) {
  if (!_sb || !user) return "user";
  const { data, error } = await _sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) console.warn(error);
  if (data) return data.role === "admin" ? "admin" : "user";

  // Профиля нет (триггер мог не сработать) — создаём
  const email = (user.email || "").toLowerCase();
  const isEmployeeSynth = email.endsWith("@smena.users");
  const role = isEmployeeSynth ? "user" : "admin";
  const login = isEmployeeSynth ? email.split("@")[0] : (email || user.id.slice(0, 8));
  const name = (user.user_metadata && user.user_metadata.name) || login || "Пользователь";
  await _sb.from("profiles").upsert({
    id: user.id,
    login,
    name,
    role,
    xp: 0,
    badges: [],
    streak: 0,
    progress: {},
    updated_at: new Date().toISOString()
  });
  return role;
}

function authErrorMessage(e) {
  const msg = (e && (e.message || e.error_description || e.msg)) || "";
  const map = {
    "Invalid login credentials": "Неверный логин или пароль",
    "Email not confirmed": "Email не подтверждён (отключите Confirm email в Auth → Providers)",
    "User already registered": "Такой логин уже занят",
    "Password should be at least 6 characters": "Пароль не короче 6 символов",
    "Signup is disabled": "Регистрация отключена — создавайте пользователей только через админку"
  };
  for (const k of Object.keys(map)) {
    if (msg.toLowerCase().includes(k.toLowerCase())) return map[k];
  }
  return msg || "Ошибка входа";
}

async function adminSignIn(email, password) {
  if (!authReady || !_sb) return { ok: false, error: "Вход не настроен" };
  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: authErrorMessage(error) };
    return { ok: true, user: data && data.user, session: data && data.session };
  } catch (e) {
    return { ok: false, error: authErrorMessage(e) };
  }
}

async function userSignIn(login, password) {
  if (!authReady || !_sb) return { ok: false, error: "Облако не подключено" };
  const email = loginToEmail(login);
  if (!email || !password) return { ok: false, error: "Введите логин и пароль" };
  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: authErrorMessage(error) };
    return { ok: true, user: data && data.user, session: data && data.session };
  } catch (e) {
    return { ok: false, error: authErrorMessage(e) };
  }
}

async function adminSignOut() {
  if (!_sb) return;
  try { await _sb.auth.signOut(); } catch (e) { console.warn(e); }
}

async function authSignOut() {
  return adminSignOut();
}

/**
 * Создание сотрудника.
 * Нужна Edge Function `create-employee` (см. ИНСТРУКЦИЮ) —
 * из браузера нельзя безопасно использовать service_role ключ.
 */
async function adminCreateEmployee(login, password, displayName, positionId) {
  if (!authReady || !currentAdmin || !_sb) {
    return { ok: false, error: "Нужен вход администратора" };
  }
  const L = String(login || "").trim().toLowerCase();
  if (!/^[a-z0-9._+-]{2,32}$/.test(L)) {
    return { ok: false, error: "Логин: 2–32 символа, латиница, цифры, . _ + -" };
  }
  if (!password || password.length < 6) {
    return { ok: false, error: "Пароль не короче 6 символов" };
  }
  const name = String(displayName || "").trim();
  if (!name || name.length > 100) return { ok: false, error: "Укажите имя (до 100 символов)" };

  try {
    // Имя функции в URL Supabase (у вас может быть super-api, если так создали)
    const fnName = (typeof EDGE_CREATE_EMPLOYEE === "string" && EDGE_CREATE_EMPLOYEE)
      ? EDGE_CREATE_EMPLOYEE
      : "create-employee";
    let data, error;
    ({ data, error } = await _sb.functions.invoke(fnName, {
      body: { login: L, password, name, positionId: positionId || null }
    }));
    // fallback на super-api, если create-employee ещё не задеплоена
    if (error && fnName === "create-employee") {
      const second = await _sb.functions.invoke("super-api", {
        body: { login: L, password, name, positionId: positionId || null }
      });
      data = second.data;
      error = second.error;
    }
    if (error) {
      console.warn(error);
      // fallback сообщение если функция не задеплоена
      const hint = "Создайте Edge Function create-employee (см. ИНСТРУКЦИЮ) или добавьте пользователя вручную в Authentication → Users (email: " + loginToEmail(L) + ")";
      return { ok: false, error: (error.message || "Ошибка вызова функции") + ". " + hint };
    }
    if (data && data.error) return { ok: false, error: data.error };
    if (positionId && data && data.uid) {
      try { await _sb.from("profiles").update({ position_id: positionId }).eq("id", data.uid); } catch (e) {}
    }
    return { ok: true, uid: data && data.uid, login: L };
  } catch (e) {
    console.warn(e);
    return {
      ok: false,
      error: "Не удалось создать пользователя. Задеплойте Edge Function create-employee или создайте вручную в Authentication (email: " + loginToEmail(L) + ")"
    };
  }
}


async function cloudLoadPositions() {
  if (!cloudReady || !_sb) return null;
  try {
    const { data, error } = await _sb.from("app_content").select("data").eq("id", "positions").maybeSingle();
    if (error) throw error;
    return data && Array.isArray(data.data) ? data.data : [];
  } catch (e) {
    console.warn("cloudLoadPositions", e);
    return null;
  }
}

async function cloudSavePositions(positions) {
  if (!cloudReady || !_sb) return false;
  try {
    const { error } = await _sb.from("app_content").upsert({
      id: "positions",
      data: positions || [],
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("cloudSavePositions", e);
    return false;
  }
}

async function cloudLoadContent() {
  if (!cloudReady || !_sb) return null;
  try {
    const { data, error } = await _sb.from("app_content").select("data").eq("id", "courses").maybeSingle();
    if (error) throw error;
    return data && Array.isArray(data.data) ? data.data : null;
  } catch (e) {
    console.warn("cloudLoadContent failed:", e);
    return null;
  }
}

async function cloudSaveContent(courses) {
  if (!cloudReady || !_sb) return false;
  try {
    const { error } = await _sb.from("app_content").upsert({
      id: "courses",
      data: courses,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("cloudSaveContent failed:", e);
    return false;
  }
}

async function cloudLoadPortal() {
  if (!cloudReady || !_sb) return null;
  try {
    const { data, error } = await _sb.from("app_content").select("data").eq("id", "portal").maybeSingle();
    if (error) throw error;
    return data && Array.isArray(data.data) ? data.data : null;
  } catch (e) {
    console.warn("cloudLoadPortal failed:", e);
    return null;
  }
}

async function cloudSavePortal(articles) {
  if (!cloudReady || !_sb) return false;
  try {
    const { error } = await _sb.from("app_content").upsert({
      id: "portal",
      data: articles,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("cloudSavePortal failed:", e);
    return false;
  }
}

async function cloudLoadUser(userId) {
  if (!cloudReady || !_sb || !userId) return null;
  try {
    const { data, error } = await _sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      name: data.name,
      login: data.login,
      role: data.role,
      positionId: data.position_id || null,
      xp: data.xp,
      badges: data.badges || [],
      streak: data.streak,
      lastActiveDate: data.last_active_date,
      progress: data.progress || {},
      updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : 0
    };
  } catch (e) {
    console.warn("cloudLoadUser failed:", e);
    return null;
  }
}

async function cloudSaveUser(userId, data) {
  if (!cloudReady || !_sb || !userId) return false;
  try {
    const row = {
      id: userId,
      updated_at: new Date().toISOString()
    };
    if (data.name !== undefined) row.name = data.name;
    if (data.xp !== undefined) row.xp = data.xp;
    if (data.badges !== undefined) row.badges = data.badges;
    if (data.streak !== undefined) row.streak = data.streak;
    if (data.lastActiveDate !== undefined) row.last_active_date = data.lastActiveDate;
    if (data.progress !== undefined) row.progress = data.progress;
    if (data.positionId !== undefined) row.position_id = data.positionId;
    const { error } = await _sb.from("profiles").upsert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("cloudSaveUser failed:", e);
    return false;
  }
}

async function cloudLoadAllUsers() {
  if (!cloudReady || !_sb) return [];
  try {
    const { data, error } = await _sb.from("profiles").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(d => ({
      id: d.id,
      name: d.name,
      login: d.login,
      role: d.role,
      positionId: d.position_id || null,
      xp: d.xp,
      badges: d.badges || [],
      streak: d.streak,
      lastActiveDate: d.last_active_date,
      progress: d.progress || {},
      updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : 0
    }));
  } catch (e) {
    console.warn("cloudLoadAllUsers failed:", e);
    return [];
  }
}

async function cloudDeleteUser(userId) {
  if (!cloudReady || !_sb || !currentAdmin) {
    return { ok: false, error: "Нужен вход администратора" };
  }
  try {
    const delName = (typeof EDGE_DELETE_EMPLOYEE === "string" && EDGE_DELETE_EMPLOYEE)
      ? EDGE_DELETE_EMPLOYEE
      : "delete-employee";
    let data, error;
    ({ data, error } = await _sb.functions.invoke(delName, { body: { uid: userId } }));
    if (error && delName === "delete-employee") {
      const second = await _sb.functions.invoke("super-api", { body: { uid: userId, action: "delete" } });
      // super-api without delete logic won't work — keep error
      if (second && !second.error && second.data && second.data.ok) {
        data = second.data; error = null;
      }
    }
    if (error) {
      console.warn(error);
      // fallback: удалить только профиль (вход по паролю останется, пока не удалите в Auth)
      const { error: e2 } = await _sb.from("profiles").delete().eq("id", userId);
      if (e2) return { ok: false, error: error.message || "Ошибка удаления. Задеплойте Edge Function delete-employee." };
      return { ok: true, partial: true };
    }
    if (data && data.error) return { ok: false, error: data.error };
    return { ok: true };
  } catch (e) {
    console.warn("cloudDeleteUser failed:", e);
    return { ok: false, error: e.message || String(e) };
  }
}

// ===== STORAGE (вложения) =====
const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
];
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|pdf|docx?|pptx?|xlsx?)$/i;

function isAllowedFile(file) {
  if (file && file.type && ALLOWED_MIME.includes(file.type)) return true;
  return ALLOWED_EXT.test((file && file.name) || "");
}

function fileIconFor(name, type) {
  const n = (name || "").toLowerCase();
  const t = (type || "").toLowerCase();
  if (t.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/.test(n)) return "🖼️";
  if (t.includes("pdf") || n.endsWith(".pdf")) return "📕";
  if (t.includes("word") || t.includes("document") || /\.docx?$/.test(n)) return "📘";
  if (t.includes("presentation") || t.includes("powerpoint") || /\.pptx?$/.test(n)) return "📙";
  if (t.includes("sheet") || t.includes("excel") || /\.xlsx?$/.test(n)) return "📗";
  return "📎";
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
}

async function uploadContentFile(file, folder = "lessons") {
  if (!cloudReady || !_sb) return { ok: false, error: "Storage не настроен" };
  if (!currentAdmin) return { ok: false, error: "Нужен вход администратора" };
  if (!isAllowedFile(file)) {
    return { ok: false, error: "Тип не поддерживается. Можно: картинки, PDF, Word, PowerPoint, Excel" };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, error: "Файл больше 25 МБ" };
  }
  const safeName = (file.name || "file")
    .replace(/[^\w.\-а-яА-ЯёЁ ]/gi, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const path = folder + "/" + Date.now() + "_" + safeName;
  try {
    const { error } = await _sb.storage.from("content").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
    if (error) throw error;
    const { data: pub } = _sb.storage.from("content").getPublicUrl(path);
    return {
      ok: true,
      file: {
        id: path,
        name: file.name || safeName,
        url: pub.publicUrl,
        type: file.type || "",
        size: file.size
      }
    };
  } catch (e) {
    console.warn("uploadContentFile:", e);
    const msg = (e && (e.message || e.error || e.error_description)) || String(e);
    if (/bucket not found|NoSuchBucket/i.test(msg)) {
      return { ok: false, error: "В Supabase нет хранилища «content». Выполните SQL из инструкции (Storage bucket)." };
    }
    if (/row-level security|RLS|policy|not allowed|403|401/i.test(msg)) {
      return { ok: false, error: "Нет прав на загрузку. Войдите как администратор (role=admin в profiles)." };
    }
    return { ok: false, error: msg || "Ошибка загрузки" };
  }
}

async function deleteContentFile(fileId) {
  if (!cloudReady || !_sb || !currentAdmin || !fileId) return false;
  try {
    const { error } = await _sb.storage.from("content").remove([fileId]);
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("deleteContentFile:", e);
    return false;
  }
}
