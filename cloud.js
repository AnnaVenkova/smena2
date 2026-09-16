// ===== CLOUD SYNC (Firebase Firestore) =====
// true заменяется при сборке:
//   preview (демо в чате) — false, облако отключено (сеть в песочнице ненадёжна)
//   deploy (реальный сайт) — true, облако включено, если задан FIREBASE_CONFIG
const CLOUD_BUILD_ENABLED = true;

let _db = null;
let cloudReady = false;

function initCloud() {
  if (!CLOUD_BUILD_ENABLED) { cloudReady = false; return; }
  if (typeof FIREBASE_CONFIG === "undefined" || !FIREBASE_CONFIG) { cloudReady = false; return; }
  if (typeof firebase === "undefined") { cloudReady = false; return; }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _db = firebase.firestore();
    cloudReady = true;
  } catch (e) {
    console.warn("Firebase init failed:", e);
    cloudReady = false;
  }
  initAuth();
  initStorage();
}

// ===== ADMIN AUTH (Firebase Authentication — вход по email/паролю) =====
let _auth = null;
let authReady = false;
let currentAdmin = null;

function initAuth() {
  if (!cloudReady || typeof firebase === "undefined" || !firebase.auth) { authReady = false; return; }
  try {
    _auth = firebase.auth();
    authReady = true;
    _auth.onAuthStateChanged(user => {
      currentAdmin = user;
      if (typeof onAdminAuthChange === "function") onAdminAuthChange(user);
    });
  } catch (e) {
    console.warn("Firebase auth init failed:", e);
    authReady = false;
  }
}

async function adminSignIn(email, password) {
  if (!authReady) return { ok: false, error: "Вход не настроен (см. README)" };
  try {
    await _auth.signInWithEmailAndPassword(email, password);
    return { ok: true };
  } catch (e) {
    const messages = {
      "auth/invalid-email": "Некорректный email",
      "auth/user-not-found": "Такой пользователь не найден",
      "auth/wrong-password": "Неверный пароль",
      "auth/invalid-credential": "Неверный email или пароль",
      "auth/too-many-requests": "Слишком много попыток, попробуйте позже"
    };
    return { ok: false, error: messages[e.code] || e.message };
  }
}

async function adminSignOut() {
  if (!authReady) return;
  try { await _auth.signOut(); } catch (e) { console.warn(e); }
}

async function cloudLoadContent() {
  if (!cloudReady) return null;
  try {
    const doc = await _db.collection("content").doc("main").get();
    return doc.exists ? doc.data().courses : null;
  } catch (e) { console.warn("cloudLoadContent failed:", e); return null; }
}

async function cloudSaveContent(courses) {
  if (!cloudReady) return false;
  try {
    await _db.collection("content").doc("main").set({ courses, updatedAt: Date.now() });
    return true;
  } catch (e) { console.warn("cloudSaveContent failed:", e); return false; }
}

async function cloudLoadUser(userId) {
  if (!cloudReady) return null;
  try {
    const doc = await _db.collection("users").doc(userId).get();
    return doc.exists ? doc.data() : null;
  } catch (e) { console.warn("cloudLoadUser failed:", e); return null; }
}

async function cloudSaveUser(userId, data) {
  if (!cloudReady) return false;
  try {
    await _db.collection("users").doc(userId).set({ ...data, updatedAt: Date.now() });
    return true;
  } catch (e) { console.warn("cloudSaveUser failed:", e); return false; }
}

async function cloudLoadAllUsers() {
  if (!cloudReady) return [];
  try {
    const snap = await _db.collection("users").get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn("cloudLoadAllUsers failed:", e); return []; }
}

async function cloudDeleteUser(userId) {
  if (!cloudReady) return false;
  try {
    await _db.collection("users").doc(userId).delete();
    return true;
  } catch (e) { console.warn("cloudDeleteUser failed:", e); return false; }
}

async function cloudLoadPortal() {
  if (!cloudReady) return null;
  try {
    const doc = await _db.collection("content").doc("portal").get();
    return doc.exists ? doc.data().articles : null;
  } catch (e) { console.warn("cloudLoadPortal failed:", e); return null; }
}

async function cloudSavePortal(articles) {
  if (!cloudReady) return false;
  try {
    await _db.collection("content").doc("portal").set({ articles, updatedAt: Date.now() });
    return true;
  } catch (e) { console.warn("cloudSavePortal failed:", e); return false; }
}

// ===== FIREBASE STORAGE (вложения: картинки, PDF, Word, PPT, Excel) =====
let _storage = null;

function initStorage() {
  if (!cloudReady || typeof firebase === "undefined" || !firebase.storage) return;
  try {
    _storage = firebase.storage();
  } catch (e) {
    console.warn("Firebase Storage init failed:", e);
  }
}

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
  if (ALLOWED_MIME.includes(file.type)) return true;
  return ALLOWED_EXT.test(file.name || "");
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
  if (!_storage) return { ok: false, error: "Storage не настроен. Подключите Firebase Storage." };
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
  const path = `content/${folder}/${Date.now()}_${safeName}`;
  const ref = _storage.ref(path);

  try {
    const snap = await ref.put(file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: { originalName: file.name || safeName }
    });
    const url = await snap.ref.getDownloadURL();
    return {
      ok: true,
      file: {
        id: path,
        name: file.name || safeName,
        url,
        type: file.type || "",
        size: file.size
      }
    };
  } catch (e) {
    console.warn("uploadContentFile:", e);
    let msg = e.message || "Ошибка загрузки";
    if (e.code === "storage/unauthorized") msg = "Нет прав на загрузку. Проверьте правила Storage и вход админа.";
    return { ok: false, error: msg };
  }
}

async function deleteContentFile(fileId) {
  if (!_storage || !currentAdmin || !fileId) return false;
  try {
    await _storage.ref(fileId).delete();
    return true;
  } catch (e) {
    // Файл мог уже быть удалён — не считаем критичной ошибкой
    console.warn("deleteContentFile:", e);
    return false;
  }
}
