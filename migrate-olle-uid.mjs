/**
 * Migrate script: Update USER_OLLE references to real Firebase UID
 * and fix phone numbers.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAbQYSVU0ZJ8oTWX9b1krnwUfwbqMJDOYo",
  authDomain: "splittaolle.firebaseapp.com",
  projectId: "splittaolle",
  storageBucket: "splittaolle.firebasestorage.app",
  messagingSenderId: "993863453672",
  appId: "1:993863453672:web:31da47a05768a45c3d325d"
};

const REAL_OLLE_UID = '17nbgG335wOhStrIUBIV6f11Dwx2';
const OLD_OLLE_UID = 'USER_OLLE';
const TRIP_ID = 'TRIP_SKANE_2026';
const OLLE_PHONE = '0703398561';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
  console.log('🔧 Migrating USER_OLLE -> real Firebase UID...');

  // 1. Update the trip to use real UID for Ölle
  const tripRef = doc(db, 'trips', TRIP_ID);
  const tripSnap = await getDoc(tripRef);
  if (!tripSnap.exists()) {
    console.log('❌ Trip not found!');
    process.exit(1);
  }
  
  const trip = tripSnap.data();
  
  // Update participants
  const updatedParticipants = trip.participants.map(p => {
    if (p.id === OLD_OLLE_UID) {
      return { ...p, id: REAL_OLLE_UID };
    }
    return p;
  });
  
  // Update expense splits and paid_by
  const updatedExpenses = trip.expenses.map(e => {
    const newSplits = {};
    for (const [uid, val] of Object.entries(e.splits)) {
      newSplits[uid === OLD_OLLE_UID ? REAL_OLLE_UID : uid] = val;
    }
    return {
      ...e,
      paid_by: e.paid_by === OLD_OLLE_UID ? REAL_OLLE_UID : e.paid_by,
      splits: newSplits,
    };
  });
  
  // Update participant_uids
  const updatedParticipantUids = (trip.participant_uids || []).map(uid => 
    uid === OLD_OLLE_UID ? REAL_OLLE_UID : uid
  );
  
  await updateDoc(tripRef, {
    participants: updatedParticipants,
    expenses: updatedExpenses,
    participant_uids: updatedParticipantUids,
    created_by: trip.created_by === OLD_OLLE_UID ? REAL_OLLE_UID : trip.created_by,
  });
  console.log('  ✅ Trip updated: Ölle\'s UID replaced in participants + expenses + splits');

  // 2. Update the real Ölle user doc to have proper emails array
  const realOlleRef = doc(db, 'users', REAL_OLLE_UID);
  await updateDoc(realOlleRef, {
    emails: ['magnus.ohlund74@gmail.com', 'magnus.ohlund@outlook.com'],
    phone: OLLE_PHONE,
    role: 'superadmin',
    alias: 'Ölle',
  });
  console.log('  ✅ Real Ölle user doc updated (emails + phone)');

  // 3. Delete the old USER_OLLE seed doc (no longer needed)
  await deleteDoc(doc(db, 'users', OLD_OLLE_UID));
  console.log('  ✅ Old USER_OLLE seed doc deleted');

  console.log('\n🎉 Migration complete! Reload the app to see Ölle\'s proper Swish number.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
