import { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, Users, Image as ImageIcon, FileText, CreditCard, 
  Share2, Camera, Upload, Shield, AlertTriangle, 
  Wifi, WifiOff, ChevronDown, ChevronUp, Check, Sparkles, Send, ArrowLeft
} from 'lucide-react';
import QRCode from 'react-qr-code';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { firebaseService } from './services/firebaseService';
import { useFirebase } from './hooks/useFirebase';
import { auth, db, googleProvider, microsoftProvider } from './services/firebase';
import { 
  signInWithPopup, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  isSignInWithEmailLink, 
  signInWithEmailLink,
  sendPasswordResetEmail,
  deleteUser
} from 'firebase/auth';
import { disableNetwork, enableNetwork, deleteDoc, doc } from 'firebase/firestore';
import { storageService, type Trip, type User } from './services/storageService';
import { ocrService } from './services/ocrService';
import './App.css';

const formatName = (name: string) => name.replace(' (Admin)', '').replace(' (Utan konto)', '').trim();

// Returns a phone number suitable for Swish, or empty string if not set
const getSwishPhone = (phone?: string) => (!phone || phone === 'NOPHONE') ? '' : phone;

// Compress images before converting to base64 to avoid Firestore 1MB limits
const compressImage = (fileToCompress: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(fileToCompress);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200; // Good enough for OCR and screen viewing
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6)); // Compress to 60% JPEG
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

const QRCodeComponent: any = (QRCode as any).default || QRCode;

