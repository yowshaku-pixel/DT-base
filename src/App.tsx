import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Upload, Search, Filter, Trash2, Loader2, AlertCircle, Save, RefreshCw, X, ChevronDown, ChevronRight, ListFilter, Download, LogIn, LogOut, User as UserIcon, Clock } from 'lucide-react';
import { MaintenanceRecord } from './types';
import { extractMaintenanceData } from './services/aiService';
import { cn, resizeImage } from './lib/utils';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType, getFirestoreErrorMessage } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, writeBatch, serverTimestamp, Timestamp, getDocFromServer, getDocs, limit } from 'firebase/firestore';

interface UploadLogEntry {
  fileName: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  error?: string;
  timestamp: number;
}

const CONCURRENCY_LIMIT = 1; // Reduced for mobile stability

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const shouldStopRef = React.useRef(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, failed: 0 });
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [dangerAction, setDangerAction] = useState<'clearAll' | 'clearDuplicates' | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(true);
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [uploadLog, setUploadLog] = useState<UploadLogEntry[]>([]);
  const [latestImage, setLatestImage] = useState<string | null>(null);
  const [isLoadingLatestImage, setIsLoadingLatestImage] = useState(false);
  const [viewingImage, setViewingImage] = useState<{ id: string, image: string | null, loading: boolean } | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [pwaStatus, setPwaStatus] = useState<string>('Checking...');
  const wakeLockRef = React.useRef<any>(null);

  // PWA Install Prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      console.log('beforeinstallprompt event fired');
      e.preventDefault();
      setDeferredPrompt(e);
      setPwaStatus('Ready to Install');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setPwaStatus('Already Installed');
    }

    // Check Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        console.log('Service Worker is ready');
        if (!deferredPrompt && !window.matchMedia('(display-mode: standalone)').matches) {
          setPwaStatus('Waiting for Chrome...');
        }
      });
    } else {
      setPwaStatus('SW Not Supported');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [deferredPrompt]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Load upload log from localStorage on mount
  useEffect(() => {
    const savedLog = localStorage.getItem('dt_base_upload_log');
    if (savedLog) {
      try {
        setUploadLog(JSON.parse(savedLog));
      } catch (e) {
        console.error("Failed to parse upload log", e);
      }
    }
  }, []);

  // Save upload log to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('dt_base_upload_log', JSON.stringify(uploadLog));
  }, [uploadLog]);

  const clearUploadLog = () => {
    setUploadLog([]);
    localStorage.removeItem('dt_base_upload_log');
  };

  // Screen Wake Lock to prevent "crushing" when screen turns off during processing
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isProcessing) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err: any) {
          console.error("Wake Lock error:", err);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (err) {
          console.error("Wake Lock release error:", err);
        }
      }
    };

    if (isProcessing) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Re-request wake lock if tab becomes visible again
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isProcessing) {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isProcessing]);

  const MASTER_PASSWORD = 'adminjo'; // Updated password

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const q = query(
        collection(db, 'maintenance_records'),
        where('userId', '==', user.uid)
      );
      const snapshot = await getDocs(q);
      const fetchedRecords = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MaintenanceRecord[];
      setRecords(fetchedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setIsCloudConnected(true);
      setError(null);
    } catch (err: any) {
      try {
        handleFirestoreError(err, OperationType.GET, 'maintenance_records');
      } catch (e: any) {
        setError(getFirestoreErrorMessage(e));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [user]);

  // Firestore listener
  useEffect(() => {
    if (!user) {
      setRecords([]);
      return;
    }

    const q = query(
      collection(db, 'maintenance_records'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      setIsCloudConnected(true);
      const fetchedRecords = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MaintenanceRecord[];
      
      // Sort by date descending
      setRecords(fetchedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      
      // If we got data from cache, it's fine, but we might still be "offline" relative to the server
      if (snapshot.metadata.fromCache) {
        console.log("Data loaded from cache");
      }
    }, (err) => {
      if (err.message.includes('the client is offline')) {
        setIsCloudConnected(false);
      }
      // Only set the error if it's NOT a quota error, or if we don't have any records yet
      // This prevents the annoying popup if we already have cached data to show
      if (!err.message.includes('quota exceeded') && !err.message.includes('Quota limit exceeded')) {
        try {
          handleFirestoreError(err, OperationType.GET, 'maintenance_records');
        } catch (e: any) {
          setError(getFirestoreErrorMessage(e));
        }
      } else {
        console.warn("Firestore Quota Exceeded - using cached data if available.");
        setIsCloudConnected(false);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("Login popup was blocked. Please allow popups for this site.");
      } else if (err.code === 'auth/network-request-failed') {
        setError("Network error: Please check your internet connection or disable any ad-blockers/VPNs that might be blocking Google Login.");
      } else {
        setError(`Login failed: ${err.message || "Please try again."}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      setError("You must be logged in to upload records. Please click the Login button.");
      return;
    }
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsProcessing(true);
      setIsStopping(false);
      shouldStopRef.current = false;
      setError(null);
      setFailedFiles([]);
      setProgress({ current: 0, total: files.length, failed: 0 });

      const fileArray = Array.from(files);
      
      // Initialize log entries for this batch
      const newEntries: UploadLogEntry[] = fileArray.map(f => ({
        fileName: f.name,
        status: 'pending',
        timestamp: Date.now()
      }));
      setUploadLog(prev => [...newEntries, ...prev].slice(0, 50)); // Keep last 50

      let completedCount = 0;
      let failedCount = 0;

      // Process in batches (concurrency control)
      for (let i = 0; i < fileArray.length; i += CONCURRENCY_LIMIT) {
        if (shouldStopRef.current) break;

        const batch = fileArray.slice(i, i + CONCURRENCY_LIMIT);
        
        await Promise.all(batch.map(async (file) => {
          if (shouldStopRef.current) return;

          // Update log to processing
          setUploadLog(prev => prev.map(entry => 
            entry.fileName === file.name && entry.status === 'pending' 
              ? { ...entry, status: 'processing' } 
              : entry
          ));

          let objectUrl: string | null = null;
          try {
            console.log(`Processing file: ${file.name}`);
            objectUrl = URL.createObjectURL(file);

            if (shouldStopRef.current) return;

            console.log(`Resizing image: ${file.name}`);
            const resizedBase64 = await resizeImage(objectUrl, 1200);

            if (shouldStopRef.current) return;

            console.log(`Extracting data from: ${file.name}`);
            if (!process.env.GEMINI_API_KEY) {
              throw new Error("Gemini API key is missing.");
            }
            await new Promise(r => setTimeout(r, 200)); 
            if (shouldStopRef.current) return;
            
            const result = await extractMaintenanceData(resizedBase64, 'image/jpeg');
            
            if (shouldStopRef.current) return;

            if (!result || !result.records || result.records.length === 0) {
              throw new Error("No readable records found in this image.");
            } else {
              // Save to Firestore
              for (const record of result.records) {
                if (shouldStopRef.current) break;
                
                // 1. Save metadata to main collection
                const recordRef = await addDoc(collection(db, 'maintenance_records'), {
                  ...record,
                  userId: user.uid,
                  fileName: file.name,
                  // originalImage: resizedBase64, // MOVED to separate collection
                  createdAt: serverTimestamp()
                });

                // 2. Save image to separate collection to save memory in list views
                await addDoc(collection(db, 'maintenance_record_images'), {
                  recordId: recordRef.id,
                  image: resizedBase64,
                  userId: user.uid,
                  createdAt: serverTimestamp()
                });
              }
              
              // Update log to success
              setUploadLog(prev => prev.map(entry => 
                entry.fileName === file.name && entry.status === 'processing' 
                  ? { ...entry, status: 'success' } 
                  : entry
              ));
            }
          } catch (err: any) {
            if (!shouldStopRef.current) {
              console.error(`Error processing file ${file.name}:`, err);
              failedCount++;
              setFailedFiles(prev => [...prev, file.name]);
              
              // Update log to failed
              setUploadLog(prev => prev.map(entry => 
                entry.fileName === file.name && entry.status === 'processing' 
                  ? { ...entry, status: 'failed', error: err.message || "Unknown error" } 
                  : entry
              ));
            }
          } finally {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            
            if (!shouldStopRef.current) {
              completedCount++;
              setProgress(prev => ({ ...prev, current: completedCount, failed: failedCount }));
            }
          }
        }));
      }

      if (shouldStopRef.current) return;

      if (failedCount > 0) {
        setError(`Processed ${completedCount} files, but ${failedCount} files had no readable records or failed.`);
      }

      if (failedCount === 0) {
        setProgress({ current: 0, total: 0, failed: 0 });
      }
    } catch (err: any) {
      console.error("Critical upload error:", err);
      setError("A critical error occurred during upload. Please try fewer files at once.");
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
      shouldStopRef.current = false;
    }
  }, [user]);

  const filteredRecords = useMemo(() => {
    const filtered = records.filter(record => {
      const matchesSearch = record.plateNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesService = record.service.toLowerCase().includes(serviceFilter.toLowerCase());
      return matchesSearch && matchesService;
    });

    return filtered;
  }, [records, searchQuery, serviceFilter]);

  // Fetch image for the latest record when it changes
  useEffect(() => {
    const fetchLatestImage = async () => {
      if (filteredRecords.length > 0) {
        const latestRecord = filteredRecords[0];
        // If the record already has an image (legacy), use it
        if (latestRecord.originalImage) {
          setLatestImage(latestRecord.originalImage);
          return;
        }

        // Otherwise fetch from separate collection
        setIsLoadingLatestImage(true);
        try {
          const q = query(
            collection(db, 'maintenance_record_images'),
            where('recordId', '==', latestRecord.id),
            where('userId', '==', user?.uid),
            limit(1)
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            setLatestImage(snapshot.docs[0].data().image);
          } else {
            setLatestImage(null);
          }
        } catch (err) {
          console.error("Failed to fetch latest image", err);
          setLatestImage(null);
        } finally {
          setIsLoadingLatestImage(false);
        }
      } else {
        setLatestImage(null);
      }
    };

    fetchLatestImage();
  }, [filteredRecords, user]);

  const groupedRecords = useMemo(() => {
    const groups: Record<string, MaintenanceRecord[]> = {};
    // Sort records by date descending within groups
    const sorted = [...filteredRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    sorted.forEach(record => {
      const plate = record.plateNumber || 'UNKNOWN';
      if (!groups[plate]) {
        groups[plate] = [];
      }
      groups[plate].push(record);
    });
    return groups;
  }, [filteredRecords]);

  const togglePlate = (plate: string) => {
    setExpandedPlates(prev => ({
      ...prev,
      [plate]: !prev[plate]
    }));
  };

  const toggleAll = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    Object.keys(groupedRecords).forEach(plate => {
      newState[plate] = expand;
    });
    setExpandedPlates(newState);
  };

  const handleViewImage = async (record: MaintenanceRecord) => {
    if (record.originalImage) {
      setViewingImage({ id: record.id, image: record.originalImage, loading: false });
      return;
    }

    setViewingImage({ id: record.id, image: null, loading: true });
    try {
      const q = query(
        collection(db, 'maintenance_record_images'),
        where('recordId', '==', record.id),
        where('userId', '==', user?.uid),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setViewingImage({ id: record.id, image: snapshot.docs[0].data().image, loading: false });
      } else {
        setViewingImage({ id: record.id, image: null, loading: false });
      }
    } catch (err) {
      console.error("Failed to fetch image", err);
      setViewingImage(null);
    }
  };

  const handleClearAll = async () => {
    if (!user || records.length === 0) return;
    if (passwordInput === MASTER_PASSWORD) {
      try {
        // Firestore batches have a limit of 500 operations
        const BATCH_SIZE = 400;
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          const chunk = records.slice(i, i + BATCH_SIZE);
          chunk.forEach(record => {
            batch.delete(doc(db, 'maintenance_records', record.id));
          });
          await batch.commit();
        }
        
        setShowPasswordPrompt(false);
        setPasswordInput('');
        setPasswordError(false);
        setDangerAction(null);
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.WRITE, 'maintenance_records');
        } catch (e: any) {
          setError(getFirestoreErrorMessage(e));
        }
      }
    } else {
      setPasswordError(true);
    }
  };

  const handleClearDuplicates = async () => {
    if (!user || records.length === 0) return;
    if (passwordInput === MASTER_PASSWORD) {
      try {
        const seen = new Set<string>();
        const duplicates: string[] = [];
        
        // Sort by createdAt descending to keep the most recent one
        const sortedRecords = [...records].sort((a, b) => {
          const timeA = (a as any).createdAt?.seconds || 0;
          const timeB = (b as any).createdAt?.seconds || 0;
          return timeB - timeA;
        });

        sortedRecords.forEach(record => {
          const key = `${record.plateNumber}-${record.date}-${record.service}`.toLowerCase().trim();
          if (seen.has(key)) {
            duplicates.push(record.id);
          } else {
            seen.add(key);
          }
        });

        if (duplicates.length === 0) {
          setError("No exact duplicates found.");
          setShowPasswordPrompt(false);
          setPasswordInput('');
          setDangerAction(null);
          return;
        }

        const BATCH_SIZE = 400;
        for (let i = 0; i < duplicates.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          const chunk = duplicates.slice(i, i + BATCH_SIZE);
          chunk.forEach(id => {
            batch.delete(doc(db, 'maintenance_records', id));
          });
          await batch.commit();
        }
        
        setShowPasswordPrompt(false);
        setPasswordInput('');
        setPasswordError(false);
        setDangerAction(null);
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.DELETE, 'maintenance_records/batch');
        } catch (e: any) {
          setError(getFirestoreErrorMessage(e));
        }
      }
    } else {
      setPasswordError(true);
    }
  };

  const downloadCSV = () => {
    if (records.length === 0) return;
    
    // Prepare CSV content
    const headers = ['Plate', 'Date', 'Service'];
    const csvRows = [
      headers.join(','),
      ...records.map(r => {
        // Escape quotes and wrap in quotes
        const plate = `"${r.plateNumber.replace(/"/g, '""')}"`;
        const date = `"${r.date.replace(/"/g, '""')}"`;
        const service = `"${r.service.replace(/"/g, '""')}"`;
        return [plate, date, service].join(',');
      })
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dt_base_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white p-4 md:p-12 max-w-7xl mx-auto flex flex-col">
      {/* Header */}
      <header className="mb-8 md:mb-12 border-b border-[var(--color-line)] pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tighter mb-2">DT.Base</h1>
            <p className="text-[10px] md:text-sm opacity-60 uppercase tracking-[0.3em] font-display font-medium">Mechanical Issue Extraction & History Log</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            {deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 md:py-3 bg-purple-600 text-white hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/40 active:scale-95 animate-bounce"
              >
                <Download className="w-4 h-4" />
                <span className="text-xs font-display font-bold uppercase tracking-[0.2em]">Install App</span>
              </button>
            )}
            <div className="px-3 py-1 bg-white/5 border border-white/10 rounded text-[8px] text-white/40 font-mono">
              PWA: {pwaStatus}
            </div>
            {isProcessing && (
              <div className="flex items-center gap-2 px-3 py-1 bg-purple-500/20 border border-purple-500/30 rounded text-[9px] text-purple-400 animate-pulse">
                <Clock className="w-3 h-3" />
                <span className="font-display font-bold uppercase tracking-[0.2em]">Keep Screen On Active</span>
              </div>
            )}

            {!isAuthReady ? (
              <div className="flex items-center gap-2 text-white/40">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em]">Syncing...</span>
              </div>
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-purple-400 block">Active</span>
                  <span className="text-[8px] opacity-40 font-mono truncate max-w-[100px] block">{user.email}</span>
                </div>
                <button 
                  onClick={logout}
                  className="p-2 bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all rounded active:scale-95"
                  title="Logout"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 md:py-3 bg-white text-black hover:bg-gray-200 transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                <span className="text-xs font-display font-bold uppercase tracking-[0.2em]">{isLoggingIn ? "Logging in..." : "Login"}</span>
              </button>
            )}

            {!isProcessing && records.length > 0 && (
              <button 
                onClick={downloadCSV}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 md:py-3 bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span className="text-xs font-display font-bold uppercase tracking-[0.2em]">Export</span>
              </button>
            )}
            {isProcessing && (
              <button 
                onClick={() => { 
                  shouldStopRef.current = true; 
                  setIsProcessing(false);
                  setIsStopping(false);
                  setProgress({ current: 0, total: 0, failed: 0 });
                }}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 md:py-3 text-white border bg-red-500/20 border-red-500/50 hover:bg-red-500/40 transition-colors active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-xs font-display font-bold uppercase tracking-[0.2em]">
                  Stop
                </span>
              </button>
            )}
            <button 
              onClick={fetchRecords}
              disabled={isRefreshing || !user}
              className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-95 disabled:opacity-50"
              title="Sync with Cloud"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            </button>
            <label className={cn(
              "flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 md:py-3 bg-purple-600 text-white cursor-pointer hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/20 active:scale-95",
              (isProcessing || !user) && "opacity-50 cursor-not-allowed"
            )}>
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="text-xs font-display font-bold uppercase tracking-[0.2em]">
                {isProcessing 
                  ? `${progress.current}/${progress.total}` 
                  : !user ? "Login to Add" : "Add Pictures"}
              </span>
              <input 
                type="file" 
                multiple 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileUpload}
                disabled={isProcessing || !user}
              />
            </label>
          </div>
        </div>
        
        {/* Progress Bar */}
        {isProcessing && (
          <div className="mt-4 h-1 w-full bg-white/10 overflow-hidden rounded-full">
            <div 
              className="h-full bg-purple-500 transition-all duration-300 shadow-[0_0_10px_rgba(168,85,247,0.5)]" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        )}
      </header>

      {/* Error Message */}
      {error && (
        <div className="mb-8 p-4 bg-red-900/40 backdrop-blur-md border border-red-500/50 text-red-100 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-display font-medium">{error}</span>
            </div>
            <button 
              onClick={() => {
                setError(null);
                setFailedFiles([]);
              }}
              className="p-2 hover:bg-red-200 rounded-full transition-all hover:scale-110"
              title="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {failedFiles.length > 0 && (
            <div className="pl-8 flex flex-col gap-1">
              <p className="text-[10px] font-display font-bold uppercase tracking-widest opacity-60">Failed Files:</p>
              <ul className="list-disc list-inside">
                {failedFiles.map((name, i) => (
                  <li key={i} className="text-[11px] font-mono opacity-80">{name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Upload Log Section */}
      {uploadLog.length > 0 && (
        <div className="mb-12 glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <ListFilter className="w-4 h-4 text-purple-400" />
              <h2 className="font-display font-bold uppercase tracking-[0.2em] text-xs text-white">Recent Upload Activity</h2>
            </div>
            <button 
              onClick={clearUploadLog}
              className="text-[10px] font-display font-bold uppercase tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-red-400 transition-all"
            >
              Clear Log
            </button>
          </div>
          
          <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {uploadLog.map((entry, i) => (
              <div key={`${entry.fileName}-${entry.timestamp}-${i}`} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    entry.status === 'success' ? "bg-green-500" : 
                    entry.status === 'failed' ? "bg-red-500" : 
                    entry.status === 'processing' ? "bg-purple-500 animate-pulse" : "bg-white/20"
                  )} />
                  <span className="text-[11px] font-mono truncate opacity-80">{entry.fileName}</span>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className={cn(
                    "text-[9px] font-display font-bold uppercase tracking-widest",
                    entry.status === 'success' ? "text-green-400" : 
                    entry.status === 'failed' ? "text-red-400" : 
                    entry.status === 'processing' ? "text-purple-400" : "text-white/40"
                  )}>
                    {entry.status}
                  </span>
                  {entry.error && (
                    <span className="text-[8px] font-mono text-red-400/60 max-w-[150px] truncate" title={entry.error}>
                      {entry.error}
                    </span>
                  )}
                  <span className="text-[8px] font-mono opacity-20">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[9px] font-display font-medium opacity-40 italic">
            * This log persists even if the browser crashes. Successful uploads are saved to the cloud.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[9px] opacity-40 block mb-2 ml-2">Identify Truck</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
            <input 
              type="text"
              placeholder="Plate number..."
              className="w-full bg-white/5 backdrop-blur-sm border border-white/10 p-2.5 pl-10 pr-10 rounded-full font-display font-medium text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:opacity-30"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition-colors"
                title="Clear Search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        
        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[9px] opacity-40 block mb-2 ml-2">Find Maintenance</label>
          <div className="relative">
            <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
            <input 
              type="text"
              placeholder="Service type..."
              className="w-full bg-white/5 backdrop-blur-sm border border-white/10 p-2.5 pl-10 pr-10 rounded-full font-display font-medium text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:opacity-30"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            />
            {serviceFilter && (
              <button 
                onClick={() => setServiceFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition-colors"
                title="Clear Filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[9px] opacity-40 block mb-2 ml-2">Quick View</label>
          <button 
            onClick={() => setShowLatestOnly(!showLatestOnly)}
            className={cn(
              "w-full flex items-center justify-center gap-3 p-2.5 rounded-full border transition-all font-display font-bold text-[11px] uppercase tracking-[0.2em]",
              showLatestOnly 
                ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20" 
                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
            )}
          >
            <Clock className={cn("w-3.5 h-3.5", showLatestOnly ? "animate-pulse" : "")} />
            {showLatestOnly ? "Latest Active" : "Latest Only"}
          </button>
        </div>
      </div>
      
      {/* Latest Result Summary Area */}
      {showLatestOnly && filteredRecords.length > 0 && (
        <div className="mb-12 p-8 bg-purple-600/10 border border-purple-500/30 rounded-xl">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <span className="font-display font-bold text-[10px] uppercase tracking-[0.3em] text-purple-400">Latest Record Summary</span>
            </div>
            
            {/* Show image if available */}
            {isLoadingLatestImage ? (
              <div className="w-full max-w-md h-48 flex items-center justify-center bg-white/5 border border-white/10 rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin opacity-40" />
              </div>
            ) : latestImage ? (
              <div className="w-full max-w-md overflow-hidden rounded-lg border border-white/10">
                <img 
                  src={latestImage} 
                  alt="Original Record" 
                  className="w-full h-auto object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-full max-w-md h-48 flex items-center justify-center bg-white/5 border border-white/10 rounded-lg border-dashed">
                <p className="text-[10px] font-display font-bold uppercase tracking-widest opacity-40">No Image Available</p>
              </div>
            )}

            <div className="space-y-1">
              <p className="font-display text-sm opacity-60 uppercase tracking-widest">
                On the date of <span className="text-white font-bold">
                  {(() => {
                    try {
                      const d = new Date(filteredRecords[0].date);
                      if (isNaN(d.getTime())) return filteredRecords[0].date;
                      const day = d.getDate().toString().padStart(2, '0');
                      const month = (d.getMonth() + 1).toString().padStart(2, '0');
                      const year = d.getFullYear().toString().slice(-2);
                      return `${day}/${month}/${year}`;
                    } catch {
                      return filteredRecords[0].date;
                    }
                  })()}
                </span>
              </p>
              <p className="font-display text-4xl md:text-6xl font-bold tracking-tighter text-white">Truck {filteredRecords[0].plateNumber}</p>
              <p className="font-display text-xl md:text-2xl font-medium text-purple-200">Work has been done with : {filteredRecords[0].service}</p>
            </div>

            <div className="pt-4 border-t border-white/5">
              <p className="font-display font-bold text-3xl text-white/80">
                {(() => {
                  const recordDate = new Date(filteredRecords[0].date);
                  const now = new Date();
                  const diffTime = Math.abs(now.getTime() - recordDate.getTime());
                  const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.4375));
                  return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
                })()}
              </p>
              <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] opacity-40 mt-1">Calculated till current time</p>
            </div>

            <div className="pt-4 border-t border-white/5 space-y-2">
              <p className="text-[11px] font-display font-medium text-white/60 italic">
                Note : Check the detailed picture of info above doesn't appear to satisfy your request
              </p>
              {filteredRecords[0].fileName && (
                <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">
                  File name : {filteredRecords[0].fileName}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Maintenance History Header */}
      <div className="flex justify-between items-end mb-6 px-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-display font-bold uppercase tracking-[0.3em] text-[10px] text-purple-400">Log History</h2>
          <div className="flex items-center gap-3">
            <h3 className="font-display font-bold text-lg text-white tracking-tight">Maintenance Records</h3>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="text-[9px] font-display font-bold uppercase tracking-[0.2em] px-2.5 py-1 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-white/60"
            >
              {showHistory ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {showHistory && (
          <div className="flex gap-3">
            <button 
              onClick={() => toggleAll(true)}
              className="text-[9px] font-display font-bold uppercase tracking-[0.2em] opacity-30 hover:opacity-100 hover:text-purple-400 transition-all"
            >
              Expand
            </button>
            <button 
              onClick={() => toggleAll(false)}
              className="text-[9px] font-display font-bold uppercase tracking-[0.2em] opacity-30 hover:opacity-100 hover:text-purple-400 transition-all"
            >
              Collapse
            </button>
          </div>
        )}
      </div>

      {showHistory && (
        <div className="flex flex-col gap-3">
          {Object.keys(groupedRecords).length === 0 ? (
            <div className="p-16 text-center border border-white/5 border-dashed rounded-3xl bg-white/[0.02] flex flex-col items-center gap-6">
              <div className="w-16 h-16 bg-purple-600/10 rounded-full flex items-center justify-center border border-purple-500/20">
                <Save className="w-8 h-8 text-purple-500/40" />
              </div>
              <div className="max-w-xs">
                <h3 className="font-display font-bold text-lg text-white mb-2">Fresh Start</h3>
                <p className="text-[11px] font-display font-medium text-white/40 leading-relaxed uppercase tracking-widest">
                  {isProcessing ? "Processing your uploads..." : "Your maintenance database is empty. Upload pictures of your logs to get started."}
                </p>
              </div>
              {!isProcessing && user && (
                <label className="flex items-center gap-2 px-8 py-4 bg-purple-600 text-white cursor-pointer hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/20 font-display font-bold uppercase tracking-[0.2em] text-xs">
                  <Upload className="w-4 h-4" />
                  Upload First Log
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*"
                    className="hidden" 
                    onChange={handleFileUpload}
                    disabled={isProcessing}
                  />
                </label>
              )}
            </div>
          ) : (
            Object.entries(groupedRecords).map(([plate, plateRecords]) => (
              <div key={plate} className="bg-white/[0.03] border border-white/5 rounded-3xl overflow-hidden transition-all hover:bg-white/[0.05]">
                {/* Plate Header */}
                <button 
                  onClick={() => togglePlate(plate)}
                  className="w-full flex items-center justify-between p-3.5 px-5 text-white transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center bg-white/5 border border-white/10 transition-transform",
                      expandedPlates[plate] && "rotate-180"
                    )}>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="font-display text-lg font-bold tracking-tight">{plate}</span>
                      <span className="text-[8px] opacity-40 font-mono uppercase tracking-widest">
                        {plateRecords.length} {plateRecords.length === 1 ? 'Entry' : 'Entries'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[8px] font-display font-bold opacity-30 uppercase tracking-[0.2em] mb-0.5">Last Service</div>
                    <div className="text-[10px] font-mono font-bold text-purple-400/80">{plateRecords[0].date}</div>
                  </div>
                </button>

                {/* Records List */}
                {expandedPlates[plate] && (
                  <div className="px-3 pb-3">
                    <div className="bg-black/20 rounded-2xl border border-white/5 divide-y divide-white/5">
                      {plateRecords.map((record, index) => (
                        <div key={record.id} className="p-3 px-4 flex items-center justify-between gap-4 group hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-4 overflow-hidden">
                            <div className="text-[9px] font-mono opacity-20 w-4">
                              {(index + 1).toString().padStart(2, '0')}
                            </div>
                            <div className="overflow-hidden">
                              <div className="text-[8px] font-display font-bold opacity-30 uppercase tracking-[0.2em] mb-0.5">
                                {record.date}
                              </div>
                              <div className="text-xs font-medium text-white/90 truncate">{record.service}</div>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleViewImage(record)}
                            className="flex-shrink-0 px-3 py-1.5 bg-purple-600/10 border border-purple-500/20 text-purple-400 text-[9px] font-display font-bold uppercase tracking-widest hover:bg-purple-600/20 transition-all rounded-full"
                          >
                            View
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Image Modal */}
      {viewingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl bg-[#0a0a0a] border border-white/10 shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] opacity-60">Record Image</span>
              <button 
                onClick={() => setViewingImage(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/20">
              {viewingImage.loading ? (
                <div className="flex flex-col items-center gap-4 py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  <span className="text-[10px] font-display font-bold uppercase tracking-widest opacity-40">Loading Image...</span>
                </div>
              ) : viewingImage.image ? (
                <img 
                  src={viewingImage.image} 
                  alt="Maintenance Record" 
                  className="max-w-full h-auto object-contain shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="py-20 text-center">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-4 opacity-40" />
                  <p className="text-[10px] font-display font-bold uppercase tracking-widest opacity-40">Image not found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <footer className="mt-8 flex flex-col gap-8 font-display font-bold text-[10px] uppercase tracking-[0.2em] opacity-40">
        <div className="flex justify-between items-center">
          <div className="flex gap-4 font-display font-bold">
            <span>Total Records: {records.length}</span>
            <span>Filtered: {filteredRecords.length}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isCloudConnected === true ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : 
                isCloudConnected === false ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : 
                "bg-white/20"
              )} />
              <span className="font-display font-bold">
                {isCloudConnected === true ? "Cloud Connected" : 
                 isCloudConnected === false ? "Cloud Offline" : 
                 "Connecting..."}
              </span>
            </div>
            {isCloudConnected === false && (
              <button 
                onClick={() => window.location.reload()}
                className="text-purple-400 hover:text-purple-300 transition-colors"
              >
                Retry
              </button>
            )}
            <div className="flex items-center gap-2">
              <RefreshCw className={cn("w-3 h-3", isProcessing && "animate-spin")} />
              <span className="font-display font-bold">Firebase Sync</span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        {!isProcessing && records.length > 0 && (
          <div className="mt-12 pt-8 border-t border-white/10 border-dashed opacity-100">
            <div className="flex flex-col items-center gap-4">
              <p className="font-display font-bold uppercase tracking-[0.2em] text-[11px] text-red-500">Danger Zone</p>
              
              {!showPasswordPrompt ? (
                <div className="flex flex-wrap justify-center gap-4">
                  <button 
                    onClick={() => {
                      setShowPasswordPrompt(true);
                      setDangerAction('clearDuplicates');
                    }}
                    className="flex items-center gap-2 px-6 py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <ListFilter className="w-4 h-4" />
                    <span className="text-xs font-display font-bold uppercase tracking-[0.2em]">Clear Duplicates</span>
                  </button>

                  <button 
                    onClick={() => {
                      setShowPasswordPrompt(true);
                      setDangerAction('clearAll');
                    }}
                    className="flex items-center gap-2 px-6 py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-xs font-display font-bold uppercase tracking-[0.2em]">Clear All History</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 w-full max-w-xs relative">
                  <button 
                    onClick={() => {
                      setShowPasswordPrompt(false);
                      setPasswordInput('');
                      setPasswordError(false);
                      setDangerAction(null);
                    }}
                    className="absolute -top-8 right-0 p-1 hover:bg-white/10 rounded-full transition-colors"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <input 
                    type="password"
                    placeholder={`ENTER PASSWORD TO ${dangerAction === 'clearAll' ? 'CLEAR ALL' : 'CLEAR DUPLICATES'}...`}
                    className={cn(
                      "w-full bg-white/5 border p-3 font-display font-medium text-xs focus:outline-none text-white",
                      passwordError ? "border-red-500" : "border-white/10"
                    )}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (dangerAction === 'clearAll' ? handleClearAll() : handleClearDuplicates())}
                    autoFocus
                  />
                  {passwordError && <p className="text-[9px] text-red-400 font-display font-bold">INCORRECT PASSWORD</p>}
                  <div className="flex gap-2 w-full">
                    <button 
                      onClick={dangerAction === 'clearAll' ? handleClearAll : handleClearDuplicates}
                      className="flex-1 bg-red-500/20 border border-red-500/50 text-red-100 py-2 text-[10px] font-display font-bold uppercase tracking-[0.2em] hover:bg-red-500/40 transition-all"
                    >
                      CONFIRM
                    </button>
                    <button 
                      onClick={() => {
                        setShowPasswordPrompt(false);
                        setPasswordInput('');
                        setPasswordError(false);
                        setDangerAction(null);
                      }}
                      className="flex-1 border border-white/10 py-2 text-[10px] font-display font-bold uppercase tracking-[0.2em] hover:bg-white/5 transition-all text-white"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
