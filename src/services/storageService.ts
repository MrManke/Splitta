// Types for Ölle-Split

export interface User {
  uid: string;
  email: string;
  alias: string;
  role: 'superadmin' | 'admin' | 'user';
  phone?: string;
  emails?: string[]; // All linked email addresses
  last_login_at?: string;
}

export interface Participant {
  id: string;
  name: string;
  has_account: boolean;
  phone?: string;
}

export interface BalanceLineItem {
  expense_id: string;
  title: string;
  paidAmount: number;
  owedAmount: number;
  date: string;
}

export interface Expense {
  expense_id: string;
  title: string;
  amount: number;
  paid_by: string; // User uid or ghost ID (e.g. 'GHOST_01')
  created_by_alias: string;
  split_type: 'equal' | 'percentage';
  splits: { [participantId: string]: number }; // percentage weight or shares (e.g. { USER_ID_123: 50, GHOST_01: 50 })
  comment?: string;
  receipt_url?: string; // base64 or URL
  is_settlement?: boolean;
  created_at: string;
}

export interface Comment {
  comment_id: string;
  expense_id: string;
  author_id: string;
  author_alias: string;
  text: string;
  created_at: string;
}

export interface AlbumPhoto {
  photo_id: string;
  url: string; // base64 or URL
  uploaded_by: string; // User alias
  caption: string;
  created_at: string;
}

export interface Trip {
  trip_id: string;
  title: string;
  created_by: string; // User uid
  created_at: string;
  total_cost: number;
  currency: string;
  participants: Participant[];
  expenses: Expense[];
  comments: Comment[];
  album: AlbumPhoto[];
}

export interface ActivityLog {
  id: string;
  trip_id: string;
  user_alias: string;
  action: string; // e.g. "lade till utlägget 'Stugahyra' - 4500 kr"
  involved_uids?: string[];
  created_at: string;
}

// Initial Mock Data (to make the app beautiful immediately on launch)
const INITIAL_USERS: User[] = [
  { uid: 'USER_MAGNUS', email: 'magnus.ohlund@outlook.com', alias: 'Ölle (Admin)', role: 'admin' },
  { uid: 'USER_ANNA', email: 'anna.andersson@gmail.com', alias: 'Anna', role: 'user' },
  { uid: 'USER_JONAS', email: 'jonas.berg@gmail.com', alias: 'Jonas', role: 'user' }
];

const INITIAL_TRIPS: Trip[] = [
  {
    trip_id: 'TRIP_FJALLEN',
    title: 'Fjällresan 2026',
    created_by: 'USER_MAGNUS',
    created_at: '2026-05-24T12:00:00Z',
    total_cost: 5700,
    currency: 'SEK',
    participants: [
      { id: 'USER_MAGNUS', name: 'Ölle (Admin)', has_account: true },
      { id: 'USER_ANNA', name: 'Anna', has_account: true },
      { id: 'USER_JONAS', name: 'Jonas', has_account: true },
      { id: 'GHOST_KALLE', name: 'Kalle (Utan konto)', has_account: false }
    ],
    expenses: [
      {
        expense_id: 'EXP_STUGA',
        title: 'Stugahyra',
        amount: 4500,
        paid_by: 'USER_MAGNUS',
        created_by_alias: 'Ölle (Admin)',
        split_type: 'equal',
        splits: { 'USER_MAGNUS': 25, 'USER_ANNA': 25, 'USER_JONAS': 25, 'GHOST_KALLE': 25 },
        comment: 'Mysig stuga nära backen',
        created_at: '2026-05-24T13:00:00Z'
      },
      {
        expense_id: 'EXP_MAT',
        title: 'Storhandling ICA',
        amount: 1200,
        paid_by: 'USER_ANNA',
        created_by_alias: 'Anna',
        split_type: 'percentage',
        splits: { 'USER_MAGNUS': 40, 'USER_ANNA': 20, 'USER_JONAS': 20, 'GHOST_KALLE': 20 }, // Magnus åt mer snacks!
        comment: 'Inklusive allt gott inför kvällarna',
        created_at: '2026-05-24T15:30:00Z'
      }
    ],
    comments: [
      {
        comment_id: 'COM_1',
        expense_id: 'EXP_STUGA',
        author_id: 'USER_ANNA',
        author_alias: 'Anna',
        text: 'Superfint ställe! Tack för att du bokade.',
        created_at: '2026-05-24T14:02:00Z'
      },
      {
        comment_id: 'COM_2',
        expense_id: 'EXP_STUGA',
        author_id: 'USER_MAGNUS',
        author_alias: 'Ölle (Admin)',
        text: 'Eller hur! Bastun ingick också 🍻',
        created_at: '2026-05-24T14:15:00Z'
      }
    ],
    album: [
      {
        photo_id: 'PHOTO_1',
        url: 'https://images.unsplash.com/photo-1551829142-d9b81d770aa5?w=500&auto=format&fit=crop&q=60',
        uploaded_by: 'Ölle (Admin)',
        caption: 'Utsikt från stugans altan på morgonen!',
        created_at: '2026-05-24T14:00:00Z'
      }
    ]
  }
];