function App() {
  // --- STATE (Firebase Sync) ---
  const { currentUser, setCurrentUser, allUsers, trips, activities, authLoading } = useFirebase();

  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);

  // Auto-select last active trip once trips are loaded
  useEffect(() => {
    if (trips.length > 0 && !activeTrip) {
      const savedTripId = localStorage.getItem('OlleSplit_LastTripId');
      if (savedTripId) {
        const t = trips.find(t => t.trip_id === savedTripId);
        if (t) setActiveTrip(t);
      }
    }
    // Update activeTrip reference if it changed in Firestore
    if (activeTrip) {
      const updated = trips.find(t => t.trip_id === activeTrip.trip_id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(activeTrip)) {
        setActiveTrip(updated);
      }
    }
  }, [trips]);

  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [theme, setTheme] = useState<'blue' | 'purple' | 'dark'>(() => {
    return (localStorage.getItem('OlleSplit_Theme') as 'blue' | 'purple' | 'dark') || 'blue';
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'debts' | 'album' | 'admin'>('dashboard');

  // Interactive UI States
  const [expandedExpense, setExpandedExpense] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Modals
  const [showAddTripModal, setShowAddTripModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [showSwishModal, setShowSwishModal] = useState<{ from: string; fromName: string; to: string; toName: string; amount: number } | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareFormat, setShareFormat] = useState<'text' | 'image' | 'pdf' | 'whatsapp' | 'email'>('whatsapp');
  const [shareLevel, setShareLevel] = useState<'summary' | 'all'>('all');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  
  // Trip Dropdown state
  const [showTripDropdown, setShowTripDropdown] = useState(false);

  // Form Inputs - Trip
  const [newTripTitle, setNewTripTitle] = useState('');
  const [newTripCurrency, setNewTripCurrency] = useState('SEK');
  const [newTripParticipants, setNewTripParticipants] = useState<string[]>(['', '', '']);

  // Form Inputs - Expense
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePayer, setExpensePayer] = useState('');
  const [expenseSplitType, setExpenseSplitType] = useState<'equal' | 'percentage'>('equal');
  const [expenseSplits, setExpenseSplits] = useState<{ [id: string]: number }>({});
  const [expenseComment, setExpenseComment] = useState('');
  const [expenseReceiptBase64, setExpenseReceiptBase64] = useState<string>('');
  const [isOcrScanning, setIsOcrScanning] = useState(false);

  // Form Inputs - Album & Admin & Comments
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoBase64, setPhotoBase64] = useState('');
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteAlias, setInviteAlias] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [newCommentText, setNewCommentText] = useState<{ [expenseId: string]: string }>({});

  // Form Inputs - Admin Edit User
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [swishPhoneInput, setSwishPhoneInput] = useState('');

  // Form Inputs - Auth & Profile
  const [emailLogin, setEmailLogin] = useState('');
  const [passwordLogin, setPasswordLogin] = useState('');
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('');
  const [loginMode, setLoginMode] = useState<'choose' | 'email-password' | 'create-password'>('choose');
  const [phonePromptInput, setPhonePromptInput] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAlias, setProfileAlias] = useState('');

  // Invite/Activation flow
  const [inviteParam, setInviteParam] = useState<string | null>(null);
  const [inviteAlias2, setInviteAlias2] = useState<string | null>(null);
  const [activationMode, setActivationMode] = useState<'choose' | 'password'>('choose');
  const [activationPassword, setActivationPassword] = useState('');
  const [activationPasswordConfirm, setActivationPasswordConfirm] = useState('');
  const [activationError, setActivationError] = useState('');

  // Refs for uploading files
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // The data sync is now handled entirely by the useFirebase hook above!

  useEffect(() => {
    if (activeTrip) {
      localStorage.setItem('OlleSplit_LastTripId', activeTrip.trip_id);
    }
  }, [activeTrip]);

  useEffect(() => {
    if (theme === 'blue') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('OlleSplit_Theme', theme);
  }, [theme]);

  // Magic Link handler
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Vänligen bekräfta din e-postadress för inloggning:');
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            window.localStorage.removeItem('emailForSignIn');
            window.history.replaceState(null, '', window.location.pathname);
          })
          .catch((error) => {
            console.error('Error signing in with email link', error);
            alert('Länken är antingen ogiltig eller har redan använts.');
          });
      }
    }
  }, []);

  // Detect invite URL parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    const alias = params.get('alias');
    if (invite) {
      setInviteParam(invite.toLowerCase());
      setInviteAlias2(alias || invite.split('@')[0]);
    }
  }, []);

  // Show auto-fading toasts
  const triggerToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // --- ACTIONS ---
  const handleToggleOffline = async () => {
    try {
      if (!isOffline) {
        await disableNetwork(db);
        setIsOffline(true);
        triggerToast('Fjäll-läge aktiverat! (Tvingad offline-läge)', 'error');
      } else {
        await enableNetwork(db);
        setIsOffline(false);
        triggerToast('Ansluten till molnet! Synkroniserar...', 'success');
      }
    } catch (error) {
      console.error("Kunde inte växla nätverksläge:", error);
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTripTitle.trim()) {
      triggerToast('Ange en titel för resan!', 'error');
      return;
    }
    if (!currentUser) return;

    const trip_id = 'TRIP_' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const participants: any[] = [{ id: currentUser.uid, name: currentUser.alias, has_account: true }];
    
    newTripParticipants.forEach((name, index) => {
      if (!name.trim()) return;
      const matchedUser = allUsers.find(u => u.alias.toLowerCase() === name.toLowerCase() || u.email.toLowerCase() === name.toLowerCase());
      if (matchedUser && matchedUser.uid !== currentUser.uid) {
        participants.push({ id: matchedUser.uid, name: matchedUser.alias, has_account: true });
      } else if (!matchedUser) {
        participants.push({ id: `GHOST_${index}_` + Math.random().toString(36).substr(2, 5).toUpperCase(), name: name.trim(), has_account: false });
      }
    });

    const newTrip: Trip = {
      trip_id,
      title: newTripTitle,
      created_by: currentUser.uid,
      created_at: new Date().toISOString(),
      total_cost: 0,
      currency: newTripCurrency,
      participants,
      expenses: [],
      comments: [],
      album: []
    };

    await firebaseService.addTrip(newTrip);
    await firebaseService.logActivity(trip_id, currentUser.alias, `skapade resan "${newTripTitle}"`, participants.map(p => p.id));
    
    setActiveTrip(newTrip);
    setShowAddTripModal(false);
    setNewTripTitle('');
    setNewTripParticipants(['', '', '']);
    setActiveTab('dashboard');
    triggerToast(`Resan "${newTrip.title}" har skapats!`);
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      triggerToast('Ange e-postadress!', 'error');
      return;
    }

    const emailLower = inviteEmail.toLowerCase().trim();
    let userToInvite = allUsers.find(u => u.email === emailLower || (u.emails && u.emails.includes(emailLower)));

    if (!userToInvite) {
      userToInvite = {
        uid: 'USER_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        email: emailLower,
        alias: inviteAlias || inviteEmail.split('@')[0],
        role: 'user'
      };
      await firebaseService.saveUser(userToInvite);
    }

    triggerToast(`Inbjudan skickad till ${inviteEmail}!`);
    setShowInviteModal(false);
    setInviteEmail('');
    setInviteAlias('');
    setInvitePhone('');
  };

  const handleKickUser = async (targetUid: string) => {
    if (confirm('Är du säker på att du vill kasta ut denna användare från plattformen? Deras utlägg kommer att finnas kvar i existerande resor som "Gäst-utlägg" för att inte förstöra kalkylerna, men användaren förlorar sin inloggning.')) {
      if (targetUid) {
         await firebaseService.deleteUser(targetUid);
         triggerToast('Användare borttagen från databasen.');
      }
    }
  };



  const generateInviteLink = (email: string, alias: string) => {
    return `${window.location.origin}/?invite=${encodeURIComponent(email)}&alias=${encodeURIComponent(alias)}`;
  };

  const handleShareInvite = (email: string, alias: string, method: 'whatsapp' | 'email' | 'copy') => {
    const activationUrl = generateInviteLink(email, alias);
    const messageBody = `Hej ${alias}!\n\nDu har blivit inbjuden till Splitta. Klicka på länken nedan för att aktivera ditt konto och välja hur du vill logga in framöver (Google, Microsoft eller Lösenord):\n\n${activationUrl}\n\nVälkommen! 🤝`;

    if (method === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(messageBody)}`, '_blank');
      triggerToast(`WhatsApp öppnat med inbjudan till ${alias}!`);
    } else if (method === 'email') {
      window.open(`mailto:${email}?subject=${encodeURIComponent('Inbjudan till Splitta')}&body=${encodeURIComponent(messageBody)}`, '_blank');
      triggerToast(`E-postprogram öppnat med inbjudan till ${alias}!`);
    } else {
      navigator.clipboard.writeText(activationUrl);
      triggerToast(`Aktiveringslänk kopierad till urklipp!`);
    }
  };

  // OAuth Activation (for invite flow)
  const handleOAuthActivation = async (provider: 'google' | 'microsoft') => {
    try {
      setActivationError('');
      const authProvider = provider === 'google' ? googleProvider : microsoftProvider;
      const result = await signInWithPopup(auth, authProvider);
      const authenticatedEmail = result.user.email?.toLowerCase();
      const urlInviteEmail = inviteParam;

      // SECURITY: Must match invite email
      if (authenticatedEmail !== urlInviteEmail) {
        await signOut(auth);
        setActivationError(`E-postadressen du loggade in med (${authenticatedEmail}) matchar inte inbjudan (${urlInviteEmail}). Logga in med rätt konto!`);
        return;
      }

      // Match OK — link Firebase UID to existing Firestore user profile
      const userDoc = await firebaseService.getUserByEmail(urlInviteEmail!);
      if (userDoc) {
        if (!userDoc.emails) userDoc.emails = [userDoc.email];
        if (!userDoc.emails.includes(authenticatedEmail!)) {
          userDoc.emails.push(authenticatedEmail!);
        }
        await firebaseService.saveUser(userDoc);
      }
      triggerToast(`Välkommen ${inviteAlias2}! Ditt konto har aktiverats.`);
      window.history.replaceState(null, '', window.location.pathname);
      setInviteParam(null);
      setInviteAlias2(null);
    } catch (error: any) {
      console.error('Activation failed:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        setActivationError('Något gick fel vid inloggningen. Försök igen.');
      }
    }
  };

  // Password Activation (for invite flow)
  const handlePasswordActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    setActivationError('');
    if (activationPassword.length < 6) {
      setActivationError('Lösenordet måste vara minst 6 tecken.');
      return;
    }
    if (activationPassword !== activationPasswordConfirm) {
      setActivationError('Lösenorden matchar inte!');
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, inviteParam!, activationPassword);
      // Link Firebase UID to existing Firestore user profile
      const userDoc = await firebaseService.getUserByEmail(inviteParam!);
      if (userDoc) {
        if (!userDoc.emails) userDoc.emails = [userDoc.email];
        await firebaseService.saveUser(userDoc);
      }
      triggerToast(`Välkommen ${inviteAlias2}! Ditt konto har aktiverats med lösenord.`);
      window.history.replaceState(null, '', window.location.pathname);
      setInviteParam(null);
      setInviteAlias2(null);
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        setActivationError('Det finns redan ett konto med den här e-postadressen. Logga in med Google, Microsoft eller lösenord på vanliga inloggningssidan istället.');
      } else {
        setActivationError(error.message);
      }
    }
  };

  const handleOpenAddExpense = () => {
    if (!activeTrip) {
      triggerToast('Skapa eller välj en resa först!', 'error');
      return;
    }
    
    setEditingExpenseId(null);
    if (!currentUser) return;
    setExpensePayer(currentUser.uid);
    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseComment('');
    setExpenseReceiptBase64('');
    setExpenseSplitType('equal');
    
    const initialSplits: { [id: string]: number } = {};
    activeTrip.participants.forEach(p => {
      initialSplits[p.id] = 1;
    });
    setExpenseSplits(initialSplits);
    setExpenseReceiptBase64('');
    setShowAddExpenseModal(true);
  };

  const handleOpenEditExpense = (exp: any) => {
    if (!activeTrip) return;
    
    if (!currentUser) return;
    if (currentUser.role === 'user' && exp.paid_by !== currentUser.uid) {
      triggerToast('Du kan bara ändra dina egna utlägg.', 'error');
      return;
    }

    setEditingExpenseId(exp.expense_id);
    setExpenseTitle(exp.title);
    setExpenseAmount(exp.amount.toString());
    setExpensePayer(exp.paid_by);
    setExpenseSplitType(exp.split_type);
    setExpenseComment(exp.comment || '');
    setExpenseReceiptBase64(exp.receipt_url || '');
    
    const initialSplits: { [id: string]: number } = {};
    activeTrip.participants.forEach(p => {
      // In equal split, checked is splits[p.id] > 0
      initialSplits[p.id] = exp.splits[p.id] || 0;
    });
    setExpenseSplits(initialSplits);
    setShowAddExpenseModal(true);
  };

  const handleSplitChange = (pId: string, value: number) => {
    setExpenseSplits(prev => ({
      ...prev,
      [pId]: value
    }));
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    if (!expenseTitle.trim()) {
      triggerToast('Ange vad utlägget gäller!', 'error');
      return;
    }
    const amountNum = parseFloat(expenseAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      triggerToast('Ange ett giltigt belopp!', 'error');
      return;
    }

    const finalSplits: { [id: string]: number } = {};
    const selectedParticipants = Object.keys(expenseSplits).filter(pId => expenseSplits[pId] > 0);

    if (selectedParticipants.length === 0) {
      triggerToast('Minst en deltagare måste ingå i splitten!', 'error');
      return;
    }

    if (expenseSplitType === 'equal') {
      selectedParticipants.forEach(pId => {
        finalSplits[pId] = 100 / selectedParticipants.length;
      });
    } else {
      const totalPct = selectedParticipants.reduce((sum, pId) => sum + (expenseSplits[pId] || 0), 0);
      if (Math.abs(totalPct - 100) > 0.1) {
        triggerToast(`Procentsatserna måste summera till exakt 100%! Nu är det ${totalPct}%`, 'error');
        return;
      }
      selectedParticipants.forEach(pId => {
        finalSplits[pId] = expenseSplits[pId];
      });
    }

    const executeAsync = async () => {
      try {
        if (editingExpenseId) {
          await firebaseService.updateExpense(
            activeTrip,
            editingExpenseId,
            expenseTitle,
            amountNum,
            expensePayer,
            expenseSplitType,
            finalSplits,
            currentUser!,
            expenseComment,
            expenseReceiptBase64 === '' ? undefined : expenseReceiptBase64
          );
        } else {
          await firebaseService.addExpense(
            activeTrip,
            expenseTitle,
            amountNum,
            expensePayer,
            expenseSplitType,
            finalSplits,
            currentUser!,
            expenseComment,
            expenseReceiptBase64 === '' ? undefined : expenseReceiptBase64
          );
        }
        triggerToast(editingExpenseId ? 'Utlägget har uppdaterats!' : 'Utlägget har registrerats!');
        setEditingExpenseId(null);
        setShowAddExpenseModal(false);
        setActiveTab('expenses');
      } catch (err: any) {
        triggerToast('Något gick fel: ' + err.message, 'error');
      }
    };
    executeAsync();
  };

  const handleDeleteExpense = (expenseId: string, title: string) => {
    if (!activeTrip) return;
    
    const exp = activeTrip.expenses.find(e => e.expense_id === expenseId);
    if (!currentUser) return;
    if (currentUser.role === 'user' && exp?.paid_by !== currentUser.uid) {
      triggerToast('Du kan bara ta bort dina egna utlägg.', 'error');
      return;
    }

    if (confirm(`Vill du ta bort utlägget "${title}"?`)) {
      firebaseService.deleteExpense(activeTrip, expenseId, currentUser!)
        .then(() => triggerToast('Utlägget har raderats.'))
        .catch(() => triggerToast('Gick inte att radera utlägget', 'error'));
    }
  };

  const handleMarkAsPaid = async (settlement: { from: string; fromName: string; to: string; toName: string; amount: number }) => {
    if (!activeTrip || !currentUser) return;
    if (!confirm(`Markera betalning: ${formatName(settlement.fromName)} betalar ${settlement.amount} ${activeTrip.currency} till ${formatName(settlement.toName)}?`)) return;
    
    try {
      const splits: { [id: string]: number } = {};
      splits[settlement.to] = 100; // Only the receiver "owes" this amount
      
      await firebaseService.addExpense(
        activeTrip,
        `Betalning: ${formatName(settlement.fromName)} -> ${formatName(settlement.toName)}`,
        settlement.amount,
        settlement.from,  // The debtor "paid"
        'percentage',
        splits,
        currentUser,
        'Automatisk reglering via Markera som betald',
        undefined,
        true // is_settlement
      );
      triggerToast(`Betalning registrerad! Skulden ar reglerad.`);
    } catch (err: any) {
      triggerToast('Kunde inte registrera betalning: ' + err.message, 'error');
    }
  };

  const handleAddComment = (e: React.FormEvent, expenseId: string) => {
    e.preventDefault();
    if (!activeTrip) return;
    const text = newCommentText[expenseId];
    if (!text || !text.trim()) return;

    firebaseService.addComment(activeTrip, expenseId, text, currentUser!).then(() => {
      setNewCommentText(prev => ({ ...prev, [expenseId]: '' }));
    });
  };

  const handleAddPhoto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    if (!photoBase64) {
      triggerToast('Välj en bild att ladda upp!', 'error');
      return;
    }

    firebaseService.uploadPhoto(activeTrip, photoBase64, photoCaption, currentUser!)
      .then(() => {
        triggerToast('Bild uppladdad till resealbumet!');
        setPhotoBase64('');
        setPhotoCaption('');
      })
      .catch(() => {
        triggerToast('Gick inte att ladda upp bilden.', 'error');
      });
  };

  const handleReceiptUploadAndOCR = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf';

    setIsOcrScanning(true);
    triggerToast(isPdf ? 'Renderar PDF och kör OCR...' : 'Skannar kvitto med OCR...', 'success');

    try {
      let fileToProcess = file;
      if (isPdf) {
        // For PDFs: convert to image first so we can save it visually
        const renderedImage = await ocrService.pdfToImageFile(file);
        if (renderedImage) {
          const compressed = await compressImage(renderedImage);
          setExpenseReceiptBase64(compressed);
          fileToProcess = renderedImage; // Pass the rendered image to OCR
        } else {
          setExpenseReceiptBase64('PDF:' + file.name); // fallback
        }
      } else {
        // Compress images before converting to base64 to avoid Firestore 1MB limits
        const compressed = await compressImage(file);
        setExpenseReceiptBase64(compressed);
      }

      const detectedAmount = await ocrService.processImage(fileToProcess);
      setIsOcrScanning(false);
      
      if (detectedAmount !== null) {
        if (expenseAmount && parseFloat(expenseAmount) !== detectedAmount) {
          const useScanned = confirm(
            `AI-OCR hittade ${detectedAmount} kr på kvittot.\nDu har redan skrivit ${expenseAmount} kr.\n\nTryck OK för att använda ${detectedAmount} kr,\neller Avbryt för att behålla ${expenseAmount} kr.`
          );
          if (useScanned) {
            setExpenseAmount(detectedAmount.toString());
            triggerToast(`Belopp ändrat till ${detectedAmount} kr. Kvitto bifogat.`, 'success');
          } else {
            triggerToast(`Behåller ${expenseAmount} kr. Kvitto bifogat.`, 'success');
          }
        } else {
          setExpenseAmount(detectedAmount.toString());
          triggerToast(`Hittade belopp: ${detectedAmount} kr! Kvitto bifogat.`, 'success');
        }
      } else {
        triggerToast('Hittade inget belopp, men kvittot är bifogat. Knappa in beloppet manuellt!', 'error');
      }
    } catch (err: any) {
      setIsOcrScanning(false);
      if (err.message === 'NO_TEXT_FOUND') {
        setExpenseReceiptBase64(''); // Discard image
        triggerToast('Bilden verkar inte innehålla någon text. Den kastades.', 'error');
      } else {
        triggerToast(err.message || 'Kunde inte läsa kvittot.', 'error');
      }
    }
  };

  const handleCopySwishInfo = (settlement: typeof showSwishModal) => {
    if (!settlement) return;
    const cleanPhone = swishPhoneInput ? swishPhoneInput.replace(/[^0-9]/g, '') : '';
    const swishUrl = cleanPhone 
      ? `https://app.swish.nu/1/p/sw/?sw=${cleanPhone}&amt=${Math.round(settlement.amount)}&msg=${encodeURIComponent(`Splitta: ${activeTrip?.title}`)}`
      : '';
    
    let text = `Hej ${settlement.fromName}! Reglering för ${activeTrip?.title}: Skicka ${settlement.amount} kr till mig på Swish. Tack! 🤝`;
    if (swishUrl) {
      text += `\n\nBetala enkelt genom att klicka på denna länk på mobilen:\n${swishUrl}`;
    }
    
    navigator.clipboard.writeText(text);
    triggerToast('Swish-info kopierad till urklipp! Klar att delas.');
  };

  const handleCopySettlementText = (fromName: string, amount: number, payeePhone: string) => {
    const cleanPhone = payeePhone ? payeePhone.replace(/[^0-9]/g, '') : '';
    const swishUrl = cleanPhone 
      ? `https://app.swish.nu/1/p/sw/?sw=${cleanPhone}&amt=${Math.round(amount)}&msg=${encodeURIComponent(`Splitta: ${activeTrip?.title}`)}`
      : '';
    
    let text = `Hej ${fromName}! Reglering för ${activeTrip?.title}: Skicka ${amount} kr till mig på Swish. Tack! 🤝`;
    if (swishUrl) {
      text += `\n\nBetala enkelt genom att klicka på denna länk på mobilen:\n${swishUrl}`;
    }
    
    navigator.clipboard.writeText(text);
    triggerToast('Dela-text kopierad till urklipp!');
  };

  const handleExportCSV = () => {
    if (!activeTrip) return;
    
    let csv = `Utlägg för ${activeTrip.title}\n`;
    csv += `Titel,Belopp,Betalare,Splittningstyp,Datum\n`;
    
    activeTrip.expenses.forEach(e => {
      const payerName = activeTrip.participants.find(p => p.id === e.paid_by)?.name || e.created_by_alias;
      csv += `"${e.title}",${e.amount},"${payerName}","${e.split_type === 'equal' ? 'Lika delning' : 'Procentuell'}","${e.created_at.slice(0, 10)}"\n`;
    });
    
    csv += `\nAvräkning\n`;
    const settlements = storageService.calculateSettlements(activeTrip);
    settlements.forEach(s => {
      csv += `"${s.fromName}","ska betala",${s.amount},"till","${s.toName}"\n`;
    });

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `OlleSplit_${activeTrip.title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('CSV-sammanställning har exporterats!');
  };

  const handleShareTrip = () => {
    setShowShareModal(true);
  };

  const executeShare = async () => {
    if (!activeTrip) return;
    const balances = storageService.calculateBalances(activeTrip);
    const settlements = storageService.calculateSettlements(activeTrip);
    
    if (['text', 'whatsapp', 'email'].includes(shareFormat)) {
      const isWA = shareFormat === 'whatsapp';
      const b_ = isWA ? '*' : '';  // bold markers for WhatsApp
      const lines: string[] = [];
      
      lines.push(`${b_}${activeTrip.title}${b_}`);
      lines.push(`Totalt utlagt: ${b_}${activeTrip.total_cost} ${activeTrip.currency}${b_}`);
      lines.push('');
      
      if (shareLevel === 'all') {
        lines.push(`${b_}Saldo per person${b_}`);
        lines.push('');
        balances.forEach(b => {
          const sign = b.balance > 0 ? '+' : '';
          lines.push(`${b_}${formatName(b.name)}${b_}: ${sign}${b.balance.toFixed(2)} ${activeTrip.currency}`);
          b.lineItems.forEach(li => {
            let detail = `  - ${li.title}:`;
            if (li.paidAmount > 0) detail += ` +${li.paidAmount.toFixed(2)}`;
            if (li.owedAmount > 0) detail += ` -${li.owedAmount.toFixed(2)}`;
            lines.push(detail);
          });
          lines.push('');
        });
      }
      
      lines.push(`${b_}Vem betalar vem?${b_}`);
      if (settlements.length === 0) {
        lines.push('Alla är kvitt!');
      } else {
        settlements.forEach(s => {
          const payeePhone = getSwishPhone(activeTrip?.participants.find(p => p.id === s.to || p.name === s.toName)?.phone);
          const cleanPhone = payeePhone ? payeePhone.replace(/[^0-9]/g, '') : '';
          const swishUrl = cleanPhone 
            ? `https://app.swish.nu/1/p/sw/?sw=${cleanPhone}&amt=${Math.round(s.amount)}&msg=${encodeURIComponent(`Splitta: ${activeTrip.title}`)}`
            : '';

          lines.push(`${formatName(s.fromName)} -> ${formatName(s.toName)}: ${b_}${s.amount} ${activeTrip.currency}${b_}`);
          if (swishUrl) {
            lines.push(`  └─ Swisha: ${swishUrl}`);
          }
          lines.push('');
        });
      }

      const text = lines.join('\n');

      if (shareFormat === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      } else if (shareFormat === 'email') {
        window.open(`mailto:?subject=${encodeURIComponent(`Sammanstallning: ${activeTrip.title}`)}&body=${encodeURIComponent(text)}`, '_blank');
      } else {
        if (navigator.share) {
          navigator.share({
            title: activeTrip.title,
            text: text
          }).catch(console.error);
        } else {
          navigator.clipboard.writeText(text);
          triggerToast('Sammanstallning kopierad till urklipp!');
        }
      }
      setShowShareModal(false);
    } else {
      // PDF or Image export logic using the hidden print view
      const printElement = document.getElementById('export-print-view');
      if (!printElement) return;
      
      triggerToast('Genererar export, vänta...', 'success');
      
      try {
        // Temporarily make it visible for html2canvas
        printElement.style.display = 'block';
        
        // Wait for fonts/QR to render
        await new Promise(r => setTimeout(r, 500));
        
        const canvas = await html2canvas(printElement, { scale: 2, useCORS: true });
        printElement.style.display = 'none';

        if (shareFormat === 'image') {
          const imgData = canvas.toDataURL('image/jpeg', 0.9);
          const link = document.createElement('a');
          link.download = `OlleSplit_${activeTrip.title.replace(/\s+/g, '_')}.jpg`;
          link.href = imgData;
          link.click();
          triggerToast('Bild har sparats!');
        } else if (shareFormat === 'pdf') {
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
          });
          
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`OlleSplit_${activeTrip.title.replace(/\s+/g, '_')}.pdf`);
          triggerToast('PDF har sparats!');
        }
      } catch (err) {
        printElement.style.display = 'none';
        triggerToast('Gick inte att generera exporten', 'error');
        console.error(err);
      }
      setShowShareModal(false);
    }
  };

  const activeTripSettlements = activeTrip ? storageService.calculateSettlements(activeTrip) : [];
  const isParticipant = activeTrip ? (activeTrip.participants.some(p => p.id === currentUser?.uid) || currentUser?.role === 'superadmin') : false;
  const activeTripBalances = activeTrip ? storageService.calculateBalances(activeTrip) : [];

  if (authLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-main)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Sparkles size={40} className="spinner" style={{ marginBottom: '20px', color: 'var(--color-primary)' }} />
          <p>Laddar Ölle-Split...</p>
        </div>
      </div>
    );
  }

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const email = emailLogin.trim().toLowerCase();
      if (!email || !passwordLogin) return;

      try {
        // Först: försök logga in (fungerar om kontot redan finns)
        await signInWithEmailAndPassword(auth, email, passwordLogin);
      } catch (signInErr: any) {
        // Om kontot inte finns i Firebase Auth, kolla om e-posten finns i Firestore
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
          const firestoreUser = await firebaseService.getUserByEmail(email);
          if (firestoreUser) {
            setLoginMode('create-password');
            return;
          }
          // E-posten finns inte alls i systemet
          triggerToast('Fel e-post eller lösenord.', 'error');
        } else {
          triggerToast('Inloggningen misslyckades: ' + signInErr.message, 'error');
        }
      }
    } catch (err: any) {
      triggerToast('Något gick fel. Försök igen.', 'error');
    }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordLogin !== createPasswordConfirm) {
      triggerToast('Lösenorden matchar inte.', 'error');
      return;
    }
    
    try {
      const email = emailLogin.trim().toLowerCase();
      await createUserWithEmailAndPassword(auth, email, passwordLogin);
      
      const firestoreUser = await firebaseService.getUserByEmail(email);
      if (firestoreUser) {
        if (!firestoreUser.emails) firestoreUser.emails = [firestoreUser.email];
        if (!firestoreUser.emails.includes(email)) firestoreUser.emails.push(email);
        await firebaseService.saveUser(firestoreUser);
        triggerToast(`Välkommen ${firestoreUser.alias}! Ditt lösenord har skapats.`);
      }
    } catch (createErr: any) {
      if (createErr.code === 'auth/email-already-in-use') {
        triggerToast('E-postadressen används redan. Om du loggat in med Google tidigare, fortsätt använda det, eller klicka på "Glömt lösenord" för att lägga till ett lösenord.', 'error');
        setLoginMode('email-password');
      } else if (createErr.code === 'auth/weak-password') {
        triggerToast('Lösenordet måste vara minst 6 tecken.', 'error');
      } else {
        triggerToast('Kunde inte skapa konto: ' + createErr.message, 'error');
      }
    }
  };

  const handleResetPassword = async () => {
    const email = emailLogin.trim().toLowerCase();
    if (!email) {
      triggerToast('Fyll i din e-postadress först!', 'error');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      window.alert(`Ett mail för att återställa/skapa lösenord har skickats till ${email}!\n\nKolla din inkorg (och skräppost) för att välja ditt nya lösenord.`);
      triggerToast(`Ett mail har skickats till ${email}!`, 'success');
    } catch (error: any) {
      window.alert('Kunde inte skicka återställningslänk. Kontrollera att e-postadressen är korrekt.');
    }
  };

  // --- INVITE ACTIVATION SCREEN ---
  if (!currentUser && inviteParam) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-main)', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '440px', width: '100%', textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ marginBottom: '30px' }}>
            <div style={{ background: 'var(--color-primary-gradient)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: 'var(--shadow-glow)' }}>
              <Sparkles size={40} color="#fff" />
            </div>
            <h1 style={{ fontSize: '28px', color: 'var(--text-main)', marginBottom: '10px' }}>Välkommen{inviteAlias2 ? `, ${inviteAlias2}` : ''}!</h1>
            <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Du har blivit inbjuden till <strong>Splitta</strong>. Aktivera ditt konto genom att välja inloggningsmetod nedan.
            </p>
            <div style={{ background: 'var(--bg-input)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Inbjuden e-post: <strong style={{ color: 'var(--text-main)' }}>{inviteParam}</strong>
            </div>
          </div>

          {activationError && (
            <div style={{ background: 'var(--bg-danger, rgba(239,68,68,0.1))', border: '1px solid var(--border-danger, rgba(239,68,68,0.3))', color: 'var(--color-danger)', padding: '14px', borderRadius: 'var(--radius-md)', marginBottom: '20px', fontSize: '13px', lineHeight: '1.5', textAlign: 'left' }}>
              <AlertTriangle size={16} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
              {activationError}
            </div>
          )}

          {activationMode === 'choose' ? (
            <>
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '16px', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '12px' }}
                onClick={() => handleOAuthActivation('google')}
              >
                🔵 Aktivera med Google
              </button>

              <button
                className="btn"
                style={{ width: '100%', padding: '16px', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '12px', background: '#00a4ef', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                onClick={() => handleOAuthActivation('microsoft')}
              >
                🟦 Aktivera med Microsoft
              </button>


              <div style={{ width: '100%', borderBottom: '1px solid var(--border-color)', margin: '8px 0 16px' }}></div>

              <button
                className="btn btn-secondary"
                style={{ width: '100%', padding: '14px', fontSize: '15px' }}
                onClick={() => setActivationMode('password')}
              >
                🔑 Skapa lösenord istället
              </button>

              <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <button
                  className="btn btn-sm"
                  style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: '13px', cursor: 'pointer' }}
                  onClick={() => { setInviteParam(null); setInviteAlias2(null); window.history.replaceState(null, '', window.location.pathname); }}
                >
                  ← Redan registrerad? Logga in här
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                className="btn btn-sm"
                style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', marginBottom: '16px', cursor: 'pointer' }}
                onClick={() => { setActivationMode('choose'); setActivationError(''); }}
              >
                <ArrowLeft size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} /> Tillbaka
              </button>
              <h3 style={{ color: 'var(--text-main)', marginBottom: '8px' }}>Skapa lösenord</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
                Kontot skapas med e-postadressen <strong>{inviteParam}</strong>
              </p>
              <form onSubmit={handlePasswordActivation} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="email"
                  value={inviteParam || ''}
                  autoComplete="username"
                  style={{ display: 'none' }}
                  readOnly
                />
                <input
                  type="password"
                  className="input-field"
                  placeholder="Lösenord (minst 6 tecken)"
                  value={activationPassword}
                  onChange={e => setActivationPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  className="input-field"
                  placeholder="Bekräfta lösenord"
                  value={activationPasswordConfirm}
                  onChange={e => setActivationPasswordConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }}>
                  ✅ Skapa konto
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- REGULAR LOGIN SCREEN ---
  if (!currentUser) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-main)', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ marginBottom: '30px' }}>
            <div style={{ background: 'var(--color-primary-gradient)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: 'var(--shadow-glow)' }}>
              <Sparkles size={40} color="#fff" />
            </div>
            <h1 style={{ fontSize: '28px', color: 'var(--text-main)', marginBottom: '10px' }}>Ölle-Split</h1>
            <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>Välkommen till framtidens kostnadsdelning. Nu med molnsynk och Fjäll-läge.</p>
          </div>
          
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '16px', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '12px' }}
            onClick={() => signInWithPopup(auth, googleProvider).catch(err => { if (err.code !== 'auth/popup-closed-by-user') alert(err.message); })}
          >
            🔵 Logga in med Google
          </button>

          <button
            className="btn"
            style={{ width: '100%', padding: '16px', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '20px', background: '#00a4ef', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            onClick={() => signInWithPopup(auth, microsoftProvider).catch(err => { if (err.code !== 'auth/popup-closed-by-user') alert(err.message); })}
          >
            🟦 Logga in med Microsoft
          </button>

          <div style={{ width: '100%', borderBottom: '1px solid var(--border-color)', margin: '12px 0' }}></div>

          {loginMode === 'choose' ? (
            <button
              className="btn btn-secondary"
              style={{ width: '100%', padding: '14px', fontSize: '15px' }}
              onClick={() => setLoginMode('email-password')}
            >
              🔑 Logga in med E-post & Lösenord
            </button>
          ) : loginMode === 'email-password' ? (
            <>
              <button
                className="btn btn-sm"
                style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', marginBottom: '12px', cursor: 'pointer' }}
                onClick={() => setLoginMode('choose')}
              >
                <ArrowLeft size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} /> Tillbaka
              </button>
              <form onSubmit={handleEmailPasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input 
                  type="email" 
                  className="input-field" 
                  placeholder="E-postadress" 
                  value={emailLogin} 
                  onChange={e => setEmailLogin(e.target.value)} 
                  required 
                  autoComplete="username"
                />
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder="Lösenord" 
                  value={passwordLogin} 
                  onChange={e => setPasswordLogin(e.target.value)} 
                  required 
                  autoComplete="current-password"
                />
                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }}>
                  Logga in
                </button>
                <div style={{ textAlign: 'center', marginTop: '4px' }}>
                  <button 
                    type="button"
                    onClick={handleResetPassword}
                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Glömt / Lägg till lösenord?
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <button
                className="btn btn-sm"
                style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', marginBottom: '12px', cursor: 'pointer' }}
                onClick={() => setLoginMode('email-password')}
              >
                <ArrowLeft size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} /> Tillbaka
              </button>
              <h3 style={{ color: 'var(--text-main)', marginBottom: '8px', fontSize: '18px' }}>Skapa ditt lösenord</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.5' }}>
                Du har blivit inbjuden men saknar lösenord. Vänligen bekräfta ditt lösenord för att aktivera kontot.
              </p>
              <form onSubmit={handleCreatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input 
                  type="email" 
                  className="input-field" 
                  value={emailLogin} 
                  disabled
                  style={{ opacity: 0.7 }}
                  autoComplete="username"
                />
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder="Lösenord" 
                  value={passwordLogin} 
                  onChange={e => setPasswordLogin(e.target.value)} 
                  required 
                  minLength={6}
                  autoComplete="new-password"
                />
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder="Bekräfta lösenord" 
                  value={createPasswordConfirm} 
                  onChange={e => setCreatePasswordConfirm(e.target.value)} 
                  required 
                  minLength={6}
                />
                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }}>
                  ✅ Spara lösenord & Logga in
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  const handleSaveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await firebaseService.saveUser(editingUser);
      setShowEditUserModal(false);
      triggerToast('Användare uppdaterad', 'success');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const phone = phonePromptInput.trim();
    // Allow saving empty (skip) - we store 'NOPHONE' as sentinel to not re-prompt
    const updatedUser = { ...currentUser, phone: phone || 'NOPHONE' };
    await firebaseService.saveUser(updatedUser);
    setCurrentUser(updatedUser);
  };

  const handleSkipPhone = async () => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, phone: 'NOPHONE' };
    await firebaseService.saveUser(updatedUser);
    setCurrentUser(updatedUser);
  };

  // Only show phone prompt if phone is explicitly undefined/null (not empty string, not 'NOPHONE')
  // Superadmins can set their phone via the admin panel
  if (currentUser && currentUser.role !== 'superadmin' && (currentUser.phone === undefined || currentUser.phone === null)) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-main)', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ background: 'var(--color-primary-gradient)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: 'var(--shadow-glow)' }}>
            <span style={{ fontSize: '28px' }}>📱</span>
          </div>
          <h2 style={{ color: 'var(--text-main)', marginBottom: '15px' }}>Välkommen {currentUser.alias}!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '25px', lineHeight: '1.5' }}>
            Ange ditt Swish-nummer så kan kompisar swisha dig direkt i appen. Du kan alltid ändra det senare i profilen.
          </p>
          <form onSubmit={handleSavePhone} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input 
              type="tel" 
              className="input-field" 
              placeholder="Ex: 0701234567" 
              value={phonePromptInput} 
              onChange={e => setPhonePromptInput(e.target.value)} 
            />
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }}>
              💾 Spara telefonnummer
            </button>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ width: '100%', padding: '12px', fontSize: '14px', opacity: 0.7 }}
              onClick={handleSkipPhone}
            >
              Hoppa över för nu
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* --- APP HEADER --- */}
      <header className="app-header">
        <div className="logo-container">
          <div className="logo-icon">
            <Sparkles size={20} />
          </div>
          <span className="logo-text">Ölle-Split</span>
        </div>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Theme Switcher */}
          <div className="theme-switcher" style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-full)', padding: '2px', gap: '4px' }}>
            <button 
              className={`btn btn-sm btn-icon-only ${theme === 'blue' ? 'btn-primary' : ''}`}
              style={{ width: '24px', height: '24px', minHeight: '24px', padding: 0, borderRadius: '50%', background: theme === 'blue' ? '#0ea5e9' : 'transparent', border: 'none' }}
              onClick={() => setTheme('blue')}
              title="Havsblå"
            />
            <button 
              className={`btn btn-sm btn-icon-only ${theme === 'purple' ? 'btn-primary' : ''}`}
              style={{ width: '24px', height: '24px', minHeight: '24px', padding: 0, borderRadius: '50%', background: theme === 'purple' ? '#a855f7' : 'transparent', border: 'none' }}
              onClick={() => setTheme('purple')}
              title="Klassisk"
            />
            <button 
              className={`btn btn-sm btn-icon-only ${theme === 'sunset' ? 'btn-primary' : ''}`}
              style={{ width: '24px', height: '24px', minHeight: '24px', padding: 0, borderRadius: '50%', background: theme === 'sunset' ? '#f97316' : 'transparent', border: 'none' }}
              onClick={() => setTheme('sunset')}
              title="Solnedgång"
            />
            <button 
              className={`btn btn-sm btn-icon-only ${theme === 'obsidian' ? 'btn-primary' : ''}`}
              style={{ width: '24px', height: '24px', minHeight: '24px', padding: 0, borderRadius: '50%', background: theme === 'obsidian' ? '#14b8a6' : 'transparent', border: 'none' }}
              onClick={() => setTheme('obsidian')}
              title="Obsidian"
            />
            <button 
              className={`btn btn-sm btn-icon-only ${theme === 'dark' ? 'btn-primary' : ''}`}
              style={{ width: '24px', height: '24px', minHeight: '24px', padding: 0, borderRadius: '50%', background: theme === 'dark' ? '#333' : 'transparent', border: 'none' }}
              onClick={() => setTheme('dark')}
              title="Midnatt"
            />
          </div>

          {/* Offline Toggle */}
          <button 
            className={`btn btn-sm ${isOffline ? 'btn-danger' : 'btn-secondary'}`} 
            onClick={handleToggleOffline}
            title={isOffline ? 'Klicka för att gå online' : 'Klicka för att simulera offline-läge'}
          >
            {isOffline ? <WifiOff size={14} /> : <Wifi size={14} />}
            <span style={{ marginLeft: '4px' }}>{isOffline ? 'Fjäll-läge' : 'Online'}</span>
          </button>

          {/* User Profile / Logout */}
          <div 
            className="user-badge" 
            style={{ position: 'relative', cursor: 'pointer' }}
            onClick={() => {
              setProfilePhone(getSwishPhone(currentUser.phone) || '');
              setProfileAlias(currentUser.alias);
              setShowProfileModal(true);
            }}
            title="Min profil"
          >
            <div className="avatar">
              {formatName(currentUser.alias).charAt(0)}
            </div>
            <span className="username">{formatName(currentUser.alias).split(' ')[0]}</span>
          </div>
        </div>
      </header>

      {/* Offline Alert Banner */}
      {isOffline && (
        <div className="offline-banner">
          <AlertTriangle size={14} />
          <span>Fjäll-läge aktivt. Utlägg sparas offline och synkas senare.</span>
        </div>
      )}

      {/* --- MAIN CONTENT PANEL --- */}
      <main className="main-content">

        {/* --- GLOBAL TRIP CONTEXT BANNER --- */}
        {activeTab !== 'dashboard' && activeTrip && (
          <div className="trip-context-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-primary-gradient)', color: 'var(--text-primary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: '20px', boxShadow: 'var(--shadow-glow)' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: '2px' }}>Aktiv Resa</div>
              <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--text-primary)' }}>{activeTrip.title}</h2>
            </div>
            <div style={{ position: 'relative' }}>
              <button 
                className="btn btn-sm" 
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: 'none' }}
                onClick={() => setShowTripDropdown(!showTripDropdown)}
              >
                Byt Resa
              </button>
              {showTripDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%', right: 0,
                  marginTop: '8px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 50,
                  minWidth: '220px',
                  overflow: 'hidden'
                }}>
                  {[...trips].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(t => (
                    <div
                      key={t.trip_id}
                      onClick={() => { setActiveTrip(t); setShowTripDropdown(false); }}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-color)',
                        background: activeTrip.trip_id === t.trip_id ? 'var(--bg-glow)' : 'transparent',
                        color: 'var(--text-primary)'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                      onMouseOut={e => e.currentTarget.style.background = activeTrip.trip_id === t.trip_id ? 'var(--bg-glow)' : 'transparent'}
                    >
                      <div style={{ fontSize: '14px', fontWeight: activeTrip.trip_id === t.trip_id ? 'bold' : 'normal', color: activeTrip.trip_id === t.trip_id ? 'var(--color-primary-light)' : 'var(--text-primary)' }}>
                        {t.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Skapad {t.created_at.slice(0, 10)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* --- VIEW: DASHBOARD / TRAVEL LIST --- */}
        {activeTab === 'dashboard' && (
          <>
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Dina Resor</h2>
              {currentUser.role !== 'user' && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddTripModal(true)}>
                  <Plus size={16} /> Ny resa
                </button>
              )}
            </div>

            {trips.length === 0 ? (
              <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p>Du har inga aktiva resor just nu.</p>
                {currentUser.role !== 'user' ? (
                  <button 
                    className="btn btn-primary" 
                    onClick={() => setShowAddTripModal(true)}
                    style={{ marginTop: '16px' }}
                  >
                    Skapa din första resa
                  </button>
                ) : (
                  <p style={{ marginTop: '16px', fontSize: '14px' }}>Be en kompis bjuda in dig till en resa!</p>
                )}
              </div>
            ) : (
              <div className="trips-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[...trips].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(t => (
                  <div 
                    key={t.trip_id} 
                    className={`card card-hover expense-item ${activeTrip?.trip_id === t.trip_id ? 'active-trip' : ''}`}
                    onClick={() => { setActiveTrip(t); setActiveTab('expenses'); }}
                    style={{
                      borderLeft: activeTrip?.trip_id === t.trip_id ? '4px solid var(--color-primary)' : '1px solid var(--border-color)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ textAlign: 'left' }}>
                        <h3 style={{ fontSize: '18px' }}>{t.title}</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {t.participants.length} deltagare • Skapad {t.created_at.slice(0,10)}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-primary-light)' }}>
                          {t.total_cost} {t.currency}
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Totalt utlägg</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* --- COMMON TRIP HEADER (Mini-dashboard) --- */}
        {activeTrip && activeTab !== 'dashboard' && activeTab !== 'admin' && (
          <div className="card" style={{ marginBottom: '20px', background: 'var(--bg-card)', position: 'relative', paddingTop: '36px' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              style={{ position: 'absolute', top: '12px', left: '12px', border: 'none', background: 'transparent', padding: '4px 8px' }}
              onClick={() => { setActiveTrip(null); setActiveTab('dashboard'); }}
            >
              <ArrowLeft size={16} style={{ marginRight: '4px' }} /> Alla resor
            </button>
            {(currentUser.uid === activeTrip.created_by || currentUser.role === 'superadmin') && (
              <button 
                className="btn btn-danger btn-sm" 
                style={{ position: 'absolute', top: '12px', right: '12px', padding: '6px' }}
                onClick={() => {
                  if(confirm(`Är du helt säker på att du vill radera resan "${activeTrip.title}" och ALLA dess utlägg? Detta går inte att ångra.`)) {
                    firebaseService.deleteTrip(activeTrip.trip_id).then(() => {
                      setActiveTrip(null);
                      setActiveTab('dashboard');
                    });
                  }
                }}
                title="Ta bort resa"
              >
                <Trash2 size={16} />
              </button>
            )}

            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '24px', marginBottom: '4px' }}>{activeTrip.title}</h2>
              <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--color-primary-light)', marginBottom: '4px' }}>
                {Math.round(activeTrip.total_cost * 100) / 100} <span style={{ fontSize: '16px', fontWeight: '600' }}>{activeTrip.currency}</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {activeTrip.expenses.length} utlägg registrerade • {activeTrip.participants.length} deltagare
              </p>
            </div>
          </div>
        )}

        {/* --- VIEW: EXPENSES --- */}
        {activeTab === 'expenses' && activeTrip && (
          <>


            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Utgiftslista</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
                  Exportera Excel
                </button>
                {isParticipant && (
                  <button className="btn btn-primary btn-sm" onClick={handleOpenAddExpense}>
                    <Plus size={16} /> Lägg till utlägg
                  </button>
                )}
              </div>
            </div>

            {activeTrip.expenses.length === 0 ? (
              <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p>Det finns inga utlägg registrerade i den här resan.</p>
                {isParticipant && (
                  <button className="btn btn-primary" onClick={handleOpenAddExpense} style={{ marginTop: '16px' }}>
                    Registrera det första utlägget
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeTrip.expenses.filter(e => !e.is_settlement).map(exp => {
                  const isExpanded = expandedExpense === exp.expense_id;
                  const payerName = formatName(activeTrip.participants.find(p => p.id === exp.paid_by)?.name || exp.created_by_alias);
                  
                  return (
                    <div 
                      key={exp.expense_id} 
                      className="card card-hover expense-item"
                    >
                      <div 
                        className="expense-header"
                        onClick={() => setExpandedExpense(isExpanded ? null : exp.expense_id)}
                      >
                        <div className="expense-title-section">
                          <div className="expense-icon">
                            <CreditCard size={18} />
                          </div>
                          <div>
                            <div className="expense-title">{exp.title}</div>
                            <div className="expense-meta">
                              Betalat av <strong>{payerName}</strong> • {exp.created_at.slice(0, 10)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="expense-amount-section">
                            <div className="expense-amount" style={{ color: 'var(--color-primary-light)' }}>
                              {exp.amount} {activeTrip.currency}
                            </div>
                            <div className="expense-split-info">
                              {exp.split_type === 'equal' ? 'Lika delning' : 'Procentuell'}
                            </div>
                          </div>
                          <div>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="expense-details-expanded">
                          {exp.receipt_url && (
                            <div>
                              <span className="form-label" style={{ marginBottom: '4px', display: 'block' }}>Kvitto</span>
                              {exp.receipt_url.startsWith('PDF:') ? (
                                <div style={{ 
                                  display: 'flex', alignItems: 'center', gap: '8px', 
                                  background: 'var(--bg-card-hover)', borderRadius: 'var(--radius-sm)',
                                  padding: '10px 12px', fontSize: '13px', color: 'var(--text-secondary)'
                                }}>
                                  <FileText size={20} style={{ color: 'var(--color-primary-light)', flexShrink: 0 }} />
                                  <span>{exp.receipt_url.replace('PDF:', '')}</span>
                                </div>
                              ) : (
                                <img src={exp.receipt_url} alt="Kvitto" className="expense-receipt-preview" />
                              )}
                            </div>
                          )}

                          <div>
                            <span className="form-label">Splittningsdetaljer</span>
                            <div className="expense-splits-grid">
                              {Object.keys(exp.splits).map(pId => {
                                const p = activeTrip.participants.find(part => part.id === pId);
                                const cost = exp.split_type === 'equal' 
                                  ? (exp.amount / Object.keys(exp.splits).length)
                                  : (exp.amount * (exp.splits[pId] / 100));
                                
                                return (
                                  <div key={pId} className="expense-split-row">
                                    <span>{p ? formatName(p.name) : 'Okänd'}</span>
                                    <strong>
                                      {exp.split_type === 'percentage' && `(${exp.splits[pId]}%) `}
                                      {cost.toFixed(2)} {activeTrip.currency}
                                    </strong>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {exp.comment && (
                            <div style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                              <strong>Kommentar:</strong> {exp.comment}
                            </div>
                          )}

                          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                            <span className="form-label">Diskussion</span>
                            <div className="comments-section">
                              {activeTrip.comments.filter(c => c.expense_id === exp.expense_id).map(c => (
                                <div key={c.comment_id} className="comment-bubble">
                                  <div className="comment-author">{c.author_alias}</div>
                                  <div style={{ color: 'var(--text-primary)' }}>{c.text}</div>
                                </div>
                              ))}
                              
                              {isParticipant && (
                                <form 
                                  className="comment-input-box"
                                  onSubmit={(e) => handleAddComment(e, exp.expense_id)}
                                >
                                  <input 
                                    type="text" 
                                    className="input-field" 
                                    style={{ padding: '8px 12px', fontSize: '13px' }}
                                    placeholder="Skriv en kommentar..."
                                    value={newCommentText[exp.expense_id] || ''}
                                    onChange={(e) => setNewCommentText(prev => ({ ...prev, [exp.expense_id]: e.target.value }))}
                                  />
                                  <button className="btn btn-primary btn-icon-only" style={{ width: '38px', height: '38px' }} type="submit">
                                    <Send size={14} />
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                            { isParticipant && (currentUser.role !== 'user' || exp.paid_by === currentUser.uid) && (
                              <>
                                <button 
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleOpenEditExpense(exp)}
                                >
                                  Ändra utlägg
                                </button>
                                <button 
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleDeleteExpense(exp.expense_id, exp.title)}
                                >
                                  <Trash2 size={12} /> Ta bort utlägg
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* --- VIEW: DEBTS / SETTLEMENT --- */}
        {activeTab === 'debts' && activeTrip && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>Avräkning & Reglering</h2>
              <button className="btn btn-secondary btn-sm" onClick={handleShareTrip}>
                <Share2 size={12} style={{ marginRight: '4px' }}/> Dela Sammanställning
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '8px' }}>
              <div 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedExpense(expandedExpense === 'debts_detail' ? null : 'debts_detail')}
              >
                <h3 style={{ fontSize: '15px' }}>Detaljerad Sammanställning</h3>
                {expandedExpense === 'debts_detail' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
              
              {expandedExpense === 'debts_detail' && (
                <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    <span>Deltagare</span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ marginRight: '8px' }}>Utlagt (Credit)</span>
                      <span style={{ marginRight: '8px' }}>Andel (Debit)</span>
                      <span>Netto</span>
                    </div>
                  </div>
                  {activeTripBalances.map(b => (
                    <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                        <strong>{formatName(b.name)}</strong>
                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ minWidth: '45px', display: 'inline-block', color: b.balance > 0 ? 'var(--color-success)' : b.balance < 0 ? 'var(--color-danger)' : 'var(--text-primary)' }}>
                            {b.balance > 0 ? '+' : ''}{b.balance}
                          </strong>
                        </div>
                      </div>
                      {b.lineItems && b.lineItems.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: '2px solid var(--border-color-active)' }}>
                          {b.lineItems.map((li, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{li.title}</span>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {li.paidAmount > 0 ? <span style={{ color: 'var(--color-success)', width: '45px', textAlign: 'right' }}>+{li.paidAmount.toFixed(2)}</span> : <span style={{ width: '45px' }}></span>}
                                {li.owedAmount > 0 ? <span style={{ color: 'var(--color-danger)', width: '45px', textAlign: 'right' }}>-{li.owedAmount.toFixed(2)}</span> : <span style={{ width: '45px' }}></span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Nedan visas de absolut mest effektiva transaktionerna för att nolla alla skulder, framräknade med en skuldförenklingsalgoritm.
            </p>

            {activeTripSettlements.length === 0 ? (
              <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-success)' }}>
                <Check size={48} style={{ margin: '0 auto 12px', color: 'var(--color-success)' }} />
                <h3>Alla är kvitt!</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Inga obetalda skulder finns i denna resa. Bra jobbat!
                </p>
              </div>
            ) : (
              <div className="debt-matrix-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeTripSettlements.map((settlement, index) => (
                  <div key={index} className="debt-row">
                    <div className="debt-user-info">
                      <div className="avatar" style={{ background: 'var(--color-danger)' }}>
                        {settlement.fromName.charAt(0)}
                      </div>
                      <div className="debt-relation">
                        <span>{settlement.fromName}</span> är skyldig <span>{settlement.toName}</span>
                        <div className="owed-amount">{settlement.amount} {activeTrip.currency}</div>
                      </div>
                    </div>
                    
                    {isParticipant && (
                      <div className="debt-actions">
                        <button 
                          className="btn btn-swish btn-sm"
                          onClick={() => {
                            const receiver = activeTrip?.participants.find(p => p.id === settlement.to);
                            setSwishPhoneInput(getSwishPhone(receiver?.phone));
                            setShowSwishModal(settlement);
                          }}
                        >
                          Swish / QR
                        </button>
                        <button 
                          className="btn btn-sm btn-icon-only"
                          style={{ background: 'transparent', color: 'var(--color-success)', border: '1px solid var(--color-success)', width: '32px', height: '32px', minHeight: '32px' }}
                          onClick={() => handleMarkAsPaid(settlement)}
                          title="Markera som betald"
                        >
                          <Check size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {activeTrip.expenses.filter(e => e.is_settlement).length > 0 && (
                  <div style={{ marginTop: '24px' }}>
                    <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Reglerade betalningar</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {activeTrip.expenses.filter(e => e.is_settlement).map(exp => {
                        // "Betalning: Ölle -> Steffe"
                        const receiverName = exp.title.split('->')[1]?.trim() || '?';
                        const payerName = exp.title.split(':')[1]?.split('->')[0]?.trim() || '?';
                        return (
                          <div key={exp.expense_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card-hover)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div className="avatar" style={{ background: 'var(--color-success)', width: '28px', height: '28px', fontSize: '12px' }}>
                                <Check size={14} />
                              </div>
                              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                                <strong style={{ color: 'var(--text-main)' }}>{payerName}</strong> betalade <strong style={{ color: 'var(--text-main)' }}>{receiverName}</strong>
                                <div style={{ fontSize: '11px', opacity: 0.7 }}>{exp.created_at.slice(0, 10)}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ fontWeight: 'bold', color: 'var(--color-success)', fontSize: '15px' }}>
                                {exp.amount} {activeTrip.currency}
                              </div>
                              {isParticipant && (
                                <button
                                  className="btn btn-sm btn-icon-only"
                                  style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', padding: '4px' }}
                                  onClick={() => handleDeleteExpense(exp.expense_id, exp.title)}
                                  title="Ångra och ta bort reglering"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* --- VIEW: PHOTO ALBUM --- */}
        {activeTab === 'album' && activeTrip && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Resealbum</h2>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {activeTrip.album.length} bilder delade
              </span>
            </div>

            {isParticipant && (
              <form onSubmit={handleAddPhoto} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => photoInputRef.current?.click()}
                  style={{ flex: 1 }}
                >
                  <Camera size={16} /> Välj foto
                </button>
                <input 
                  type="file" 
                  ref={photoInputRef}
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      compressImage(file).then(base64 => {
                        setPhotoBase64(base64);
                      }).catch(err => console.error('Compression failed:', err));
                    }
                  }}
                  style={{ display: 'none' }}
                />
                
                {photoBase64 && (
                  <img 
                    src={photoBase64} 
                    alt="Preview" 
                    style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }} 
                  />
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Skriv en rolig bildtext..."
                  value={photoCaption}
                  onChange={(e) => setPhotoCaption(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={!photoBase64}>
                <Upload size={14} /> Dela i albumet
              </button>
            </form>
            )}

            {activeTrip.album.length === 0 ? (
              <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <ImageIcon size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p>Inga bilder har laddats upp än. Fota något skoj på resan!</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {activeTrip.album.map(photo => (
                  <div key={photo.photo_id} className="card card-hover" style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <img 
                      src={photo.url} 
                      alt={photo.caption} 
                      onClick={() => setFullscreenPhoto(photo.url)}
                      style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: 'var(--radius-md)', cursor: 'pointer' }} 
                    />
                    <div style={{ fontSize: '11px', textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, color: 'var(--color-primary-light)' }}>{photo.uploaded_by}</div>
                      <div style={{ color: 'var(--text-primary)', marginTop: '2px', lineHeight: 1.3 }}>{photo.caption}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* --- VIEW: GLOBAL ADMINISTRATION --- */}
        {activeTab === 'admin' && (
          <>
            {currentUser.role === 'user' ? (
              <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-danger)' }}>
                <Shield size={48} style={{ margin: '0 auto 12px' }} />
                <h3>Åtkomst nekas</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Endast Global Admin (Superadmin) kan lägga till nya användare eller hantera behörigheter på plattformen.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <h2>Medlemshantering</h2>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowInviteModal(true)}>
                      <Plus size={16} /> Bjud in användare
                    </button>
                  </div>
                </div>

                <div className="card" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                  <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Alla godkända systemanvändare ({allUsers.length})</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {allUsers.map(u => (
                      <div 
                        key={u.uid} 
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 14px',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)'
                        }}
                      >
                        <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="avatar" style={{ background: u.role === 'admin' ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                            {u.alias.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>
                              {u.alias} {u.uid === 'USER_MAGNUS' && '👑'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {u.email} ({u.role}) 
                              {u.last_login_at && ` • Inloggad: ${new Date(u.last_login_at).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button 
                            className="btn btn-sm" 
                            style={{ padding: '4px 8px', background: '#25D366', color: '#fff', border: 'none', fontSize: '12px' }}
                            onClick={() => handleShareInvite(u.email, u.alias, 'whatsapp')}
                            title={`Skicka inbjudan via WhatsApp`}
                          >
                            💬 WA
                          </button>
                          <button 
                            className="btn btn-sm" 
                            style={{ padding: '4px 8px', background: 'var(--color-primary)', color: '#fff', border: 'none', fontSize: '12px' }}
                            onClick={() => handleShareInvite(u.email, u.alias, 'email')}
                            title={`Skicka inbjudan via e-post`}
                          >
                            ✉️ E-post
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => handleShareInvite(u.email, u.alias, 'copy')}
                            title={`Kopiera aktiveringslänk`}
                          >
                            📋 Länk
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ padding: '4px 8px' }}
                            onClick={() => { setEditingUser(u); setShowEditUserModal(true); }}
                          >
                            Redigera
                          </button>
                          {u.uid !== currentUser.uid && (
                            <button 
                              className="btn btn-danger btn-sm" 
                              style={{ padding: '4px 8px' }}
                              onClick={() => handleKickUser(u.uid)}
                            >
                              Kasta ut
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '40px', paddingBottom: '20px' }}>
          <button 
            className="btn btn-sm" 
            style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: '12px' }}
            onClick={() => setShowPrivacyModal(true)}
          >
            Integritetspolicy
          </button>
        </div>

        {/* --- COMMON TRIP FOOTER (Realtime Activity) --- */}
        {activeTrip && activeTab !== 'dashboard' && (
          <div className="card" style={{ background: 'var(--bg-card)', marginTop: '24px', marginBottom: '80px' }}>
            <h3 style={{ marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              Realtidsaktivitet
            </h3>
            <div className="activity-feed">
              {activities.filter(a => a.trip_id === activeTrip.trip_id).length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>Ingen aktivitet än.</p>
              ) : (
                activities.filter(a => a.trip_id === activeTrip.trip_id).map(act => (
                  <div key={act.id} className="activity-item">
                    <div className="activity-item-content">
                      <strong>{formatName(act.user_alias)}</strong> {act.action}
                    </div>
                    <div className="activity-item-time">{new Date(act.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </main>

      {/* --- APP FOOTER / BOTTOM NAV TABS --- */}
      <footer className="bottom-nav">
        <button 
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <FileText className="nav-tab-icon" />
          <span>Dashboard</span>
        </button>

        {activeTrip && (
          <>
            <button 
              className={`nav-tab ${activeTab === 'expenses' ? 'active' : ''}`}
              onClick={() => setActiveTab('expenses')}
            >
              <CreditCard className="nav-tab-icon" />
              <span>Utlägg</span>
            </button>

            <button 
              className={`nav-tab ${activeTab === 'debts' ? 'active' : ''}`}
              onClick={() => setActiveTab('debts')}
            >
              <Users className="nav-tab-icon" />
              <span>Avräkning</span>
            </button>

            <button 
              className={`nav-tab ${activeTab === 'album' ? 'active' : ''}`}
              onClick={() => setActiveTab('album')}
            >
              <ImageIcon className="nav-tab-icon" />
              <span>Album</span>
            </button>
          </>
        )}

        {currentUser.role === 'superadmin' && (
          <button 
            className={`nav-tab ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            <Shield className="nav-tab-icon" />
            <span>Admin</span>
          </button>
        )}

      </footer>

      {/* --- MODAL: EDIT USER --- */}
      {showEditUserModal && editingUser && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Redigera Användare</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEditUserModal(false)}>Avbryt</button>
            </div>
            <form onSubmit={handleSaveEditedUser} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Alias / Namn</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editingUser.alias} 
                  onChange={e => setEditingUser({ ...editingUser, alias: e.target.value })} 
                  required 
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Telefonnummer (För Swish)</label>
                <input 
                  type="tel" 
                  className="input-field" 
                  value={getSwishPhone(editingUser.phone) || ''} 
                  onChange={e => setEditingUser({ ...editingUser, phone: e.target.value || 'NOPHONE' })} 
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Roll</label>
                <select 
                  className="input-field" 
                  value={editingUser.role} 
                  onChange={e => setEditingUser({ ...editingUser, role: e.target.value as any })}
                >
                  <option value="user">Användare (Deltagare)</option>
                  <option value="admin">Admin (Skapa resor)</option>
                  <option value="superadmin">Superadmin (System)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Kopplade e-postadresser</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  {(editingUser.emails || [editingUser.email]).map((em, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input 
                        type="email" 
                        className="input-field" 
                        style={{ flex: 1 }}
                        value={em} 
                        onChange={e => {
                          const updated = [...(editingUser.emails || [editingUser.email])];
                          updated[i] = e.target.value;
                          setEditingUser({ ...editingUser, emails: updated, email: updated[0] });
                        }} 
                      />
                      {(editingUser.emails || [editingUser.email]).length > 1 && (
                        <button 
                          type="button" 
                          className="btn btn-danger btn-sm" 
                          style={{ padding: '4px 8px' }}
                          onClick={() => {
                            const updated = (editingUser.emails || [editingUser.email]).filter((_, j) => j !== i);
                            setEditingUser({ ...editingUser, emails: updated, email: updated[0] });
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm" 
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => {
                      const emails = [...(editingUser.emails || [editingUser.email]), ''];
                      setEditingUser({ ...editingUser, emails });
                    }}
                  >
                    <Plus size={12} /> Lägg till e-post
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-primary">Spara ändringar</button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: MY PROFILE --- */}
      {showProfileModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>👤 Min profil</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowProfileModal(false)}>Stäng</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--bg-glow)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center' }}>
                <div className="avatar" style={{ width: '56px', height: '56px', fontSize: '24px', margin: '0 auto 8px' }}>
                  {formatName(currentUser.alias).charAt(0)}
                </div>
                <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--text-main)' }}>{currentUser.alias}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{currentUser.email}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-primary-light)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{currentUser.role}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>👤 Mitt visningsnamn (Alias)</label>
                  <input
                    type="text"
                    className="input-field"
                    value={profileAlias}
                    onChange={e => setProfileAlias(e.target.value)}
                  />
                </div>
                
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>📱 Swish-nummer</label>
                  <input
                    type="tel"
                    className="input-field"
                    placeholder="Ex: 0701234567"
                    value={profilePhone}
                    onChange={e => setProfilePhone(e.target.value)}
                  />
                </div>

                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    const phone = profilePhone.trim() || 'NOPHONE';
                    const alias = profileAlias.trim() || currentUser.alias;
                    const updated = { ...currentUser, phone, alias };
                    await firebaseService.saveUser(updated);
                    setCurrentUser(updated);
                    
                    // Also update activeTrip participants to reflect the new alias immediately
                    if (activeTrip) {
                      const updatedParticipants = activeTrip.participants.map(p => 
                        p.id === updated.uid ? { ...p, name: updated.alias } : p
                      );
                      const updatedTrip = { ...activeTrip, participants: updatedParticipants };
                      await firebaseService.updateTrip(updatedTrip);
                    }
                    
                    setShowProfileModal(false);
                    triggerToast('Profil uppdaterad! ✅');
                  }}
                >
                  Spara ändringar
                </button>
              </div>

              {currentUser.emails && currentUser.emails.length > 1 && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>📧 Kopplade e-postadresser</label>
                  {currentUser.emails.map((em, i) => (
                    <div key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '4px 0' }}>
                      {em} {em === currentUser.email && <span style={{ color: 'var(--color-primary-light)' }}>✓ Primär</span>}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  className="btn btn-danger"
                  style={{ width: '100%' }}
                  onClick={() => {
                    setShowProfileModal(false);
                    if (confirm('Vill du logga ut?')) auth.signOut();
                  }}
                >
                  🚪 Logga ut
                </button>
                <button
                  className="btn"
                  style={{ width: '100%', background: 'transparent', color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}
                  onClick={async () => {
                    if (confirm('ÄR DU HELT SÄKER? Detta raderar din inloggning och profil permanent. Dina gamla utlägg ligger kvar i resorna som "Gäst-utlägg" så matematiken inte går sönder.')) {
                      try {
                        const user = auth.currentUser;
                        if (user) {
                          await deleteDoc(doc(db, 'users', currentUser.uid));
                          await deleteUser(user);
                          setShowProfileModal(false);
                          triggerToast('Ditt konto har raderats permanent.', 'success');
                        }
                      } catch (error: any) {
                        if (error.code === 'auth/requires-recent-login') {
                          triggerToast('Du måste logga ut och logga in igen för att radera kontot av säkerhetsskäl.', 'error');
                        } else {
                          triggerToast('Kunde inte radera kontot: ' + error.message, 'error');
                        }
                      }
                    }
                  }}
                >
                  🗑️ Radera mitt konto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: CREATE TRIP --- */}
      {showAddTripModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Skapa ny resa</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddTripModal(false)}>Avbryt</button>
            </div>
            
            <form onSubmit={handleCreateTrip}>
              <div className="form-group">
                <label className="form-label">Resans namn</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="t.ex. Fjällresan 2026"
                  value={newTripTitle}
                  onChange={(e) => setNewTripTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Valuta</label>
                <select 
                  className="input-field select-field" 
                  value={newTripCurrency}
                  onChange={(e) => setNewTripCurrency(e.target.value)}
                >
                  <option value="SEK">SEK (kr)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="NOK">NOK (kr)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Deltagare (ett namn per rad)</label>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Tips: Skriver du namnet/e-posten på en inbjuden vän kopplas deras konto. Annars skapas en smart "Ghost User" som du kan fördela kostnader på!
                </p>
                {newTripParticipants.map((part, index) => (
                  <div key={index} style={{ marginBottom: '8px' }}>
                    <input 
                      type="text"
                      className="input-field"
                      placeholder={`Deltagare ${index + 1}`}
                      value={part}
                      list={`user-list-${index}`}
                      onChange={(e) => {
                        const updated = [...newTripParticipants];
                        updated[index] = e.target.value;
                        setNewTripParticipants(updated);
                      }}
                    />
                    <datalist id={`user-list-${index}`}>
                      {allUsers.map(u => (
                        <option key={u.uid} value={u.alias} />
                      ))}
                    </datalist>
                  </div>
                ))}
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setNewTripParticipants([...newTripParticipants, ''])}
                  style={{ alignSelf: 'flex-start' }}
                >
                  + Fler deltagare
                </button>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '14px' }}>
                Starta resan
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: ADD EXPENSE --- */}
      {showAddExpenseModal && activeTrip && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingExpenseId ? 'Redigera utlägg' : 'Registrera utlägg'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                setShowAddExpenseModal(false);
                setEditingExpenseId(null);
              }}>Stäng</button>
            </div>

            {/* OCR upload box */}
            <div style={{ 
              border: '1px solid rgba(var(--color-primary-rgb), 0.3)', 
              borderRadius: 'var(--radius-md)', 
              padding: '12px', 
              marginBottom: '18px',
              background: 'var(--bg-glow)'
            }}>
              {isOcrScanning ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <Sparkles className="logo-tab-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--color-primary-light)', margin: '0 auto 8px' }} />
                  <p style={{ fontSize: '13px', fontWeight: 600 }}>Tolkar kvitto med Cloud AI-OCR...</p>
                </div>
              ) : expenseReceiptBase64 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  {expenseReceiptBase64.startsWith('PDF:') ? (
                    <div style={{ 
                      display: 'flex', alignItems: 'center', gap: '8px', 
                      background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)',
                      padding: '10px 12px', fontSize: '13px', color: 'var(--text-secondary)'
                    }}>
                      <FileText size={20} style={{ color: 'var(--color-primary-light)', flexShrink: 0 }} />
                      <span>{expenseReceiptBase64.replace('PDF:', '')}</span>
                    </div>
                  ) : (
                    <img src={expenseReceiptBase64} alt="Kvitto" style={{ maxHeight: '120px', borderRadius: 'var(--radius-sm)', objectFit: 'contain' }} />
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpenseReceiptBase64('')}>
                      Ta bort kvitto
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => cameraInputRef.current?.click()}>
                      Skanna nytt
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
                    <Camera size={24} style={{ color: 'var(--color-primary-light)' }} />
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>Snabb-läs kvitto</p>
                      <p style={{ fontSize: '11px', color: 'var(--color-primary-light)', opacity: 0.8, margin: 0 }}>AI-tolkar beloppet</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      type="button" 
                      className="btn btn-primary btn-sm" 
                      onClick={() => cameraInputRef.current?.click()}
                      style={{ padding: '6px 10px' }}
                    >
                      📷 Fota
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => fileInputRef.current?.click()}
                      style={{ padding: '6px 10px' }}
                    >
                      📁 Välj
                    </button>
                  </div>
                </div>
              )}
              {/* Camera capture input (direct, no file picker) */}
              <input 
                type="file" 
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                onChange={handleReceiptUploadAndOCR}
                style={{ display: 'none' }}
              />
              {/* File picker (gallery + PDF) */}
              <input 
                type="file" 
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                onChange={handleReceiptUploadAndOCR}
                style={{ display: 'none' }}
              />
            </div>

            <form onSubmit={handleAddExpense}>
              <div className="form-group">
                <label className="form-label">Vad har du köpt?</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="t.ex. Tankat bilen, Middag"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Belopp ({activeTrip.currency})</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="input-field" 
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Vem betalade?</label>
                <select 
                  className="input-field select-field" 
                  value={expensePayer}
                  onChange={(e) => setExpensePayer(e.target.value)}
                >
                  {activeTrip.participants.map(p => (
                    <option key={p.id} value={p.id}>{formatName(p.name)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Splittningstyp</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    className={`btn btn-sm ${expenseSplitType === 'equal' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => {
                      setExpenseSplitType('equal');
                      const initial: { [id: string]: number } = {};
                      activeTrip.participants.forEach(p => { initial[p.id] = 1; });
                      setExpenseSplits(initial);
                    }}
                  >
                    Lika delning
                  </button>
                  <button 
                    type="button" 
                    className={`btn btn-sm ${expenseSplitType === 'percentage' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => {
                      setExpenseSplitType('percentage');
                      const initial: { [id: string]: number } = {};
                      activeTrip.participants.forEach(p => { initial[p.id] = 0; });
                      setExpenseSplits(initial);
                    }}
                  >
                    Procentuell (%)
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Vilka ingår i splitten?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-input)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                  {(() => {
                    const parsedAmount = parseFloat(expenseAmount) || 0;
                    const checkedCount = Object.keys(expenseSplits).filter(pId => expenseSplits[pId] > 0).length;
                    const equalShare = checkedCount > 0 ? (parsedAmount / checkedCount) : 0;
                    
                    return activeTrip.participants.map(p => {
                      const isSelected = expenseSplits[p.id] > 0;
                      const shareCost = expenseSplitType === 'equal'
                        ? (isSelected ? equalShare : 0)
                        : (parsedAmount * ((expenseSplits[p.id] || 0) / 100));
                        
                      return (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label className="checkbox-container">
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={(e) => {
                                if (expenseSplitType === 'equal') {
                                  handleSplitChange(p.id, e.target.checked ? 1 : 0);
                                } else {
                                  const alreadySelected = Object.keys(expenseSplits).filter(pId => expenseSplits[pId] > 0 && pId !== p.id);
                                  const remainingPct = 100 - alreadySelected.reduce((sum, pId) => sum + (expenseSplits[pId] || 0), 0);
                                  handleSplitChange(p.id, e.target.checked ? Math.max(0, remainingPct) : 0);
                                }
                              }}
                            />
                            <span className="custom-checkbox"></span>
                            <span style={{ display: 'flex', flexDirection: 'column' }}>
                              <span>{formatName(p.name)}</span>
                              <span style={{ fontSize: '11px', color: isSelected ? 'var(--color-primary-light)' : 'var(--text-muted)' }}>
                                {shareCost.toFixed(2)} {activeTrip.currency}
                              </span>
                            </span>
                          </label>

                          {expenseSplitType === 'percentage' && isSelected && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input 
                                type="number" 
                                className="input-field" 
                                style={{ width: '64px', padding: '6px', textAlign: 'center' }}
                                value={expenseSplits[p.id] || 0}
                                onChange={(e) => handleSplitChange(p.id, parseFloat(e.target.value) || 0)}
                              />
                              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>%</span>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Kommentar (Valfritt)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="t.ex. Handlat på ICA"
                  value={expenseComment}
                  onChange={(e) => setExpenseComment(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setShowAddExpenseModal(false);
                    setEditingExpenseId(null);
                  }}
                >
                  Avbryt
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editingExpenseId ? 'Spara ändringar' : 'Registrera utlägg'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: SWISH AND QR --- */}
      {showSwishModal && activeTrip && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Swish-reglering</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowSwishModal(null)}>Stäng</button>
            </div>

            <div className="qr-modal-content">
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                Reglera skuld från <strong>{showSwishModal.fromName}</strong> till <strong>{showSwishModal.toName}</strong>
              </div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--color-primary-light)' }}>
                {showSwishModal.amount} {activeTrip.currency}
              </div>

              <div style={{ width: '100%', marginTop: '15px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mottagarens Swish-nummer</label>
                <input 
                  type="tel" 
                  className="input-field" 
                  style={{ textAlign: 'center', fontWeight: 'bold' }}
                  value={swishPhoneInput}
                  onChange={e => setSwishPhoneInput(e.target.value)}
                  placeholder="Ex: 0701234567"
                />
              </div>

              <div style={{ background: '#fff', padding: '16px', borderRadius: 'var(--radius-md)', display: 'inline-block', margin: '20px 0' }}>
                <QRCodeComponent 
                  value={`https://app.swish.nu/1/p/sw/?sw=${swishPhoneInput.replace(/[^0-9]/g, '')}&amt=${Math.round(showSwishModal.amount)}&msg=${encodeURIComponent(`Splitta: ${activeTrip.title}`)}`}
                  size={200}
                />
              </div>

              <p style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '280px' }}>
                Skanna QR-koden direkt med din vanliga mobilkamera eller direkt i Swish-appen för att fästa belopp, mottagare och meddelande!
              </p>

              <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => handleCopySwishInfo(showSwishModal)}
                >
                  Kopiera dela-text
                </button>
                <a 
                  className="btn btn-swish" 
                  style={{ flex: 1, textDecoration: 'none', opacity: swishPhoneInput ? 1 : 0.5, pointerEvents: swishPhoneInput ? 'auto' : 'none' }}
                  href={`swish://payment?data=${encodeURIComponent(JSON.stringify({
                    version: 1,
                    payee: { value: swishPhoneInput },
                    amount: { value: showSwishModal.amount },
                    message: { value: `Reglering: ${activeTrip.title}` }
                  }))}`}
                >
                  Öppna Swish
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: INVITE SYSTEM USER --- */}
      {showInviteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Bjud in användare</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowInviteModal(false)}>Avbryt</button>
            </div>
            
            <form onSubmit={handleInviteUser}>
              <div className="form-group">
                <label className="form-label">E-postadress</label>
                <input 
                  type="email" 
                  className="input-field" 
                  placeholder="t.ex. kompis@gmail.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Alias (visningsnamn)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="t.ex. Kalle, Sofia"
                  value={inviteAlias}
                  onChange={(e) => setInviteAlias(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Telefonnummer (för Swish)</label>
                <input 
                  type="tel" 
                  className="input-field" 
                  placeholder="t.ex. 0701234567"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '14px' }}>
                Ge tillträde
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: SHARE OPTIONS --- */}
      {showShareModal && activeTrip && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Dela Sammanställning</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowShareModal(false)}>Avbryt</button>
            </div>
            
            <div className="form-group">
              <label className="form-label">Vad vill du dela?</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  type="button" 
                  className={`btn btn-sm ${shareLevel === 'summary' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setShareLevel('summary')}
                >
                  Endast Slutreglering
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${shareLevel === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setShareLevel('all')}
                >
                  Detaljerad Rapport
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Hur vill du dela?</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className={`btn btn-sm ${shareFormat === 'whatsapp' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, minWidth: '45%' }}
                  onClick={() => setShareFormat('whatsapp')}
                >
                  WhatsApp
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${shareFormat === 'email' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, minWidth: '45%' }}
                  onClick={() => setShareFormat('email')}
                >
                  E-post
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${shareFormat === 'text' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, minWidth: '30%' }}
                  onClick={() => setShareFormat('text')}
                >
                  Kopiera Text
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${shareFormat === 'image' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, minWidth: '30%' }}
                  onClick={() => setShareFormat('image')}
                >
                  Bild (JPG)
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${shareFormat === 'pdf' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, minWidth: '30%' }}
                  onClick={() => setShareFormat('pdf')}
                >
                  PDF
                </button>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} onClick={executeShare}>
              Exportera & Dela
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL: PRIVACY POLICY --- */}
      {showPrivacyModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Integritetspolicy</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowPrivacyModal(false)}>Stäng</button>
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
              <p><strong>Ölle-Split</strong> värnar om din personliga integritet.</p>
              <br/>
              <p>1. <strong>Datan lagras säkert:</strong> All information om dina resor, utlägg och de telefonnummer du anger lagras lokalt i din enhet tills vi lanserar molnstödet. När molnstöd aktiveras kommer data att sparas i Google Firebase och skyddas bakom inloggning.</p>
              <br/>
              <p>2. <strong>Telefonnummer & Swish:</strong> De telefonnummer du anger används uteslutande för att generera en lokal Swish-QR-kod och förifylla din Swish-app. De skickas aldrig till tredjepartstjänster för marknadsföring eller analys.</p>
              <br/>
              <p>3. <strong>Analys & Spårning:</strong> Appen spårar ej ditt beteende eller din exakta plats. Vi använder endast nödvändig lokal lagring för att appen ska fungera.</p>
              <br/>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => setShowPrivacyModal(false)}>Jag förstår</button>
            </div>
          </div>
        </div>
      )}

      {/* --- HIDDEN EXPORT VIEW FOR HTML2CANVAS --- */}
      {activeTrip && (
        <div 
          id="export-print-view" 
          style={{ 
            display: 'none', 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '800px', 
            padding: '40px', 
            background: '#ffffff', 
            color: '#000000',
            fontFamily: 'Inter, sans-serif',
            zIndex: -9999
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Sparkles size={32} color="#0ea5e9" />
            <h1 style={{ margin: 0, fontSize: '32px', color: '#000' }}>Ölle-Split Sammanställning</h1>
          </div>
          <h2 style={{ fontSize: '24px', color: '#0ea5e9', marginBottom: '10px' }}>{activeTrip.title}</h2>
          <p style={{ fontSize: '18px', color: '#444', marginBottom: '30px' }}>
            Totalt utlagt: <strong>{activeTrip.total_cost} {activeTrip.currency}</strong>
          </p>

          {shareLevel === 'all' && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '15px', color: '#000' }}>
                Detaljerad Debit/Credit per Person
              </h3>
              {activeTripBalances.map(b => (
                <div key={b.id} style={{ marginBottom: '15px', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold' }}>
                    <span style={{ color: '#000' }}>{formatName(b.name)}</span>
                    <span style={{ color: b.balance > 0 ? '#16a34a' : b.balance < 0 ? '#dc2626' : '#64748b' }}>
                      {b.balance > 0 ? '+' : ''}{b.balance} {activeTrip.currency}
                    </span>
                  </div>
                  {b.lineItems && b.lineItems.length > 0 && (
                    <div style={{ marginTop: '10px', paddingLeft: '15px', borderLeft: '3px solid #cbd5e1' }}>
                      {b.lineItems.map((li, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px', color: '#475569' }}>
                          <span>{li.title}</span>
                          <div>
                            {li.paidAmount > 0 && <span style={{ color: '#16a34a', fontWeight: 'bold', marginRight: '8px' }}>+{li.paidAmount.toFixed(2)} {activeTrip.currency}</span>}
                            {li.owedAmount > 0 && <span style={{ color: '#dc2626', fontWeight: 'bold' }}>-{li.owedAmount.toFixed(2)} {activeTrip.currency}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <h3 style={{ fontSize: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '15px', color: '#000' }}>
            Vem Swishar Vem? (Reglering)
          </h3>
          
          {activeTripSettlements.length === 0 ? (
            <p style={{ color: '#16a34a', fontSize: '18px', fontWeight: 'bold' }}>Alla är kvitt!</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {activeTripSettlements.map((s, idx) => {
                const payeePhone = getSwishPhone(activeTrip?.participants.find(p => p.id === s.to || p.name === s.toName)?.phone);
                const cleanPhone = payeePhone ? payeePhone.replace(/[^0-9]/g, '') : '';
                const swishUrl = cleanPhone 
                  ? `https://app.swish.nu/1/p/sw/?sw=${cleanPhone}&amt=${Math.round(s.amount)}&msg=${encodeURIComponent(`Splitta: ${activeTrip.title}`)}`
                  : '';
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#000' }}>
                        {formatName(s.fromName)} <span style={{ color: '#64748b', fontWeight: 'normal' }}>swishar</span> {formatName(s.toName)}
                      </div>
                      <div style={{ fontSize: '28px', color: '#0ea5e9', fontWeight: 'bold' }}>
                        {s.amount} {activeTrip.currency}
                      </div>
                    </div>
                    {swishUrl ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div style={{ background: '#fff', padding: '16px', borderRadius: 'var(--radius-md)', display: 'inline-block' }}>
                          <QRCodeComponent value={swishUrl} size={120} />
                        </div>
                        <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                          <a 
                            href={swishUrl}
                            className="btn btn-swish btn-sm"
                            style={{ 
                              textDecoration: 'none', 
                              fontSize: '11px', 
                              padding: '6px 8px', 
                              flex: 1,
                              textAlign: 'center',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold'
                            }}
                          >
                            Swisha
                          </a>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ 
                              fontSize: '11px', 
                              padding: '6px 8px', 
                              flex: 1,
                              textAlign: 'center',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold'
                            }}
                            onClick={() => handleCopySettlementText(s.fromName, s.amount, payeePhone)}
                          >
                            Dela
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b', maxWidth: '140px', textAlign: 'center', padding: '8px', border: '1px dashed #cbd5e1', borderRadius: '6px' }}>
                        Saknar Swish-nummer
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- MODAL: FULLSCREEN PHOTO --- */}
      {fullscreenPhoto && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 9999, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setFullscreenPhoto(null)}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button 
              className="btn btn-icon-only" 
              style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', zIndex: 10 }}
              onClick={(e) => { e.stopPropagation(); setFullscreenPhoto(null); }}
            >
              ✕
            </button>
            <img 
              src={fullscreenPhoto} 
              alt="Fullscreen" 
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 'var(--radius-md)', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }} 
            />
          </div>
        </div>
      )}

      {/* --- TOAST NOTIFICATIONS --- */}
      {toast && (
        <div className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
