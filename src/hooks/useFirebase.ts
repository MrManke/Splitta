import { useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { firebaseService } from '../services/firebaseService';
import type { Trip, User, ActivityLog } from '../services/storageService';

export function useFirebase() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [authLoading, setAuthLoading] = useState(true);

  // 1. Auth Listener
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: any) => {
      if (firebaseUser) {
        let userDoc = await firebaseService.getUser(firebaseUser.uid);
        const isSuperAdmin = firebaseUser.email === 'magnus.ohlund@outlook.com' || firebaseUser.email === 'magnus.ohlund74@gmail.com';

        // If no direct UID match, try finding by email in any user's emails array
        if (!userDoc && firebaseUser.email) {
          userDoc = await firebaseService.getUserByEmail(firebaseUser.email);
          if (userDoc) {
            // Link Firebase Auth UID to existing user doc
            userDoc.uid = firebaseUser.uid;
            if (!userDoc.emails) {
              userDoc.emails = [userDoc.email];
            }
            if (!userDoc.emails.includes(firebaseUser.email)) {
              userDoc.emails.push(firebaseUser.email);
            }
            await firebaseService.saveUser(userDoc);
          }
        }

        if (!userDoc) {
          // Create user document if it doesn't exist
          userDoc = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            alias: isSuperAdmin ? 'Ölle' : (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Användare'),
            role: isSuperAdmin ? 'superadmin' : 'user',
            emails: firebaseUser.email ? [firebaseUser.email] : [],
          };
          await firebaseService.saveUser(userDoc);
        } else if (isSuperAdmin && (userDoc.alias !== 'Ölle' || userDoc.role !== 'superadmin')) {
           // Enforce Ölle alias and superadmin role for existing documents
           userDoc.alias = 'Ölle';
           userDoc.role = 'superadmin';
           await firebaseService.saveUser(userDoc);
        }
        setCurrentUser(userDoc);
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Users Listener
  useEffect(() => {
    if (!db) return;
    const q = collection(db, 'users');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData: User[] = [];
      snapshot.forEach((doc) => usersData.push(doc.data() as User));
      setAllUsers(usersData);
    });
    return () => unsubscribe();
  }, []);

  // 3. Trips Listener
  useEffect(() => {
    if (!db || !currentUser) {
      setTrips([]);
      return;
    }
    
    // Superadmins see all trips, admins and users see trips they are part of
    let q;
    if (currentUser.role === 'superadmin') {
      q = collection(db, 'trips');
    } else {
      q = query(collection(db, 'trips'), where('participant_uids', 'array-contains', currentUser.uid));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsData: Trip[] = [];
      snapshot.forEach((doc) => tripsData.push(doc.data() as Trip));
      // Sort by latest created first
      tripsData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTrips(tripsData);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 4. Activities Listener
  useEffect(() => {
    if (!db || !currentUser) {
      setActivities([]);
      return;
    }

    const q = collection(db, 'activities');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const actsData: ActivityLog[] = [];
      snapshot.forEach((doc) => actsData.push(doc.data() as ActivityLog));
      
      // Filter activities in memory (similar to before)
      const filteredActs = actsData.filter(a => {
        if (currentUser.role === 'superadmin') return true;
        if (a.user_alias === currentUser.alias) return true;
        if (!a.involved_uids || a.involved_uids.length === 0) return true;
        return a.involved_uids.includes(currentUser.uid);
      });
      
      filteredActs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setActivities(filteredActs);
    });

    return () => unsubscribe();
  }, [currentUser]);

  return { currentUser, allUsers, trips, activities, authLoading };
}
