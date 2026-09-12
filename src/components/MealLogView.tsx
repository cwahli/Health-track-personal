import React, { useState, useMemo, useRef } from 'react';
import { 
  Utensils, 
  Search, 
  Filter, 
  Plus, 
  Calendar, 
  Flame, 
  Heart, 
  Droplet, 
  Clock, 
  Info, 
  Tag, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  FileEdit,
  Edit3,
  Link2,
  Sparkles, 
  Image as ImageIcon, 
  ExternalLink, 
  Maximize2, 
  Link, 
  RotateCcw, 
  FileSpreadsheet, 
  UploadCloud, 
  FileImage, 
  Paperclip,
  Loader2,
  Check,
  FolderOpen,
  MessageSquare,
  X
} from 'lucide-react';
import { LoggedMeal, DayColumn, MealLogRow, MealModalSession } from '../types';
import { formatDriveImageUrl, isGoogleDriveUrl, getDriveDirectViewUrl, getMealPhotos, MealPhotoItem } from '../utils/driveImage';
import { formatMealTimeAgo } from '../utils/timeAgo';
import { DriveFolderModal } from './DriveFolderModal';
import { PhotoBrowserLightbox } from './PhotoBrowserLightbox';
import { GOOGLE_DRIVE_FOLDER_URL, GOOGLE_DRIVE_FOLDER_ID, DriveFolderFile } from '../data/googleDriveFolderData';
import { uploadImageToGoogleDrive } from '../utils/driveUploader';
import { googleSignIn, getAccessToken } from '../utils/googleAuth';
import { formatBytes } from '../utils/imageCompressor';

interface MealLogViewProps {
  meals: LoggedMeal[];
  activeSessions?: MealModalSession[];
  onOpenSession?: (id: string) => void;
  onCloseSession?: (id: string) => void;
  columns: DayColumn[];
  onAddMeal: (meal: Omit<LoggedMeal, 'id'>, sheetRows?: MealLogRow[]) => void;
  onDeleteMeal: (id: string) => void;
  onReviewMeal?: (meal: LoggedMeal) => void;
  isDeletingMealId?: string | null;
  onOpenMealSimulator?: () => void;
  onResetDefaultMeals?: () => void;
  onUpdateMealPhoto?: (id: string, imageUrl: string, driveFileName?: string) => void;
  onSetMealTopPhoto?: (
    meal: LoggedMeal,
    selectedPhoto: MealPhotoItem,
    newOrderedPhotos: MealPhotoItem[]
  ) => Promise<boolean | void> | boolean | void;
  onDeleteMealPhoto?: (
    meal: LoggedMeal,
    deletedPhoto: MealPhotoItem,
    newOrderedPhotos: MealPhotoItem[]
  ) => Promise<boolean | void> | boolean | void;
  orphanedPhotos?: DriveFolderFile[];
  onRecoverOrphan?: (photos: DriveFolderFile[]) => void;
  onDeleteOrphan?: (photos: DriveFolderFile[]) => void;
  onMergeOrphan?: (targetMeal: LoggedMeal, photos: DriveFolderFile[]) => void;
}

