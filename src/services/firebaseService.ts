import { db } from './firebase';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import type { Trip, User, Expense, Comment, AlbumPhoto, ActivityLog } from './storageService';

const TRIPS_COLLECTION = 'trips';
const USERS_COLLECTION = 'users';
const ACTIVITIES_COLLECTION = 'activities';

export const firebaseService = {
  // --- USERS ---
  async saveUser(user: User): Promise<void> {
    await setDoc(doc(db, USERS_COLLECTION, user.uid), user, { merge: true });
  },
  
  async getUser(uid: string): Promise<User | null> {
    const docSnap = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (docSnap.exists()) {
      return docSnap.data() as User;
    }
    return null;
  },

  // --- TRIPS ---
  async addTrip(trip: Trip): Promise<void> {
    // We add participant_uids array for easy Firestore querying/security rules
    const participant_uids = trip.participants.map(p => p.id);
    await setDoc(doc(db, TRIPS_COLLECTION, trip.trip_id), { ...trip, participant_uids });
  },

  async updateTrip(trip: Trip): Promise<void> {
    const participant_uids = trip.participants.map(p => p.id);
    await setDoc(doc(db, TRIPS_COLLECTION, trip.trip_id), { ...trip, participant_uids }, { merge: true });
  },

  async deleteTrip(tripId: string): Promise<void> {
    await deleteDoc(doc(db, TRIPS_COLLECTION, tripId));
  },

  // --- EXPENSES ---
  async addExpense(
    trip: Trip,
    title: string,
    amount: number,
    paid_by: string,
    split_type: 'equal' | 'percentage',
    splits: { [participantId: string]: number },
    currentUser: User,
    comment?: string,
    receipt_url?: string
  ): Promise<void> {
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

    const updatedExpenses = [...trip.expenses, newExpense];
    const total_cost = updatedExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    await this.updateTrip({ ...trip, expenses: updatedExpenses, total_cost });

    const involved = [...new Set([paid_by, ...Object.keys(splits).filter(id => splits[id] > 0)])];
    await this.logActivity(trip.trip_id, currentUser.alias, `lade till utlägget "${title}" - ${amount} ${trip.currency}`, involved);
  },

  async updateExpense(
    trip: Trip,
    expense_id: string,
    title: string,
    amount: number,
    paid_by: string,
    split_type: 'equal' | 'percentage',
    splits: { [participantId: string]: number },
    currentUser: User,
    comment?: string,
    receipt_url?: string
  ): Promise<void> {
    const updatedExpenses = trip.expenses.map(e => {
      if (e.expense_id === expense_id) {
        return {
          ...e,
          title, amount, paid_by, split_type, splits, comment,
          receipt_url: receipt_url !== undefined ? receipt_url : e.receipt_url
        };
      }
      return e;
    });

    const total_cost = updatedExpenses.reduce((sum, e) => sum + e.amount, 0);
    await this.updateTrip({ ...trip, expenses: updatedExpenses, total_cost });

    const involved = [...new Set([paid_by, ...Object.keys(splits).filter(id => splits[id] > 0)])];
    await this.logActivity(trip.trip_id, currentUser.alias, `uppdaterade utlägget "${title}" - ${amount} ${trip.currency}`, involved);
  },

  async deleteExpense(trip: Trip, expense_id: string, currentUser: User): Promise<void> {
    const expense = trip.expenses.find(e => e.expense_id === expense_id);
    if (!expense) return;

    const updatedExpenses = trip.expenses.filter(e => e.expense_id !== expense_id);
    const updatedComments = trip.comments.filter(c => c.expense_id !== expense_id);
    const total_cost = updatedExpenses.reduce((sum, e) => sum + e.amount, 0);

    await this.updateTrip({ ...trip, expenses: updatedExpenses, comments: updatedComments, total_cost });

    const involved = [...new Set([expense.paid_by, ...Object.keys(expense.splits).filter(id => expense.splits[id] > 0)])];
    await this.logActivity(trip.trip_id, currentUser.alias, `tog bort utlägget "${expense.title}" - ${expense.amount} ${trip.currency}`, involved);
  },

  // --- ALBUM & COMMENTS ---
  async uploadPhoto(trip: Trip, url: string, caption: string, currentUser: User): Promise<void> {
    const newPhoto: AlbumPhoto = {
      photo_id: 'PHOTO_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      url,
      caption,
      uploaded_by: currentUser.alias,
      created_at: new Date().toISOString()
    };

    const updatedAlbum = [...trip.album, newPhoto];
    await this.updateTrip({ ...trip, album: updatedAlbum });
    await this.logActivity(trip.trip_id, currentUser.alias, `laddade upp en bild till resealbumet`);
  },

  async addComment(trip: Trip, expense_id: string, text: string, currentUser: User): Promise<void> {
    const newComment: Comment = {
      comment_id: 'COM_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      expense_id,
      author_id: currentUser.uid,
      author_alias: currentUser.alias,
      text,
      created_at: new Date().toISOString()
    };

    const updatedComments = [...trip.comments, newComment];
    await this.updateTrip({ ...trip, comments: updatedComments });
    await this.logActivity(trip.trip_id, currentUser.alias, `kommenterade på ett utlägg`);
  },

  // --- ACTIVITIES ---
  async logActivity(trip_id: string, user_alias: string, action: string, involved_uids: string[] = []): Promise<void> {
    const activity: ActivityLog = {
      id: 'ACT_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      trip_id,
      user_alias,
      action,
      involved_uids,
      created_at: new Date().toISOString()
    };
    await setDoc(doc(db, 'activities', activity.id), activity);
  }
};
