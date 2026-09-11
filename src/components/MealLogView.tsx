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
  FolderOpen
} from 'lucide-react';
import { LoggedMeal, DayColumn, MealLogRow } from '../types';
import { formatDriveImageUrl, isGoogleDriveUrl, getDriveDirectViewUrl } from '../utils/driveImage';
import { DriveFolderModal } from './DriveFolderModal';
import { GOOGLE_DRIVE_FOLDER_URL, GOOGLE_DRIVE_FOLDER_ID, DriveFolderFile } from '../data/googleDriveFolderData';
import { uploadImageToGoogleDrive } from '../utils/driveUploader';
import { googleSignIn, getAccessToken } from '../utils/googleAuth';
import { formatBytes } from '../utils/imageCompressor';

interface MealLogViewProps {
  meals: LoggedMeal[];
  columns: DayColumn[];
  onAddMeal: (meal: Omit<LoggedMeal, 'id'>, sheetRows?: MealLogRow[]) => void;
  onDeleteMeal: (id: string) => void;
  isDeletingMealId?: string | null;
  onOpenMealSimulator?: () => void;
  onResetDefaultMeals?: () => void;
  onUpdateMealPhoto?: (id: string, imageUrl: string, driveFileName?: string) => void;
}

export const MealLogView: React.FC<MealLogViewProps> = ({
  meals,
  columns,
  onAddMeal,
  onDeleteMeal,
  isDeletingMealId,
  onOpenMealSimulator,
  onResetDefaultMeals,
  onUpdateMealPhoto,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Image Lightbox State
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; driveUrl?: string; fileName?: string } | null>(null);

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
        const cleanFileName = `${mealLabel}_${fileToUpload.name.replace(/\s+/g, '_')}`;

        const uploadRes = await uploadImageToGoogleDrive(fileToUpload, {
          customFileName: cleanFileName,
          mealId: mealLabel,
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
      const cleanFileName = `${mealLabel}_${file.name.replace(/\s+/g, '_')}`;

      setUploadStatusMsg(`Uploading "${file.name}" into Personal Food Drive folder...`);
      const uploadRes = await uploadImageToGoogleDrive(file, {
        customFileName: cleanFileName,
        mealId: mealLabel,
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
      {filteredMeals.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Utensils className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No meal logs match your current filters</p>
          <p className="text-xs text-slate-500">Try adjusting your search query or date selector</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMeals.map((meal, idx) => {
            const formattedImg = formatDriveImageUrl(meal.imageUrl || meal.driveFileName, meal.mealId);
            const hasActualImage = !!formattedImg;
            const directDriveLink = getDriveDirectViewUrl(meal.imageUrl || meal.driveFileName, meal.mealId) || (meal.driveFileId ? `https://drive.google.com/file/d/${meal.driveFileId}/view` : undefined);
            const displayDriveName = meal.driveFileName || `${meal.foodName.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;

            return (
              <div
                key={meal.id ? `${meal.id}-${meal.dateStr || ''}-${idx}` : `meal-${idx}`}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-4 transition-all shadow-md group relative flex flex-col justify-between"
              >
                <div>
                  
                  {/* Top Meal Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {meal.mealId && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                            {meal.mealId}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                          meal.mealType === 'Breakfast' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          meal.mealType === 'Lunch' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          meal.mealType === 'Dinner' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                          meal.mealType === 'Late Night' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                          'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                        }`}>
                          {meal.mealType}
                        </span>
                        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {meal.dateStr}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {meal.time}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-white mt-1.5 leading-snug">
                        {meal.foodName}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Portion: {meal.portion}
                      </p>
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
                      onClick={() => setPreviewImage({ url: formattedImg!, title: meal.foodName, driveUrl: directDriveLink, fileName: displayDriveName })}
                      className="mt-3 relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video sm:aspect-[21/9] group/img cursor-pointer hover:border-slate-700 transition"
                      title="Click to view full photo"
                    >
                      <img
                        src={formattedImg!}
                        alt={meal.foodName}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                      />
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

                  {/* Nutrition Badges Grid */}
                  <div className="mt-3.5 grid grid-cols-4 sm:grid-cols-7 gap-1.5 text-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-[11px]">
                    <div>
                      <span className="text-[9px] uppercase text-slate-500 block">Protein</span>
                      <span className="font-semibold text-slate-200">{meal.protein}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-slate-500 block">Carbs</span>
                      <span className="font-semibold text-slate-200">{meal.carbs}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-slate-500 block">Fat</span>
                      <span className="font-semibold text-slate-200">{meal.totalFat}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-rose-400 block font-medium">Sat Fat</span>
                      <span className={`font-bold ${meal.saturatedFat > 5 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {meal.saturatedFat}g
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-sky-400 block font-medium">Sodium</span>
                      <span className={`font-bold ${meal.sodium > 600 ? 'text-sky-400' : 'text-slate-200'}`}>
                        {meal.sodium}mg
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-emerald-400 block font-medium">Fiber</span>
                      <span className="font-bold text-emerald-300">{meal.fiber}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-amber-400 block font-medium">Sugar</span>
                      <span className={`font-bold ${meal.addedSugars > 10 ? 'text-amber-400' : 'text-slate-200'}`}>
                        {meal.addedSugars}g
                      </span>
                    </div>
                  </div>

                  {/* Meal Diagnosis from Google Sheet */}
                  {meal.clinicalNote && (
                    <div className="mt-3 text-xs text-slate-300 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold uppercase text-emerald-400 block tracking-wider">Sheet Meal Diagnosis</span>
                        <p className="mt-0.5 leading-relaxed">{meal.clinicalNote}</p>
                      </div>
                    </div>
                  )}

                </div>

                {/* Card Footer: Badges & Lower-down Bin button */}
                <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {meal.flags && meal.flags.length > 0 && meal.flags.map((flag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>

                  {/* Bin lower down on card */}
                  <button
                    onClick={() => onDeleteMeal(meal.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/80 cursor-pointer shrink-0 ml-auto flex items-center gap-1 text-xs"
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
            );
          })}
        </div>
      )}

      {/* Attach / Replace Photo Modal */}
      {attachPhotoTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border-0 sm:border border-slate-800 rounded-none sm:rounded-2xl max-w-md w-full h-full sm:h-auto p-6 space-y-4 shadow-2xl animate-fade-in flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
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
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

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
      )}


      {/* Full Resolution Image Lightbox */}
      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-4 space-y-3 shadow-2xl animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white font-heading">{previewImage.title}</h4>
                {previewImage.fileName && (
                  <p className="text-xs text-emerald-400 font-mono">Drive File: {previewImage.fileName}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {previewImage.driveUrl && (
                  <a
                    href={previewImage.driveUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 border border-slate-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Google Drive</span>
                  </a>
                )}
                <button
                  onClick={() => setPreviewImage(null)}
                  className="text-slate-400 hover:text-white text-sm p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center max-h-[70vh]">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
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
