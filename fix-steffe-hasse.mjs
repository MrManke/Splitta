/**
 * Fix script: 
 * 1. Add Steffe's email (bostrom1974@hotmail.com) to USER_STEFFE doc
 * 2. Add Hasse to Skåne 2026 trip participants (he was there but had no expenses)
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore';

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

const TRIP_ID = 'TRIP_SKANE_2026';
const HASSE_UID = 'USER_HASSE';

async function fix() {
  // 1. Fix Steffe's email
  console.log('📝 Fixing Steffe email...');
  const steffRef = doc(db, 'users', 'USER_STEFFE');
  const steffSnap = await getDoc(steffRef);
  if (steffSnap.exists()) {
    const data = steffSnap.data();
    const emails = data.emails || [];
    if (!emails.includes('bostrom1974@hotmail.com')) {
      emails.push('bostrom1974@hotmail.com');
    }
    await updateDoc(steffRef, { 
      email: 'bostrom1974@hotmail.com',
      emails 
    });
    console.log('  ✅ Steffe email fixed');
  } else {
    console.log('  ❌ USER_STEFFE not found');
  }

  // 2. Add Hasse to Skåne 2026 trip
  console.log('📝 Adding Hasse to Skåne 2026...');
  const tripRef = doc(db, 'trips', TRIP_ID);
  const tripSnap = await getDoc(tripRef);
  if (!tripSnap.exists()) {
    console.log('  ❌ Trip not found');
    process.exit(1);
  }
  
  const trip = tripSnap.data();
  const hasseAlreadyInTrip = trip.participants.some(p => p.id === HASSE_UID);
  
  if (hasseAlreadyInTrip) {
    console.log('  ℹ️ Hasse already in trip participants');
  } else {
    const updatedParticipants = [
      ...trip.participants,
      { id: HASSE_UID, name: 'Hasse', has_account: true }
    ];
    const updatedParticipantUids = [...(trip.participant_uids || []), HASSE_UID];
    
    await updateDoc(tripRef, {
      participants: updatedParticipants,
      participant_uids: updatedParticipantUids,
    });
    console.log('  ✅ Hasse added to Skåne 2026 participants');
  }

  console.log('\n🎉 Done!');
  process.exit(0);
}

fix().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
