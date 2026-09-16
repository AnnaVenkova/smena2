// ===== Конфигурация Supabase =====
// 1. https://supabase.com → New project
// 2. Project Settings → API:
//    - Project URL  → вставьте в url
//    - anon public  → вставьте в anonKey
// 3. Сохраните, закоммитьте, запушьте.

const SUPABASE_CONFIG = {
  url: "// https://gdroatsdhhxpimsecagp.supabase.co/rest/v1/",       // например https://xxxx.supabase.co
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdkcm9hdHNkaGh4cGltc2VjYWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MTYzNzQsImV4cCI6MjEwNTA5MjM3NH0.fsKBk217kL9jjtskNVcPPKFG6VRi4WNlRM97q6L6Brg"    // anon public key
};

// Пока url/anonKey пустые — приложение работает локально (без облака).
