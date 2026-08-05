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
