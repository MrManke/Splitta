/**
 * Seed script: Creates "Skåne 2026" trip with users and expenses.
 * Run with: node seed-data.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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

// User IDs (ghost users that will be linked when they log in)
const OLLE_UID = 'USER_OLLE';
const PETTA_UID = 'USER_PETTA';
const STEFFE_UID = 'USER_STEFFE';
const HASSE_UID = 'USER_HASSE';

// --- USERS ---
const users = [
  {
    uid: OLLE_UID,
    email: 'magnus.ohlund74@gmail.com',
    alias: 'Ölle',
    role: 'superadmin',
    phone: 'NOPHONE',
    emails: ['magnus.ohlund74@gmail.com', 'magnus.ohlund@outlook.com'],
  },
  {
    uid: PETTA_UID,
    email: 'peter.rander@yahoo.se',
    alias: 'Petta',
    role: 'user',
    phone: '+46702457253',
    emails: ['peter.rander@yahoo.se'],
  },
  {
    uid: STEFFE_UID,
    email: 'bostrom1974@hotmail.com',
    alias: 'Steffe',
    role: 'user',
    phone: 'NOPHONE',
    emails: ['bostrom1974@hotmail.com'],
  },
  {
    uid: HASSE_UID,
    email: 'hr@3p.nu',
    alias: 'Hasse',
    role: 'user',
    phone: '+46765005051',
    emails: ['hr@3p.nu'],
  },
];

// --- TRIP: Skåne 2026 ---
const TRIP_ID = 'TRIP_SKANE_2026';

const participants = [
  { id: OLLE_UID, name: 'Ölle', has_account: true },
  { id: PETTA_UID, name: 'Petta', has_account: true },
  { id: STEFFE_UID, name: 'Steffe', has_account: true },
];

// Expenses derived from image:
// 1. Bilhyra: Steffe paid 2120, split 3 ways equally (706.67 each)
// 2. Mat-snacks: Ölle paid 904, split 3 ways equally (301.33 each)
// 3. Bensin: Ölle paid 926, split 3 ways equally (308.67 each)
// 4. Mat: Steffe paid 420, split 3 ways equally (140 each)
// 5. Bensin (2): Steffe paid 906, split 3 ways equally (302 each)
// 6. Gas & Kaffe: Petta paid 120, split 3 ways equally (40 each)
// 7. Bensin Gävle-Stockholm ToR: Petta paid 450, split between Petta and Ölle

const now = new Date().toISOString();

const expenses = [
  {
    expense_id: 'EXP_SEED_001',
    title: 'Bilhyra',
    amount: 2120,
    paid_by: STEFFE_UID,
    created_by_alias: 'Ölle',
    split_type: 'equal',
    splits: { [OLLE_UID]: 33.33, [PETTA_UID]: 33.33, [STEFFE_UID]: 33.34 },
    comment: '',
    created_at: '2026-05-20T10:00:00Z',
  },
  {
    expense_id: 'EXP_SEED_002',
    title: 'Mat-snacks',
    amount: 904,
    paid_by: OLLE_UID,
    created_by_alias: 'Ölle',
    split_type: 'equal',
    splits: { [OLLE_UID]: 33.33, [PETTA_UID]: 33.33, [STEFFE_UID]: 33.34 },
    comment: '',
    created_at: '2026-05-20T12:00:00Z',
  },
  {
    expense_id: 'EXP_SEED_003',
    title: 'Bensin',
    amount: 926,
    paid_by: OLLE_UID,
    created_by_alias: 'Ölle',
    split_type: 'equal',
    splits: { [OLLE_UID]: 33.33, [PETTA_UID]: 33.33, [STEFFE_UID]: 33.34 },
    comment: '',
    created_at: '2026-05-20T14:00:00Z',
  },
  {
    expense_id: 'EXP_SEED_004',
    title: 'Mat',
    amount: 420,
    paid_by: STEFFE_UID,
    created_by_alias: 'Ölle',
    split_type: 'equal',
    splits: { [OLLE_UID]: 33.33, [PETTA_UID]: 33.33, [STEFFE_UID]: 33.34 },
    comment: '',
    created_at: '2026-05-21T10:00:00Z',
  },
  {
    expense_id: 'EXP_SEED_005',
    title: 'Bensin',
    amount: 906,
    paid_by: STEFFE_UID,
    created_by_alias: 'Ölle',
    split_type: 'equal',
    splits: { [OLLE_UID]: 33.33, [PETTA_UID]: 33.33, [STEFFE_UID]: 33.34 },
    comment: '',
    created_at: '2026-05-21T12:00:00Z',
  },
  {
    expense_id: 'EXP_SEED_006',
    title: 'Gas & Kaffe',
    amount: 120,
    paid_by: PETTA_UID,
    created_by_alias: 'Ölle',
    split_type: 'equal',
    splits: { [OLLE_UID]: 33.33, [PETTA_UID]: 33.33, [STEFFE_UID]: 33.34 },
    comment: '',
    created_at: '2026-05-21T14:00:00Z',
  },
  {
    expense_id: 'EXP_SEED_007',
    title: 'Bensin Gävle-Stockholm ToR',
    amount: 450,
    paid_by: PETTA_UID,
    created_by_alias: 'Ölle',
    split_type: 'equal',
    splits: { [OLLE_UID]: 50, [PETTA_UID]: 50 },
    comment: 'Tur och retur',
    created_at: '2026-05-22T08:00:00Z',
  },
];

const totalCost = expenses.reduce((sum, e) => sum + e.amount, 0);

const trip = {
  trip_id: TRIP_ID,
  title: 'Skåne 2026',
  created_by: OLLE_UID,
  created_at: '2026-05-20T08:00:00Z',
  total_cost: totalCost,
  currency: 'SEK',
  participants,
  expenses,
  comments: [],
  album: [],
  participant_uids: [OLLE_UID, PETTA_UID, STEFFE_UID],
};

async function seed() {
  console.log('🌱 Seeding users...');
  for (const user of users) {
    await setDoc(doc(db, 'users', user.uid), user);
    console.log(`  ✅ ${user.alias} (${user.email})`);
  }

  console.log('🌱 Seeding trip: Skåne 2026...');
  await setDoc(doc(db, 'trips', TRIP_ID), trip);
  console.log(`  ✅ Trip created with ${expenses.length} expenses, total: ${totalCost} SEK`);

  console.log('\n🎉 Done! Refresh the app to see the data.');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
