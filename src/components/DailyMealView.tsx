import React, { useState, useRef } from 'react';
import { 
  Calendar, 
  Flame, 
  Heart, 
  Droplet, 
  Clock, 
  Info, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle,
  ShieldCheck,
  Utensils,
  ExternalLink,
  Maximize2,
  FileImage,
  UploadCloud,
  Loader2,
  FolderOpen
} from 'lucide-react';
import { LoggedMeal, DayColumn, NutrientRow } from '../types';
import { formatDriveImageUrl, isGoogleDriveUrl, getDriveDirectViewUrl } from '../utils/driveImage';
import { DriveFolderModal } from './DriveFolderModal';
import { GOOGLE_DRIVE_FOLDER_URL, GOOGLE_DRIVE_FOLDER_ID, DriveFolderFile } from '../data/googleDriveFolderData';
import { uploadImageToGoogleDrive } from '../utils/driveUploader';
import { googleSignIn, getAccessToken } from '../utils/googleAuth';
import { formatBytes } from '../utils/imageCompressor';

interface DailyMealViewProps {
  selectedDayKey: string;
  onSelectDay: (dayKey: string) => void;
  meals: LoggedMeal[];
  columns: DayColumn[];
  nutrients: NutrientRow[];
  clinicalDiagnoses?: Record<string, { overall: string; highlights: string[]; flags: string[]; raw: string }>;

  onUpdateMealPhoto?: (id: string, imageUrl: string, driveFileName?: string) => void;
}

