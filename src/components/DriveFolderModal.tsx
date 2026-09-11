import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  FolderOpen, 
  ExternalLink, 
  Search, 
  Check, 
  Image as ImageIcon, 
  Calendar, 
  Sparkles,
  UploadCloud,
  Loader2,
  AlertCircle,
  LogIn,
  LogOut,
  User,
  CheckCircle2,
  RefreshCw,
  Plus
} from 'lucide-react';
import { GOOGLE_DRIVE_PHOTOS, GOOGLE_DRIVE_FOLDER_URL, GOOGLE_DRIVE_FOLDER_ID, DriveFolderFile } from '../data/googleDriveFolderData';
import { uploadImageToGoogleDrive, fetchGoogleDriveFolderFiles } from '../utils/driveUploader';
import { googleSignIn, googleSignOut, initAuth, getAccessToken } from '../utils/googleAuth';
import { formatBytes } from '../utils/imageCompressor';
import { User as FirebaseUser } from 'firebase/auth';

interface DriveFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMealName?: string;
  targetMealId?: string;
  onSelectPhoto: (file: DriveFolderFile) => void;
}

export const DriveFolderModal: React.FC<DriveFolderModalProps> = ({
  isOpen,
  onClose,
  targetMealName,
  targetMealId,
  onSelectPhoto,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'gallery' | 'upload'>('gallery');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<DriveFolderFile | null>(null);
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, boolean>>({});
  
  // Dynamic drive photos list (initialized with static catalogue + dynamically updated)
  const [photosList, setPhotosList] = useState<DriveFolderFile[]>(GOOGLE_DRIVE_PHOTOS);

  // Auth state
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [customMealId, setCustomMealId] = useState(targetMealId || 'M-027');
  const [customMealName, setCustomMealName] = useState(targetMealName || '');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setHasToken(!!token);
      },
      () => {
        setCurrentUser(null);
        setHasToken(false);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Update target meal defaults when prop changes
  useEffect(() => {
    if (targetMealId) setCustomMealId(targetMealId);
    if (targetMealName) setCustomMealName(targetMealName);
  }, [targetMealId, targetMealName]);

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setHasToken(true);
        // Refresh photos from Google Drive directly
        loadDriveFiles();
      }
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('popup-closed-by-user')
      ) {
        return;
      }
      console.warn('Sign in failed:', err);
      setAuthError(err.message || 'Failed to authorize Google Drive');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    await googleSignOut();
    setCurrentUser(null);
    setHasToken(false);
  };

  const loadDriveFiles = async () => {
    try {
      const liveFiles = await fetchGoogleDriveFolderFiles();
      if (liveFiles && liveFiles.length > 0) {
        // Merge with existing avoiding duplicates
        setPhotosList((prev) => {
          const ids = new Set(liveFiles.map((f) => f.id));
          const existingRemaining = prev.filter((p) => !ids.has(p.id));
          return [...liveFiles, ...existingRemaining];
        });
      }
    } catch (err) {
      console.warn('Could not refresh drive files:', err);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (JPEG, PNG, WEBP, etc.)');
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(null);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUploadToDrive = async () => {
    if (!selectedFile) return;

    if (!hasToken) {
      // Prompt sign in first
      try {
        await handleSignIn();
      } catch {
        return;
      }
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const safeMealPart = (customMealName || selectedFile.name.replace(/\.[^/.]+$/, "")).replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateTag = new Date().toISOString().slice(0, 10);
      const generatedName = `${customMealId || 'Meal'}_${safeMealPart}_${dateTag}.jpg`;

      const result = await uploadImageToGoogleDrive(selectedFile, {
        customFileName: generatedName,
        mealId: customMealId || undefined,
        dateStr: new Date().toLocaleDateString('en-GB'),
        description: `Meal photo for ${customMealName || customMealId} uploaded directly to Google Drive`,
      });

      const compNote = result.wasCompressed
        ? ` (Compressed ${formatBytes(result.originalSizeBytes)} → ${formatBytes(result.uploadedSizeBytes)} < 200 KB)`
        : ` (${formatBytes(result.uploadedSizeBytes)})`;
      setUploadSuccess(`Successfully uploaded "${result.fileName}" to Google Drive${compNote}!`);
      
      // Prepend to photos list
      setPhotosList((prev) => [result.driveFile, ...prev]);
      setSelectedPhoto(result.driveFile);

      // Auto-attach to caller
      onSelectPhoto(result.driveFile);

      // Reset form
      setTimeout(() => {
        setActiveSubTab('gallery');
        setSelectedFile(null);
        setPreviewUrl(null);
      }, 1500);

    } catch (err: any) {
      console.warn('Upload error:', err);
      setUploadError(err.message || 'Failed to upload photo to Google Drive');
    } finally {
      setIsUploading(false);
    }
  };

  const filteredPhotos = useMemo(() => {
    if (!searchQuery.trim()) return photosList;
    const query = searchQuery.toLowerCase();
    return photosList.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.mealId && p.mealId.toLowerCase().includes(query)) ||
        (p.dateStr && p.dateStr.includes(query))
    );
  }, [photosList, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-0 sm:p-6 animate-fade-in">
      <div className="bg-slate-900 border-0 sm:border border-slate-700/80 rounded-none sm:rounded-2xl max-w-4xl w-full h-full sm:h-auto sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white font-heading">
                  Google Drive Meal Photos
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {photosList.length} Photos Connected
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Folder: <code className="text-blue-300 text-[11px] bg-slate-800 px-1 py-0.5 rounded">{GOOGLE_DRIVE_FOLDER_ID}</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Google Auth Status / Login Button */}
            {currentUser ? (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-2.5 py-1.5 rounded-xl">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                  ✓
                </div>
                <span className="text-xs font-semibold text-slate-200 hidden sm:inline max-w-[140px] truncate">
                  {currentUser.email || currentUser.displayName}
                </span>
                <button
                  onClick={handleSignOut}
                  title="Disconnect Google Account"
                  className="text-slate-400 hover:text-rose-400 text-xs p-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={isAuthenticating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md transition cursor-pointer"
              >
                {isAuthenticating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogIn className="w-3.5 h-3.5" />
                )}
                <span>Connect Google Drive</span>
              </button>
            )}

            <a
              href={GOOGLE_DRIVE_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Drive Folder</span>
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-sm transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs (Browse Gallery vs Direct Upload) */}
        <div className="bg-slate-950/80 border-b border-slate-800/80 px-4 sm:px-5 flex items-center justify-between">
          <div className="flex items-center gap-2 py-2">
            <button
              onClick={() => setActiveSubTab('gallery')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeSubTab === 'gallery'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Drive Photo Gallery ({photosList.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('upload')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeSubTab === 'upload'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-bold">Upload Photo to Drive</span>
              <span className="px-1.5 py-0.2 bg-emerald-500/30 text-emerald-300 text-[10px] rounded-full font-bold">New</span>
            </button>
          </div>

          {currentUser && activeSubTab === 'gallery' && (
            <button
              onClick={loadDriveFiles}
              title="Refresh from Google Drive"
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-300 transition py-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Sync Drive</span>
            </button>
          )}
        </div>

        {/* SUBTAB 1: GALLERY VIEW */}
        {activeSubTab === 'gallery' && (
          <>
            {/* Search & Target Meal Banner */}
            <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by filename, meal ID (e.g. M-010, KFC, Quaker, Soto, Tongkol)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {targetMealName && (
                <div className="text-xs text-slate-300 bg-slate-800/80 border border-slate-700 px-3 py-2 rounded-xl flex items-center gap-2">
                  <span className="text-slate-400">Target Meal:</span>
                  <span className="text-emerald-400 font-bold truncate max-w-[180px]">{targetMealName}</span>
                </div>
              )}
            </div>

            {/* Photos Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {filteredPhotos.map((photo) => {
                  const isSelected = selectedPhoto?.id === photo.id;
                  const hasError = imageLoadErrors[photo.id];

                  return (
                    <div
                      key={photo.id}
                      onClick={() => setSelectedPhoto(photo)}
                      className={`group relative rounded-xl border overflow-hidden cursor-pointer transition-all duration-200 flex flex-col bg-slate-950/70 ${
                        isSelected
                          ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/10'
                          : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      {/* Image Thumbnail Container */}
                      <div className="relative aspect-square w-full bg-slate-900 overflow-hidden flex items-center justify-center">
                        {!hasError ? (
                          <img
                            src={photo.url}
                            alt={photo.name}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() => setImageLoadErrors((prev) => ({ ...prev, [photo.id]: true }))}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="p-3 text-center text-slate-500 flex flex-col items-center justify-center h-full">
                            <ImageIcon className="w-8 h-8 text-slate-600 mb-1" />
                            <span className="text-[10px] text-slate-400">Drive Photo</span>
                          </div>
                        )}

                        {/* Meal Badge */}
                        {photo.mealId && (
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 backdrop-blur-md text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                            {photo.mealId}
                          </span>
                        )}

                        {/* Date Badge */}
                        {photo.dateStr && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-slate-950/80 backdrop-blur-md text-[10px] text-slate-300">
                            {photo.dateStr}
                          </span>
                        )}

                        {isSelected && (
                          <div className="absolute inset-0 bg-blue-600/30 backdrop-blur-[1px] flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg">
                              <Check className="w-5 h-5" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Caption & Filename */}
                      <div className="p-2.5 flex flex-col justify-between flex-1">
                        <p className="text-[11px] font-medium text-slate-200 line-clamp-2 leading-snug" title={photo.name}>
                          {photo.name.replace(/_/g, ' ').replace(/\.jpg|\.png/gi, '')}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-900 text-[10px] text-slate-500">
                          <span>ID: {photo.id.substring(0, 6)}...</span>
                          <a
                            href={photo.directViewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-0.5"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredPhotos.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                  <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-300">No photos matching &quot;{searchQuery}&quot;</p>
                  <p className="text-xs text-slate-500 mt-1">Try searching for &quot;M-010&quot;, &quot;KFC&quot;, &quot;Oatmeal&quot;, &quot;Steak&quot;, or &quot;Coconut&quot;</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                {selectedPhoto ? (
                  <span className="text-slate-200 font-medium truncate max-w-xs sm:max-w-md inline-block">
                    Selected: <strong className="text-blue-400">{selectedPhoto.name}</strong>
                  </span>
                ) : (
                  <span>Click any photo to select and attach it to your meal</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={!selectedPhoto}
                  onClick={() => {
                    if (selectedPhoto) {
                      onSelectPhoto(selectedPhoto);
                      onClose();
                    }
                  }}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-blue-600/20 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Use This Photo</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* SUBTAB 2: DIRECT UPLOAD TO GOOGLE DRIVE */}
        {activeSubTab === 'upload' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-emerald-400" />
                <span>Direct Upload to Google Drive Folder</span>
              </h4>
              <p className="text-xs text-slate-300 mt-1">
                Upload any food photo or receipt directly into your shared Drive folder (<code>1bnF0AV0N1ua2kVDKsA5-PA1CQ-7Y4tPN</code>). It will automatically generate a direct CDN link and attach to your meal log.
              </p>
            </div>

            {/* Auth Notice if not logged in */}
            {!currentUser && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                    <LogIn className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white">Google Account Sign-In Required</h5>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Connect your Google Drive account with 1-click to upload files directly into the folder.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSignIn}
                  disabled={isAuthenticating}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shrink-0 cursor-pointer shadow-md"
                >
                  {isAuthenticating ? 'Connecting...' : 'Sign In with Google'}
                </button>
              </div>
            )}

            {/* Drag & Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[200px] ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              {previewUrl ? (
                <div className="flex flex-col items-center">
                  <img
                    src={previewUrl}
                    alt="Upload Preview"
                    className="max-h-48 rounded-xl object-contain shadow-lg border border-slate-800"
                  />
                  <p className="text-xs font-medium text-emerald-400 mt-3 flex items-center gap-1.5 flex-wrap justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Selected: {selectedFile?.name}</span>
                    {selectedFile && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-500/40 text-sky-300">
                        {formatBytes(selectedFile.size)} • Auto-compresses to &lt;200 KB
                      </span>
                    )}
                  </p>
                  <span className="text-[11px] text-slate-500 mt-1">Click or drag another image to replace</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mb-3 group-hover:scale-110 transition">
                    <UploadCloud className="w-6 h-6 text-emerald-400" />
                  </div>
                  <p className="text-sm font-bold text-white">Click or drag and drop photo here</p>
                  <p className="text-xs text-slate-400 mt-1">Supports JPEG, PNG, WEBP, Camera snap</p>
                </div>
              )}
            </div>

            {/* Metadata Fields for Organization */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Meal Identifier / Code</label>
                <input
                  type="text"
                  value={customMealId}
                  onChange={(e) => setCustomMealId(e.target.value)}
                  placeholder="e.g. M-027"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Meal / Food Description</label>
                <input
                  type="text"
                  value={customMealName}
                  onChange={(e) => setCustomMealName(e.target.value)}
                  placeholder="e.g. Steamed Salmon & Bok Choy"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Error or Success alerts */}
            {uploadError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{uploadError}</span>
              </div>
            )}

            {uploadSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            {/* Upload Action Button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setActiveSubTab('gallery');
                }}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Back to Gallery
              </button>

              <button
                type="button"
                disabled={!selectedFile || isUploading}
                onClick={handleUploadToDrive}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading to Drive...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload & Attach Photo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
