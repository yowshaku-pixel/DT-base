import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Upload, Search, Filter, Trash2, Loader2, AlertCircle, Save, RefreshCw, X, ChevronDown, ChevronRight, ListFilter, Download, LogIn, LogOut, User as UserIcon, Clock, Truck, Plus, Database, Zap } from 'lucide-react';
import { MaintenanceRecord } from './types';
import { extractMaintenanceData } from './services/aiService';
import { cn, resizeImage } from './lib/utils';
import { supabase, getSupabaseErrorMessage } from './supabase';
import { User } from '@supabase/supabase-js';

interface UploadLogEntry {
  fileName: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  error?: string;
  timestamp: number;
}

const CONCURRENCY_LIMIT = 1; // Reduced for mobile stability
// No limit - fetch all records for the user

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const shouldStopRef = React.useRef(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, failed: 0 });
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [debouncedService, setDebouncedService] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [dangerAction, setDangerAction] = useState<'clearAll' | 'clearDuplicates' | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [showLatestOnly, setShowLatestOnly] = useState(false);
  const [uploadLog, setUploadLog] = useState<UploadLogEntry[]>([]);
  const [latestImage, setLatestImage] = useState<string | null>(null);
  const [isLoadingLatestImage, setIsLoadingLatestImage] = useState(false);
  const lastFetchedRecordIdRef = React.useRef<string | null>(null);
  const [viewingImage, setViewingImage] = useState<{ id: string, image: string | null, loading: boolean } | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [pwaStatus, setPwaStatus] = useState<string>('Checking...');
  const [sessionStats, setSessionStats] = useState({ reads: 0, writes: 0, deletes: 0 });
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [manualEntryData, setManualEntryData] = useState<{
    fileName: string;
    plateNumber: string;
    date: string;
    service: string;
  } | null>(null);
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

  // Debounce search and filter to prevent excessive re-renders and Firestore reads
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedService(serviceFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [serviceFilter]);

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
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  // Auth Listener
  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      setError("Supabase configuration is missing. Please check your Secrets in AI Studio.");
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setRecords([]);
    localStorage.removeItem(`records_${user?.id}`);
  };

  const fetchRecords = useCallback(async () => {
    if (!user || !supabase) return;
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('maintenance_records')
        .select('*')
        .eq('user_id', user.id)
        .order('service_date', { ascending: false });

      if (error) throw error;

      setRecords(data as MaintenanceRecord[]);
      setIsCloudConnected(true);
      setError(null);
      setIsQuotaExceeded(false);
      
      // Cache in localStorage for offline access
      localStorage.setItem(`records_${user.id}`, JSON.stringify(data));
    } catch (err: any) {
      console.warn("Fetch failed:", err);
      setIsCloudConnected(false);
      
      // Check for quota/rate limit (Supabase uses standard HTTP codes)
      if (err.status === 429) {
        setIsQuotaExceeded(true);
      }

      // Fallback to localStorage
      const cached = localStorage.getItem(`records_${user.id}`);
      if (cached) {
        setRecords(JSON.parse(cached));
        setError(null);
      } else {
        setError(getSupabaseErrorMessage(err));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [user]);

  // Initial fetch
  useEffect(() => {
    if (user && isAuthReady) {
      fetchRecords();
    }
  }, [user, isAuthReady, fetchRecords]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase configuration is missing. Please check your Secrets in AI Studio.");
      return;
    }
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    
    setIsLoggingIn(true);
    setError(null);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setError("Account created! You can now log in.");
        setAuthMode('login');
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) {
      setError("Supabase configuration is missing. Please check your Secrets in AI Studio.");
      return;
    }
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
              // Save to Supabase
              for (const record of result.records) {
                if (shouldStopRef.current) break;
                
                // 1. Save metadata to main table
                setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));
                const { data: recordData, error: recordError } = await supabase
                  .from('maintenance_records')
                  .insert({
                    plate_number: record.plate_number,
                    service_date: record.service_date,
                    service_description: record.service_description,
                    confidence: record.confidence,
                    user_id: user.id,
                    file_name: file.name,
                    created_at: new Date().toISOString()
                  })
                  .select()
                  .single();

                if (recordError) throw recordError;

                // 2. Save image to separate table to save memory in list views
                if (recordData) {
                  setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));
                  const { error: imageError } = await supabase
                    .from('maintenance_record_images')
                    .insert({
                      record_id: recordData.id,
                      image_data: resizedBase64,
                      user_id: user.id,
                      created_at: new Date().toISOString()
                    });
                  
                  if (imageError) throw imageError;
                }
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

  const handleManualAdd = async () => {
    if (!user || !manualEntryData || !supabase) return;
    if (!manualEntryData.plateNumber || !manualEntryData.date || !manualEntryData.service) {
      setError("Please fill in all fields for manual entry.");
      return;
    }
    
    try {
      setIsProcessing(true);
      setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));
      
      const { error } = await supabase
        .from('maintenance_records')
        .insert({
          plate_number: manualEntryData.plateNumber.toUpperCase().trim(),
          service_date: manualEntryData.date,
          service_description: manualEntryData.service.trim(),
          confidence: 1.0,
          user_id: user.id,
          file_name: manualEntryData.fileName,
          created_at: new Date().toISOString()
        });
      
      if (error) throw error;
      
      // Update log to success
      setUploadLog(prev => prev.map(entry => 
        entry.fileName === manualEntryData.fileName && entry.status === 'failed' 
          ? { ...entry, status: 'success', error: undefined } 
          : entry
      ));
      
      setManualEntryData(null);
      setError(null);
      fetchRecords(); // Refresh list
    } catch (err: any) {
      setError(getSupabaseErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const filtered = records.filter(record => {
      const matchesSearch = record.plate_number.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesService = record.service_description.toLowerCase().includes(debouncedService.toLowerCase());
      return matchesSearch && matchesService;
    });

    return filtered;
  }, [records, debouncedSearch, debouncedService]);

  // Fetch image for the latest record when it changes
  useEffect(() => {
    const fetchLatestImage = async () => {
      if (!showLatestOnly || filteredRecords.length === 0 || !user || !supabase) {
        if (latestImage) setLatestImage(null);
        lastFetchedRecordIdRef.current = null;
        return;
      }

      const latestRecord = filteredRecords[0];
      
      // Avoid redundant fetches if the record hasn't changed
      if (latestRecord.id === lastFetchedRecordIdRef.current) return;

      // If the record already has an image (legacy), use it
      if (latestRecord.originalImage) {
        setLatestImage(latestRecord.originalImage);
        lastFetchedRecordIdRef.current = latestRecord.id;
        return;
      }

      // Otherwise fetch from separate table
      setIsLoadingLatestImage(true);
      try {
        const { data, error } = await supabase
          .from('maintenance_record_images')
          .select('image_data')
          .eq('record_id', latestRecord.id)
          .eq('user_id', user.id)
          .limit(1)
          .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        
        setSessionStats(prev => ({ ...prev, reads: prev.reads + 1 }));
        
        if (data) {
          setLatestImage(data.image_data);
        } else {
          setLatestImage(null);
        }
        lastFetchedRecordIdRef.current = latestRecord.id;
      } catch (err) {
        console.error("Failed to fetch latest image", err);
        setLatestImage(null);
      } finally {
        setIsLoadingLatestImage(false);
      }
    };

    fetchLatestImage();
  }, [filteredRecords, user, showLatestOnly]);

  const groupedRecords = useMemo(() => {
    const groups: Record<string, MaintenanceRecord[]> = {};
    // Sort records by date descending within groups
    const sorted = [...filteredRecords].sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime());
    
    sorted.forEach(record => {
      const plate = record.plate_number || 'UNKNOWN';
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
    if (!supabase) return;
    if (record.originalImage) {
      setViewingImage({ id: record.id, image: record.originalImage, loading: false });
      return;
    }

    setViewingImage({ id: record.id, image: null, loading: true });
    try {
      const { data, error } = await supabase
        .from('maintenance_record_images')
        .select('image_data')
        .eq('record_id', record.id)
        .eq('user_id', user?.id)
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      setSessionStats(prev => ({ ...prev, reads: prev.reads + 1 }));
      if (data) {
        setViewingImage({ id: record.id, image: data.image_data, loading: false });
      } else {
        setViewingImage({ id: record.id, image: null, loading: false });
      }
    } catch (err) {
      console.error("Failed to fetch image", err);
      setViewingImage(null);
    }
  };

  const handleClearAll = async () => {
    if (!user || records.length === 0 || !supabase) return;
    if (passwordInput === MASTER_PASSWORD) {
      try {
        const { error } = await supabase
          .from('maintenance_records')
          .delete()
          .eq('user_id', user.id);

        if (error) throw error;

        setSessionStats(prev => ({ ...prev, deletes: prev.deletes + records.length }));
        setRecords([]);
        
        setShowPasswordPrompt(false);
        setPasswordInput('');
        setPasswordError(false);
        setDangerAction(null);
      } catch (err: any) {
        setError(getSupabaseErrorMessage(err));
      }
    } else {
      setPasswordError(true);
    }
  };

  const handleClearDuplicates = async () => {
    if (!user || records.length === 0 || !supabase) return;
    if (passwordInput === MASTER_PASSWORD) {
      try {
        const seen = new Set<string>();
        const duplicates: string[] = [];
        
        // Sort by createdAt descending to keep the most recent one
        const sortedRecords = [...records].sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return timeB - timeA;
        });

        sortedRecords.forEach(record => {
          const key = `${record.plate_number}-${record.service_date}-${record.service_description}`.toLowerCase().trim();
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

        const { error } = await supabase
          .from('maintenance_records')
          .delete()
          .in('id', duplicates);

        if (error) throw error;

        setSessionStats(prev => ({ ...prev, deletes: prev.deletes + duplicates.length }));
        fetchRecords(); // Refresh list
        
        setShowPasswordPrompt(false);
        setPasswordInput('');
        setPasswordError(false);
        setDangerAction(null);
      } catch (err: any) {
        setError(getSupabaseErrorMessage(err));
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
        const plate = `"${r.plate_number.replace(/"/g, '""')}"`;
        const date = `"${r.service_date.replace(/"/g, '""')}"`;
        const service = `"${r.service_description.replace(/"/g, '""')}"`;
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
      {/* Quota Warning Banner */}
      {isQuotaExceeded && (
        <div className="mb-8 p-4 bg-blue-600/20 border border-blue-500/40 rounded-xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-display font-bold uppercase tracking-widest text-blue-200 mb-1">Daily Read Limit Reached</h3>
            <p className="text-[10px] text-blue-200/60 leading-relaxed uppercase tracking-wider">
              The app is currently in <span className="text-white font-bold">Offline Cache Mode</span>. You can still view and search your existing records, but new data might not sync until the quota resets at midnight.
            </p>
          </div>
          <button 
            onClick={() => setIsQuotaExceeded(false)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-blue-400" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="mb-8 md:mb-12 border-b border-[var(--color-line)] pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-600/20 border border-purple-500/30 rounded-xl">
              <Truck className="w-8 h-8 text-purple-400" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tighter mb-2">DT.Base</h1>
              <p className="text-[10px] md:text-sm opacity-60 uppercase tracking-[0.3em] font-display font-medium">Mechanical Issue Extraction & History Log</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <button 
              onClick={() => setShowUsageModal(true)}
              className="px-3 py-1 bg-white/5 border border-white/10 rounded text-[8px] text-white/60 font-mono hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              USAGE STATS
            </button>
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
                  <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-purple-400">Active</span>
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
            ) : null}

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
              onClick={() => fetchRecords()}
              disabled={isRefreshing || !user}
              className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-95 disabled:opacity-50"
              title="Sync with Supabase"
            >
              <Zap className={cn("w-4 h-4 text-emerald-400", isRefreshing && "animate-pulse")} />
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

      {/* Auth Section */}
      {!user && isAuthReady && (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-full max-w-md p-8 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl">
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-display font-bold tracking-tight mb-2">
                {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-sm text-white/40 uppercase tracking-widest">
                {authMode === 'login' ? 'Sign in to access your records' : 'Join DT.Base to start tracking'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-[10px] font-display font-bold uppercase tracking-widest text-white/40 mb-2">Email Address</label>
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors text-white"
                  placeholder="name@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-display font-bold uppercase tracking-widest text-white/40 mb-2">Password</label>
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors text-white"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-4 bg-white text-black font-display font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-gray-200 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {authMode === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-[10px] font-display font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 transition-colors"
              >
                {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content (Only if logged in) */}
      {user && (
        <>
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
                  {entry.status === 'failed' && (
                    <button 
                      onClick={() => setManualEntryData({ 
                        fileName: entry.fileName, 
                        plateNumber: '', 
                        date: new Date().toISOString().split('T')[0], 
                        service: '' 
                      })}
                      className="text-[9px] font-display font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 underline flex items-center gap-1"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      Add Manually
                    </button>
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
                      const d = new Date(filteredRecords[0].service_date);
                      if (isNaN(d.getTime())) return filteredRecords[0].service_date;
                      const day = d.getDate().toString().padStart(2, '0');
                      const month = (d.getMonth() + 1).toString().padStart(2, '0');
                      const year = d.getFullYear().toString().slice(-2);
                      return `${day}/${month}/${year}`;
                    } catch {
                      return filteredRecords[0].service_date;
                    }
                  })()}
                </span>
              </p>
              <p className="font-display text-4xl md:text-6xl font-bold tracking-tighter text-white">Truck {filteredRecords[0].plate_number}</p>
              <p className="font-display text-xl md:text-2xl font-medium text-purple-200">Work has been done with : {filteredRecords[0].service_description}</p>
            </div>

            <div className="pt-4 border-t border-white/5">
              <p className="font-display font-bold text-3xl text-white/80">
                {(() => {
                  const recordDate = new Date(filteredRecords[0].service_date);
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
              {filteredRecords[0].file_name && (
                <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">
                  File name : {filteredRecords[0].file_name}
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
                    <div className="text-[10px] font-mono font-bold text-purple-400/80">{plateRecords[0].service_date}</div>
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
                                {record.service_date}
                              </div>
                              <div className="text-xs font-medium text-white/90 truncate">{record.service_description}</div>
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
            <button 
              onClick={() => fetchRecords()}
              disabled={isRefreshing}
              className="ml-4 text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1.5 active:scale-95 disabled:opacity-30"
              title="Bypass cache and fetch directly from server"
            >
              <RefreshCw className={cn("w-2.5 h-2.5", isRefreshing && "animate-spin")} />
              <span>Force Sync</span>
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Database className={cn(
                "w-3.5 h-3.5",
                isCloudConnected === true ? "text-green-500" : 
                isCloudConnected === false ? "text-red-500" : 
                "text-white/20"
              )} />
              <span className="font-display font-bold">
                {isQuotaExceeded ? "Quota Exceeded" :
                 isCloudConnected === true ? "Supabase Connected" : 
                 isCloudConnected === false ? "Supabase Offline" : 
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
              <Zap className={cn("w-3 h-3 text-emerald-400", isProcessing && "animate-pulse")} />
              <span className="font-display font-bold">Supabase Sync</span>
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

      {/* Usage Stats Modal */}
      {showUsageModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0a0a0c] border border-white/10 p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />
            
            <button 
              onClick={() => setShowUsageModal(false)}
              className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-8">
              <h2 className="text-2xl font-display font-black tracking-tighter italic mb-2">USAGE DASHBOARD</h2>
              <p className="text-[10px] text-white/40 font-mono uppercase tracking-[0.2em]">Session Monitoring & Quota Estimates</p>
            </div>

            <div className="space-y-6">
              {/* Reads */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60">Reads (Session)</span>
                  <span className="text-xl font-mono font-bold text-white">{sessionStats.reads.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500" 
                    style={{ width: `${Math.min((sessionStats.reads / 50000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: 50,000</p>
              </div>

              {/* Writes */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60">Writes (Session)</span>
                  <span className="text-xl font-mono font-bold text-white">{sessionStats.writes.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 transition-all duration-500" 
                    style={{ width: `${Math.min((sessionStats.writes / 20000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: 20,000</p>
              </div>

              {/* Deletes */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60">Deletes (Session)</span>
                  <span className="text-xl font-mono font-bold text-white">{sessionStats.deletes.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-red-500 transition-all duration-500" 
                    style={{ width: `${Math.min((sessionStats.deletes / 20000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: 20,000</p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded">
                <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[9px] text-blue-200/70 leading-relaxed uppercase tracking-wider">
                  These stats track your current session. Supabase counts total usage across all devices. 
                  Check the Supabase Dashboard for official monthly billing totals.
                </p>
              </div>
              <button 
                onClick={() => setSessionStats({ reads: 0, writes: 0, deletes: 0 })}
                className="w-full mt-4 py-3 border border-white/10 text-[10px] font-display font-bold uppercase tracking-[0.2em] hover:bg-white/5 transition-all"
              >
                Reset Session Stats
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {manualEntryData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md glass-panel p-8 relative animate-in fade-in zoom-in duration-300">
            <button 
              onClick={() => setManualEntryData(null)}
              className="absolute right-6 top-6 p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <Plus className="w-5 h-5 text-purple-400" />
                <h2 className="text-2xl font-display font-black tracking-tighter italic uppercase">Manual Entry</h2>
              </div>
              <p className="text-[10px] text-white/40 font-mono uppercase tracking-[0.2em] truncate">
                File: {manualEntryData.fileName}
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Plate Number</label>
                <input 
                  type="text"
                  value={manualEntryData.plateNumber}
                  onChange={(e) => setManualEntryData({ ...manualEntryData, plateNumber: e.target.value.toUpperCase() })}
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-xl font-display font-bold text-lg focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
                  placeholder="E.G. ABC-1234"
                />
              </div>

              <div>
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Service Date</label>
                <input 
                  type="date"
                  value={manualEntryData.date}
                  onChange={(e) => setManualEntryData({ ...manualEntryData, date: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-xl font-display font-bold text-lg focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Service Description</label>
                <textarea 
                  value={manualEntryData.service}
                  onChange={(e) => setManualEntryData({ ...manualEntryData, service: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 p-4 rounded-xl font-display font-bold text-base focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all min-h-[100px]"
                  placeholder="E.G. Oil Change, Tire Rotation..."
                />
              </div>

              <button 
                onClick={handleManualAdd}
                disabled={isProcessing}
                className="w-full py-5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-display font-black uppercase tracking-[0.3em] rounded-2xl transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-3"
              >
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save Record
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
