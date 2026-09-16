// ===== Конфигурация Supabase =====
// Project Settings → API:
//   Project URL  → url  (БЕЗ /rest/v1/ в конце)
//   anon public  → anonKey

const SUPABASE_CONFIG = {
  url: "https://gdroatsdhhxpimsecagp.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdkcm9hdHNkaGh4cGltc2VjYWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MTYzNzQsImV4cCI6MjEwNTA5MjM3NH0.fsKBk217kL9jjtskNVcPPKFG6VRi4WNlRM97q6L6Brg"
};

// Имя Edge Function в URL (последний сегмент пути).
// У вас сейчас: .../functions/v1/super-api  →  оставьте "super-api"
// Если создадите функцию с именем create-employee → поменяйте на "create-employee"
const EDGE_CREATE_EMPLOYEE = "super-api";
const EDGE_DELETE_EMPLOYEE = "delete-employee";
