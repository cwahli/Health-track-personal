import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  RefreshCw, 
  Sheet, 
  Sparkles, 
  Utensils, 
  LayoutDashboard,
  CalendarDays,
  FileSpreadsheet,
  BookOpen,
  FolderOpen,
  HeartPulse,
  LogOut,
  Loader2,
  Plus,
  Camera,
  Settings,
  X,
  RotateCcw, Download,
  User
} from 'lucide-react';
import { SheetConfig, NavigationTab } from '../types';
import { initAuth, googleSignIn, googleSignOut } from '../utils/googleAuth';
import { User as FirebaseUser } from 'firebase/auth';

interface HeaderProps {
  sheetConfig: SheetConfig;
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenConnectModal: () => void;
  onOpenMealSimulator: () => void;
  onOpenAskCoach: () => void;
  onOpenLogMeal: () => void;
  onOpenDriveModal?: () => void;
  onResyncSheetAttachments?: () => void;
  onManualRefresh: () => void;
  onDownloadDebug?: () => void;
  isRefreshing: boolean;
  lastSyncedText: string;
}

export const Header: React.FC<HeaderProps> = ({
  sheetConfig,
  activeTab,
  onSelectTab,
  onOpenConnectModal,
  onOpenMealSimulator,
  onOpenAskCoach,
  onOpenLogMeal,
  onOpenDriveModal,
  onResyncSheetAttachments,
  onManualRefresh,
  onDownloadDebug,
  isRefreshing,
  lastSyncedText,
}) => {
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => setGoogleUser(user),
      () => setGoogleUser(null)
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const res = await googleSignIn();
      if (res?.user) {
        setGoogleUser(res.user);
        // Automatically sync live data after successful sign in
        setTimeout(() => {
          onManualRefresh();
        }, 300);
      }
    } catch (err: any) {
      if (
        err?.code !== 'auth/popup-closed-by-user' &&
        err?.code !== 'auth/cancelled-popup-request' &&
        !err?.message?.includes('popup-closed-by-user')
      ) {
        console.warn('Sign-in error:', err);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await googleSignOut();
    setGoogleUser(null);
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Top App Bar */}
          <div className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-800/60">
            
            {/* Brand & App Identity */}
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => setShowSettingsModal(true)}
              title="Open Settings"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center shrink-0 group-hover:shadow-emerald-500/40 transition-shadow">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-white font-heading group-hover:text-emerald-300 transition-colors">
                    NutriHealth Sync
                  </h1>
                </div>
              </div>
            </div>

            {/* Action Controls & Navigation */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Quick Refresh / Sync Live Data Button (Triggers Google Sign In if not logged in) */}
              <button
                id="manual-sheet-refresh-btn"
                onClick={() => {
                  if (!googleUser) {
                    handleGoogleSignIn();
                  } else {
                    onManualRefresh();
                  }
                }}
                disabled={isRefreshing || isSigningIn}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer ${
                  isRefreshing || isSigningIn ? 'opacity-80' : ''
                }`}
                title={googleUser ? "Fetch Latest Spreadsheet Updates & Photos" : "Sign in to Google to sync live data"}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isSigningIn ? 'animate-spin text-emerald-400' : ''}`} />
                <span className="hidden sm:inline">
                  {isSigningIn ? 'Signing in...' : isRefreshing ? 'Syncing...' : 'Sync Live'}
                </span>
              </button>

              {/* Add Menu (Dropdown for Agents) */}
              <div className="relative" ref={addMenuRef}>
                <button
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="flex items-center justify-center p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition cursor-pointer"
                  title="Open AI Agents"
                >
                  <Plus className="w-5 h-5" />
                </button>
                {showAddMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-2 z-[99] animate-fade-in">
                    <button
                      onClick={() => { setShowAddMenu(false); onOpenLogMeal(); }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-700 text-sm text-slate-200 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Camera className="w-4 h-4 text-indigo-400" />
                      Log Meal
                    </button>
                    <button
                      onClick={() => { setShowAddMenu(false); onOpenMealSimulator(); }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-700 text-sm text-slate-200 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Utensils className="w-4 h-4 text-teal-400" />
                      Simulate Meal
                    </button>
                    <button
                      onClick={() => { setShowAddMenu(false); onOpenAskCoach(); }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-700 text-sm text-slate-200 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      AI Coach
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* View Navigation Tabs */}
          <nav className="flex items-center gap-1 py-2 overflow-x-auto no-scrollbar">
            <button
              id="tab-health-dashboard"
              onClick={() => onSelectTab('dashboard')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Health Dashboard</span>
            </button>
            <button
              id="tab-health-profile"
              onClick={() => onSelectTab('health')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'health'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
              <span>Health Profile & Labs</span>
            </button>
            <button
              id="tab-meal-log"
              onClick={() => onSelectTab('meal-log')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'meal-log'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Meal Log</span>
            </button>
            <button
              id="tab-daily-meal"
              onClick={() => onSelectTab('daily-meal')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'daily-meal'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Daily Meal</span>
            </button>
            <button
              id="tab-spreadsheet-grid"
              onClick={() => onSelectTab('spreadsheet')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'spreadsheet'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Spreadsheet Grid</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border-0 sm:border border-slate-700 rounded-none sm:rounded-2xl w-full h-full sm:h-auto sm:max-h-[90vh] max-w-lg shadow-2xl flex flex-col text-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-400" />
                Settings & Integrations
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Google Sheet Connection */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Sheet className="w-4 h-4 text-emerald-400" />
                  Google Sheet
                </h4>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-slate-200 font-medium">
                      {sheetConfig.sheetUrl ? 'Connected' : 'Not Connected'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {lastSyncedText || 'No sync data'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setShowSettingsModal(false);
                      onOpenConnectModal();
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Configure
                  </button>
                </div>
              </div>

              {/* Google Account & User Profile */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-400" />
                    User Account & Profile
                  </span>
                  {googleUser && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                      Active
                    </span>
                  )}
                </h4>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  {googleUser ? (
                    <div className="flex items-center gap-3 w-full">
                      {googleUser.photoURL ? (
                        <img
                          src={googleUser.photoURL}
                          alt={googleUser.displayName || 'Google User'}
                          className="w-10 h-10 rounded-full border-2 border-emerald-400"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 flex items-center justify-center font-bold text-sm">
                          {(googleUser.displayName || googleUser.email || 'C')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          {googleUser.displayName || 'C. Liu'}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{googleUser.email}</p>
                      </div>
                      <button
                        onClick={handleGoogleSignOut}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/20 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Sign out of Google"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div>
                        <p className="text-xs text-slate-300 font-medium">Not Signed In</p>
                        <p className="text-[11px] text-slate-400">Sign in to sync with live Google Sheet & Drive</p>
                      </div>
                      <button
                        onClick={handleGoogleSignIn}
                        disabled={isSigningIn}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-medium transition-all shadow-sm cursor-pointer disabled:opacity-60"
                      >
                        {isSigningIn ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                        ) : (
                          <svg className="w-4 h-4" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                          </svg>
                        )}
                        <span>Sign In</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Google Drive Connection */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-blue-400" />
                  Google Drive Photos
                </h4>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-4">
                  {onOpenDriveModal && (
                    <button
                      onClick={() => {
                        setShowSettingsModal(false);
                        onOpenDriveModal();
                      }}
                      className="w-full py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold transition-colors cursor-pointer flex justify-center items-center gap-2"
                    >
                      Browse Drive Folder
                    </button>
                  )}
                </div>
              </div>

              {/* Resync Sheet Attachments & Defaults */}
              {onResyncSheetAttachments && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-emerald-400" />
                    Meal Photos & Attachments
                  </h4>
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-200 font-medium">
                        Resync Sheet Attachments
                      </span>
                      <span className="text-xs text-slate-400">
                        Reload and sync all default meal photos from Google Sheet
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        onResyncSheetAttachments();
                        setShowSettingsModal(false);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Resync Now</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Developer Debug Tools */}
              {onDownloadDebug && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Settings className="w-4 h-4 text-purple-400" />
                    Developer Diagnostics
                  </h4>
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-200 font-medium">
                        Download Debug State
                      </span>
                      <span className="text-xs text-slate-400">
                        Export local storage and memory state to a JSON file for debugging
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        onDownloadDebug();
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