export const DailyMealView: React.FC<DailyMealViewProps> = ({
  selectedDayKey,
  onSelectDay,
  meals,
  columns,
  nutrients,
  clinicalDiagnoses,

  onUpdateMealPhoto,
}) => {
  const currentDayCol = columns.find(c => c.key === selectedDayKey) || columns[1] || columns[0];
  const dayMeals = meals.filter(m => m.dayKey === selectedDayKey);
  const diagnosis = clinicalDiagnoses?.[selectedDayKey];

  // Image Lightbox State
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; driveUrl?: string; fileName?: string } | null>(null);

  // Photo Attach Modal & Google Drive Folder State
  const [attachPhotoTarget, setAttachPhotoTarget] = useState<LoggedMeal | null>(null);
  const [isDriveFolderOpen, setIsDriveFolderOpen] = useState(false);
  const [driveFolderTargetMeal, setDriveFolderTargetMeal] = useState<LoggedMeal | null>(null);
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [pendingDriveFile, setPendingDriveFile] = useState<{ file: File; mealTargetId: string } | null>(null);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Key Nutrient Target comparisons for current day
  const satFatNutrient = nutrients.find(n => n.id === 'sat_fat');
  const sodiumNutrient = nutrients.find(n => n.id === 'sodium');
  const fiberNutrient = nutrients.find(n => n.id === 'fiber');
  const calNutrient = nutrients.find(n => n.id === 'calories');

  const satFatVal = satFatNutrient?.days[selectedDayKey] || satFatNutrient?.baseline;
  const sodiumVal = sodiumNutrient?.days[selectedDayKey] || sodiumNutrient?.baseline;
  const fiberVal = fiberNutrient?.days[selectedDayKey] || fiberNutrient?.baseline;
  const calVal = calNutrient?.days[selectedDayKey] || calNutrient?.baseline;

  // Meal totals
  const totalMealCalories = dayMeals.reduce((acc, m) => acc + m.calories, 0);
  const totalMealSatFat = dayMeals.reduce((acc, m) => acc + m.saturatedFat, 0);
  const totalMealSodium = dayMeals.reduce((acc, m) => acc + m.sodium, 0);
  const totalMealFiber = dayMeals.reduce((acc, m) => acc + m.fiber, 0);

  const executeUpload = async (file: File, mealTargetId: string) => {
    setIsUploading(true);
    setUploadErrorMsg(null);
    setUploadStatusMsg(`Uploading "${file.name}" to Google Drive (Personal food)...`);

    try {
      const cleanName = `${mealTargetId}_${file.name.replace(/\s+/g, '_')}`;
      const uploadRes = await uploadImageToGoogleDrive(file, {
        customFileName: cleanName,
        mealId: mealTargetId,
        description: `Uploaded from NutriHealth Tracker for meal ${mealTargetId}`,
        onProgressStatus: (msg) => setUploadStatusMsg(msg),
      });

      const compNote = uploadRes.wasCompressed
        ? ` (Compressed ${formatBytes(uploadRes.originalSizeBytes)} → ${formatBytes(uploadRes.uploadedSizeBytes)} < 200 KB)`
        : ` (${formatBytes(uploadRes.uploadedSizeBytes)})`;
      setUploadStatusMsg(`✅ Successfully uploaded "${uploadRes.fileName}"${compNote}!`);
      if (onUpdateMealPhoto) {
        onUpdateMealPhoto(mealTargetId, uploadRes.thumbnailUrl || uploadRes.webViewLink, uploadRes.fileName);
      }

      setPendingDriveFile(null);
      setTimeout(() => {
        setIsUploading(false);
        setUploadStatusMsg(null);
        setAttachPhotoTarget(null);
      }, 1500);
    } catch (err: any) {
      console.warn('Drive upload error in DailyMealView:', err);
      setIsUploading(false);
      setUploadErrorMsg(err.message || 'Failed to upload photo to Google Drive');
      setUploadStatusMsg(null);
    }
  };

  const handleFileUpload = async (file: File, mealTargetId: string) => {
    if (!file || !file.type.startsWith('image/') || !onUpdateMealPhoto) return;
    
    setUploadErrorMsg(null);

    const token = await getAccessToken();
    if (!token) {
      setPendingDriveFile({ file, mealTargetId });
      setUploadStatusMsg(null);
      return;
    }

    await executeUpload(file, mealTargetId);
  };

  const handleAuthorizeAndUpload = async () => {
    setIsSigningInGoogle(true);
    setUploadErrorMsg(null);
    setUploadStatusMsg('Opening Google sign-in window...');

    try {
      const authRes = await googleSignIn();
      if (!authRes?.accessToken) {
        setIsSigningInGoogle(false);
        setUploadStatusMsg(null);
        return;
      }
      setIsSigningInGoogle(false);
      setUploadStatusMsg('Google Drive connected! Starting upload...');

      if (pendingDriveFile) {
        await executeUpload(pendingDriveFile.file, pendingDriveFile.mealTargetId);
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
        setUploadErrorMsg('Popup blocked. Please check your browser address bar and allow popups for this site.');
      } else {
        setUploadErrorMsg(err.message || 'Failed to sign in to Google Drive');
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
      
      {/* Day Selector Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
            Daily Meal Timeline
          </span>
          <h2 className="text-lg font-bold text-white font-heading">
            {currentDayCol.label} ({currentDayCol.dateStr})
          </h2>
        </div>

        {/* Date Switcher Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          {columns.filter(c => !c.isRollingBaseline).map((col) => {
            const isSelected = col.key === selectedDayKey;
            return (
              <button
                key={col.key}
                onClick={() => onSelectDay(col.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {col.label}
              </button>
            );
          })}
        </div>

      </div>

      {/* Daily Nutrient Budget Status vs Ceilings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Calories Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-400 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              Caloric Budget
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-amber-300">
              Target: {calVal?.target || 1651} kcal
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{calVal?.intake || totalMealCalories}</span>
            <span className="text-xs text-slate-400">/ {calVal?.target || 1651} kcal</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full rounded-full ${
                (calVal?.percentage || 0) <= 100 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(calVal?.percentage || 0, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {(calVal?.percentage || 0) <= 100 ? '🟢 On Track with Deficit Goal' : '🔴 Exceeded Daily Deficit Allowance'}
          </p>
        </div>

        {/* Saturated Fat Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-400 flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-rose-400" />
              Saturated Fat
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20">
              Ceiling: &lt;15 g
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${(satFatVal?.intake || 0) > 15 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {satFatVal?.intake || totalMealSatFat}
            </span>
            <span className="text-xs text-slate-400">/ 15 g max</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full rounded-full ${(satFatVal?.intake || 0) > 15 ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(((satFatVal?.intake || 0) / 15) * 100, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {(satFatVal?.intake || 0) <= 15 ? '🟢 Under Atherogenic Threshold' : '🚨 High Arterial Plaque Risk'}
          </p>
        </div>

        {/* Sodium Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-400 flex items-center gap-1.5">
              <Droplet className="w-4 h-4 text-sky-400" />
              Renal Sodium
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20">
              Ceiling: &lt;1,500 mg
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${(sodiumVal?.intake || 0) > 1500 ? 'text-rose-400' : 'text-sky-400'}`}>
              {(sodiumVal?.intake || totalMealSodium).toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">/ 1,500 mg max</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full rounded-full ${(sodiumVal?.intake || 0) > 1500 ? 'bg-rose-500' : 'bg-sky-500'}`}
              style={{ width: `${Math.min(((sodiumVal?.intake || 0) / 1500) * 100, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {(sodiumVal?.intake || 0) <= 1500 ? '🟢 Kidney Filtration Pressure Safe' : '🚨 High Renal Glomerular Pressure'}
          </p>
        </div>

        {/* Dietary Fiber Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Soluble & Total Fiber
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              Goal: ≥38 g
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">
              {fiberVal?.intake || totalMealFiber}
            </span>
            <span className="text-xs text-slate-400">/ 38 g goal</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(((fiberVal?.intake || 0) / 38) * 100, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {(fiberVal?.intake || 0) >= 15 ? '🟢 High Soluble Beta-Glucan' : '⚪ Below optimal clearance goal'}
          </p>
        </div>

      </div>

      {/* Spreadsheet Diagnosis Callout for Selected Day */}
      {diagnosis && (
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white font-heading">
                Spreadsheet Clinical Assessment for {currentDayCol.label}
              </h3>
            </div>
            <span className="text-[11px] text-emerald-400/80 font-mono">Row 2 Diagnosis Match</span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
            {diagnosis.overall || diagnosis.raw}
          </p>

          {diagnosis.highlights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
              {diagnosis.highlights.map((h, i) => (
                <div key={i} className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-2.5 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{h}</span>
                </div>
              ))}
              {diagnosis.flags.map((f, i) => (
                <div key={i} className="text-xs text-amber-300 bg-amber-950/30 border border-amber-500/20 rounded-xl p-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chronological Meal Timeline for Today */}
      <div className="space-y-4">
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white font-heading">
              Chronological Daily Meals ({dayMeals.length})
            </h3>
          </div>
        </div>

        {dayMeals.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            <p className="text-sm">No individual meal items logged for this date.</p>
            <p className="text-xs text-slate-500 mt-1">Check the spreadsheet totals in the dashboard.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dayMeals.map((meal, index) => {
              const formattedImg = formatDriveImageUrl(meal.imageUrl || meal.driveFileName, meal.mealId);
              const hasActualImage = !!formattedImg;
              const directDriveLink = getDriveDirectViewUrl(meal.imageUrl || meal.driveFileName, meal.mealId) || (meal.driveFileId ? `https://drive.google.com/file/d/${meal.driveFileId}/view` : undefined);
              const displayDriveName = meal.driveFileName || `${meal.foodName.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;

              return (
                <div 
                  key={meal.id ? `${meal.id}-${meal.dateStr || ''}-${index}` : `daily-meal-${index}`}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition space-y-3 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    
                    <div className="flex items-start gap-3.5">
                      {/* Image Thumbnail or Drive Attachment Icon */}
                      {hasActualImage ? (
                        <div 
                          onClick={() => setPreviewImage({ url: formattedImg!, title: meal.foodName, driveUrl: directDriveLink, fileName: displayDriveName })}
                          className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 group/thumb cursor-zoom-in"
                          title="Click to expand full photo"
                        >
                          <img
                            src={formattedImg!}
                            alt={meal.foodName}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover/thumb:scale-110 transition duration-200"
                          />
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-slate-950/80 text-[9px] font-bold text-slate-300">
                            #{index + 1}
                          </span>
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition">
                            <Maximize2 className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div 
                          onClick={() => setAttachPhotoTarget(meal)}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-emerald-400 hover:border-emerald-500/50 hover:bg-slate-900 cursor-pointer transition shrink-0 group/icon"
                          title="Upload or link real photo"
                        >
                          <FileImage className="w-6 h-6 group-hover/icon:scale-110 transition" />
                          <span className="text-[9px] text-slate-400 mt-1 font-mono">Drive Chip</span>
                        </div>
                      )}

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          {meal.mealId && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                              {meal.mealId}
                            </span>
                          )}
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {meal.mealType}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {meal.time}
                          </span>
                          
                          {/* Google Drive Smart Chip */}
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-[10px] text-emerald-300 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span className="truncate max-w-[130px]">{displayDriveName}</span>
                          </div>

                          <button
                            onClick={() => setAttachPhotoTarget(meal)}
                            className="text-[10px] font-semibold text-slate-300 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 cursor-pointer"
                          >
                            <UploadCloud className="w-3 h-3 text-teal-400" />
                            <span>{hasActualImage ? 'Replace Photo' : 'Upload Photo'}</span>
                          </button>

                          {directDriveLink && (
                            <a
                              href={directDriveLink}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>Drive File</span>
                            </a>
                          )}
                        </div>
                        
                        <h4 className="text-sm font-bold text-white mt-1">
                          {meal.foodName}
                        </h4>
                        <p className="text-xs text-slate-400">
                          {meal.portion}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 sm:text-right shrink-0">
                      <div>
                        <span className="text-base font-bold text-amber-300">{meal.calories}</span>
                        <span className="text-xs text-slate-400 ml-1">kcal</span>
                      </div>
                    </div>

                  </div>

                  {/* Micro Nutrients Grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Protein</span>
                      <span className="font-semibold text-slate-200">{meal.protein}g</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Carbs</span>
                      <span className="font-semibold text-slate-200">{meal.carbs}g</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Total Fat</span>
                      <span className="font-semibold text-slate-200">{meal.totalFat}g</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-rose-400 block font-medium">Sat Fat</span>
                      <span className={`font-semibold ${meal.saturatedFat > 5 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {meal.saturatedFat}g
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-sky-400 block font-medium">Sodium</span>
                      <span className={`font-semibold ${meal.sodium > 600 ? 'text-sky-400' : 'text-slate-200'}`}>
                        {meal.sodium}mg
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-400 block font-medium">Fiber</span>
                      <span className="font-semibold text-emerald-300">{meal.fiber}g</span>
                    </div>
                  </div>

                  {/* Clinical Meal Diagnosis from Google Sheet */}
                  {meal.clinicalNote && (
                    <div className="text-xs text-slate-300 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-bold uppercase text-emerald-400 block tracking-wider">Sheet Meal Diagnosis</span>
                        <p className="mt-0.5 leading-relaxed">{meal.clinicalNote}</p>
                      </div>
                    </div>
                  )}

                  {/* Meal Flags */}
                  {meal.flags && meal.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {meal.flags.map((flag, idx) => (
                        <span 
                          key={idx}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

      </div>

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
                      Photo selected: <span className="font-semibold text-white">{pendingDriveFile.file.name}</span>. Click below to sign in once to your Personal Food Google Drive.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAuthorizeAndUpload}
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
            {isUploading && (
              <div className="bg-blue-950/50 border border-blue-500/40 rounded-xl p-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
                <div className="text-xs text-blue-200">
                  <p className="font-bold">Uploading directly to Google Drive...</p>
                  <p className="text-[11px] text-blue-300/80 mt-0.5">{uploadStatusMsg}</p>
                </div>
              </div>
            )}

            {uploadStatusMsg && !isUploading && !uploadErrorMsg && !pendingDriveFile && (
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
                    onClick={handleAuthorizeAndUpload}
                    className="mt-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Sign In to Google Drive</span>
                  </button>
                </div>
              </div>
            )}

            {/* Drag & Drop Upload Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed border-slate-700 hover:border-slate-600 bg-slate-950/50 rounded-xl p-6 text-center cursor-pointer transition ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0], attachPhotoTarget.id);
                  }
                }}
              />
              <UploadCloud className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-200">
                Upload Photo Directly to Google Drive Folder
              </p>
              <p className="text-[11px] text-emerald-400 font-medium mt-1">
                Drop your meal photo (JPEG, PNG, WebP) or click to browse
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
                  Instant 1-click select matching authentic photo
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
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl"
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
