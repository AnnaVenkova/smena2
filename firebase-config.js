// ===== Конфигурация Firebase =====
// Пока не заполнено — приложение работает в локальном режиме:
// каждый пользователь видит только свой прогресс, вход администратора — по временному PIN.
//
// Чтобы включить общий прогресс, панель администратора и защищённый вход по email:
//
// 1. Зайдите на https://console.firebase.google.com → «Add project» → создайте проект (бесплатно).
//
// 2. Firestore: Build → Firestore Database → Create database → Start in test mode → выберите регион.
//    Затем вкладка Rules → вставьте правила из файла firestore.rules.txt → Publish.
//
// 3. Authentication (вход администратора):
//    Build → Authentication → Get started → вкладка Sign-in method → включите «Email/Password».
//    Затем вкладка Users → Add user → впишите email и пароль администратора (например, ваш рабочий email).
//    Можно добавить несколько администраторов — просто повторите для каждого.
//
// 4. Project settings (шестерёнка) → General → Your apps → нажмите значок «</>» (Web) →
//    зарегистрируйте приложение → скопируйте объект firebaseConfig, который покажет Firebase.
//
// 5. Вставьте его вместо null ниже, сохраните, закоммитьте и запушьте в GitHub.
//
// После этого в приложении: Профиль → «Включить» (режим администратора) откроет
// окно входа по email и паролю — тому, что вы создали на шаге 3.

const firebaseConfig = {
  apiKey: "AIzaSyALRvBuWHojHwx0nwVy-bkPhkFiyq8LI_k",
  authDomain: "smena3-975cd.firebaseapp.com",
  projectId: "smena3-975cd",
  storageBucket: "smena3-975cd.firebasestorage.app",
  messagingSenderId: "498368556296",
  appId: "1:498368556296:web:1231f854420b098191d0bd";
};

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
