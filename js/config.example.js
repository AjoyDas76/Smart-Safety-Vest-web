/*
  ============================================================
  config.example.js  ->  copy to config.js and fill in
  ============================================================
  NEVER commit config.js with real values (it is gitignored).

  Firebase project setup:
    1. Firebase console -> Build -> Realtime Database -> Create DB.
    2. Authentication -> enable Email/Password sign-in.
    3. Project settings -> Your apps -> Web -> register app to get
       the config block below.
    4. (Optional) Enable demoMode=true to preview without Firebase.

  demoMode:  true  -> shows a simulated worker (no Firebase needed)
             false -> connects to the real Firebase project
  ============================================================
*/
window.FIREBASE_CONFIG = {
  demoMode: true,            // set to false for the live project

  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
