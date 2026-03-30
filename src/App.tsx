import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Upload, Search, Filter, Trash2, Loader2, AlertCircle, Save, RefreshCw, X, ChevronDown, ChevronRight, ListFilter, Download, LogIn, LogOut, User as UserIcon, Clock } from 'lucide-react';
import { MaintenanceRecord } from './types';
import { extractMaintenanceData } from './services/aiService';
import { cn, resizeImage } from './lib/utils';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType, getFirestoreErrorMessage } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, writeBatch, serverTimestamp, Timestamp, getDocFromServer, getDocs } from 'firebase/firestore';

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
  const wakeLockRef = React.useRef<any>(null);

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
      } else {
        setError("Failed to login. Please try again.");
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
      let completedCount = 0;
      let failedCount = 0;

      // Process in batches (concurrency control)
      for (let i = 0; i < fileArray.length; i += CONCURRENCY_LIMIT) {
        if (shouldStopRef.current) break;

        const batch = fileArray.slice(i, i + CONCURRENCY_LIMIT);
        
        await Promise.all(batch.map(async (file) => {
          if (shouldStopRef.current) return;

          let objectUrl: string | null = null;
          try {
            console.log(`Processing file: ${file.name}`);
            // 1. Create Object URL (more memory efficient than FileReader)
            objectUrl = URL.createObjectURL(file);

            if (shouldStopRef.current) return;

            // 2. Resize image to speed up upload and AI processing
            console.log(`Resizing image: ${file.name}`);
            const resizedBase64 = await resizeImage(objectUrl, 1200);
            console.log(`Resized image size: ${Math.round(resizedBase64.length / 1024)} KB`);

            if (shouldStopRef.current) return;

            // 3. Extract data using AI
            console.log(`Extracting data from: ${file.name}`);
            if (!process.env.GEMINI_API_KEY) {
              throw new Error("Gemini API key is missing. Please check your environment variables.");
            }
            await new Promise(r => setTimeout(r, 200)); 
            if (shouldStopRef.current) return;
            
            const result = await extractMaintenanceData(resizedBase64, 'image/jpeg');
            console.log(`Extraction result for ${file.name}:`, result);
            
            if (shouldStopRef.current) return;

            if (!result || !result.records || result.records.length === 0) {
              console.log(`No records found in ${file.name}`);
              failedCount++;
              if (!shouldStopRef.current) {
                setFailedFiles(prev => [...prev, file.name]);
              }
            } else {
              // Save to Firestore
              console.log(`Saving ${result.records.length} records for ${file.name}`);
              for (const record of result.records) {
                if (shouldStopRef.current) break;
                try {
                  await addDoc(collection(db, 'maintenance_records'), {
                    ...record,
                    userId: user.uid,
                    fileName: file.name,
                    originalImage: resizedBase64,
                    createdAt: serverTimestamp()
                  });
                } catch (err) {
                  if (!shouldStopRef.current) {
                    console.error("Firestore save error:", err);
                    try {
                      handleFirestoreError(err, OperationType.CREATE, 'maintenance_records');
                    } catch (e: any) {
                      setError(getFirestoreErrorMessage(e));
                    }
                  }
                }
              }
              console.log(`Successfully saved records for ${file.name}`);
            }
          } catch (err) {
            if (!shouldStopRef.current) {
              console.error(`Error processing file ${file.name}:`, err);
              failedCount++;
              setFailedFiles(prev => [...prev, file.name]);
            }
          } finally {
            // Clean up Object URL to free memory
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            
            if (!shouldStopRef.current) {
              completedCount++;
              console.log(`Completed ${completedCount}/${fileArray.length} files`);
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

    if (showLatestOnly && filtered.length > 0) {
      return [filtered[0]]; // records are already sorted by date desc in listener
    }

    return filtered;
  }, [records, searchQuery, serviceFilter, showLatestOnly]);

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
    <div className="min-h-screen p-4 md:p-12 max-w-7xl mx-auto flex flex-col">
      {/* Header */}
      <header className="mb-8 md:mb-12 border-b border-[var(--color-line)] pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tighter mb-2">DT.Base</h1>
            <p className="text-[10px] md:text-sm opacity-60 uppercase tracking-[0.3em] font-display font-medium">Mechanical Issue Extraction & History Log</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[10px] opacity-50 block mb-2">Filter by Plate</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
            <input 
              type="text"
              placeholder="SEARCH PLATE..."
              className="w-full bg-white/5 backdrop-blur-sm border border-white/10 p-4 pl-12 pr-12 font-display font-medium text-base md:text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Clear Search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[10px] opacity-50 block mb-2">Filter by Service</label>
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
            <input 
              type="text"
              placeholder="SEARCH SERVICE..."
              className="w-full bg-white/5 backdrop-blur-sm border border-white/10 p-4 pl-12 pr-12 font-display font-medium text-base md:text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            />
            {serviceFilter && (
              <button 
                onClick={() => setServiceFilter('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Clear Filter"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[10px] opacity-50 block mb-2">Quick Filter</label>
          <button 
            onClick={() => setShowLatestOnly(!showLatestOnly)}
            className={cn(
              "w-full flex items-center justify-center gap-3 p-4 border transition-all font-display font-bold text-xs uppercase tracking-[0.2em]",
              showLatestOnly 
                ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20" 
                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
            )}
          >
            <Clock className={cn("w-4 h-4", showLatestOnly ? "animate-pulse" : "")} />
            {showLatestOnly ? "Showing Latest" : "Show Latest Only"}
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
            {filteredRecords[0].originalImage && (
              <div className="w-full max-w-md overflow-hidden rounded-lg border border-white/10">
                <img 
                  src={filteredRecords[0].originalImage} 
                  alt="Original Record" 
                  className="w-full h-auto object-contain"
                  referrerPolicy="no-referrer"
                />
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
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="font-display font-bold uppercase tracking-[0.2em] text-sm text-white">Maintenance History</h2>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="text-[10px] font-display font-bold uppercase tracking-[0.2em] px-3 py-1.5 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 transition-all"
          >
            {showHistory ? 'Hide All' : 'Show All'}
          </button>
        </div>
        {showHistory && (
          <div className="flex gap-4">
            <button 
              onClick={() => toggleAll(true)}
              className="text-[10px] font-display font-bold uppercase tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-purple-400 transition-all"
            >
              Expand All
            </button>
            <button 
              onClick={() => toggleAll(false)}
              className="text-[10px] font-display font-bold uppercase tracking-[0.2em] opacity-40 hover:opacity-100 hover:text-purple-400 transition-all"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {showHistory && (
        <div className="flex flex-col gap-4">
          {Object.keys(groupedRecords).length === 0 ? (
            <div className="p-12 text-center border border-white/10 border-dashed rounded-xl">
              <p className="font-display font-bold text-[11px] opacity-40 uppercase tracking-[0.2em]">
                {isProcessing ? "Processing batch..." : "No records found. Add pictures to begin."}
              </p>
            </div>
          ) : (
            Object.entries(groupedRecords).map(([plate, plateRecords]) => (
              <div key={plate} className="glass-panel overflow-hidden">
                {/* Plate Header */}
                <button 
                  onClick={() => togglePlate(plate)}
                  className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 text-white transition-all"
                >
                  <div className="flex items-center gap-4">
                    {expandedPlates[plate] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-display text-2xl font-bold tracking-tighter">{plate}</span>
                    <span className="text-[10px] opacity-50 font-mono uppercase tracking-widest">
                      {plateRecords.length} {plateRecords.length === 1 ? 'Record' : 'Records'}
                    </span>
                  </div>
                  <div className="text-[10px] font-display font-bold opacity-50 uppercase tracking-[0.2em]">
                    Last Service: {plateRecords[0].date}
                  </div>
                </button>

                {/* Records List */}
                {expandedPlates[plate] && (
                  <div className="divide-y divide-[var(--color-line)]/10">
                    {plateRecords.map((record, index) => (
                      <div key={record.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:bg-white/5 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="text-[10px] font-mono opacity-30 mt-1">
                            {(index + 1).toString().padStart(2, '0')}
                          </div>
                          <div>
                            <div className="text-[10px] font-display font-bold opacity-50 uppercase tracking-[0.2em] mb-1">
                              {record.date}
                            </div>
                            <div className="text-sm font-medium text-white">{record.service}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
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
