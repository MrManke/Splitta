/**
 * Show all user docs
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAbQYSVU0ZJ8oTWX9b1krnwUfwbqMJDOYo",
  authDomain: "splittaolle.firebaseapp.com",
  projectId: "splittaolle",
  storageBucket: "splittaolle.firebasestorage.app",
  messagingSenderId: "993863453672",
  appId: "1:993863453672:web:31da47a05768a45c3d325d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function showUsers() {
  const usersSnap = await getDocs(collection(db, 'users'));
  for (const d of usersSnap.docs) {
    const data = d.data();
    console.log(`ID: ${d.id}`);
    console.log(`  alias: ${data.alias}, email: ${data.email}, phone: ${data.phone}, role: ${data.role}`);
    console.log(`  emails: ${JSON.stringify(data.emails)}`);
    console.log('');
  }
  process.exit(0);
}

showUsers().catch(err => { console.error(err); process.exit(1); });