const INITIAL_ACTIVITIES: ActivityLog[] = [
  {
    id: 'ACT_1',
    trip_id: 'TRIP_FJALLEN',
    user_alias: 'Ölle (Admin)',
    action: 'skapade resan "Fjällresan 2026"',
    created_at: '2026-05-24T12:00:00Z'
  },
  {
    id: 'ACT_2',
    trip_id: 'TRIP_FJALLEN',
    user_alias: 'Ölle (Admin)',
    action: 'lade till utlägget "Stugahyra" - 4500 kr',
    created_at: '2026-05-24T13:00:00Z'
  },
  {
    id: 'ACT_3',
    trip_id: 'TRIP_FJALLEN',
    user_alias: 'Anna',
    action: 'lade till utlägget "Storhandling ICA" - 1200 kr',
    created_at: '2026-05-24T15:30:00Z'
  }
];

// LocalStorage Keys
const KEYS = {
  USERS: 'ollesplit_users',
  TRIPS: 'ollesplit_trips',
  ACTIVITIES: 'ollesplit_activities',
  CURRENT_USER_ID: 'ollesplit_current_user_id',
  OFFLINE_MODE: 'ollesplit_offline_mode'
};

// Storage Service Class (Handles mock data read/writes with full reactive local-storage integration)
class StorageService {
  private listeners: (() => void)[] = [];

  constructor() {
    this.initDatabase();
  }

  // Initialize DB if not present in LocalStorage
  private initDatabase() {
    if (!localStorage.getItem(KEYS.USERS)) {
      localStorage.setItem(KEYS.USERS, JSON.stringify(INITIAL_USERS));
    }
    if (!localStorage.getItem(KEYS.TRIPS)) {
      localStorage.setItem(KEYS.TRIPS, JSON.stringify(INITIAL_TRIPS));
    }
    if (!localStorage.getItem(KEYS.ACTIVITIES)) {
      localStorage.setItem(KEYS.ACTIVITIES, JSON.stringify(INITIAL_ACTIVITIES));
    }
    if (!localStorage.getItem(KEYS.CURRENT_USER_ID)) {
      // Default logged in user is Magnus (Superadmin)
      localStorage.setItem(KEYS.CURRENT_USER_ID, 'USER_MAGNUS');
    }
    if (!localStorage.getItem(KEYS.OFFLINE_MODE)) {
      localStorage.setItem(KEYS.OFFLINE_MODE, 'false');
    }
  }

  // Subscribe to reactive database changes (triggers state refreshes in React!)
  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  // --- OFFLINE SIMULATION ---
  isOffline(): boolean {
    return localStorage.getItem(KEYS.OFFLINE_MODE) === 'true';
  }

  setOfflineMode(offline: boolean) {
    localStorage.setItem(KEYS.OFFLINE_MODE, String(offline));
    this.notify();
  }

  // --- AUTHENTICATION MOCK ---
  getUsers(): User[] {
    return JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
  }

  getLoggedInUser(): User {
    const users = this.getUsers();
    const uid = localStorage.getItem(KEYS.CURRENT_USER_ID) || 'USER_MAGNUS';
    return users.find(u => u.uid === uid) || users[0] || INITIAL_USERS[0];
  }

