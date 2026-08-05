// ===== Конфигурация Firebase =====
// Пока не заполнено — приложение работает в локальном режиме:
// каждый пользователь видит только свой прогресс, общая статистика недоступна.
//
// Чтобы включить общий прогресс и панель администратора:
// 1. Зайдите на https://console.firebase.google.com → «Add project» → создайте проект (бесплатно).
// 2. В проекте: Build → Firestore Database → Create database → Start in test mode → выберите регион (ближайший).
// 3. Затем: Firestore Database → вкладка Rules → вставьте правила из файла firestore.rules.txt → Publish.
// 4. Project settings (шестерёнка) → General → Your apps → нажмите значок «</>» (Web) → зарегистрируйте приложение.
// 5. Скопируйте объект firebaseConfig, который покажет Firebase, и вставьте его вместо null ниже.
// 6. Сохраните файл, закоммитьте и запушьте в GitHub — через минуту сайт обновится.

const FIREBASE_CONFIG = null;

/* Пример заполненной конфигурации (у вас будут другие значения):
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyABCDEF1234567890",
  authDomain: "smena-plus-12345.firebaseapp.com",
  projectId: "smena-plus-12345",
  storageBucket: "smena-plus-12345.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
*/
