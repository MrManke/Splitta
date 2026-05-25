/**
 * Fix script: Update any user docs that have phone: '' or phone: undefined
 * to phone: 'NOPHONE' so they don't get stuck on the phone prompt screen.
 * Run with: node fix-phone.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

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

async function fixPhones() {
  console.log('🔍 Checking user docs for missing/empty phone numbers...');
  
  const usersSnap = await getDocs(collection(db, 'users'));
  let fixed = 0;
  
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    if (data.phone === undefined || data.phone === null || data.phone === '') {
      console.log(`  📝 Fixing ${data.alias || data.email || userDoc.id} (phone: "${data.phone}")`);
      await updateDoc(doc(db, 'users', userDoc.id), { phone: 'NOPHONE' });
      fixed++;
    } else {
      console.log(`  ✅ ${data.alias || data.email || userDoc.id} (phone: "${data.phone}") - OK`);
    }
  }
  
  console.log(`\n🎉 Done! Fixed ${fixed} user(s).`);
  process.exit(0);
}

fixPhones().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