  loginAs(uid: string) {
    localStorage.setItem(KEYS.CURRENT_USER_ID, uid);
    this.notify();
  }

  inviteUser(email: string, alias: string): { success: boolean; error?: string } {
    const users = this.getUsers();
    
    // Check if email already invited
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: 'E-postadressen är redan inbjuden!' };
    }

    const newUser: User = {
      uid: 'USER_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      email: email.toLowerCase(),
      alias: alias || email.split('@')[0],
      role: 'user'
    };

    users.push(newUser);
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    this.notify();
    return { success: true };
  }

  deleteUser(uid: string): { success: boolean; error?: string } {
    // Cannot delete Superadmin Magnus
    if (uid === 'USER_MAGNUS') {
      return { success: false, error: 'Det går inte att kasta ut Superadmin!' };
    }

    let users = this.getUsers();
    users = users.filter(u => u.uid !== uid);
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    
    // If the deleted user was logged in, switch to Magnus
    if (localStorage.getItem(KEYS.CURRENT_USER_ID) === uid) {
      localStorage.setItem(KEYS.CURRENT_USER_ID, 'USER_MAGNUS');
    }
    
    this.notify();
    return { success: true };
  }

  // --- TRIPS CRUD ---
  getTrips(): Trip[] {
    const allTrips: Trip[] = JSON.parse(localStorage.getItem(KEYS.TRIPS) || '[]');
    const currentUser = this.getLoggedInUser();

    // Permissions check:
    // Magnus (Superadmin) can see ALL trips.
    // Regular invited admins can only see trips they created OR are listed in the participants list!
    if (currentUser.role === 'admin') {
      return allTrips;
    }

    return allTrips.filter(t => 
      t.created_by === currentUser.uid || 
      t.participants.some(p => p.id === currentUser.uid)
    );
  }

  // --- ACTIVITIES ---
  getActivityLogs(trip_id: string, currentUser: User): ActivityLog[] {
    const allActivities: ActivityLog[] = JSON.parse(localStorage.getItem(KEYS.ACTIVITIES) || '[]');
    return allActivities
      .filter(a => a.trip_id === trip_id)
      .filter(a => {
        if (currentUser.role === 'admin') return true;
        if (a.user_alias === currentUser.alias) return true;
        if (!a.involved_uids || a.involved_uids.length === 0) return true; // General activities
        return a.involved_uids.includes(currentUser.uid);
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }



  // --- DEBT SIMPLIFICATION ALGORITHM (GREEDY SPLITWISE) ---
  calculateBalances(trip: Trip): { id: string; name: string; paid: number; owed: number; balance: number; lineItems: BalanceLineItem[] }[] {
    const participants = trip.participants;
    const expenses = trip.expenses;
    
    if (participants.length === 0) return [];

    const stats: { [id: string]: { paid: number, owed: number, lineItems: { [expId: string]: BalanceLineItem } } } = {};
    participants.forEach(p => {
      stats[p.id] = { paid: 0, owed: 0, lineItems: {} };
    });

    expenses.forEach(exp => {
      const perUserExpStats: { [id: string]: { paid: number, owed: number } } = {};

      const payerId = exp.paid_by;
      if (!perUserExpStats[payerId]) perUserExpStats[payerId] = { paid: 0, owed: 0 };
      perUserExpStats[payerId].paid += exp.amount;

      if (exp.split_type === 'equal') {
        const selectedParticipants = Object.keys(exp.splits).filter(pId => exp.splits[pId] > 0);
        if (selectedParticipants.length > 0) {
          const share = exp.amount / selectedParticipants.length;
          selectedParticipants.forEach(pId => {
            if (!perUserExpStats[pId]) perUserExpStats[pId] = { paid: 0, owed: 0 };
            perUserExpStats[pId].owed += share;
          });
        }
      } else if (exp.split_type === 'percentage') {
        Object.keys(exp.splits).forEach(pId => {
          const share = exp.amount * ((exp.splits[pId] || 0) / 100);
          if (share > 0) {
            if (!perUserExpStats[pId]) perUserExpStats[pId] = { paid: 0, owed: 0 };
            perUserExpStats[pId].owed += share;
          }
        });
      }

      // Add to global stats and lineItems
      Object.keys(perUserExpStats).forEach(pId => {
        if (stats[pId]) {
          stats[pId].paid += perUserExpStats[pId].paid;
          stats[pId].owed += perUserExpStats[pId].owed;
          stats[pId].lineItems[exp.expense_id] = {
            expense_id: exp.expense_id,
            title: exp.title,
            paidAmount: perUserExpStats[pId].paid,
            owedAmount: perUserExpStats[pId].owed,
            date: exp.created_at
          };
        }
      });
    });

    return participants.map(p => ({
      id: p.id,
      name: p.name,
      paid: Math.round(stats[p.id].paid * 100) / 100,
      owed: Math.round(stats[p.id].owed * 100) / 100,
      balance: Math.round((stats[p.id].paid - stats[p.id].owed) * 100) / 100,
      lineItems: Object.values(stats[p.id].lineItems).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }));
  }

  calculateSettlements(trip: Trip): { from: string; fromName: string; to: string; toName: string; amount: number }[] {
    const participants = trip.participants;
    const expenses = trip.expenses;
    
    if (participants.length === 0 || expenses.length === 0) return [];

    // 1. Calculate net balance for each participant
    // Net balance = (Total amount paid by participant) - (Total amount participant owes)
    const balances: { [id: string]: number } = {};
    participants.forEach(p => {
      balances[p.id] = 0;
    });

    expenses.forEach(exp => {
      const payerId = exp.paid_by;
      
      // Add amount to the payer's balance
      if (balances[payerId] !== undefined) {
        balances[payerId] += exp.amount;
      }

      // Calculate how much each participant owes for this expense
      if (exp.split_type === 'equal') {
        // Equal split: divide amount equally among all selected participants in the splits
        const selectedParticipants = Object.keys(exp.splits);
        const share = exp.amount / selectedParticipants.length;
        selectedParticipants.forEach(pId => {
          if (balances[pId] !== undefined) {
            balances[pId] -= share;
          }
        });
      } else if (exp.split_type === 'percentage') {
        // Percentage split: calculate custom percentage for each
        const selectedParticipants = Object.keys(exp.splits);
        selectedParticipants.forEach(pId => {
          const percentage = exp.splits[pId];
          const share = exp.amount * (percentage / 100);
          if (balances[pId] !== undefined) {
            balances[pId] -= share;
          }
        });
      }
    });

    // 2. Separate into debtors (those who owe money, net < 0) and creditors (those who are owed money, net > 0)
    const debtors: { id: string; name: string; amount: number }[] = [];
    const creditors: { id: string; name: string; amount: number }[] = [];

    participants.forEach(p => {
      // Fix float rounding issues (e.g. 0.0000001 -> 0)
      const balance = Math.round(balances[p.id] * 100) / 100;
      if (balance < 0) {
        debtors.push({ id: p.id, name: p.name, amount: -balance });
      } else if (balance > 0) {
        creditors.push({ id: p.id, name: p.name, amount: balance });
      }
    });

    // Sort debtors descending and creditors descending to always match the largest amounts first (Greedy approach)
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements: { from: string; fromName: string; to: string; toName: string; amount: number }[] = [];

    let d = 0; // debtor index
    let c = 0; // creditor index

    while (d < debtors.length && c < creditors.length) {
      const debtor = debtors[d];
      const creditor = creditors[c];

      // Settle the minimum of what debtor owes vs what creditor is owed
      const settleAmount = Math.min(debtor.amount, creditor.amount);
      const roundedAmount = Math.round(settleAmount * 100) / 100;

      if (roundedAmount > 0.01) {
        settlements.push({
          from: debtor.id,
          fromName: debtor.name,
          to: creditor.id,
          toName: creditor.name,
          amount: roundedAmount
        });
      }

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (Math.round(debtor.amount * 100) / 100 <= 0) {
        d++;
      }
      if (Math.round(creditor.amount * 100) / 100 <= 0) {
        c++;
      }
    }

    return settlements;
  }
}

export const storageService = new StorageService();
