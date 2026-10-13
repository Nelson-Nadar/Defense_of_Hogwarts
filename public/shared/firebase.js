
import { initializeApp, getApps, getApp } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import { getDatabase } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyANJuaTdUsz8nPiAcnxA2v5PhtSMSq23Uk",
  authDomain: "defense-of-hogwarts.firebaseapp.com",
  databaseURL: "https://defense-of-hogwarts-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "defense-of-hogwarts",
  appId: "1:336030243577:web:8eb299df7a02a784ba2028"
};

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const db = getDatabase(app);
export { firebaseConfig };

console.info("Firebase initialized:", firebaseConfig.projectId);