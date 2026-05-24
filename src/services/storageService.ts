// Types for Ölle-Split

export interface User {
  uid: string;
  email: string;
  alias: string;
  role: 'admin' | 'user';
}

export interface Participant {
  id: string;
  name: string;
  has_account: boolean;
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

  createTrip(title: string, currency: string = 'SEK', participantNames: string[]): Trip {
    const currentUser = this.getLoggedInUser();
    const trips = JSON.parse(localStorage.getItem(KEYS.TRIPS) || '[]') as Trip[];

    const trip_id = 'TRIP_' + Math.random().toString(36).substr(2, 9).toUpperCase();

    // Map initial participants
    const participants: Participant[] = [
      { id: currentUser.uid, name: currentUser.alias, has_account: true }
    ];

    // Add other invited users if names match, otherwise add as Ghost Users
    const allUsers = this.getUsers();
    participantNames.forEach((name, index) => {
      if (!name.trim()) return;
      
      // Look for a registered user with this exact alias or email
      const matchedUser = allUsers.find(u => 
        u.alias.toLowerCase() === name.toLowerCase() || 
        u.email.toLowerCase() === name.toLowerCase()
      );

      if (matchedUser) {
        // Prevent double adding creator
        if (matchedUser.uid !== currentUser.uid) {
          participants.push({ id: matchedUser.uid, name: matchedUser.alias, has_account: true });
        }
      } else {
        // Create a Ghost User
        participants.push({ 
          id: `GHOST_${index}_` + Math.random().toString(36).substr(2, 5).toUpperCase(), 
          name: name.trim(), 
          has_account: false 
        });
      }
    });

    const newTrip: Trip = {
      trip_id,
      title,
      created_by: currentUser.uid,
      created_at: new Date().toISOString(),
      total_cost: 0,
      currency,
      participants,
      expenses: [],
      comments: [],
      album: []
    };

    trips.push(newTrip);
    localStorage.setItem(KEYS.TRIPS, JSON.stringify(trips));

    this.logActivity(trip_id, currentUser.alias, `skapade resan "${title}"`);
    this.notify();
    return newTrip;
  }

  // --- EXPENSES CRUD ---
  addExpense(
    trip_id: string, 
    title: string, 
    amount: number, 
    paid_by: string, 
    split_type: 'equal' | 'percentage', 
    splits: { [participantId: string]: number },
    comment?: string,
    receipt_url?: string
  ): { success: boolean; error?: string } {
    const trips = JSON.parse(localStorage.getItem(KEYS.TRIPS) || '[]') as Trip[];
    const tripIndex = trips.findIndex(t => t.trip_id === trip_id);
    
    if (tripIndex === -1) return { success: false, error: 'Resan hittades inte!' };
    
    const currentUser = this.getLoggedInUser();
    const expense_id = 'EXP_' + Math.random().toString(36).substr(2, 9).toUpperCase();

    const newExpense: Expense = {
      expense_id,
      title,
      amount,
      paid_by,
      created_by_alias: currentUser.alias,
      split_type,
      splits,
      comment,
      receipt_url,
      created_at: new Date().toISOString()
    };

    trips[tripIndex].expenses.push(newExpense);
    
    // Recalculate rolling total
    trips[tripIndex].total_cost = trips[tripIndex].expenses.reduce((sum, e) => sum + e.amount, 0);

    localStorage.setItem(KEYS.TRIPS, JSON.stringify(trips));
    
    // Log Activity
    this.logActivity(trip_id, currentUser.alias, `lade till utlägget "${title}" - ${amount} ${trips[tripIndex].currency}`);
    this.notify();
    
    return { success: true };
  }

  deleteExpense(trip_id: string, expense_id: string): { success: boolean; error?: string } {
    const trips = JSON.parse(localStorage.getItem(KEYS.TRIPS) || '[]') as Trip[];
    const tripIndex = trips.findIndex(t => t.trip_id === trip_id);
    
    if (tripIndex === -1) return { success: false, error: 'Resan hittades inte!' };
    
    const currentUser = this.getLoggedInUser();
    const expense = trips[tripIndex].expenses.find(e => e.expense_id === expense_id);
    if (!expense) return { success: false, error: 'Utlägget hittades inte!' };

    trips[tripIndex].expenses = trips[tripIndex].expenses.filter(e => e.expense_id !== expense_id);
    trips[tripIndex].comments = trips[tripIndex].comments.filter(c => c.expense_id !== expense_id);
    
    // Recalculate rolling total
    trips[tripIndex].total_cost = trips[tripIndex].expenses.reduce((sum, e) => sum + e.amount, 0);

    localStorage.setItem(KEYS.TRIPS, JSON.stringify(trips));

    this.logActivity(trip_id, currentUser.alias, `tog bort utlägget "${expense.title}" - ${expense.amount} ${trips[tripIndex].currency}`);
    this.notify();

    return { success: true };
  }

  // --- COMMENTS ---
  addComment(trip_id: string, expense_id: string, text: string): { success: boolean; error?: string } {
    const trips = JSON.parse(localStorage.getItem(KEYS.TRIPS) || '[]') as Trip[];
    const tripIndex = trips.findIndex(t => t.trip_id === trip_id);
    
    if (tripIndex === -1) return { success: false, error: 'Resan hittades inte!' };
    
    const currentUser = this.getLoggedInUser();
    const comment_id = 'COM_' + Math.random().toString(36).substr(2, 9).toUpperCase();

    const newComment: Comment = {
      comment_id,
      expense_id,
      author_id: currentUser.uid,
      author_alias: currentUser.alias,
      text,
      created_at: new Date().toISOString()
    };

    trips[tripIndex].comments.push(newComment);
    localStorage.setItem(KEYS.TRIPS, JSON.stringify(trips));
    this.notify();

    return { success: true };
  }

  // --- ALBUM ---
  uploadPhoto(trip_id: string, base64Url: string, caption: string): { success: boolean; error?: string } {
    const trips = JSON.parse(localStorage.getItem(KEYS.TRIPS) || '[]') as Trip[];
    const tripIndex = trips.findIndex(t => t.trip_id === trip_id);
    
    if (tripIndex === -1) return { success: false, error: 'Resan hittades inte!' };
    
    const currentUser = this.getLoggedInUser();
    const photo_id = 'PHOTO_' + Math.random().toString(36).substr(2, 9).toUpperCase();

    const newPhoto: AlbumPhoto = {
      photo_id,
      url: base64Url,
      uploaded_by: currentUser.alias,
      caption,
      created_at: new Date().toISOString()
    };

    trips[tripIndex].album.push(newPhoto);
    localStorage.setItem(KEYS.TRIPS, JSON.stringify(trips));
    
    this.logActivity(trip_id, currentUser.alias, `laddade upp en bild till resealbumet`);
    this.notify();

    return { success: true };
  }

  // --- ACTIVITIES ---
  getActivityLogs(trip_id: string): ActivityLog[] {
    const allActivities: ActivityLog[] = JSON.parse(localStorage.getItem(KEYS.ACTIVITIES) || '[]');
    return allActivities
      .filter(a => a.trip_id === trip_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  private logActivity(trip_id: string, user_alias: string, action: string) {
    const activities: ActivityLog[] = JSON.parse(localStorage.getItem(KEYS.ACTIVITIES) || '[]');
    activities.push({
      id: 'ACT_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      trip_id,
      user_alias,
      action,
      created_at: new Date().toISOString()
    });
    localStorage.setItem(KEYS.ACTIVITIES, JSON.stringify(activities));
  }

  // --- DEBT SIMPLIFICATION ALGORITHM (GREEDY SPLITWISE) ---
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