export const MealLogView: React.FC<MealLogViewProps> = ({
  meals,
  activeSessions = [],
  onOpenSession,
  onCloseSession,
  columns,
  onAddMeal,
  onDeleteMeal,
  onReviewMeal,
  isDeletingMealId,
  onOpenMealSimulator,
  onResetDefaultMeals,
  onUpdateMealPhoto,
  onSetMealTopPhoto,
  onDeleteMealPhoto,
  orphanedPhotos = [],
  onRecoverOrphan,
  onDeleteOrphan,
  onMergeOrphan,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Image Lightbox State (supports multiple photos & browsing)
  const [activeLightbox, setActiveLightbox] = useState<{ photos: MealPhotoItem[]; initialIndex: number; meal?: LoggedMeal } | null>(null);

  // Photo Attach / Link Modal State
  const [attachPhotoTarget, setAttachPhotoTarget] = useState<LoggedMeal | null>(null);
  const [isDriveFolderOpen, setIsDriveFolderOpen] = useState(false);
  const [driveFolderTargetMeal, setDriveFolderTargetMeal] = useState<LoggedMeal | null>(null);
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMealFileInputRef = useRef<HTMLInputElement>(null);

  // Upload Status States
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [pendingDriveFile, setPendingDriveFile] = useState<{ file: File; targetMealId?: string; isNewMealForm?: boolean } | null>(null);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  // Group Orphaned Photos
  const orphanGroups = useMemo(() => {
    const groups = new Map<string, { groupKey: string; mealId: string; dishName: string; photos: DriveFolderFile[] }>();
    orphanedPhotos.forEach(photo => {
      const mealIdMatch = photo.name.match(/(M-\d+|KFC-\d+|Obalab-\d+)/i);
      const mealId = photo.mealId || (mealIdMatch ? mealIdMatch[1].toUpperCase() : '');
      let dishName = photo.name.replace(/^(?:meal_)?(M-\d+|KFC-\d+|Obalab-\d+)[_ -]*/i, '');
      dishName = dishName.replace(/_\d{4}-\d{2}-\d{2}.*$/, '');
      dishName = dishName.replace(/_photo\d+.*$/i, '');
      dishName = dishName.replace(/\.[^/.]+$/, '');
      if (!dishName || dishName === 'photo') {
        dishName = mealId ? `Meal ${mealId}` : 'Meal Photo';
      }
      
      const groupKey = `${mealId}:::${dishName}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { groupKey, mealId, dishName, photos: [] });
      }
      groups.get(groupKey)!.photos.push(photo);
    });
    return Array.from(groups.values());
  }, [orphanedPhotos]);

  // Form State for Adding New Meal
  const [selectedNewMealFile, setSelectedNewMealFile] = useState<File | null>(null);
  const [newMealLocalPreview, setNewMealLocalPreview] = useState<string | null>(null);
  const [newMeal, setNewMeal] = useState({
    mealId: 'M-027',
    dayKey: 'today',
    dateStr: '08/09/2026',
    mealType: 'Breakfast' as LoggedMeal['mealType'],
    time: '08:00 AM',
    foodName: '',
    portion: '',
    imageUrl: '',
    driveFileName: '',
    calories: 350,
    protein: 20,
    carbs: 45,
    totalFat: 10,
    saturatedFat: 2.0,
    sodium: 300,
    addedSugars: 0,
    fiber: 6.0,
    potassium: 400,
    clinicalNote: '',
  });

  // Distinct dates across all meals for robust filtering
  const extraMealDates = useMemo(() => {
    const colKeys = new Set(columns.map(c => c.key));
    const colDates = new Set(columns.map(c => c.dateStr));
    const list: { key: string; label: string; dateStr: string }[] = [];

    meals.forEach((m) => {
      if (!colKeys.has(m.dayKey) && !colDates.has(m.dateStr)) {
        colKeys.add(m.dayKey);
        colDates.add(m.dateStr);
        list.push({
          key: m.dayKey,
          label: m.dateStr,
          dateStr: m.dateStr,
        });
      }
    });
    return list;
  }, [columns, meals]);

  // Filtered Meals
  const filteredMeals = useMemo(() => {
    return meals.filter((meal) => {
      const matchesSearch = 
        meal.foodName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        meal.portion.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (meal.mealId && meal.mealId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (meal.driveFileName && meal.driveFileName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (meal.clinicalNote && meal.clinicalNote.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesDay = 
        selectedDayFilter === 'all' || 
        meal.dayKey === selectedDayFilter || 
        meal.dateStr === selectedDayFilter;
      const matchesType = selectedTypeFilter === 'all' || meal.mealType === selectedTypeFilter;

      return matchesSearch && matchesDay && matchesType;
    });
  }, [meals, searchQuery, selectedDayFilter, selectedTypeFilter]);

  const handleCreateMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeal.foodName.trim()) return;

    let imageUrl = newMeal.imageUrl;
    let driveFileName = newMeal.driveFileName;

    // Check if there is an un-uploaded photo file selected
    const fileToUpload = (pendingDriveFile?.isNewMealForm ? pendingDriveFile.file : null) || selectedNewMealFile;

    if (fileToUpload && !imageUrl) {
      setIsUploadingDrive(true);
      setUploadErrorMsg(null);
      setUploadStatusMsg(`Authorizing and uploading "${fileToUpload.name}" to Google Drive Personal food folder...`);

      try {
        let token = await getAccessToken();
        if (!token) {
          setIsSigningInGoogle(true);
          const authResult = await googleSignIn();
          setIsSigningInGoogle(false);
          if (!authResult?.accessToken) {
            // User closed the popup or cancelled sign in; proceed with saving meal without Drive upload
            setIsUploadingDrive(false);
            setUploadStatusMsg(null);
            onAddMeal(newMeal);
            return;
          }
          token = authResult.accessToken;
        }

        const mealLabel = newMeal.mealId || 'Meal';

        const uploadRes = await uploadImageToGoogleDrive(fileToUpload, {
          mealId: mealLabel,
          dishName: newMeal.foodName || 'Meal',
          dateStr: newMeal.dateStr || new Date().toISOString().split('T')[0],
          imageIndex: 0,
          totalImages: 1,
          description: `Meal photo for ${mealLabel} (${newMeal.foodName}) uploaded directly into Google Drive Personal food folder`,
          onProgressStatus: (status) => setUploadStatusMsg(status),
        });

        imageUrl = uploadRes.thumbnailUrl || uploadRes.webViewLink;
        driveFileName = uploadRes.fileName;
        const compNote = uploadRes.wasCompressed 
          ? ` (Compressed ${formatBytes(uploadRes.originalSizeBytes)} → ${formatBytes(uploadRes.uploadedSizeBytes)} < 200 KB)` 
          : ` (${formatBytes(uploadRes.uploadedSizeBytes)})`;
        setUploadStatusMsg(`✅ Photo uploaded to Google Drive as "${uploadRes.fileName}"${compNote}!`);
      } catch (err: any) {
        setIsUploadingDrive(false);
        setIsSigningInGoogle(false);
        console.warn('Failed to upload meal photo to Google Drive:', err);
        setUploadErrorMsg(err.message || 'Failed to upload photo to Google Drive. Click Sign In to authorize or remove photo.');
        // Do not close modal so user can retry or sign in without losing inputs
        return;
      } finally {
        setIsUploadingDrive(false);
        setIsSigningInGoogle(false);
      }
    }

    const flags: string[] = [];
    if (newMeal.saturatedFat <= 2.0) flags.push('🟢 Low Sat Fat');
    else if (newMeal.saturatedFat > 6.0) flags.push('🔴 High Sat Fat');

    if (newMeal.sodium <= 200) flags.push('🟢 Low Sodium');
    else if (newMeal.sodium > 800) flags.push('⚠️ High Sodium');

    if (newMeal.fiber >= 5) flags.push('🟢 High Fiber');
    if (newMeal.addedSugars > 15) flags.push('⚠️ High Sugar');

    onAddMeal({
      ...newMeal,
      imageUrl,
      driveFileName,
      flags,
    });

    setIsAddModalOpen(false);
    setSelectedNewMealFile(null);
    setNewMealLocalPreview(null);
    setPendingDriveFile(null);
    setUploadStatusMsg(null);
    setUploadErrorMsg(null);
    setNewMeal({
      mealId: `M-${Math.floor(Math.random() * 900 + 100)}`,
      dayKey: 'today',
      dateStr: '08/09/2026',
      mealType: 'Breakfast',
      time: '08:00 AM',
      foodName: '',
      portion: '',
      imageUrl: '',
      driveFileName: '',
      calories: 350,
      protein: 20,
      carbs: 45,
      totalFat: 10,
      saturatedFat: 2.0,
      sodium: 300,
      addedSugars: 0,
      fiber: 6.0,
      potassium: 400,
      clinicalNote: '',
    });
  };

  // Execute upload after token verified
  const executeDriveUpload = async (file: File, targetMealId?: string, isNewMealForm: boolean = false) => {
    setIsUploadingDrive(true);
    setUploadErrorMsg(null);
    setUploadStatusMsg(`Uploading "${file.name}" to Google Drive folder (ID: ${GOOGLE_DRIVE_FOLDER_ID})...`);

    try {
      const mealLabel = targetMealId || (isNewMealForm ? newMeal.mealId : 'Meal');
      const matchedMeal = meals.find(m => m.mealId === targetMealId || m.id === targetMealId);
      const dishName = isNewMealForm ? newMeal.foodName : (matchedMeal?.foodName || 'Meal');
      const dateStr = isNewMealForm ? newMeal.dateStr : (matchedMeal?.dateStr || new Date().toISOString().split('T')[0]);

      setUploadStatusMsg(`Uploading "${file.name}" into Personal Food Drive folder...`);
      const uploadRes = await uploadImageToGoogleDrive(file, {
        mealId: mealLabel,
        dishName: dishName,
        dateStr: dateStr,
        imageIndex: 0,
        totalImages: 1,
        description: `Uploaded from NutriHealth Tracker for ${mealLabel} into Google Drive folder 1bnF0AV0N1ua2kVDKsA5-PA1CQ-7Y4tPN`,
        onProgressStatus: (status) => setUploadStatusMsg(status),
      });

      const compNote = uploadRes.wasCompressed 
        ? ` (Compressed ${formatBytes(uploadRes.originalSizeBytes)} → ${formatBytes(uploadRes.uploadedSizeBytes)} < 200 KB)` 
        : ` (${formatBytes(uploadRes.uploadedSizeBytes)})`;
      setUploadStatusMsg(`✅ Successfully uploaded "${uploadRes.fileName}" to Google Drive${compNote}!`);

      if (isNewMealForm) {
        setNewMeal(prev => ({
          ...prev,
          imageUrl: uploadRes.thumbnailUrl || uploadRes.webViewLink,
          driveFileName: uploadRes.fileName,
        }));
        setSelectedNewMealFile(null);
      } else if (targetMealId && onUpdateMealPhoto) {
        onUpdateMealPhoto(targetMealId, uploadRes.thumbnailUrl || uploadRes.webViewLink, uploadRes.fileName);
      } else if (attachPhotoTarget && onUpdateMealPhoto) {
        onUpdateMealPhoto(attachPhotoTarget.id, uploadRes.thumbnailUrl || uploadRes.webViewLink, uploadRes.fileName);
      }

      setPendingDriveFile(null);
      setTimeout(() => {
        setIsUploadingDrive(false);
        setUploadStatusMsg(null);
        if (!isNewMealForm) {
          setAttachPhotoTarget(null);
        }
      }, 2000);

    } catch (err: any) {
      console.warn('Direct Drive upload error:', err);
      setIsUploadingDrive(false);
      setUploadErrorMsg(err.message || 'Failed to upload photo to Google Drive.');
      setUploadStatusMsg(null);
    }
  };

  // Direct Upload to Google Drive Trigger
  const handleDirectDriveUpload = async (file: File, targetMealId?: string, isNewMealForm: boolean = false) => {
    if (!file || !file.type.startsWith('image/')) {
      setUploadErrorMsg('Please select a valid image file (JPEG, PNG, WEBP, HEIC)');
      return;
    }

    setUploadErrorMsg(null);
    
    // Check if user has active token
    const token = await getAccessToken();
    if (!token) {
      // Stage file and prompt explicit 1-click user auth button to avoid browser popup blocking
      setPendingDriveFile({ file, targetMealId, isNewMealForm });
      setUploadStatusMsg(null);
      return;
    }

    // If already authorized, proceed immediately
    await executeDriveUpload(file, targetMealId, isNewMealForm);
  };

  // Direct 1-Click User Action to Sign in & Execute Staged Upload
  const handleAuthorizeAndUploadPending = async () => {
    setIsSigningInGoogle(true);
    setUploadErrorMsg(null);
    setUploadStatusMsg('Opening Google sign-in window...');

    try {
      const authResult = await googleSignIn();
      if (!authResult?.accessToken) {
        // User closed the popup or cancelled sign-in
        setIsSigningInGoogle(false);
        setUploadStatusMsg(null);
        return;
      }
      setIsSigningInGoogle(false);
      setUploadStatusMsg('Google Drive connected! Starting upload...');

      if (pendingDriveFile) {
        const { file, targetMealId, isNewMealForm } = pendingDriveFile;
        await executeDriveUpload(file, targetMealId, isNewMealForm);
      }
    } catch (err: any) {
      setIsSigningInGoogle(false);
      setUploadStatusMsg(null);
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.message?.includes('popup-closed-by-user')
      ) {
        return;
      }
      console.warn('Google Sign In error:', err);
      if (err?.code === 'auth/popup-blocked') {
        setUploadErrorMsg('Popup blocked. Please check your browser address bar and allow popups for this applet.');
      } else {
        setUploadErrorMsg(err.message || 'Google authorization cancelled or failed.');
      }
    }
  };

  const handleSaveDriveLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachPhotoTarget || !driveUrlInput.trim() || !onUpdateMealPhoto) return;
    onUpdateMealPhoto(attachPhotoTarget.id, driveUrlInput.trim());
    setAttachPhotoTarget(null);
    setDriveUrlInput('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Orphaned Photos / Pending Recovery UI */}
      {orphanGroups.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-900/50 rounded-2xl p-5 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-amber-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Pending Recovery: Unsynced Drive Photos ({orphanedPhotos.length})
            </h3>
            <span className="text-xs text-amber-500/70">
              Photos uploaded to Google Drive but missing from Google Sheet rows.
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {orphanGroups.map((group) => {
              const primaryPhoto = group.photos[0];
              const matchingMeal = meals.find(m => 
                (group.mealId && m.mealId?.toUpperCase() === group.mealId.toUpperCase()) ||
                (group.dishName && m.foodName.toLowerCase().replace(/[^a-z0-9]/g, '').includes(group.dishName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)))
              );

              return (
              <div key={group.groupKey} className="group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg relative">
                 <div className="h-32 w-full bg-slate-950 relative">
                   <img src={primaryPhoto.thumbnailLink || primaryPhoto.webViewLink || primaryPhoto.url} alt={group.dishName} className="w-full h-full object-cover" />
                   {group.photos.length > 1 && (
                     <div className="absolute top-2 right-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg border border-slate-700">
                       {group.photos.length} Photos
                     </div>
                   )}
                 </div>
                 <div className="p-3">
                   <div className="flex items-center gap-2 mb-2">
                     <span className="text-[10px] font-bold bg-amber-900/40 text-amber-500 px-1.5 py-0.5 rounded border border-amber-800/50">
                       {group.mealId || 'No ID'}
                     </span>
                     <p className="text-xs text-slate-300 font-medium truncate" title={group.dishName}>{group.dishName.replace(/_/g, ' ')}</p>
                   </div>
                   
                   {matchingMeal ? (
                     <div className="bg-emerald-950/40 rounded-lg p-2 mb-3 border border-emerald-800/40 flex flex-col items-center justify-center py-2 text-center">
                       <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                         <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                         <span>In Spreadsheet</span>
                       </div>
                       <span className="text-[10px] text-slate-300 font-medium truncate max-w-[200px]" title={matchingMeal.foodName}>
                         {matchingMeal.foodName} ({matchingMeal.mealId || 'Row'})
                       </span>
                     </div>
                   ) : (
                     <div className="bg-slate-950 rounded-lg p-2 mb-3 border border-slate-800/50 flex flex-col items-center justify-center py-2">
                       <FileSpreadsheet className="w-4 h-4 text-slate-500 mb-0.5" />
                       <span className="text-[10px] text-slate-400 font-medium">Missing Spreadsheet Row</span>
                     </div>
                   )}

                   <div className="flex items-center gap-2">
                     {matchingMeal ? (
                       <button
                         onClick={() => {
                           if (onMergeOrphan) {
                             onMergeOrphan(matchingMeal, group.photos);
                           }
                         }}
                         className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-blue-900/30"
                         title={`Attach photos to ${matchingMeal.foodName} (${matchingMeal.mealId})`}
                       >
                         <Link2 className="w-3.5 h-3.5" /> Link Photo
                       </button>
                     ) : null}
                     <button
                       onClick={() => onRecoverOrphan && onRecoverOrphan(group.photos)}
                       className={`${matchingMeal ? 'px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300' : 'flex-1 bg-emerald-600 hover:bg-emerald-500 text-white'} py-1.5 rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer`}
                       title="Log or re-analyze as a new meal"
                     >
                       <Edit3 className="w-3.5 h-3.5" /> Recover
                     </button>
                     <button
                       onClick={() => onDeleteOrphan && onDeleteOrphan(group.photos)}
                       className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-900/50 text-slate-300 hover:text-rose-400 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-slate-700 hover:border-rose-900/50 cursor-pointer"
                       title="Delete photo from Google Drive"
                     >
                       <Trash2 className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 </div>
              </div>
            )})}
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col md:flex-row gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by food name, ID (e.g. M-026, M-016), diagnosis, or Drive file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Day Filter */}
          <div className="flex items-center gap-2">
            <select
              value={selectedDayFilter}
              onChange={(e) => setSelectedDayFilter(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">📅 All Dates Logged ({meals.length} meals)</option>
              {columns.filter(c => !c.isRollingBaseline).map((col) => (
                <option key={col.key} value={col.key}>
                  {col.label} ({col.dateStr})
                </option>
              ))}
              {extraMealDates.map((d) => (
                <option key={d.key} value={d.key}>
                  📅 {d.label}
                </option>
              ))}
            </select>

            {/* Meal Type Filter */}
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">🍽️ All Meal Types</option>
              <option value="Breakfast">🥣 Breakfast</option>
              <option value="Lunch">🥗 Lunch</option>
              <option value="Dinner">🍲 Dinner</option>
              <option value="Snack">🍎 Snack</option>
              <option value="Late Night">🌙 Late Night</option>
            </select>

            {/* Drive Photo Gallery Icon Button */}
            <button
              onClick={() => {
                setDriveFolderTargetMeal(null);
                setIsDriveFolderOpen(true);
              }}
              className="p-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 border border-blue-500/40 rounded-xl transition cursor-pointer flex items-center justify-center shrink-0"
              title="Drive Photo Gallery (Browse all 48 Google Drive meal photos)"
              aria-label="Open Drive Photo Gallery"
            >
              <FileImage className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      {/* Meals Grid with Drive Attachment Card & Photos */}
      {(filteredMeals.length === 0 && activeSessions.filter(s => s.status !== 'saved').length === 0) ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Utensils className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No meal logs match your current filters</p>
          <p className="text-xs text-slate-500">Try adjusting your search query or date selector</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Render Active Agent Sessions as Cards */}
          {activeSessions.filter(s => s.status !== 'saved').map(session => (
            <div
              key={session.id}
              className="bg-indigo-950/40 border border-indigo-500/50 hover:border-indigo-400/80 rounded-2xl p-4 sm:p-5 space-y-4 transition-all shadow-md shadow-indigo-950/40 group relative flex flex-col justify-between cursor-pointer"
              onClick={() => onOpenSession?.(session.id)}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-base font-bold text-white leading-snug">
                        {session.previewDishName || session.title}
                      </h3>
                    </div>
                    <p className="text-xs text-indigo-300/80">
                      Active Meal Agent Session • {session.mealSlot}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this active session?')) {
                           onCloseSession?.(session.id);
                        }
                      }}
                      className="p-2 bg-indigo-950/80 hover:bg-rose-900/60 border border-indigo-500/20 hover:border-rose-500/50 text-indigo-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer shadow opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Delete Session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex gap-4">
                  {/* Photo Preview Container */}
                  <div className="w-32 h-32 rounded-xl bg-slate-950 border border-indigo-500/30 overflow-hidden shrink-0 relative group/img shadow-inner flex items-center justify-center">
                    {session.previewImageUrl ? (
                      <img src={session.previewImageUrl} alt={session.previewDishName || session.title} className="w-full h-full object-cover opacity-80" />
                    ) : (
                      <Utensils className="w-8 h-8 text-indigo-500/40" />
                    )}
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                      <span className="text-xs font-bold text-white bg-black/60 px-2 py-1 rounded">Resume</span>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-center gap-3">
                     <div className="bg-indigo-900/30 rounded-lg p-3 border border-indigo-800/40 flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                         <Sparkles className="w-4 h-4" />
                       </div>
                       <div>
                         <p className="text-xs text-indigo-300/90 font-medium leading-tight">Meal Agent is waiting</p>
                         <p className="text-[10px] text-indigo-400/70 mt-0.5">Click to continue your chat</p>
                       </div>
                     </div>
                     <button className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors">
                       <MessageSquare className="w-3.5 h-3.5" />
                       Continue Chat
                     </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredMeals.map((meal, idx) => {
            const mealPhotos = getMealPhotos(meal);
            const hasActualImage = mealPhotos.length > 0;
            const primaryPhoto = mealPhotos[0];
            const directDriveLink = primaryPhoto?.driveUrl || getDriveDirectViewUrl(meal.imageUrl || meal.driveFileName, meal.mealId) || (meal.driveFileId ? `https://drive.google.com/file/d/${meal.driveFileId}/view` : undefined);
            const displayDriveName = primaryPhoto?.fileName || meal.driveFileName || `${meal.foodName.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;

            return (
              <div
                key={meal.id ? `${meal.id}-${meal.dateStr || ''}-${idx}` : `meal-${idx}`}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-4 transition-all shadow-md group relative flex flex-col justify-between"
              >
                <div>
                  
                  {/* Top Meal Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <h3 className="text-base font-bold text-white leading-snug">
                        {meal.foodName}
                      </h3>
                      {meal.portion && (
                        <p className="text-xs text-slate-400">
                          {meal.portion}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-base font-bold text-amber-300">{meal.calories}</span>
                        <span className="text-[11px] text-slate-400 ml-1">kcal</span>
                      </div>
                    </div>
                  </div>

                  {/* Meal Photo: Clean preview where clicking automatically opens it */}
                  {hasActualImage ? (
                    <div
                      onClick={() => setActiveLightbox({ photos: mealPhotos, initialIndex: 0, meal })}
                      className="mt-3 relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video sm:aspect-[21/9] group/img cursor-pointer hover:border-slate-700 transition"
                      title={mealPhotos.length > 1 ? `Click to browse all ${mealPhotos.length} photos` : "Click to view full photo"}
                    >
                      <img
                        src={primaryPhoto.url}
                        alt={meal.foodName}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition">
                        <Maximize2 className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  ) : (
                    /* Google Drive Smart Chip File Card (No generic pictures) */
                    <div className="mt-3 bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <FileImage className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span className="text-xs font-mono font-bold text-slate-200 truncate max-w-[200px]">
                              {displayDriveName}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Google Drive Smart Chip Attached in Spreadsheet Cell
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => setAttachPhotoTarget(meal)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold transition cursor-pointer"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>Upload / Link Actual Photo</span>
                        </button>
                        {directDriveLink && (
                          <a
                            href={directDriveLink}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs"
                            title="Open Drive link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Nutrition Badges Grid - Unboxed directly in card */}
                  <div className="mt-3.5 grid grid-cols-4 sm:grid-cols-7 gap-1.5 text-center text-[11px]">
                    <div>
                      <span className="text-[9px] uppercase text-slate-500 block">Protein</span>
                      <span className="font-semibold text-slate-200">{Number(meal.protein).toFixed(1).replace(/\.0$/, '')}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-slate-500 block">Carbs</span>
                      <span className="font-semibold text-slate-200">{Number(meal.carbs).toFixed(1).replace(/\.0$/, '')}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-slate-500 block">Fat</span>
                      <span className="font-semibold text-slate-200">{Number(meal.totalFat).toFixed(1).replace(/\.0$/, '')}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-rose-400 block font-medium">Sat Fat</span>
                      <span className={`font-bold ${meal.saturatedFat > 5 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {Number(meal.saturatedFat).toFixed(1).replace(/\.0$/, '')}g
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-sky-400 block font-medium">Sodium</span>
                      <span className={`font-bold ${meal.sodium > 600 ? 'text-sky-400' : 'text-slate-200'}`}>
                        {Number(meal.sodium).toFixed(1).replace(/\.0$/, '')}mg
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-emerald-400 block font-medium">Fiber</span>
                      <span className="font-bold text-emerald-300">{Number(meal.fiber).toFixed(1).replace(/\.0$/, '')}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-amber-400 block font-medium">Sugar</span>
                      <span className={`font-bold ${meal.addedSugars > 10 ? 'text-amber-400' : 'text-slate-200'}`}>
                        {Number(meal.addedSugars).toFixed(1).replace(/\.0$/, '')}g
                      </span>
                    </div>
                  </div>

                  {/* Meal Diagnosis from Google Sheet - Clean unboxed text */}
                  {meal.clinicalNote && (
                    <div className="mt-3 text-xs text-slate-300 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="mt-0.5 leading-relaxed text-slate-300">{meal.clinicalNote}</p>
                      </div>
                    </div>
                  )}

                </div>

                {/* Card Footer: Meal ID, Combined Date/Time Ago, Badges & Action Buttons */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {meal.mealId && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                        {meal.mealId}
                      </span>
                    )}
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {formatMealTimeAgo(meal.dateStr, meal.time, meal.timestamp)}
                    </span>
                    {meal.flags && meal.flags.length > 0 && meal.flags.map((flag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>

                  {/* Card Action Controls: only shown on card roll-over / hover */}
                  <div className="flex items-center gap-1 shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReviewMeal?.(meal);
                      }}
                      className="p-1.5 text-slate-400 hover:text-emerald-400 transition rounded-lg hover:bg-slate-800/80 cursor-pointer flex items-center gap-1 text-xs"
                      title="Review & edit meal in chat"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteMeal(meal.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/80 cursor-pointer flex items-center gap-1 text-xs"
                      title="Delete meal entry"
                    >
                      {isDeletingMealId === meal.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Attach / Replace Photo Modal */}
      {attachPhotoTarget && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0B111E] text-slate-100 animate-fade-in w-full h-full overflow-hidden">
          <div className="w-full h-full flex flex-col overflow-hidden">
            <div className="p-4 sm:px-8 sm:py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
              <div className="flex items-center gap-2">
                <FileImage className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white font-heading">
                  Attach Actual Photo for {attachPhotoTarget.foodName}
                </h3>
              </div>
              <button
                onClick={() => {
                  setAttachPhotoTarget(null);
                  setUploadErrorMsg(null);
                  setUploadStatusMsg(null);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
              <div className="max-w-xl mx-auto space-y-4 w-full">
            {/* Folder Target Banner */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 truncate">
                <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="truncate">
                  <span className="font-semibold text-white">Target Folder:</span>{' '}
                  <span className="text-slate-400">NutriHealth Meals (Personal food)</span>
                </div>
              </div>
              <a
                href={GOOGLE_DRIVE_FOLDER_URL}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold shrink-0"
              >
                <span>Open Drive</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Google Drive Authorization Prompt if Pending */}
            {pendingDriveFile && (
              <div className="bg-amber-950/60 border border-amber-500/50 rounded-xl p-4 space-y-3 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-white">Sign In to Google Drive to Complete Upload</p>
                    <p className="text-amber-200/90 text-[11px] mt-0.5">
                      Photo selected: <span className="font-semibold text-white">{pendingDriveFile.file.name}</span>. Click below to authorize Google Drive, and your photo will upload directly into your folder.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAuthorizeAndUploadPending}
                  disabled={isSigningInGoogle}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  {isSigningInGoogle ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Opening Sign-In Window...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                      <span>Authorize Google Drive & Upload Photo</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Upload Status / Progress Indicator */}
            {isUploadingDrive && (
              <div className="bg-blue-950/50 border border-blue-500/40 rounded-xl p-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
                <div className="text-xs text-blue-200">
                  <p className="font-bold">Uploading directly to Google Drive...</p>
                  <p className="text-[11px] text-blue-300/80 mt-0.5">{uploadStatusMsg}</p>
                </div>
              </div>
            )}

            {uploadStatusMsg && !isUploadingDrive && !uploadErrorMsg && !pendingDriveFile && (
              <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-xl p-3 flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{uploadStatusMsg}</span>
              </div>
            )}

            {uploadErrorMsg && (
              <div className="bg-rose-950/50 border border-rose-500/40 rounded-xl p-3 flex items-start gap-2 text-xs text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Upload Notice</p>
                  <p className="text-[11px] text-rose-200/90 mt-0.5">{uploadErrorMsg}</p>
                  <button
                    type="button"
                    onClick={handleAuthorizeAndUploadPending}
                    className="mt-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Sign In to Google Drive</span>
                  </button>
                </div>
              </div>
            )}

            {/* Direct Upload to Drive Drag & Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleDirectDriveUpload(e.dataTransfer.files[0], attachPhotoTarget.id);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                dragActive 
                  ? 'border-emerald-400 bg-emerald-950/20' 
                  : 'border-slate-700 hover:border-slate-600 bg-slate-950/50'
              } ${isUploadingDrive ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleDirectDriveUpload(e.target.files[0], attachPhotoTarget.id);
                  }
                }}
              />
              <UploadCloud className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-200">
                Upload Photo Directly to Google Drive Folder
              </p>
              <p className="text-[11px] text-emerald-400 font-medium mt-1">
                Drop your meal photo (JPEG, PNG, WebP, HEIC) or click to browse
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Target Folder: 1bnF0AV0N1ua2kVDKsA5-PA1CQ-7Y4tPN
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px bg-slate-800 flex-1"></div>
              <span className="text-[10px] uppercase font-bold text-slate-500">or choose existing</span>
              <div className="h-px bg-slate-800 flex-1"></div>
            </div>

            {/* 1-Click Select from Connected Drive Folder */}
            <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                  <FileImage className="w-4 h-4 text-blue-400" />
                  <span>Choose from Shared Drive Folder (48 Photos)</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Select from existing 48 authentic meal photos in folder
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDriveFolderTargetMeal(attachPhotoTarget);
                  setIsDriveFolderOpen(true);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer shadow transition"
              >
                Browse Gallery
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px bg-slate-800 flex-1"></div>
              <span className="text-[10px] uppercase font-bold text-slate-500">or paste link</span>
              <div className="h-px bg-slate-800 flex-1"></div>
            </div>

            {/* Direct Link Form */}
            <form onSubmit={handleSaveDriveLink} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">
                  Google Drive Share Link or Direct Image URL
                </label>
                <input
                  type="text"
                  placeholder="https://drive.google.com/file/d/... or direct image URL"
                  value={driveUrlInput}
                  onChange={(e) => setDriveUrlInput(e.target.value)}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAttachPhotoTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!driveUrlInput.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Save Photo Link
                </button>
              </div>
            </form>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Full Resolution Multi-Photo Lightbox & Browser */}
      {activeLightbox && (
        <PhotoBrowserLightbox
          photos={activeLightbox.photos}
          initialIndex={activeLightbox.initialIndex}
          mealId={activeLightbox.meal?.mealId || activeLightbox.meal?.id}
          onSetTopPhoto={
            activeLightbox.meal && onSetMealTopPhoto
              ? (selectedPhoto, newOrderedPhotos) =>
                  onSetMealTopPhoto(activeLightbox.meal!, selectedPhoto, newOrderedPhotos)
              : undefined
          }
          onDeletePhoto={
            activeLightbox.meal && onDeleteMealPhoto
              ? (deletedPhoto, newOrderedPhotos) =>
                  onDeleteMealPhoto(activeLightbox.meal!, deletedPhoto, newOrderedPhotos)
              : undefined
          }
          onClose={() => setActiveLightbox(null)}
        />
      )}

      {/* Google Drive Photo Gallery Modal */}
      <DriveFolderModal
        isOpen={isDriveFolderOpen}
        onClose={() => {
          setIsDriveFolderOpen(false);
          setDriveFolderTargetMeal(null);
        }}
        targetMealName={driveFolderTargetMeal?.foodName}
        onSelectPhoto={(file: DriveFolderFile) => {
          if (driveFolderTargetMeal && onUpdateMealPhoto) {
            onUpdateMealPhoto(driveFolderTargetMeal.id, file.url, file.name);
          } else if (attachPhotoTarget && onUpdateMealPhoto) {
            onUpdateMealPhoto(attachPhotoTarget.id, file.url, file.name);
          }
          setAttachPhotoTarget(null);
          setDriveFolderTargetMeal(null);
          setIsDriveFolderOpen(false);
        }}
      />

    </div>
  );
};
