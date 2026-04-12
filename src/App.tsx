import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Upload, Search, Filter, Trash2, Loader2, AlertCircle, Save, RefreshCw, X, ChevronDown, ChevronRight, ListFilter, Download, LogIn, LogOut, User as UserIcon, Clock, Truck, Plus, Database, Zap, Eye, Key, Tag, Coins, Settings, Smartphone, Cloud, AlertTriangle } from 'lucide-react';
import { MaintenanceRecord, MarketPrice } from './types';
import { extractMaintenanceData, analyzeMaintenanceData, isApiKeyAvailable } from './services/aiService';
import { cn, resizeImage, arePlatesSimilar } from './lib/utils';
import { supabase, getSupabaseErrorMessage } from './supabase';
import { User } from '@supabase/supabase-js';
import AIChatAssistant from './components/AIChatAssistant';
import { motion, AnimatePresence } from 'motion/react';

interface UploadLogEntry {
  fileName: string;
  status: 'queued' | 'processing' | 'success' | 'failed' | 'pending';
  error?: string;
  timestamp: number;
  imageData?: string; // Base64 image data for viewing
}

const CONCURRENCY_LIMIT = 1; // Reduced for mobile stability
// No limit - fetch all records for the user

export default function App() {
  const MASTER_PASSWORD = import.meta.env.VITE_SERVICE_PASSWORD || 'adminjo';
  const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || 'dtbase_access';

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
  const [secondaryServiceFilter, setSecondaryServiceFilter] = useState('');
  const [debouncedSecondaryService, setDebouncedSecondaryService] = useState('');
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  
  // Usage Tracking & Password Protection
  const [usageStats, setUsageStats] = useState(() => {
    try {
      const saved = localStorage.getItem('dtbase_usage_stats');
      return saved ? JSON.parse(saved) : { extractions: 0, searches: 0 };
    } catch (e) {
      console.error("Error parsing usage stats", e);
      return { extractions: 0, searches: 0 };
    }
  });
  const [isServiceUnlocked, setIsServiceUnlocked] = useState(false);
  const [showServicePasswordPrompt, setShowServicePasswordPrompt] = useState(false);
  const [servicePasswordInput, setServicePasswordInput] = useState('');
  const [servicePasswordError, setServicePasswordError] = useState(false);

  useEffect(() => {
    localStorage.setItem('dtbase_usage_stats', JSON.stringify(usageStats));
  }, [usageStats]);

  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  const [appPasswordInput, setAppPasswordInput] = useState('');
  const [appPasswordError, setAppPasswordError] = useState(false);

  const handleAppUnlock = () => {
    if (appPasswordInput === APP_PASSWORD) {
      setIsAppUnlocked(true);
      setAppPasswordError(false);
      setAppPasswordInput('');
    } else {
      setAppPasswordError(true);
    }
  };

  const handleUnlockService = () => {
    if (servicePasswordInput === MASTER_PASSWORD) {
      setIsServiceUnlocked(true);
      setShowServicePasswordPrompt(false);
      setServicePasswordInput('');
      setServicePasswordError(false);
    } else {
      setServicePasswordError(true);
    }
  };

  const handleExportData = () => {
    if (records.length === 0) return;
    
    // Create CSV content
    const headers = ['Plate Number', 'Date', 'Service Type', 'File Name'];
    const csvRows = [
      headers.join(','),
      ...records.map(r => [
        `"${r.plate_number}"`,
        `"${new Date(r.service_date).toLocaleString()}"`,
        `"${r.service_description}"`,
        `"${r.file_name || ''}"`
      ].join(','))
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `fleet_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [isFabOpen, setIsFabOpen] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [dangerAction, setDangerAction] = useState<'clearAll' | 'clearDuplicates' | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [showDateRangeReport, setShowDateRangeReport] = useState(false);
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
  const [showMarketPricesModal, setShowMarketPricesModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [manualEntryData, setManualEntryData] = useState<{
    fileName: string;
    plateNumber: string;
    date: string;
    service: string;
  } | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentServiceFilters, setRecentServiceFilters] = useState<string[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const wakeLockRef = React.useRef<any>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [troubleFindingAnswer, setTroubleFindingAnswer] = useState<string | null>(null);
  const [isTroubleFindingLoading, setIsTroubleFindingLoading] = useState(false);
  const troubleStopRef = useRef(false);
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([]);

  // Prevent accidental refresh/close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasActiveWork = isProcessing || isTroubleFindingLoading || uploadLog.some(entry => entry.status === 'queued' || entry.status === 'processing');
      
      if (hasActiveWork) {
        e.preventDefault();
        // Modern browsers ignore the custom string but require it for the dialog to show
        e.returnValue = 'You have active processes running. Are you sure you want to leave?';
        return 'You have active processes running. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing, isTroubleFindingLoading, uploadLog]);

  // API Key Selection Check
  useEffect(() => {
    const checkApiKey = async () => {
      // Check if a key already exists in environment (free or paid)
      if (isApiKeyAvailable()) {
        setHasApiKey(true);
        return;
      }

      if ((window as any).aistudio?.hasSelectedApiKey) {
        try {
          const selected = await (window as any).aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        } catch (err) {
          console.error("Error checking API key:", err);
          setHasApiKey(true); // Fallback
        }
      } else {
        // If not in AI Studio or API not available, assume we have one from env
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      try {
        await (window as any).aistudio.openSelectKey();
        setHasApiKey(true); // Assume success per instructions
      } catch (err) {
        console.error("Error opening key selector:", err);
      }
    }
  };

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
      navigator.serviceWorker.ready.then((registration) => {
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

  // Save upload log to localStorage whenever it changes (strip image data to avoid 5MB limit)
  useEffect(() => {
    const logToSave = uploadLog.map(({ imageData, ...rest }) => rest);
    localStorage.setItem('dt_base_upload_log', JSON.stringify(logToSave));
  }, [uploadLog]);

  const clearUploadLog = () => {
    setUploadLog([]);
    localStorage.removeItem('dt_base_upload_log');
  };

  const removeLogEntry = (fileName: string, timestamp: number) => {
    setUploadLog(prev => prev.filter(entry => !(entry.fileName === fileName && entry.timestamp === timestamp)));
  };

  // Load recent searches from localStorage on mount
  useEffect(() => {
    const savedSearches = localStorage.getItem('dt_base_recent_searches');
    const savedServiceFilters = localStorage.getItem('dt_base_recent_service_filters');
    try {
      if (savedSearches) setRecentSearches(JSON.parse(savedSearches));
    } catch (e) {
      console.error("Failed to parse recent searches", e);
    }
    try {
      if (savedServiceFilters) setRecentServiceFilters(JSON.parse(savedServiceFilters));
    } catch (e) {
      console.error("Failed to parse recent service filters", e);
    }
  }, []);

  // Save recent searches to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('dt_base_recent_searches', JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    localStorage.setItem('dt_base_recent_service_filters', JSON.stringify(recentServiceFilters));
  }, [recentServiceFilters]);

  const addToRecentSearches = (query: string) => {
    if (!query || query.length < 2) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== query.toLowerCase());
      return [query, ...filtered].slice(0, 5); // Keep last 5
    });
  };

  const addToRecentServiceFilters = (query: string) => {
    if (!query || query.length < 2) return;
    setRecentServiceFilters(prev => {
      const filtered = prev.filter(s => s.toLowerCase() !== query.toLowerCase());
      return [query, ...filtered].slice(0, 5); // Keep last 5
    });
  };

  // Debounce search and filter to prevent excessive re-renders and Firestore reads
  useEffect(() => {
    if (searchQuery) setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setIsSearching(false);
      if (searchQuery.length >= 3) {
        addToRecentSearches(searchQuery);
        // Track search usage
        if (!isServiceUnlocked) {
          setUsageStats(prev => ({ ...prev, searches: prev.searches + 1 }));
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, isServiceUnlocked]);

  useEffect(() => {
    if (serviceFilter || secondaryServiceFilter) setIsFiltering(true);
    const timer = setTimeout(() => {
      setDebouncedService(serviceFilter);
      setDebouncedSecondaryService(secondaryServiceFilter);
      setIsFiltering(false);
      if (serviceFilter.length >= 3) addToRecentServiceFilters(serviceFilter);
    }, 500);
    return () => clearTimeout(timer);
  }, [serviceFilter, secondaryServiceFilter]);

  // Screen Wake Lock to prevent "crushing" when screen turns off during processing
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isProcessing) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err: any) {
          // Gracefully handle permission policy errors
          if (err.name === 'NotAllowedError' || err.message?.includes('permissions policy')) {
            console.warn("Wake Lock disallowed by policy, skipping.");
          } else {
            console.error("Wake Lock error:", err);
          }
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
    setTotalCount(0);
    localStorage.removeItem(`records_${user?.id}`);
  };

  const fetchRecords = useCallback(async () => {
    if (!user || !supabase) return;
    setIsRefreshing(true);
    try {
      let allData: MaintenanceRecord[] = [];
      let from = 0;
      let to = 999;
      
      // Fetch first page and total count
      const { data, count, error } = await supabase
        .from('maintenance_records')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('service_date', { ascending: false })
        .range(from, to);

      if (error) throw error;

      allData = data as MaintenanceRecord[];
      const total = count || 0;
      setTotalCount(total);

      // If there are more than 1000, fetch the rest in batches (up to 10k)
      while (allData.length < total && allData.length < 10000) {
        from += 1000;
        to += 1000;
        const { data: moreData, error: moreError } = await supabase
          .from('maintenance_records')
          .select('*')
          .eq('user_id', user.id)
          .order('service_date', { ascending: false })
          .range(from, to);
        
        if (moreError) {
          console.warn("Error fetching more records:", moreError);
          break;
        }
        if (!moreData || moreData.length === 0) break;
        allData = [...allData, ...(moreData as MaintenanceRecord[])];
      }

      setRecords(allData);
      setIsCloudConnected(true);
      setError(null);
      setIsQuotaExceeded(false);
      
      // Cache in localStorage for offline access
      localStorage.setItem(`records_${user.id}`, JSON.stringify(allData));
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
        try {
          setRecords(JSON.parse(cached));
          setError(null);
        } catch (e) {
          console.error("Failed to parse cached records", e);
          setError(getSupabaseErrorMessage(err));
        }
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
      setError(getSupabaseErrorMessage(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Helper for AI extraction with robust retry logic
  const performExtractionWithRetry = useCallback(async (
    base64: string, 
    fileName: string, 
    logId: string | number, // timestamp or fileName
    isBatch: boolean = true
  ): Promise<any> => {
    const retries = 7;
    let currentDelay = 5000;
    
    for (let i = 0; i < retries; i++) {
      try {
        const extractionPromise = extractMaintenanceData(base64, 'image/jpeg');
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("AI extraction timed out. The image might be too complex or the network is slow.")), 90000)
        );
        const result = await Promise.race([extractionPromise, timeoutPromise]);
        setUsageStats(prev => ({ ...prev, extractions: prev.extractions + 1 }));
        return result;
      } catch (err: any) {
        const errorMessage = err.message?.toLowerCase() || "";
        
        // Distinguish between transient rate limits (429) and hard quota limits
        const isRateLimit = (errorMessage.includes("429") || 
                           errorMessage.includes("resource_exhausted") ||
                           errorMessage.includes("rate limit") ||
                           errorMessage.includes("quota_exceeded") ||
                           errorMessage.includes("ai_rate_limit_exceeded")) &&
                           !errorMessage.includes("billing details") &&
                           !errorMessage.includes("plan");
        
        // Only treat as a hard daily quota if it explicitly says "daily limit reached",
        // or mentions billing/plan/quota exhaustion that isn't just a transient rate limit.
        const isDailyQuota = errorMessage.includes("ai_daily_quota_exceeded") || 
                            errorMessage.includes("billing details") || 
                            errorMessage.includes("current quota") ||
                            errorMessage.includes("plan") ||
                            errorMessage.includes("quota exceeded");
        
        const isServerError = errorMessage.includes("500") || 
                             errorMessage.includes("internal error") || 
                             errorMessage.includes("xhr error") ||
                             errorMessage.includes("rpc failed") ||
                             errorMessage.includes("failed to fetch") ||
                             errorMessage.includes("connection error") ||
                             errorMessage.includes("load failed");
 
        const isTimeout = errorMessage.includes("timed out");

        // If it's a hard daily quota error, don't retry
        if (isDailyQuota) {
          throw new Error("DAILY_QUOTA_EXCEEDED");
        }

        // Retry on rate limit, server error, or timeout
        // Increased retries to 10 for rate limits to be more resilient
        const maxRetries = isRateLimit ? 10 : retries;
        if ((isRateLimit || isServerError || isTimeout) && i < maxRetries - 1) {
          const reason = isRateLimit ? "Rate limit" : isServerError ? "Network/Server error" : "Timeout";
          
          // For rate limits, use a longer initial delay and more aggressive backoff
          const retryDelay = isRateLimit ? currentDelay * 2.5 : currentDelay;
          
          console.warn(`[AI] ${reason} hit for ${fileName}, retrying in ${retryDelay}ms... (Attempt ${i + 1}/${maxRetries})`);
          
          // Update log to show retry status
          setUploadLog(prev => prev.map(entry => {
            const match = isBatch ? entry.fileName === fileName : entry.timestamp === logId;
            return match && entry.status === 'processing' 
              ? { ...entry, error: `${reason} hit, retrying in ${Math.round(retryDelay/1000)}s... (Attempt ${i + 1}/${maxRetries})` } 
              : entry;
          }));

          await new Promise(r => setTimeout(r, retryDelay));
          currentDelay = retryDelay * 1.5; // Exponential backoff
          continue;
        }

        // If we exhausted all retries for a rate limit, it's effectively a daily quota exceeded
        if (isRateLimit) {
          throw new Error("DAILY_QUOTA_EXCEEDED");
        }
        throw err;
      }
    }
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) {
      setError("Supabase configuration is missing. Please check your Secrets in AI Studio.");
      return;
    }
    if (!user) {
      setError("You must be logged in to upload records. Please click the Login button.");
      return;
    }

    // Check if services are unlocked
    if (!isServiceUnlocked) {
      setShowServicePasswordPrompt(true);
      return;
    }

    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsProcessing(true);
      setError(null);
      const fileArray = Array.from(files);
      setProgress({ current: 0, total: fileArray.length, failed: 0 });
      
      const newEntries: UploadLogEntry[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        let objectUrl: string | null = null;
        try {
          objectUrl = URL.createObjectURL(file);
          const resizedBase64 = await resizeImage(objectUrl, 1000);
          
          newEntries.push({
            fileName: file.name,
            status: 'queued',
            timestamp: Date.now() + newEntries.length,
            imageData: resizedBase64
          });
        } catch (err) {
          console.error(`Error queuing ${file.name}:`, err);
        } finally {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          setProgress(prev => ({ ...prev, current: i + 1 }));
        }
      }

      setUploadLog(prev => [...newEntries, ...prev].slice(0, 50));
      e.target.value = '';
      
      // Clear progress after a short delay
      setTimeout(() => setProgress({ current: 0, total: 0, failed: 0 }), 1000);

    } catch (err: any) {
      console.error("Queue error:", err);
      setError("Failed to queue images. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [user, supabase]);

  const startBatchProcessing = useCallback(async () => {
    if (!supabase || !user || isProcessing) return;
    
    const queuedItems = uploadLog.filter(entry => entry.status === 'queued');
    if (queuedItems.length === 0) return;

    try {
      setIsProcessing(true);
      setIsStopping(false);
      shouldStopRef.current = false;
      setError(null);
      setFailedFiles([]);
      setProgress({ current: 0, total: queuedItems.length, failed: 0 });

      let localCompletedCount = 0;
      let localFailedCount = 0;

      for (const entry of queuedItems) {
        if (shouldStopRef.current) break;

        // Update status to processing
        setUploadLog(prev => prev.map(e => 
          e.timestamp === entry.timestamp ? { ...e, status: 'processing', error: undefined } : e
        ));

        try {
          if (!entry.imageData) throw new Error("Image data missing for queued item.");

          const result = await performExtractionWithRetry(entry.imageData, entry.fileName, entry.timestamp, false);
          
          if (shouldStopRef.current) throw new Error("Processing stopped by user");

          if (!result || !result.records || result.records.length === 0) {
            throw new Error("No readable records found in this image.");
          }

          for (const record of result.records) {
            if (shouldStopRef.current) break;
            
            const { data: recordData, error: recordError } = await supabase
              .from('maintenance_records')
              .insert({
                plate_number: record.plate_number,
                service_date: record.service_date,
                service_description: record.service_description,
                confidence: record.confidence,
                user_id: user.id,
                file_name: entry.fileName,
                created_at: new Date().toISOString()
              })
              .select()
              .single();

            if (recordError) throw recordError;
            setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));

            if (recordData) {
              const { error: imageError } = await supabase
                .from('maintenance_record_images')
                .insert({
                  record_id: recordData.id,
                  image_data: entry.imageData,
                  user_id: user.id,
                  created_at: new Date().toISOString()
                });
              
              if (imageError) throw imageError;
              setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));
            }
          }
          
          // Success!
          setUploadLog(prev => prev.map(e => 
            e.timestamp === entry.timestamp ? { ...e, status: 'success' } : e
          ));

          // Update usage stats on success
          if (!isServiceUnlocked) {
            setUsageStats(prev => ({ ...prev, uploads: prev.uploads + 1 }));
          }

        } catch (err: any) {
          console.error(`[BATCH] Failed: ${entry.fileName}`, err);
          
          if (err.message === "DAILY_QUOTA_EXCEEDED") {
            // Calculate time until midnight
            const now = new Date();
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            const diffMs = midnight.getTime() - now.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            
            const resetMsg = `Daily Quota Reached. Reset in ${diffHours}h ${diffMins}m (at Midnight).`;
            setError(
              <div className="flex flex-col gap-1">
                <span>{resetMsg}</span>
                <button 
                  onClick={handleSelectKey}
                  className="text-[10px] underline hover:text-white transition-colors text-left"
                >
                  Switch to a different API key or a Paid plan to continue now
                </button>
              </div> as any
            );
            
            setUploadLog(prev => prev.map(e => 
              e.timestamp === entry.timestamp ? { ...e, status: 'failed', error: "Daily limit reached. Try again after midnight." } : e
            ));
            
            // Stop the entire batch
            shouldStopRef.current = true;
            break;
          }

          localFailedCount++;
          setFailedFiles(prev => [...prev, entry.fileName]);
          
          setUploadLog(prev => prev.map(e => 
            e.timestamp === entry.timestamp ? { ...e, status: 'failed', error: getSupabaseErrorMessage(err) } : e
          ));
        } finally {
          localCompletedCount++;
          setProgress(prev => ({ ...prev, current: localCompletedCount, failed: localFailedCount }));
          
          // 15-second delay between requests to stay within free tier rate limits (approx 4 RPM)
          // This is safer for localhost and shared environments
          if (localCompletedCount < queuedItems.length && !shouldStopRef.current) {
            await new Promise(r => setTimeout(r, 15000));
          }
        }
      }

      if (shouldStopRef.current) return;

      if (localFailedCount > 0) {
        setError(`Processed ${localCompletedCount} images, but ${localFailedCount} failed. Check the log below.`);
      } else {
        setTimeout(() => setProgress({ current: 0, total: 0, failed: 0 }), 2000);
      }

      fetchRecords();

    } catch (err: any) {
      console.error("Batch processing error:", err);
      setError("A critical error occurred during batch processing.");
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
      shouldStopRef.current = false;
    }
  }, [user, supabase, uploadLog, isProcessing, fetchRecords, performExtractionWithRetry]);

  const stopBatchProcessing = useCallback(() => {
    setIsStopping(true);
    shouldStopRef.current = true;
  }, []);

  const handleRetry = useCallback(async (entry: UploadLogEntry) => {
    if (!supabase || !user || !entry.imageData) return;

    try {
      // Update log to processing
      setUploadLog(prev => prev.map(e => 
        e.timestamp === entry.timestamp ? { ...e, status: 'processing', error: undefined } : e
      ));

      const result = await performExtractionWithRetry(entry.imageData, entry.fileName, entry.timestamp, false);

      if (!result || !result.records || result.records.length === 0) {
        throw new Error("No readable records found in this image.");
      }

      for (const record of result.records) {
        const { data: recordData, error: recordError } = await supabase
          .from('maintenance_records')
          .insert({
            plate_number: record.plate_number,
            service_date: record.service_date,
            service_description: record.service_description,
            confidence: record.confidence,
            user_id: user.id,
            file_name: entry.fileName,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (recordError) throw recordError;
        setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));

        if (recordData) {
          const { error: imageError } = await supabase
            .from('maintenance_record_images')
            .insert({
              record_id: recordData.id,
              image_data: entry.imageData,
              user_id: user.id,
              created_at: new Date().toISOString()
            });
          
          if (imageError) throw imageError;
          setSessionStats(prev => ({ ...prev, writes: prev.writes + 1 }));
        }
      }
      
      // Success!
      setUploadLog(prev => prev.map(e => 
        e.timestamp === entry.timestamp ? { ...e, status: 'success', error: undefined } : e
      ));
      
      // Refresh records
      fetchRecords();

    } catch (err: any) {
      console.error(`[RETRY] Failed: ${entry.fileName}`, err);
      
      if (err.message === "DAILY_QUOTA_EXCEEDED") {
        const now = new Date();
        const midnight = new Date();
        midnight.setHours(24, 0, 0, 0);
        const diffMs = midnight.getTime() - now.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        const resetMsg = `Daily Quota Reached. Reset in ${diffHours}h ${diffMins}m (at Midnight).`;
        setError(
          <div className="flex flex-col gap-1">
            <span>{resetMsg}</span>
            <button 
              onClick={handleSelectKey}
              className="text-[10px] underline hover:text-white transition-colors text-left"
            >
              Switch to a different API key or a Paid plan to continue now
            </button>
          </div> as any
        );
        
        setUploadLog(prev => prev.map(e => 
          e.timestamp === entry.timestamp ? { ...e, status: 'failed', error: "Daily limit reached. Try again after midnight." } : e
        ));
      } else {
        setUploadLog(prev => prev.map(e => 
          e.timestamp === entry.timestamp ? { ...e, status: 'failed', error: getSupabaseErrorMessage(err) } : e
        ));
      }
    }
  }, [user, fetchRecords]);

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
      const searchLower = debouncedSearch.toLowerCase().trim();
      const matchesSearch = !searchLower || 
        record.plate_number.toLowerCase().includes(searchLower) ||
        arePlatesSimilar(record.plate_number, searchLower);
        
      const matchesService = record.service_description.toLowerCase().includes(debouncedService.toLowerCase());
      const matchesSecondaryService = record.service_description.toLowerCase().includes(debouncedSecondaryService.toLowerCase());
      
      const recordDate = new Date(record.service_date);
      const matchesStartDate = !startDate || recordDate >= new Date(startDate);
      const matchesEndDate = !endDate || recordDate <= new Date(endDate);

      return matchesSearch && matchesService && matchesSecondaryService && matchesStartDate && matchesEndDate;
    });

    return filtered;
  }, [records, debouncedSearch, debouncedService, debouncedSecondaryService, startDate, endDate]);

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
        setError(getSupabaseErrorMessage(err));
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

  // Fetch Records
  useEffect(() => {
    if (user && isAuthReady) {
      fetchRecords();
    }
  }, [user, isAuthReady, fetchRecords]);

  // Fetch Market Prices
  useEffect(() => {
    if (!user || !supabase) return;
    
    const fetchMarketPrices = async () => {
      try {
        const { data, error } = await supabase
          .from('market_prices')
          .select('*')
          .eq('user_id', user.id);
        
        if (error) {
          // If table doesn't exist (42P01) or PostgREST can't find it
          const isMissingTable = error.code === '42P01' || 
                                error.message?.toLowerCase().includes('not found') ||
                                error.message?.toLowerCase().includes('does not exist');
          
          if (isMissingTable) {
            console.warn("Market prices table not found in Supabase. This feature is optional.");
            return;
          }
          throw error;
        }
        if (data) {
          setMarketPrices(data);
        }
      } catch (err) {
        console.error("Error fetching market prices:", err);
      }
    };
    
    fetchMarketPrices();
  }, [user]);

  const handleSaveMarketPrice = async (item: string, price: number, currency: string) => {
    if (!user || !supabase) return;
    
    try {
      const { error } = await supabase
        .from('market_prices')
        .upsert({
          item_name: item,
          price: price,
          currency: currency,
          confirmed_by: user.email || 'User',
          last_updated: new Date().toISOString(),
          user_id: user.id
        }, { onConflict: 'item_name,user_id' });
        
      if (error) {
        if (error.message?.includes('not found')) {
          setError("Market prices table is not set up in your database yet.");
          return;
        }
        throw error;
      }

      // Refresh prices
      const { data: updatedData, error: fetchError } = await supabase
        .from('market_prices')
        .select('*')
        .eq('user_id', user.id);
      
      if (fetchError) throw fetchError;
      if (updatedData) setMarketPrices(updatedData);
    } catch (err) {
      console.error("Error saving market price:", err);
      setError(getSupabaseErrorMessage(err));
    }
  };

  const handleTroubleFinding = useCallback(async () => {
    if (!records.length) return;
    
    if (!isServiceUnlocked) {
      setShowServicePasswordPrompt(true);
      return;
    }

    setIsTroubleFindingLoading(true);
    setTroubleFindingAnswer(null);
    troubleStopRef.current = false;
    
    try {
      const context = `The user is having trouble finding history. 
      Current filters: 
      - Plate: ${searchQuery || 'None'}
      - Primary Service: ${serviceFilter || 'None'}
      - Secondary Service: ${secondaryServiceFilter || 'None'}
      - Date Range: ${startDate || 'Any'} to ${endDate || 'Any'}
      
      Please analyze the full database and find any records that might be similar or relevant to what they are looking for. 
      If you find similar records, list them clearly. If you don't find anything, suggest what they might be doing wrong or what else they could search for.`;
      
      const answer = await analyzeMaintenanceData(context, records, [], marketPrices);
      if (troubleStopRef.current) return;
      
      setUsageStats(prev => ({ ...prev, searches: prev.searches + 1 }));
      setTroubleFindingAnswer(answer);
    } catch (err: any) {
      if (troubleStopRef.current) return;
      console.error("Trouble finding error:", err);
      setTroubleFindingAnswer("Sorry, I encountered an error while searching. Please try again.");
    } finally {
      if (!troubleStopRef.current) {
        setIsTroubleFindingLoading(false);
      }
    }
  }, [records, searchQuery, serviceFilter, secondaryServiceFilter, startDate, endDate]);

  const handleStopTroubleFinding = () => {
    troubleStopRef.current = true;
    setIsTroubleFindingLoading(false);
  };

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
      setError(getSupabaseErrorMessage(err));
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
        setTotalCount(0);
        
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
        const duplicates: string[] = [];
        const uniqueRecords: MaintenanceRecord[] = [];
        
        // Sort by createdAt descending to keep the most recent one
        const sortedRecords = [...records].sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return timeB - timeA;
        });

        sortedRecords.forEach(record => {
          // Check if this record is a duplicate of any already seen unique record
          // We use the new plate similarity rule: > 5 matching characters at same positions
          const isDuplicate = uniqueRecords.some(unique => 
            arePlatesSimilar(record.plate_number, unique.plate_number) &&
            record.service_date === unique.service_date &&
            record.service_description.toLowerCase().trim() === unique.service_description.toLowerCase().trim()
          );

          if (isDuplicate) {
            duplicates.push(record.id);
          } else {
            uniqueRecords.push(record);
          }
        });

        if (duplicates.length === 0) {
          setError("No duplicates found based on the new similarity rules.");
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

  if (!isAuthReady || hasApiKey === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/40">Initialising DT.Base...</span>
        </div>
      </div>
    );
  }

  if (!isAppUnlocked) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md p-8 text-center">
          <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <Key className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-display font-bold text-white mb-4 tracking-tight uppercase">App Access Required</h1>
          <p className="text-sm text-white/40 mb-8 leading-relaxed uppercase tracking-widest">
            Please enter the access password to enter DT.Base.
          </p>
          <div className="space-y-4">
            <div className="relative">
              <input 
                type="password"
                value={appPasswordInput}
                onChange={(e) => setAppPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAppUnlock()}
                placeholder="Enter App Password"
                className={cn(
                  "w-full bg-black/40 border px-4 py-4 text-white font-mono text-center tracking-[0.5em] focus:outline-none transition-all rounded-xl",
                  appPasswordError ? "border-red-500/50" : "border-white/10 focus:border-amber-500/50"
                )}
              />
              {appPasswordError && (
                <p className="text-[10px] text-red-400 font-display font-bold uppercase tracking-widest mt-2">
                  Incorrect Password
                </p>
              )}
            </div>
            <button
              onClick={handleAppUnlock}
              className="w-full py-4 px-6 bg-amber-500 hover:bg-amber-600 text-black font-display font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-amber-900/20 active:scale-[0.98]"
            >
              Enter App
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl p-8 text-center">
          <div className="w-16 h-16 bg-purple-600/20 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-2xl font-display font-bold text-white mb-4 tracking-tight uppercase">Paid Tier API Key Required</h1>
          <p className="text-sm text-white/40 mb-8 leading-relaxed uppercase tracking-widest">
            To use the AI features of DT.Base, you need to select a Gemini API key from a paid Google Cloud project.
          </p>
          <div className="space-y-4">
            <button
              onClick={handleSelectKey}
              className="w-full py-4 px-6 bg-purple-600 hover:bg-purple-500 text-white font-display font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-purple-900/20 active:scale-[0.98]"
              title="Select a Gemini API key from your Google Cloud project"
            >
              Select API Key
            </button>
            <p className="text-[10px] text-white/20 font-display font-medium uppercase tracking-widest">
              Note: You must have billing enabled on your Google Cloud project.
              <br />
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline mt-2 inline-block"
              >
                Learn more about billing
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

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
      <header className="relative mb-4 md:mb-6 border-b border-white/5 pb-4 glassmorphism p-4 rounded-3xl neon-border-violet">
        {/* Settings Button - Moved to top right as requested */}
        <button 
          onClick={() => setShowSettingsModal(true)}
          className="absolute top-4 right-4 p-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-all rounded-full text-white/40 hover:text-white hover:neon-glow-violet z-10"
          title="Open Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 border border-purple-500/30 rounded-2xl">
              <Truck className="w-6 h-6 text-purple-400" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-5xl md:text-8xl font-display font-bold tracking-tighter leading-none">DT.Base</h1>
              <p className="text-[11px] opacity-50 uppercase tracking-[0.5em] font-display font-bold mt-1">Mechanical History Log</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {deferredPrompt && (
              <button 
                onClick={handleInstallClick}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-violet-600 text-white hover:bg-violet-500 transition-all active:scale-95 rounded-xl shadow-[0_0_15px_rgba(160,32,240,0.4)]"
                title="Install DT.Base as a Progressive Web App"
              >
                <Download className="w-3 h-3" />
                <span className="text-[10px] font-display font-bold uppercase tracking-widest">Install</span>
              </button>
            )}
            
            {user ? null : null}
            
            <div className="hidden">
              <div 
                className="flex items-center gap-2 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg"
                title="Cloud synchronization status"
              >
                <Database className={cn(
                  "w-2 h-2",
                  isCloudConnected === true ? "text-green-500" : "text-red-500"
                )} />
                <span className="text-[7px] font-mono text-white/20 uppercase tracking-widest">
                  {isCloudConnected ? "Sync" : "Off"}
                </span>
              </div>
            </div>

            {!isServiceUnlocked && (
              <button 
                onClick={() => setShowServicePasswordPrompt(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500/20 transition-all rounded-xl shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                title="Enter password to unlock AI and advanced features"
              >
                <Key className="w-3 h-3" />
                <span className="text-[8px] font-display font-bold uppercase tracking-widest">Unlock Services</span>
              </button>
            )}
          </div>
        </div>
      </header>
        
        {/* Progress Bar */}
        {isProcessing && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-display font-bold text-purple-400 uppercase tracking-widest animate-pulse">
                {isStopping ? "Stopping..." : "Processing Queue..."}
              </span>
              {!isStopping && (
                <button 
                  onClick={stopBatchProcessing}
                  className="text-[10px] font-display font-bold text-red-400 hover:text-red-300 uppercase tracking-widest transition-colors"
                  title="Stop current batch processing"
                >
                  Stop Progress
                </button>
              )}
            </div>
            <div className="h-1 w-full bg-white/10 overflow-hidden rounded-full">
              <div 
                className="h-full bg-purple-500 transition-all duration-300 shadow-[0_0_10px_rgba(168,85,247,0.5)]" 
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

      {/* Error Message */}
      {error && (
        <div className="mb-8 p-4 bg-red-900/40 backdrop-blur-md border border-red-500/50 text-red-100 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div className="flex flex-col">
                <div className="text-sm font-display font-medium">{error}</div>
                {typeof error === 'string' && error.includes("Daily Quota Reached") && (
                  <p className="text-[10px] opacity-60 mt-1">
                    You can still add records manually using the "Add Manually" button on failed items in the log below.
                  </p>
                )}
                {typeof error === 'string' && (error.includes("Failed to fetch") || error.includes("connection error")) && (
                  <p className="text-[10px] opacity-60 mt-1">
                    This is often caused by unstable internet or browser extensions blocking the request. Try refreshing or using a different browser.
                  </p>
                )}
              </div>
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
      {!user && (
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
              <div key={`${entry.fileName}-${entry.timestamp}-${i}`} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded group/log">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    entry.status === 'success' ? "bg-green-500" : 
                    entry.status === 'failed' ? "bg-red-500" : 
                    entry.status === 'processing' ? "bg-purple-500 animate-pulse" : 
                    entry.status === 'queued' ? "bg-blue-500" : "bg-white/20"
                  )} />
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-[11px] font-mono truncate opacity-80" title={entry.fileName}>{entry.fileName}</span>
                    {entry.status === 'failed' && entry.error && (
                      <span className="text-[8px] font-mono text-red-400/60 truncate" title={entry.error}>
                        {entry.error}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className={cn(
                    "text-[9px] font-display font-bold uppercase tracking-widest",
                    entry.status === 'success' ? "text-green-400" : 
                    entry.status === 'failed' ? "text-red-400" : 
                    entry.status === 'processing' ? "text-purple-400" : 
                    entry.status === 'queued' ? "text-blue-400" : "text-white/40"
                  )}>
                    {entry.status}
                  </span>
                  
                  {entry.status === 'failed' && (
                    <div className="flex items-center gap-2">
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
                      
                      {entry.imageData && (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleRetry(entry)}
                            className="text-[9px] font-display font-bold uppercase tracking-widest bg-purple-500/20 hover:bg-purple-500/40 px-2 py-1 rounded text-purple-300 flex items-center gap-1 transition-colors"
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            Retry
                          </button>
                          
                          <button 
                            onClick={() => setViewingImage({ id: entry.fileName, image: entry.imageData!, loading: false })}
                            className="text-[9px] font-display font-bold uppercase tracking-widest bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white flex items-center gap-1 transition-colors"
                          >
                            <Eye className="w-2.5 h-2.5" />
                            View Image
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {entry.status !== 'failed' && entry.imageData && (
                    <button 
                      onClick={() => setViewingImage({ id: entry.fileName, image: entry.imageData!, loading: false })}
                      className="text-[9px] font-display font-bold uppercase tracking-widest text-white/40 hover:text-white underline flex items-center gap-1"
                    >
                      <Eye className="w-2.5 h-2.5" />
                      View
                    </button>
                  )}

                  <button 
                    onClick={() => removeLogEntry(entry.fileName, entry.timestamp)}
                    className="p-1.5 hover:bg-white/10 rounded-full transition-all text-white/20 hover:text-white active:scale-90"
                    title="Remove from log"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {uploadLog.some(e => e.status === 'queued') && (
            <div className="mt-6 p-4 bg-purple-600/10 border border-purple-500/20 rounded-2xl flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center">
                <h4 className="text-xs font-display font-bold text-white uppercase tracking-widest mb-1">Ready to Process</h4>
                <p className="text-[10px] font-display font-medium text-white/40 uppercase tracking-widest">
                  {uploadLog.filter(e => e.status === 'queued').length} images waiting in queue
                </p>
              </div>
              <button 
                onClick={startBatchProcessing}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-3 py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-display font-bold uppercase tracking-[0.2em] text-xs rounded-xl shadow-lg shadow-purple-900/20 transition-all active:scale-[0.98]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    Start AI Extraction
                  </>
                )}
              </button>
              <p className="text-[9px] font-display font-medium text-purple-400/60 uppercase tracking-widest text-center">
                * Images will be processed one by one with a 5s interval to ensure stability
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-1">
            <p className="text-[9px] font-display font-medium opacity-40 italic">
              * This log persists even if the browser crashes. Successful uploads are saved to the cloud.
            </p>
            <p className="text-[9px] font-display font-medium opacity-40 italic">
              * Note: Mobile browsers may rename files (e.g., "image.jpg") when selecting from the gallery.
            </p>
            <p className="text-[9px] font-display font-medium opacity-40 italic">
              * The "View" button is only available for the current session to save storage space.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[9px] opacity-40 block mb-2 ml-2">Identify Truck</label>
          <div className="relative">
            {isSearching ? (
              <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400 animate-spin" />
            ) : (
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
            )}
            <input 
              type="text"
              placeholder={!isServiceUnlocked && usageStats.searches >= 15 ? "Search limit reached..." : "Plate number..."}
              className={cn(
                "w-full bg-black/40 backdrop-blur-md border p-2.5 pl-10 pr-10 rounded-full font-display font-medium text-sm focus:outline-none transition-all placeholder:opacity-30",
                !isServiceUnlocked && usageStats.searches >= 15 ? "opacity-50 cursor-not-allowed border-white/10" : "neon-border-cyan"
              )}
              value={searchQuery}
              onChange={(e) => {
                if (!isServiceUnlocked && usageStats.searches >= 15) {
                  setShowServicePasswordPrompt(true);
                  return;
                }
                setSearchQuery(e.target.value);
              }}
              disabled={!isServiceUnlocked && usageStats.searches >= 15}
              title="Search records by truck plate number"
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
          {recentSearches.length > 0 && !searchQuery && (
            <div className="mt-2 flex flex-wrap gap-1.5 ml-2">
              {recentSearches.map((s, i) => (
                <button 
                  key={i} 
                  onClick={() => setSearchQuery(s)}
                  className="text-[8px] font-mono bg-white/5 hover:bg-purple-500/20 border border-white/5 hover:border-purple-500/30 px-2 py-0.5 rounded-full opacity-40 hover:opacity-100 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[9px] opacity-40 block mb-2 ml-2">Find Maintenance</label>
          <div className="flex flex-col gap-2">
            <div className="relative">
              {isFiltering ? (
                <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400 animate-spin" />
              ) : (
                <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
              )}
              <input 
                type="text"
                placeholder="Primary filter..."
                className="w-full bg-black/40 backdrop-blur-md border neon-border-violet p-2.5 pl-10 pr-10 rounded-full font-display font-medium text-sm focus:outline-none transition-all placeholder:opacity-30"
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                title="Filter records by service description (e.g. Oil, Tires)"
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
            <div className="relative">
              <ListFilter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-30" />
              <input 
                type="text"
                placeholder="Secondary filter..."
                className="w-full bg-black/40 backdrop-blur-md border neon-border-violet p-2.5 pl-10 pr-10 rounded-full font-display font-medium text-sm focus:outline-none transition-all placeholder:opacity-30"
                value={secondaryServiceFilter}
                onChange={(e) => setSecondaryServiceFilter(e.target.value)}
                title="Add a second filter for more specific results"
              />
              {secondaryServiceFilter && (
                <button 
                  onClick={() => setSecondaryServiceFilter('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  title="Clear Secondary Filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {recentServiceFilters.length > 0 && !serviceFilter && !secondaryServiceFilter && (
            <div className="mt-2 flex flex-wrap gap-1.5 ml-2">
              {recentServiceFilters.map((s, i) => (
                <button 
                  key={i} 
                  onClick={() => setServiceFilter(s)}
                  className="text-[8px] font-mono bg-white/5 hover:bg-purple-500/20 border border-white/5 hover:border-purple-500/30 px-2 py-0.5 rounded-full opacity-40 hover:opacity-100 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative group">
          <label className="font-display font-bold uppercase tracking-[0.2em] text-[9px] opacity-40 block mb-2 ml-2">Date Range</label>
          <div className="flex items-center gap-2">
            <input 
              type="date"
              className="flex-1 bg-white/5 backdrop-blur-sm border border-white/10 p-2.5 rounded-xl font-display font-medium text-[10px] focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Start date for filtering records"
            />
            <span className="text-white/20 text-[10px]">to</span>
            <input 
              type="date"
              className="flex-1 bg-white/5 backdrop-blur-sm border border-white/10 p-2.5 rounded-xl font-display font-medium text-[10px] focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="End date for filtering records"
            />
          </div>
          {(startDate || endDate) && (
            <button 
              onClick={() => setShowDateRangeReport(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 p-2 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-xl font-display font-bold text-[9px] uppercase tracking-[0.2em] hover:bg-purple-600/30 transition-all"
            >
              <ListFilter className="w-3 h-3" />
              Generate Summary Report
            </button>
          )}
        </div>

        <div className="flex items-end gap-2">
            <div className="flex flex-col items-center gap-1">
              <button 
                onClick={() => setShowLatestOnly(!showLatestOnly)}
                className={cn(
                  "flex-1 w-full flex items-center justify-center gap-2 p-2.5 rounded-full border transition-all font-display font-bold text-[10px] uppercase tracking-[0.2em]",
                  showLatestOnly 
                    ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20" 
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                )}
                title="Toggle Latest Only"
              >
                <Clock className={cn("w-3.5 h-3.5", showLatestOnly ? "animate-pulse" : "")} />
                {showLatestOnly ? "Latest" : "All"}
              </button>
              <span className="text-[8px] font-mono text-white/30 uppercase tracking-widest">{filteredRecords.length} Filtered</span>
            </div>
          
          <button 
            onClick={() => {
              setSearchQuery('');
              setServiceFilter('');
              setSecondaryServiceFilter('');
              setStartDate('');
              setEndDate('');
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 p-2.5 rounded-full border transition-all font-display font-bold text-[10px] uppercase tracking-[0.2em]",
              (searchQuery || serviceFilter || secondaryServiceFilter || startDate || endDate) 
                ? "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30" 
                : "bg-white/5 border-white/10 text-white/20 cursor-not-allowed"
            )}
            disabled={!(searchQuery || serviceFilter || secondaryServiceFilter || startDate || endDate)}
            title="Clear All Filters"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Trouble Finding Section */}
      <div className="mb-8 p-6 glassmorphism rounded-2xl neon-border-violet shimmer-ai">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div className="flex flex-col">
            <h3 className="font-display font-bold text-sm text-white uppercase tracking-widest">Trouble finding History?</h3>
            <p className="text-[9px] font-display font-medium text-white/60 uppercase tracking-widest">AI can search the entire database</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleTroubleFinding}
              disabled={isTroubleFindingLoading || records.length === 0}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-display font-bold uppercase tracking-[0.2em] text-[10px] rounded-full transition-all active:scale-95 shadow-[0_0_20px_rgba(0,245,255,0.4)]"
              title="Use AI to search for similar or related records across the entire database"
            >
              {isTroubleFindingLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3 fill-current" />
                  Ask AI
                </>
              )}
            </button>
            {isTroubleFindingLoading && (
              <button 
                onClick={handleStopTroubleFinding}
                className="px-3 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 font-display font-bold uppercase tracking-[0.2em] text-[9px] rounded-lg transition-all active:scale-95 border border-red-500/30"
                title="Stop AI search"
              >
                Stop
              </button>
            )}
          </div>
        </div>

        {troubleFindingAnswer && (
          <div className="mt-6 p-6 bg-zinc-900/50 border border-purple-500/20 rounded-xl animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
              <span className="font-display font-bold text-[10px] uppercase tracking-[0.3em] text-purple-400">AI Search Results</span>
              <button 
                onClick={() => setTroubleFindingAnswer(null)}
                className="ml-auto p-1 hover:bg-white/10 rounded-full transition-colors"
                title="Close AI search results"
              >
                <X className="w-3 h-3 opacity-40 hover:opacity-100" />
              </button>
            </div>
            <div className="prose prose-invert prose-sm max-w-none">
              <div className="text-white/80 font-display leading-relaxed whitespace-pre-wrap text-xs">
                {troubleFindingAnswer}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Latest Result Summary Area */}
      {showLatestOnly && filteredRecords.length > 0 && (
        <div className="mb-12 p-6 glassmorphism rounded-2xl neon-border-violet">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(160,32,240,0.8)]" />
                <span className="font-display font-bold text-[9px] uppercase tracking-[0.3em] text-violet-400">Latest Inquiry Found</span>
              </div>
              <div className="text-[9px] font-mono opacity-30 uppercase tracking-widest">
                {(() => {
                  const d = new Date(filteredRecords[0].service_date);
                  if (isNaN(d.getTime())) return filteredRecords[0].service_date;
                  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
                })()}
              </div>
            </div>
            
            {/* Show image if available */}
            {isLoadingLatestImage ? (
              <div className="w-full max-w-sm h-40 flex items-center justify-center bg-white/5 border border-white/10 rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin opacity-20" />
              </div>
            ) : latestImage ? (
              <div className="w-full max-w-sm overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/50">
                <img 
                  src={latestImage} 
                  alt="Original Record" 
                  className="w-full h-auto object-contain grayscale hover:grayscale-0 transition-all duration-500"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}

            <div className="space-y-4">
              <div className="text-center">
                <p className="font-display text-4xl md:text-5xl font-bold tracking-tighter text-white mb-1 uppercase">{filteredRecords[0].plate_number}</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[10px] font-display font-bold text-white/40 uppercase tracking-widest">History for {filteredRecords[0].plate_number}</span>
                  <div className="w-1 h-1 bg-white/10 rounded-full" />
                  <span className="text-[10px] font-display font-bold text-purple-400 uppercase tracking-widest">
                    {(() => {
                      const recordDate = new Date(filteredRecords[0].service_date);
                      const now = new Date();
                      const diffTime = Math.abs(now.getTime() - recordDate.getTime());
                      const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.4375));
                      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                      if (diffMonths > 0) return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
                      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
                    })()}
                  </span>
                </div>
              </div>

              <div className="bg-black/20 p-6 rounded-xl border border-white/5">
                <div className="flex flex-col gap-2">
                  {(() => {
                    // Combine all records from the same date and truck if they exist
                    const combinedDescription = filteredRecords
                      .filter(r => r.service_date === filteredRecords[0].service_date && r.plate_number === filteredRecords[0].plate_number)
                      .map(r => r.service_description)
                      .join('\n');

                    return combinedDescription.split(/[,*\n]/)
                      .map(p => p.trim())
                      .filter(p => p)
                      .sort((a, b) => {
                        const aLower = a.toLowerCase();
                        const bLower = b.toLowerCase();
                        const aMatch = (serviceFilter && aLower.includes(serviceFilter.toLowerCase())) || (secondaryServiceFilter && aLower.includes(secondaryServiceFilter.toLowerCase()));
                        const bMatch = (serviceFilter && bLower.includes(serviceFilter.toLowerCase())) || (secondaryServiceFilter && bLower.includes(secondaryServiceFilter.toLowerCase()));
                        // Put matches at the bottom, non-matches at the top
                        if (aMatch && !bMatch) return 1;
                        if (!aMatch && bMatch) return -1;
                        return 0;
                      })
                      .map((part, i) => {
                        const lowerPart = part.toLowerCase();
                        const isPrimaryMatch = serviceFilter && lowerPart.includes(serviceFilter.toLowerCase());
                        const isSecondaryMatch = secondaryServiceFilter && lowerPart.includes(secondaryServiceFilter.toLowerCase());
                        const isMatch = isPrimaryMatch || isSecondaryMatch;

                        // Filter out common names/metadata ONLY if they are NOT a match
                        const isMetadata = lowerPart.includes('mechanic') || 
                                         lowerPart.includes('supervisor') || 
                                         lowerPart.includes('fundi') ||
                                         lowerPart.includes('garage');

                        if (isMetadata && !isMatch) return null;

                        return (
                          <div key={i} className="flex items-start gap-2">
                            <span className={cn(
                              "transition-all duration-500",
                              isMatch 
                                ? "text-2xl md:text-3xl font-bold text-emerald-500 leading-tight" 
                                : "text-[14px] opacity-70 font-medium text-white/90"
                            )}>
                              * {part}
                            </span>
                          </div>
                        );
                      });
                  })()}
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 pt-4">
                <div className="flex flex-wrap justify-center gap-2">
                  {searchQuery && <span className="px-2 py-1 bg-white/5 rounded text-[8px] font-mono text-white/40 uppercase tracking-widest">Plate: {searchQuery}</span>}
                  {serviceFilter && <span className="px-2 py-1 bg-white/5 rounded text-[8px] font-mono text-white/40 uppercase tracking-widest">Primary: {serviceFilter}</span>}
                  {secondaryServiceFilter && <span className="px-2 py-1 bg-white/5 rounded text-[8px] font-mono text-white/40 uppercase tracking-widest">Secondary: {secondaryServiceFilter}</span>}
                <button 
                  onClick={() => {
                    const recordDate = new Date(filteredRecords[0].service_date);
                    const now = new Date();
                    const diffTime = Math.abs(now.getTime() - recordDate.getTime());
                    const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.4375));
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    const timeDiff = diffMonths > 0 ? `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago` : `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
                    const text = `DT.Base History for ${filteredRecords[0].plate_number}\nDate: ${filteredRecords[0].service_date} (${timeDiff})\nService: ${filteredRecords[0].service_description}`;
                    if (navigator.share) {
                      navigator.share({ title: 'DT.Base Record', text });
                    } else {
                      navigator.clipboard.writeText(text);
                      alert("Copied to clipboard!");
                    }
                  }}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-cyan-500 to-violet-600 text-white hover:from-cyan-400 hover:to-violet-500 transition-all active:scale-95 rounded-full shadow-[0_0_20px_rgba(0,245,255,0.3)]"
                  title="Share this record or copy it to clipboard"
                >
                  <Search className="w-3 h-3" />
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em]">Share Result</span>
                </button>
              </div>
            </div>
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
              title="Toggle visibility of the maintenance log history"
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
              title="Expand all truck record groups"
            >
              Expand
            </button>
            <button 
              onClick={() => toggleAll(false)}
              className="text-[9px] font-display font-bold uppercase tracking-[0.2em] opacity-30 hover:opacity-100 hover:text-purple-400 transition-all"
              title="Collapse all truck record groups"
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
                <label 
                  onClick={(e) => {
                    if (!isServiceUnlocked) {
                      e.preventDefault();
                      setShowServicePasswordPrompt(true);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 px-8 py-4 bg-purple-600 text-white cursor-pointer hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/20 font-display font-bold uppercase tracking-[0.2em] text-xs",
                    !isServiceUnlocked && "opacity-50"
                  )}
                  title={!isServiceUnlocked ? "Unlock services to upload" : "Upload your first maintenance log image"}
                >
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
              <div key={plate} className="glassmorphism rounded-3xl overflow-hidden transition-all hover:bg-white/[0.05] neon-border-violet/30">
                {/* Plate Header */}
                <button 
                  onClick={() => togglePlate(plate)}
                  className="w-full flex items-center justify-between p-3.5 px-5 text-white transition-all"
                  title={`Click to ${expandedPlates[plate] ? 'collapse' : 'expand'} records for ${plate}`}
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
                              <div className="text-[8px] font-display font-bold opacity-30 uppercase tracking-[0.2em] mb-0.5 flex items-center gap-2">
                                <span>{record.service_date}</span>
                                {record.file_name && (
                                  <>
                                    <span className="opacity-40">•</span>
                                    <span className="truncate max-w-[120px]">{record.file_name}</span>
                                  </>
                                )}
                              </div>
                              <div className="text-xs font-medium text-white/90 truncate">{record.service_description}</div>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleViewImage(record)}
                            className="flex-shrink-0 px-3 py-1.5 bg-purple-600/10 border border-purple-500/20 text-purple-400 text-[9px] font-display font-bold uppercase tracking-widest hover:bg-purple-600/20 transition-all rounded-full"
                            title="View the original image for this record"
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
          <div className="relative w-full max-w-4xl glassmorphism neon-border-violet shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <div className="flex flex-col">
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-violet-400">Record Image</span>
                {records.find(r => r.id === viewingImage.id)?.file_name && (
                  <span className="text-[9px] font-mono text-white/40 truncate max-w-[200px]">
                    {records.find(r => r.id === viewingImage.id)?.file_name}
                  </span>
                )}
              </div>
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

      {/* Date Range Summary Report Modal */}
      {showDateRangeReport && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 backdrop-blur-md overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-2xl glassmorphism neon-border-violet shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02] shimmer-ai">
              <div className="flex flex-col gap-1 relative z-10">
                <h2 className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-violet-400">Summary Report</h2>
                <div className="flex items-center gap-2 text-white/60 font-display font-bold text-xs uppercase tracking-widest">
                  <span>From {startDate || 'Start'}</span>
                  <ChevronRight className="w-3 h-3 opacity-30 text-cyan-400" />
                  <span>To {endDate || 'Today'}</span>
                </div>
              </div>
              <button 
                onClick={() => setShowDateRangeReport(false)}
                className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                title="Close Report"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-8">
              {Object.entries(groupedRecords).length === 0 ? (
                <div className="py-20 text-center">
                  <AlertCircle className="w-8 h-8 text-white/10 mx-auto mb-4" />
                  <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/20">No records found for this range</p>
                </div>
              ) : (
                Object.entries(groupedRecords).map(([plate, plateRecords]) => {
                  // Group by service type for this plate
                  const serviceGroups: Record<string, string[]> = {};
                  plateRecords.forEach(r => {
                    const desc = r.service_description.toLowerCase().trim();
                    if (!serviceGroups[desc]) serviceGroups[desc] = [];
                    serviceGroups[desc].push(r.service_date);
                  });

                  return (
                    <div key={plate} className="space-y-6">
                      <div className="flex items-baseline gap-3 border-b border-white/5 pb-2">
                        <h3 className="text-2xl font-display font-bold text-white tracking-tight uppercase">{plate}</h3>
                        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                          {plateRecords.length} {plateRecords.length === 1 ? 'Entry' : 'Entries'}
                        </span>
                      </div>

                      <div className="space-y-6 pl-4">
                        {Object.entries(serviceGroups).map(([service, dates]) => (
                          <div key={service} className="space-y-3">
                            <p className="text-sm font-display font-medium text-white/80 leading-relaxed">
                              Has <span className="text-purple-400 font-bold">{dates.length}</span> {dates.length === 1 ? 'record' : 'records'} for <span className="text-emerald-400 font-bold uppercase tracking-wide">{service}</span>
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime()).map((date, i) => (
                                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border border-white/5 rounded-lg">
                                  <div className="w-1 h-1 rounded-full bg-purple-500/50" />
                                  <span className="text-[10px] font-mono text-white/60 font-bold">{date}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-6 border-t border-white/5 bg-white/[0.01] flex justify-between items-center">
              <div className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em]">
                Generated {new Date().toLocaleDateString()}
              </div>
              <button 
                onClick={() => {
                  const reportText = Object.entries(groupedRecords).map(([plate, plateRecords]) => {
                    const serviceGroups: Record<string, string[]> = {};
                    plateRecords.forEach(r => {
                      const desc = r.service_description.toLowerCase().trim();
                      if (!serviceGroups[desc]) serviceGroups[desc] = [];
                      serviceGroups[desc].push(r.service_date);
                    });

                    let plateText = `\n${plate}\nHas ${plateRecords.length} records\n`;
                    Object.entries(serviceGroups).forEach(([service, dates]) => {
                      plateText += `\nFor ${service.toUpperCase()}:\n`;
                      dates.forEach(d => plateText += `* ${d}\n`);
                    });
                    return plateText;
                  }).join('\n---\n');

                  const fullText = `DT.Base Summary Report\nFrom: ${startDate || 'Start'} To: ${endDate || 'Today'}\n${reportText}`;
                  
                  if (navigator.share) {
                    navigator.share({ title: 'DT.Base Summary Report', text: fullText });
                  } else {
                    navigator.clipboard.writeText(fullText);
                    alert("Report copied to clipboard!");
                  }
                }}
                className="flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-gray-200 transition-all active:scale-95 rounded-xl"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em]">Share Report</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Stats */}
      <footer className="mt-8 flex flex-col gap-8 font-display font-bold text-[10px] uppercase tracking-[0.2em] opacity-40">
        <div className="flex justify-center items-center">
          <div className="flex items-center gap-4">
            {isCloudConnected === false && (
              <button 
                onClick={() => window.location.reload()}
                className="text-purple-400 hover:text-purple-300 transition-colors text-[10px] font-display font-bold uppercase tracking-widest"
                title="Retry connecting to the cloud database"
              >
                Retry Connection
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Market Prices Modal */}
      <AnimatePresence>
        {showMarketPricesModal && (
          <div 
            className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 backdrop-blur-md overflow-y-auto"
            onClick={() => setShowMarketPricesModal(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="glassmorphism neon-border-violet w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] rounded-3xl my-auto"
            >
              <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-white/5 shimmer-ai">
                <div className="flex items-center gap-3 relative z-10">
                  <div className="p-2 bg-amber-500/20 rounded-lg border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                    <Tag className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-display font-bold text-white uppercase tracking-widest">Market Price Reference</h2>
                    <p className="text-[10px] text-cyan-400/60 font-mono uppercase">Tracked Costs for Parts & Services</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowMarketPricesModal(false)}
                  className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                  title="Close Market Database"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {marketPrices.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-white/10">
                    <Coins className="w-8 h-8 text-white/10 mx-auto mb-3" />
                    <p className="text-xs text-white/40 font-mono uppercase tracking-widest">No market prices tracked yet.</p>
                    <p className="text-[10px] text-white/20 font-mono mt-2 px-8">
                      The AI automatically tracks prices from your logs and chat corrections.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {marketPrices.map((price) => (
                      <div key={price.id} className="p-3 glassmorphism border neon-border-violet/20 flex items-center justify-between group hover:neon-border-violet transition-all rounded-xl">
                        <div className="flex flex-col">
                          <span className="text-xs font-display font-bold text-white uppercase tracking-wider">{price.item_name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-white/40 font-mono uppercase">Last Updated: {new Date(price.last_updated).toLocaleDateString()}</span>
                            <span className="text-[9px] text-violet-400/60 font-mono uppercase">By: {price.confirmed_by}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-mono font-bold text-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.3)]">{price.currency} {price.price.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-[10px] font-display font-bold text-amber-500 uppercase tracking-widest">How it works</p>
                      <p className="text-[9px] text-white/60 leading-relaxed">
                        The AI scans your logs for costs and saves them here. You can also correct prices in the AI Chat (e.g., "The price of Caltex Ultra is 5000") to update this database.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
                <button 
                  onClick={() => setShowMarketPricesModal(false)}
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white font-display font-bold uppercase tracking-widest text-[10px] transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 backdrop-blur-md overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md glassmorphism p-6 sm:p-8 relative rounded-3xl my-auto neon-border-violet"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500 rounded-t-3xl" />
              
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-display font-black tracking-tighter italic mb-1 text-white">SETTINGS</h2>
                  <p className="text-[10px] text-violet-400/60 font-mono uppercase tracking-[0.2em]">Application Configuration & Tools</p>
                </div>
                <button 
                  onClick={() => setShowSettingsModal(false)}
                  className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                  title="Close Settings"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-10">
                {/* Section: Overview */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-3 bg-purple-500 rounded-full" />
                    <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-white/40">System Overview</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {/* Database Stats */}
                    <div className="p-6 bg-gradient-to-br from-violet-500/10 to-transparent border border-violet-500/20 rounded-3xl flex items-center justify-between group hover:from-violet-500/15 transition-all shadow-xl shadow-violet-900/10 neon-glow-violet">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-violet-400 mb-1">Fleet Database</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-display font-bold text-white tracking-tighter">{totalCount !== null ? totalCount : records.length}</span>
                          <span className="text-xs font-display font-bold text-white/30 uppercase tracking-widest">Records</span>
                        </div>
                      </div>
                      <div className="p-4 bg-violet-500/20 rounded-2xl border border-violet-500/30 shadow-inner">
                        <Database className="w-7 h-7 text-violet-400" />
                      </div>
                    </div>

                    {/* User Info */}
                    {user && (
                      <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between group hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-white/20 transition-all">
                            <UserIcon className="w-6 h-6 text-white/30" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/30 mb-0.5">Operator</span>
                            <span className="text-xs font-mono text-white/90 truncate max-w-[160px]">{user.email}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            logout();
                            setShowSettingsModal(false);
                          }}
                          className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 hover:border-red-500/40 transition-all rounded-xl shadow-lg shadow-red-900/20"
                          title="Logout"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section: Connectivity */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-3 bg-blue-500 rounded-full" />
                    <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-white/40">Connectivity</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 glassmorphism rounded-2xl flex flex-col gap-4 group hover:bg-white/[0.06] transition-all neon-border-violet/20">
                      <div className="flex items-center justify-between">
                        <Smartphone className="w-4 h-4 text-violet-400/40" />
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse shadow-[0_0_8px_rgba(160,32,240,0.8)]" />
                      </div>
                      <div>
                        <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-white/30 block mb-1">PWA Status</span>
                        <span className="text-[10px] font-mono text-violet-400 font-bold uppercase tracking-widest">{pwaStatus}</span>
                      </div>
                    </div>
                    <div className="p-4 glassmorphism rounded-2xl flex flex-col gap-4 group hover:bg-white/[0.06] transition-all neon-border-cyan/20">
                      <div className="flex items-center justify-between">
                        <Cloud className={cn(
                          "w-4 h-4",
                          isCloudConnected ? "text-cyan-400" : "text-red-500"
                        )} />
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isCloudConnected ? "bg-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.8)]" : "bg-red-500"
                        )} />
                      </div>
                      <div>
                        <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-white/30 block mb-1">Cloud Sync</span>
                        <span className={cn(
                          "text-[10px] font-mono uppercase tracking-widest font-bold",
                          isCloudConnected ? "text-cyan-400" : "text-red-500/80"
                        )}>
                          {isCloudConnected ? "Connected" : "Offline"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Tools */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                    <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-white/40">Fleet Tools</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button 
                      onClick={() => {
                        setShowUsageModal(true);
                        setShowSettingsModal(false);
                      }}
                      className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-green-500/10 rounded-xl border border-green-500/20 group-hover:bg-green-500/20 transition-all">
                          <Zap className="w-4 h-4 text-green-500" />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Usage Statistics</span>
                          <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Quota & Performance</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                    </button>

                    <button 
                      onClick={() => {
                        setShowMarketPricesModal(true);
                        setShowSettingsModal(false);
                      }}
                      className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 group-hover:bg-amber-500/20 transition-all">
                          <Tag className="w-4 h-4 text-amber-500" />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Market Database</span>
                          <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Price Reference Logs</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                    </button>

                    <button 
                      onClick={handleExportData}
                      disabled={records.length === 0}
                      className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 transition-all group disabled:opacity-50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/20 group-hover:bg-purple-500/20 transition-all">
                          <Download className="w-4 h-4 text-purple-400" />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Export Fleet Data</span>
                          <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Download CSV Report</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                    </button>

                    <button 
                      onClick={() => {
                        fetchRecords();
                        setShowSettingsModal(false);
                      }}
                      disabled={isRefreshing}
                      className="w-full p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center justify-between hover:bg-white/[0.08] hover:border-white/20 transition-all group disabled:opacity-50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 group-hover:bg-blue-500/20 transition-all">
                          <RefreshCw className={cn("w-4 h-4 text-blue-400", isRefreshing && "animate-spin")} />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/80">Force Cloud Sync</span>
                          <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Manual Data Refresh</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  </div>
                </div>

                {/* Section: Advanced */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-3 bg-amber-500 rounded-full" />
                    <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-amber-500/40">Restricted</p>
                  </div>
                  {!isServiceUnlocked ? (
                    <button 
                      onClick={() => {
                        setShowServicePasswordPrompt(true);
                        setShowSettingsModal(false);
                      }}
                      className="w-full p-5 bg-amber-500/[0.03] border border-amber-500/20 rounded-3xl flex items-center justify-between hover:bg-amber-500/[0.08] hover:border-amber-500/40 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                          <Key className="w-5 h-5 text-amber-500" />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-amber-500/90">Unlock Advanced Services</span>
                          <span className="text-[8px] font-mono text-amber-500/40 uppercase tracking-widest">Master Access Required</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-amber-500/40 group-hover:text-amber-500/60 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  ) : (
                    <button 
                      onClick={() => setIsServiceUnlocked(false)}
                      className="w-full p-5 bg-green-500/[0.03] border border-green-500/20 rounded-3xl flex items-center justify-between hover:bg-green-500/[0.08] hover:border-green-500/40 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-500/10 rounded-2xl border border-green-500/20">
                          <Key className="w-5 h-5 text-green-500" />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-green-500/90">Advanced Services Active</span>
                          <span className="text-[8px] font-mono text-green-500/40 uppercase tracking-widest">Tap to Relock System</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-mono text-green-500/60 font-bold uppercase tracking-widest">UNLOCKED</span>
                      </div>
                    </button>
                  )}
                </div>

                {/* Section: Danger Zone */}
                {records.length > 0 && (
                  <div className="space-y-4 pt-6 border-t border-white/5">
                    <div className="flex items-center gap-2 px-1">
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                      <p className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-red-500/60">Danger Zone</p>
                    </div>
                    
                    {!showPasswordPrompt ? (
                      <button 
                        onClick={() => {
                          setShowPasswordPrompt(true);
                          setDangerAction('clearDuplicates');
                        }}
                        className="w-full p-4 bg-red-500/[0.02] border border-red-500/10 rounded-2xl flex items-center justify-between hover:bg-red-500/[0.06] hover:border-red-500/30 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/20">
                            <ListFilter className="w-4 h-4 text-red-500" />
                          </div>
                          <div className="flex flex-col items-start">
                            <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-red-400/80">Clear Duplicates</span>
                            <span className="text-[8px] font-mono text-red-500/30 uppercase tracking-widest">Permanent Data Cleanup</span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-red-500/20 group-hover:text-red-500/40 group-hover:translate-x-0.5 transition-all" />
                      </button>
                    ) : (
                      <div className="p-5 bg-red-500/[0.03] border border-red-500/20 rounded-3xl space-y-5 shadow-2xl shadow-red-900/10">
                        <div className="relative">
                          <input 
                            type="password"
                            placeholder="ENTER MASTER PASSWORD..."
                            className={cn(
                              "w-full bg-black/60 border p-4 font-mono text-xs focus:outline-none text-white rounded-2xl placeholder:text-white/10 transition-all",
                              passwordError ? "border-red-500" : "border-white/10 focus:border-red-500/50"
                            )}
                            value={passwordInput}
                            onChange={(e) => {
                              setPasswordInput(e.target.value);
                              setPasswordError(false);
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && handleClearDuplicates()}
                            autoFocus
                          />
                          <button 
                            onClick={() => {
                              setShowPasswordPrompt(false);
                              setPasswordInput('');
                              setPasswordError(false);
                            }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white p-1.5 bg-white/5 rounded-full transition-all"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {passwordError && <p className="text-[8px] text-red-400 font-display font-bold uppercase tracking-widest text-center">Incorrect Password</p>}
                        <button 
                          onClick={handleClearDuplicates}
                          className="w-full bg-red-600 hover:bg-red-500 text-white py-4 text-[11px] font-display font-black uppercase tracking-[0.3em] transition-all rounded-2xl shadow-xl shadow-red-900/40 active:scale-[0.98]"
                        >
                          Confirm Data Wipe
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 flex justify-center">
                <p className="text-[8px] text-white/20 font-mono uppercase tracking-[0.3em]">DT.Base v2.4.0 • Secure Fleet Management</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Usage Stats Modal */}
      {showUsageModal && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-md glassmorphism neon-border-violet p-6 sm:p-8 relative rounded-3xl my-auto">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500 rounded-t-3xl" />
            
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-2xl font-display font-black tracking-tighter italic mb-1 text-white">USAGE DASHBOARD</h2>
                <p className="text-[10px] text-violet-400/60 font-mono uppercase tracking-[0.2em]">Session Monitoring & Quota Estimates</p>
              </div>
              <button 
                onClick={() => setShowUsageModal(false)}
                className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                title="Close Dashboard"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Reads */}
              <div className="p-4 glassmorphism border neon-border-cyan/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60">Reads (Session)</span>
                  <span className="text-xl font-mono font-bold text-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.3)]">{sessionStats.reads.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 transition-all duration-500 shadow-[0_0_8px_rgba(0,245,255,0.8)]" 
                    style={{ width: `${Math.min((sessionStats.reads / 50000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: 50,000</p>
              </div>

              {/* Writes */}
              <div className="p-4 glassmorphism border neon-border-violet/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60">Writes (Session)</span>
                  <span className="text-xl font-mono font-bold text-violet-400 shadow-[0_0_8px_rgba(160,32,240,0.3)]">{sessionStats.writes.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-violet-500 transition-all duration-500 shadow-[0_0_8px_rgba(160,32,240,0.8)]" 
                    style={{ width: `${Math.min((sessionStats.writes / 20000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: 20,000</p>
              </div>

              {/* Deletes */}
              <div className="p-4 glassmorphism border neon-border-violet/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60">Deletes (Session)</span>
                  <span className="text-xl font-mono font-bold text-violet-400 shadow-[0_0_8px_rgba(160,32,240,0.3)]">{sessionStats.deletes.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-violet-500 transition-all duration-500 shadow-[0_0_8px_rgba(160,32,240,0.8)]" 
                    style={{ width: `${Math.min((sessionStats.deletes / 20000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: 20,000</p>
              </div>

              {/* AI Extractions */}
              <div className="p-4 glassmorphism border neon-border-cyan/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-cyan-400 shadow-[0_0_8px_rgba(0,245,255,0.3)]">AI Extractions (Session)</span>
                  <span className="text-xl font-mono font-bold text-white">{usageStats.extractions.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 transition-all duration-500 shadow-[0_0_8px_rgba(0,245,255,0.8)]" 
                    style={{ width: `${Math.min((usageStats.extractions / 1500) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: ~1,500 (Free Tier)</p>
              </div>

              {/* AI Searches */}
              <div className="p-4 glassmorphism border neon-border-violet/20 rounded-xl">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-violet-400 shadow-[0_0_8px_rgba(160,32,240,0.3)]">AI Searches (Session)</span>
                  <span className="text-xl font-mono font-bold text-white">{usageStats.searches.toLocaleString()}</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-violet-500 transition-all duration-500 shadow-[0_0_8px_rgba(160,32,240,0.8)]" 
                    style={{ width: `${Math.min((usageStats.searches / 1500) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-white/30 mt-2 font-mono uppercase tracking-widest">Daily Limit: ~1,500 (Free Tier)</p>
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
                onClick={() => {
                  setSessionStats({ reads: 0, writes: 0, deletes: 0 });
                  setUsageStats({ extractions: 0, searches: 0 });
                }}
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
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-md glassmorphism neon-border-violet p-6 sm:p-8 relative rounded-3xl my-auto">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-500 via-cyan-500 to-violet-500 rounded-t-3xl" />
            
            <div className="flex items-start justify-between mb-8">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Plus className="w-5 h-5 text-violet-400" />
                  <h2 className="text-2xl font-display font-black tracking-tighter italic uppercase text-white">Manual Entry</h2>
                </div>
                <p className="text-[10px] text-violet-400/60 font-mono uppercase tracking-[0.2em] truncate max-w-[200px]">
                  File: {manualEntryData.fileName}
                </p>
              </div>
              <button 
                onClick={() => setManualEntryData(null)}
                className="p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white"
                title="Close Manual Entry"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Plate Number</label>
                <input 
                  type="text"
                  value={manualEntryData.plateNumber}
                  onChange={(e) => setManualEntryData({ ...manualEntryData, plateNumber: e.target.value.toUpperCase() })}
                  className="w-full bg-black/40 border neon-border-violet p-4 rounded-xl font-display font-bold text-lg focus:outline-none transition-all placeholder:text-white/10"
                  placeholder="E.G. ABC-1234"
                />
              </div>

              <div>
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Service Date</label>
                <input 
                  type="date"
                  value={manualEntryData.date}
                  onChange={(e) => setManualEntryData({ ...manualEntryData, date: e.target.value })}
                  className="w-full bg-black/40 border neon-border-violet p-4 rounded-xl font-display font-bold text-lg focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/60 block mb-2">Service Description</label>
                <textarea 
                  value={manualEntryData.service}
                  onChange={(e) => setManualEntryData({ ...manualEntryData, service: e.target.value })}
                  className="w-full bg-black/40 border neon-border-violet p-4 rounded-xl font-display font-bold text-base focus:outline-none transition-all min-h-[100px] placeholder:text-white/10"
                  placeholder="E.G. Oil Change - 15000 KES, Tire Rotation - 5000 KES..."
                />
              </div>

              <button 
                onClick={handleManualAdd}
                disabled={isProcessing}
                className="w-full py-5 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 disabled:opacity-50 text-white font-display font-black uppercase tracking-[0.3em] rounded-2xl transition-all shadow-[0_0_20px_rgba(0,245,255,0.3)] flex items-center justify-center gap-3"
                title="Save this manual entry to the database"
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
      
      {/* AI Chat Assistant */}
      {user && records.length > 0 && (
        <AIChatAssistant 
          records={records} 
          marketPrices={marketPrices}
          onSaveMarketPrice={handleSaveMarketPrice}
          isLocked={!isServiceUnlocked}
          onUnlockRequest={() => setShowServicePasswordPrompt(true)}
        />
      )}
      
      {/* Floating Action Hub */}
      <div className="fixed bottom-6 right-24 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {isFabOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              className="flex flex-col items-end gap-3 mb-2"
            >
              {/* Manual Entry Solution */}
              <motion.button
                whileHover={{ scale: 1.05, x: -5 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setManualEntryData({
                    fileName: 'Manual Entry',
                    plateNumber: '',
                    date: new Date().toISOString().split('T')[0],
                    service: ''
                  });
                  setIsFabOpen(false);
                }}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900/90 backdrop-blur-md text-white rounded-2xl shadow-xl border border-white/10 hover:neon-border-violet transition-all group"
              >
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/40 group-hover:text-violet-400 transition-colors">Manual Entry</span>
                <div className="p-2 bg-violet-500/20 rounded-xl border border-violet-500/30">
                  <Plus className="w-4 h-4 text-violet-400" />
                </div>
              </motion.button>

              {/* AI Scan Solution */}
              <motion.label
                whileHover={{ scale: 1.05, x: -5 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-3 px-4 py-3 bg-zinc-900/90 backdrop-blur-md text-white rounded-2xl shadow-xl border border-white/10 hover:neon-border-cyan transition-all group cursor-pointer"
              >
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-white/40 group-hover:text-cyan-400 transition-colors">AI Fleet Scan</span>
                <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-500/30">
                  <Zap className="w-4 h-4 text-cyan-400" />
                </div>
                <input 
                  type="file" 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    handleFileUpload(e);
                    setIsFabOpen(false);
                  }}
                  disabled={isProcessing || !user}
                />
              </motion.label>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (!isServiceUnlocked) {
              setShowServicePasswordPrompt(true);
            } else {
              setIsFabOpen(!isFabOpen);
            }
          }}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,245,255,0.4)] transition-all border relative overflow-hidden group",
            isFabOpen ? "bg-zinc-800 text-white border-white/20" : "bg-gradient-to-br from-cyan-500 to-violet-600 text-white border-cyan-400/50"
          )}
        >
          <AnimatePresence mode="wait">
            {isFabOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
              >
                <X className="w-6 h-6" />
              </motion.div>
            ) : (
              <motion.div
                key="plus"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                className="flex items-center justify-center"
              >
                {isProcessing ? (
                  <div className="relative flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin opacity-20" />
                    <span className="absolute text-[8px] font-bold">{progress.current}</span>
                  </div>
                ) : (
                  <Plus className="w-6 h-6" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Tooltip on hover (Desktop) */}
          {!isFabOpen && (
            <div className="absolute right-full mr-4 px-3 py-1.5 bg-zinc-900 border border-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              <span className="text-[10px] font-display font-bold uppercase tracking-widest text-white/60">Add to Fleet</span>
            </div>
          )}
        </motion.button>
      </div>

      {/* Service Password Modal */}
      <AnimatePresence>
        {showServicePasswordPrompt && (
          <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/95 backdrop-blur-md overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md glassmorphism neon-border-violet p-6 sm:p-8 rounded-3xl shadow-2xl relative my-auto"
            >
              <button 
                onClick={() => {
                  setShowServicePasswordPrompt(false);
                  setServicePasswordInput('');
                  setServicePasswordError(false);
                }}
                className="absolute top-4 right-4 p-2 bg-white/5 border border-white/10 hover:bg-white/20 rounded-full transition-all text-white/60 hover:text-white z-10"
                title="Close Unlock Modal"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_15px_rgba(160,32,240,0.3)]">
                  <Key className="w-8 h-8 text-violet-400" />
                </div>
                <h3 className="text-xl font-display font-bold text-white uppercase tracking-wider mb-2">Unlock Services</h3>
                <p className="text-xs text-violet-400/60 font-mono uppercase tracking-widest">
                  Enter the master password to continue using AI and advanced features.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-display font-bold text-violet-400/40 uppercase tracking-widest ml-1">Password</label>
                  <input 
                    type="password"
                    value={servicePasswordInput}
                    onChange={(e) => {
                      setServicePasswordInput(e.target.value);
                      setServicePasswordError(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlockService()}
                    className={cn(
                      "w-full bg-black/40 border p-4 rounded-xl text-white font-mono focus:outline-none transition-all",
                      servicePasswordError ? "border-red-500" : "neon-border-violet"
                    )}
                    placeholder="••••••••"
                    autoFocus
                  />
                  {servicePasswordError && (
                    <p className="text-[10px] text-red-400 font-display font-bold uppercase tracking-widest text-center mt-2">
                      Incorrect Password
                    </p>
                  )}
                </div>

                <button 
                  onClick={handleUnlockService}
                  className="w-full py-4 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-display font-black uppercase tracking-[0.3em] rounded-2xl transition-all shadow-[0_0_20px_rgba(0,245,255,0.3)] active:scale-[0.98]"
                >
                  Unlock Now
                </button>

                <div className="pt-4 border-t border-white/5 flex flex-col gap-2">
                  <div className="flex justify-between text-[9px] font-mono uppercase tracking-tighter">
                    <span className="text-white/30">Uploads:</span>
                    <span className="text-red-400">Locked</span>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono uppercase tracking-tighter">
                    <span className="text-white/30">Searches:</span>
                    <span className={cn(usageStats.searches >= 15 ? "text-red-400" : "text-white/60")}>
                      {usageStats.searches} / 15
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono uppercase tracking-tighter">
                    <span className="text-white/30">AI Access:</span>
                    <span className="text-red-400">Locked</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );
}
