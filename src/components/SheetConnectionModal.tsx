import React, { useState } from 'react';
import { 
  X, 
  Sheet, 
  Link, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink,
  HelpCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { SheetConfig } from '../types';

interface SheetConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetConfig: SheetConfig;
  onSaveConfig: (url: string, autoSync: boolean, interval: number) => Promise<void>;
  onResetToDefault: () => void;
}

export const SheetConnectionModal: React.FC<SheetConnectionModalProps> = ({
  isOpen,
  onClose,
  sheetConfig,
  onSaveConfig,
  onResetToDefault,
}) => {
  const [urlInput, setUrlInput] = useState(sheetConfig.sheetUrl || '');
  const [autoSync, setAutoSync] = useState(sheetConfig.autoSync ?? true);
  const [interval, setInterval] = useState(sheetConfig.syncIntervalSeconds || 30);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      await onSaveConfig(urlInput.trim(), autoSync, interval);
      setFeedback({
        type: 'success',
        message: 'Successfully connected to Google Sheet! Live data updated.',
      });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to connect. Please ensure your Google Sheet is shared with "Anyone with the link can view".',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border-0 sm:border border-slate-700 rounded-none sm:rounded-2xl w-full h-full sm:h-auto sm:max-h-[90vh] max-w-xl p-6 shadow-2xl flex flex-col text-slate-100 relative">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Sheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Native Google Sheet Live Connection
              </h3>
              <p className="text-xs text-slate-400">
                Synchronize nutrition logs directly from your Google Spreadsheet
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-5 py-2">
        {/* Feedback alert */}
        {feedback && (
          <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            feedback.type === 'success' 
              ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300' 
              : 'bg-rose-950/60 border border-rose-500/40 text-rose-300'
          }`}>
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Google Sheet URL or Spreadsheet ID:
            </label>
            <div className="relative">
              <Link className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="sheet-url-input"
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Sync Settings */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Real-Time Background Polling
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
            </div>

            {autoSync && (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
                <span className="text-slate-400">Sync Interval:</span>
                <select
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value={15}>Every 15 Seconds (Rapid)</option>
                  <option value={30}>Every 30 Seconds (Recommended)</option>
                  <option value={60}>Every 1 Minute</option>
                  <option value={300}>Every 5 Minutes</option>
                </select>
              </div>
            )}
          </div>

          {/* Guide / How to Share */}
          <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-emerald-400">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>How Native Sheet Sync Works:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed">
              <li>Open your Google Sheet with the nutrition logs.</li>
              <li>You do <strong>not</strong> need to make the sheet public. Ensure you are signed in with the Google Account that has access to the sheet.</li>
              <li>Paste the URL above. The app will securely sync data using your authorized account!</li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setUrlInput('');
                onResetToDefault();
                setFeedback({ type: 'success', message: 'Restored preloaded initial clinical dataset.' });
              }}
              className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
            >
              Reset to Default Dataset
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="save-sheet-connect-btn"
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-slate-950 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                <span>{isSaving ? 'Connecting...' : 'Connect & Sync'}</span>
              </button>
            </div>
          </div>

        </form>
        </div>

      </div>
    </div>
  );
};
