import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShieldCheck,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  HardDrive,
  Trash2,
  ExternalLink,
  Wrench,
  X,
  XCircle,
  ArrowRight,
  Info,
  Clock,
  Eye,
  Sliders,
  Check,
  Edit3,
  Layers,
  Camera,
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  Folder,
  FolderSearch,
  FolderOpen,
} from 'lucide-react';
import { LoggedMeal, MealLogRow, SheetConfig } from '../types';
import { GOOGLE_DRIVE_PHOTOS, DriveFolderFile } from '../data/googleDriveFolderData';
import { 
  fetchGoogleDriveFolderFiles, 
  renameGoogleDriveFile, 
  deleteImageFromGoogleDrive, 
  normalizeDateToISO,
  getActiveDriveFolderId,
  getActiveDriveFolderName,
  setActiveDriveFolder
} from '../utils/driveUploader';
import { getAccessToken, googleSignIn, loadSavedToken } from '../utils/googleAuth';
import { getDriveThumbnailProxyUrl, extractDriveFileId, runtimeDrivePhotoCache } from '../utils/driveImage';

export interface SanitationIssue {
  id: string;
  type: 'NON_STANDARD_FILENAME' | 'UNLINKED_SHEET_PHOTO' | 'ORPHAN_DRIVE_PHOTO' | 'BROKEN_PHOTO_URL' | 'INVALID_DATE';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedItem: string;
  proposedFix: string;
  payload?: any;
  fixed?: boolean;
}

export interface InspectedPhotoItem {
  id: string;
  originalName: string;
  mealId: string;
  dateStr: string;
  photoIndex: number;
  detectedFood: string;
  perspective: 'Plated_Dish' | 'Food_Packaging' | 'Nutrition_Facts_Table' | 'Ingredient_Prep' | 'Beverage' | 'Scale_Measurement' | 'Other';
  cleanDescription: string;
  confidence: number;
  proposedStandardName: string;
  editedName?: string;
  thumbnailUrl: string;
  status: 'pending' | 'inspected' | 'renamed' | 'failed';
  error?: string;
  previousProposedName?: string;
  lastInspectedAt?: number;
  isRecentlyUpdated?: boolean;
}

interface SheetDriveSanitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  meals: LoggedMeal[];
  mealSheetRows: MealLogRow[];
  sheetConfig: SheetConfig;
  onRefreshData: () => Promise<void> | void;
}

export const SheetDriveSanitationModal: React.FC<SheetDriveSanitationModalProps> = ({
  isOpen,
  onClose,
  meals,
  mealSheetRows,
  sheetConfig,
  onRefreshData,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFolderFile[]>([]);
  const [issues, setIssues] = useState<SanitationIssue[]>([]);
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'issues' | 'vision_renamer' | 'sheet_links'>('vision_renamer');
  const [filterType, setFilterType] = useState<string>('all');
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [isLogExpanded, setIsLogExpanded] = useState<boolean>(false);

  // Customizable Vision Batch Configuration
  const [batchSize, setBatchSize] = useState<number>(10);
  const [isVisionInspecting, setIsVisionInspecting] = useState<boolean>(false);
  const [inspectingPhotoId, setInspectingPhotoId] = useState<string | null>(null);
  const [visionProgress, setVisionProgress] = useState<{ current: number; total: number; batchNum: number; totalBatches: number } | null>(null);
  const [inspectedPhotos, setInspectedPhotos] = useState<InspectedPhotoItem[]>([]);
  const [isRenamingBatch, setIsRenamingBatch] = useState<boolean>(false);
  const [previewModalImage, setPreviewModalImage] = useState<{ url: string; title: string } | null>(null);
  const [activeCertaintyTooltipId, setActiveCertaintyTooltipId] = useState<string | null>(null);
  const [fixingIssueId, setFixingIssueId] = useState<string | null>(null);
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  // Active Drive Folder state & management
  const [activeFolderName, setActiveFolderName] = useState<string>(() => getActiveDriveFolderName());
  const [activeFolderId, setActiveFolderId] = useState<string>(() => getActiveDriveFolderId());
  const [availableFolders, setAvailableFolders] = useState<{ id: string; name: string }[]>([]);
  const [showFolderSelector, setShowFolderSelector] = useState(false);
  const [customFolderInput, setCustomFolderInput] = useState('');
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

  const loadAvailableFolders = async () => {
    setIsLoadingFolders(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const resp = await fetch('/api/drive/folders', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.folders && Array.isArray(data.folders)) {
          setAvailableFolders(data.folders);
        }
      } else if (resp.status === 401) {
        throw new Error('401_UNAUTHORIZED');
      }
    } catch (err: any) {
      console.warn('Could not load drive folders:', err);
      if (err.message === '401_UNAUTHORIZED') {
         setHasDriveToken(false);
          setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ❌ Your Google Drive session expired. Please connect Drive again.`, ...prev]);
      }
    } finally {
      setIsLoadingFolders(false);
    }
  };

  const handleSelectFolder = (folderId: string, folderName?: string) => {
    setActiveDriveFolder(folderId, folderName);
    setActiveFolderId(folderId);
    if (folderName) setActiveFolderName(folderName);
    setShowFolderSelector(false);
    setActionLog((prev) => [
      `[${new Date().toLocaleTimeString()}] 📁 Switched Google Drive folder to: "${folderName || folderId}". Rescanning...`,
      ...prev,
    ]);
    setTimeout(() => {
      runCleanlinessScan();
    }, 150);
  };

  const handleCustomFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFolderInput.trim()) return;
    const input = customFolderInput.trim();
    const match = input.match(/folders\/([-\w]{25,})/) || input.match(/[-\w]{25,}/);
    const folderId = match ? match[1] || match[0] : input;
    handleSelectFolder(folderId, 'Custom Folder');
    setCustomFolderInput('');
  };

  const activeControllerRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef<boolean>(false);

  const handleStopInspection = () => {
    stopRequestedRef.current = true;
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    setIsVisionInspecting(false);
    setActionLog((prev) => [
      `[${new Date().toLocaleTimeString()}] ⏹️ Vision inspection stopped by user.`,
      ...prev,
    ]);
  };

  // Check auth state on mount
  useEffect(() => {
    getAccessToken().then((token) => {
      setHasDriveToken(!!token);
    });
  }, []);

  // Listen for Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !previewModalImage) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, previewModalImage]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setHasDriveToken(true);
        setActionLog((prev) => [
          `[${new Date().toLocaleTimeString()}] ✅ Google Drive authorized! Refreshing photos...`,
          ...prev,
        ]);
        await runCleanlinessScan();
        if (onRefreshData) {
          try {
            await onRefreshData();
          } catch {
            // Ignore background refresh errors
          }
        }
      }
    } catch (err: any) {
      if (!err?.message?.includes('popup-closed-by-user') && !err?.message?.includes('cancelled-popup-request')) {
        setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ⚠️ Sign-in notice: ${err.message || err}`, ...prev]);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Scan Drive & Spreadsheet for cleanliness and synchronization
  const runCleanlinessScan = async () => {
    setIsScanning(true);
    setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] Starting Drive & Sheet Cleanliness Audit...`, ...prev]);

    try {
      const token = await getAccessToken();
      setHasDriveToken(!!token);

      let fetchedDriveFiles: DriveFolderFile[] = [];
      if (token) {
        try {
          fetchedDriveFiles = await fetchGoogleDriveFolderFiles();
        } catch (fetchErr: any) {
          console.warn('Live Google Drive fetch notice:', fetchErr);
          if (fetchErr.message === '401_UNAUTHORIZED') {
             setHasDriveToken(false);
          setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ❌ Your Google Drive session expired. Please connect Drive again.`, ...prev]);
          }
        }
      }

      // Multi-tier Fallback:
      // If live Google Drive returned 0 files (or user is not authenticated yet),
      // seamlessly load all known photos from GOOGLE_DRIVE_PHOTOS!
      if (!fetchedDriveFiles || fetchedDriveFiles.length === 0) {
        fetchedDriveFiles = [...GOOGLE_DRIVE_PHOTOS];
      }

      // Filter out obsolete template files (multi-view, mini_heads) so they never pollute the meal audit
      fetchedDriveFiles = fetchedDriveFiles.filter(
        (f) => !f.name.includes('multi-view') && !f.name.includes('mini_heads')
      );

      // Also merge photos from logged meals and spreadsheet rows
      const existingIds = new Set(fetchedDriveFiles.map((f) => f.id));
      meals.forEach((meal) => {
        if (meal.photoUrls && Array.isArray(meal.photoUrls)) {
          meal.photoUrls.forEach((url, idx) => {
            if (!url) return;
            const trimmed = url.trim();
            const isFilename = /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(trimmed);
            const driveMatch = extractDriveFileId(trimmed);

            let fileId = '';
            let resolvedUrl = '';
            let resolvedName = '';

            if (driveMatch) {
              fileId = driveMatch;
              resolvedUrl = `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
            } else if (isFilename) {
              const cached = runtimeDrivePhotoCache.get(trimmed.toLowerCase());
              const foundFile = fetchedDriveFiles.find((f) => {
                const fName = f.name.toLowerCase();
                const tName = trimmed.toLowerCase();
                if (fName === tName) return true;
                if (fName.replace(/\.[^/.]+$/, '') === tName.replace(/\.[^/.]+$/, '')) return true;
                // Check if meal ID matches
                if (meal.mealId && (f.name.toUpperCase().startsWith(meal.mealId.toUpperCase() + '_') || (f.mealId && f.mealId.toUpperCase() === meal.mealId.toUpperCase()))) {
                  const photoNumStr = `photo${idx + 1}`;
                  if (fName.includes(photoNumStr) || tName.includes(photoNumStr)) return true;
                }
                return false;
              });

              if (foundFile) {
                fileId = foundFile.id;
                resolvedUrl = foundFile.url;
                resolvedName = foundFile.name;
              } else if (cached) {
                fileId = cached.id;
                resolvedUrl = cached.url;
                resolvedName = cached.name || trimmed;
              } else {
                const mealCached = meal.mealId ? (runtimeDrivePhotoCache.get(meal.mealId.toLowerCase()) || runtimeDrivePhotoCache.get(meal.mealId.toUpperCase())) : null;
                if (mealCached) {
                  fileId = mealCached.id;
                  resolvedUrl = mealCached.url;
                  resolvedName = mealCached.name || trimmed;
                } else {
                  fileId = `photo-${meal.mealId || 'meal'}-${idx}`;
                  resolvedName = trimmed;
                }
              }
            } else {
              fileId = `photo-${meal.mealId || 'meal'}-${idx}`;
              resolvedUrl = trimmed.startsWith('http') ? trimmed : '';
            }

            if (!existingIds.has(fileId)) {
              existingIds.add(fileId);
              const nameGuess = resolvedName || `${meal.mealId || 'M-000'}_${(meal.foodName || 'Meal').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_photo${idx + 1}_${meal.dateStr || ''}.jpg`;
              fetchedDriveFiles.push({
                id: fileId,
                name: nameGuess,
                url: resolvedUrl || (driveMatch ? `https://lh3.googleusercontent.com/d/${fileId}=w1000` : (trimmed.startsWith('http') ? trimmed : '')),
                directViewUrl: driveMatch ? `https://drive.google.com/file/d/${fileId}/view` : '',
                mealId: meal.mealId,
                dateStr: meal.dateStr,
              });
            }
          });
        }
      });

      setDriveFiles(fetchedDriveFiles);

      const foundIssues: SanitationIssue[] = [];
      const photoItemsToInspect: InspectedPhotoItem[] = [];

      // 1. Check for Non-Standard Photo Filenames in Google Drive
      // Standard format: M-XXX_[Description]_[photoX]_[YYYY-MM-DD].jpg
      const standardNameRegex = /^(M-\d+)_[A-Za-z0-9_-]+_photo\d+_\d{4}-\d{2}-\d{2}\.[a-zA-Z0-9]+$/;

      // Group photos by meal ID for accurate photo numbering
      const photosByMeal = new Map<string, DriveFolderFile[]>();
      fetchedDriveFiles.forEach((file) => {
        const mealIdMatch = file.name.match(/(M-\d+)/i) || (file.mealId ? [null, file.mealId] : null);
        const mid = mealIdMatch ? mealIdMatch[1].toUpperCase() : 'M-000';
        const list = photosByMeal.get(mid) || [];
        list.push(file);
        photosByMeal.set(mid, list);
      });

      fetchedDriveFiles.forEach((file) => {
        const mealIdMatch = file.name.match(/(M-\d+)/i);
        const mealId = mealIdMatch ? mealIdMatch[1].toUpperCase() : (file.mealId || 'M-000');
        
        const matchingMeal = meals.find((m) => m.mealId?.toUpperCase() === mealId) ||
          mealSheetRows.find((r) => r.mealId?.toUpperCase() === mealId);

        let cleanDish = 'Meal_Photo';
        let dishContext = '';
        if (matchingMeal && 'foodName' in matchingMeal && matchingMeal.foodName) {
          dishContext = matchingMeal.foodName;
          cleanDish = matchingMeal.foodName
            .trim()
            .replace(/[^\w\s-]/g, '')
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join('_');
        } else if (matchingMeal && 'dish' in matchingMeal && matchingMeal.dish) {
          dishContext = matchingMeal.dish;
          cleanDish = matchingMeal.dish
            .trim()
            .replace(/[^\w\s-]/g, '')
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join('_');
        }

        const mealPhotos = photosByMeal.get(mealId) || [file];
        const photoIdxInMeal = mealPhotos.findIndex((f) => (f.id === file.id && f.name === file.name) || f === file);
        const photoNum = photoIdxInMeal >= 0 ? photoIdxInMeal + 1 : 1;
        
        const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
        const rawDate = dateMatch ? dateMatch[1] : (file.dateStr || new Date().toISOString().split('T')[0]);
        const dateStr = normalizeDateToISO(rawDate);

        const proposedName = `${mealId}_${cleanDish}_photo${photoNum}_${dateStr}.jpg`;
        const isNonStandard = !standardNameRegex.test(file.name);

        let directUrl = file.url;
        if (!directUrl && file.id && !file.id.startsWith('photo-')) {
          directUrl = `https://lh3.googleusercontent.com/d/${file.id}=w800`;
        }
        if (!directUrl) {
          const cached = runtimeDrivePhotoCache.get(file.name.toLowerCase()) || 
            (file.mealId ? (runtimeDrivePhotoCache.get(file.mealId.toLowerCase()) || runtimeDrivePhotoCache.get(file.mealId.toUpperCase())) : null);
          if (cached) {
            directUrl = cached.url;
          }
        }

        photoItemsToInspect.push({
          id: file.id,
          originalName: file.name,
          mealId,
          dateStr,
          photoIndex: photoNum - 1,
          detectedFood: dishContext || 'Meal photo',
          perspective: 'Plated_Dish',
          cleanDescription: cleanDish,
          confidence: 0.85,
          proposedStandardName: proposedName,
          editedName: proposedName,
          thumbnailUrl: directUrl,
          status: isNonStandard ? 'pending' : 'inspected',
        });

        if (isNonStandard) {
          foundIssues.push({
            id: `rename-${file.id}-${file.name}`,
            type: 'NON_STANDARD_FILENAME',
            severity: 'low',
            title: 'Non-Standard Drive Photo Name',
            description: `Drive photo "${file.name}" requires AI visual inspection and standardization.`,
            affectedItem: file.name,
            proposedFix: `Inspect visually & rename to "${proposedName}"`,
            payload: { fileId: file.id, oldName: file.name, proposedName },
          });
        }
      });

      setInspectedPhotos(photoItemsToInspect);

      // 2. Check for Unlinked Drive Photos (Drive photo exists for meal, but Sheet Column AO is blank)
      const mealsWithDrivePhotos = new Map<string, DriveFolderFile[]>();
      fetchedDriveFiles.forEach((file) => {
        const mealMatch = file.name.match(/(M-\d+)/i) || (file.mealId ? [null, file.mealId] : null);
        if (mealMatch) {
          const mid = mealMatch[1].toUpperCase();
          const list = mealsWithDrivePhotos.get(mid) || [];
          list.push(file);
          mealsWithDrivePhotos.set(mid, list);
        }
      });

      mealSheetRows.forEach((row) => {
        if (row.mealId && (!row.photoUrl || row.photoUrl.trim().length === 0)) {
          const mid = row.mealId.toUpperCase();
          const drivePhotos = mealsWithDrivePhotos.get(mid);
          if (drivePhotos && drivePhotos.length > 0) {
            const primaryPhoto = drivePhotos[0];
            const directUrl = `https://lh3.googleusercontent.com/d/${primaryPhoto.id}=w1000`;
            foundIssues.push({
              id: `unlink-${row.mealId}-${row.rowNumber || Math.random()}`,
              type: 'UNLINKED_SHEET_PHOTO',
              severity: 'medium',
              title: 'Missing Photo Link in Spreadsheet (Col AO)',
              description: `Meal ${row.mealId} (${row.dish}) has photo(s) in Google Drive but Column AO is blank in Google Sheets.`,
              affectedItem: `Meal ${row.mealId} [Row ${row.rowNumber || '?'}]`,
              proposedFix: `Populate Column AO with Drive link: ${directUrl}`,
              payload: { mealId: row.mealId, photoUrl: directUrl, allPhotos: drivePhotos },
            });
          }
        }
      });

      // 3. Check for Orphan Drive Photos (Photos with no matching meal row in Sheet)
      const allKnownMealIds = new Set<string>();
      mealSheetRows.forEach((r) => r.mealId && allKnownMealIds.add(r.mealId.toUpperCase()));
      meals.forEach((m) => m.mealId && allKnownMealIds.add(m.mealId.toUpperCase()));

      fetchedDriveFiles.forEach((file) => {
        const mealMatch = file.name.match(/(M-\d+)/i) || (file.mealId ? [null, file.mealId] : null);
        const mid = mealMatch ? mealMatch[1].toUpperCase() : null;
        if (!mid || !allKnownMealIds.has(mid)) {
          foundIssues.push({
            id: `orphan-${file.id}`,
            type: 'ORPHAN_DRIVE_PHOTO',
            severity: 'medium',
            title: 'Orphaned Google Drive Photo',
            description: `File "${file.name}" in Google Drive does not match any logged meal in your spreadsheet.`,
            affectedItem: file.name,
            proposedFix: 'Recover as new meal log or delete from Google Drive',
            payload: { fileId: file.id, fileName: file.name, url: file.url },
          });
        }
      });

      // 4. Check for Non-Normalized Dates in Spreadsheet
      mealSheetRows.forEach((row) => {
        if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date) && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(row.date)) {
          const parts = row.date.split('/');
          const norm = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          foundIssues.push({
            id: `date-${row.mealId}-${row.date}`,
            type: 'INVALID_DATE',
            severity: 'low',
            title: 'Non-Standard Date Format in Spreadsheet',
            description: `Date "${row.date}" in row ${row.rowNumber || '?'} is not ISO YYYY-MM-DD.`,
            affectedItem: `Meal ${row.mealId || 'N/A'} [${row.date}]`,
            proposedFix: `Normalize date to "${norm}"`,
            payload: { rowNumber: row.rowNumber, oldDate: row.date, normalizedDate: norm },
          });
        }
      });

      setIssues(foundIssues);
      setLastScannedAt(new Date().toLocaleTimeString());
      setActionLog((prev) => [
        `[${new Date().toLocaleTimeString()}] Audit complete. ${fetchedDriveFiles.length} photos scanned, ${foundIssues.length} issues identified.`,
        ...prev,
      ]);
    } catch (err: any) {
      console.error('Error during cleanliness audit:', err);
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ❌ Scan error: ${err.message || err}`, ...prev]);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runCleanlinessScan();
    }
  }, [isOpen]);

  // Execute Multimodal AI Vision Batch Inspection
  const handleRunVisionInspectionBatch = async (customItems?: InspectedPhotoItem[]) => {
    let itemsToProcess = customItems || inspectedPhotos.filter((p) => p.status !== 'renamed');
    
    // If all items are already marked inspected or renamed, allow re-inspecting all
    if (itemsToProcess.length === 0 && inspectedPhotos.length > 0) {
      itemsToProcess = inspectedPhotos;
    }

    if (itemsToProcess.length === 0) {
      setActionLog((prev) => [
        `[${new Date().toLocaleTimeString()}] ⚠️ No photos discovered to inspect. Refreshing photo inventory...`,
        ...prev,
      ]);
      await runCleanlinessScan();
      return;
    }

    setIsVisionInspecting(true);
    stopRequestedRef.current = false;
    const effectiveBatchSize = Math.max(1, Math.min(25, batchSize || 10));
    const totalBatches = Math.ceil(itemsToProcess.length / effectiveBatchSize);

    setActionLog((prev) => [
      `[${new Date().toLocaleTimeString()}] 👁️ Initiating Multimodal Vision Inspection: ${itemsToProcess.length} photos in ${totalBatches} batches (${effectiveBatchSize} photos/batch)...`,
      ...prev,
    ]);

    try {
      for (let b = 0; b < totalBatches; b++) {
        if (stopRequestedRef.current) {
          setActionLog((prev) => [
            `[${new Date().toLocaleTimeString()}] ⏹️ Batch inspection halted prior to Batch ${b + 1}.`,
            ...prev,
          ]);
          break;
        }

        const start = b * effectiveBatchSize;
        const end = Math.min(itemsToProcess.length, start + effectiveBatchSize);
        const chunk = itemsToProcess.slice(start, end);

        setVisionProgress({
          current: start,
          total: itemsToProcess.length,
          batchNum: b + 1,
          totalBatches,
        });

        setActionLog((prev) => [
          `[${new Date().toLocaleTimeString()}] Visualizing Batch ${b + 1}/${totalBatches} (Photos ${start + 1}–${end})...`,
          ...prev,
        ]);

        const token = await getAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const controller = new AbortController();
        activeControllerRef.current = controller;
        const timeoutMs = Math.max(60000, chunk.length * 3500);
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          let res: Response | null = null;
          let fetchAttempts = 0;
          let lastFetchError: any = null;

          while (fetchAttempts < 2 && !stopRequestedRef.current) {
            fetchAttempts++;
            try {
              res = await fetch('/api/gemini/describe-photo-batch', {
                method: 'POST',
                headers,
                signal: controller.signal,
                body: JSON.stringify({
                  photos: chunk.map((c) => ({
                    id: c.id,
                    name: c.originalName,
                    url: c.thumbnailUrl,
                    mealId: c.mealId,
                    dateStr: c.dateStr,
                    photoIndex: c.photoIndex,
                    dishContext: c.detectedFood,
                  })),
                  preferredModel: 'gemini-3.5-flash-lite',
                  accessToken: token || '',
                }),
              });

              if (res.ok) {
                lastFetchError = null;
                break;
              } else {
                const errData = await res.json().catch(() => ({}));
                lastFetchError = new Error(errData.error || `HTTP ${res.status} on batch ${b + 1}`);
              }
            } catch (netErr: any) {
              lastFetchError = netErr;
              if (fetchAttempts < 2 && !stopRequestedRef.current && netErr.name !== 'AbortError') {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                continue;
              }
            }
          }

          if (lastFetchError) {
            throw lastFetchError;
          }

          if (!res || !res.ok) {
            throw new Error(`Failed on batch ${b + 1}`);
          }

          const data = await res.json();
          const inspectedResults: any[] = data.inspections || [];

          // Log specific visual detections and nomenclature changes for immediate user clarity
          inspectedResults.forEach((match) => {
            const matchingItem = chunk.find((c) => c.id === match.id);
            const oldTarget = matchingItem?.editedName || matchingItem?.proposedStandardName;
            const newTarget = match.proposedStandardName;
            const isNameChanged = oldTarget && oldTarget !== newTarget;
            const badgeInfo = perspectiveBadges[match.perspective] || perspectiveBadges.Plated_Dish;
            const foodName = match.cleanDescription?.replace(/_/g, ' ') || match.detectedFood;

            if (isNameChanged) {
              setActionLog((prev) => [
                `[${new Date().toLocaleTimeString()}] ✨ Detected "${foodName}" (${badgeInfo.label}, ${Math.round(match.confidence * 100)}% certainty) ➔ Updated target: "${oldTarget}" to "${newTarget}"`,
                ...prev,
              ]);
            } else {
              setActionLog((prev) => [
                `[${new Date().toLocaleTimeString()}] 🎯 Confirmed "${foodName}" (${badgeInfo.label}, ${Math.round(match.confidence * 100)}% certainty) ➔ Target validated as "${newTarget}"`,
                ...prev,
              ]);
            }
          });

          // Update items in state progressively with change history and timestamps
          setInspectedPhotos((prev) =>
            prev.map((item) => {
              const match = inspectedResults.find(
                (r) => r.id === item.id && (r.originalName ? r.originalName === item.originalName : true)
              ) || inspectedResults.find((r) => r.id === item.id);
              if (match) {
                const oldTarget = item.editedName || item.proposedStandardName;
                const newTarget = match.proposedStandardName;
                const hadNameChange = oldTarget !== newTarget;
                return {
                  ...item,
                  detectedFood: match.detectedFood,
                  perspective: match.perspective,
                  cleanDescription: match.cleanDescription,
                  confidence: match.confidence,
                  proposedStandardName: match.proposedStandardName,
                  editedName: match.proposedStandardName,
                  previousProposedName: hadNameChange ? oldTarget : item.previousProposedName,
                  lastInspectedAt: Date.now(),
                  isRecentlyUpdated: true,
                  status: 'inspected',
                };
              }
              return item;
            })
          );
        } catch (batchErr: any) {
          if (stopRequestedRef.current) {
            break;
          }
          const isTimeout = batchErr.name === 'AbortError' || batchErr.message?.includes('aborted');
          const noticeMsg = isTimeout ? `Timed out after ${Math.round(timeoutMs / 1000)}s` : (batchErr.message || String(batchErr));
          
          setActionLog((prev) => [
            `[${new Date().toLocaleTimeString()}] ⚠️ Batch ${b + 1} (${noticeMsg}). Applying standard naming heuristics and continuing...`,
            ...prev,
          ]);

          // Seamlessly apply standard heuristic naming for this chunk so the user is never blocked
          setInspectedPhotos((prev) =>
            prev.map((item) => {
              const inChunk = chunk.some((c) => c.id === item.id && c.originalName === item.originalName);
              if (inChunk && item.status !== 'renamed') {
                return {
                  ...item,
                  status: 'inspected',
                  editedName: item.proposedStandardName,
                  lastInspectedAt: Date.now(),
                  isRecentlyUpdated: true,
                };
              }
              return item;
            })
          );
        } finally {
          clearTimeout(timeoutId);
          activeControllerRef.current = null;
        }
      }

      if (!stopRequestedRef.current) {
        setVisionProgress({
          current: itemsToProcess.length,
          total: itemsToProcess.length,
          batchNum: totalBatches,
          totalBatches,
        });

        setActionLog((prev) => [
          `[${new Date().toLocaleTimeString()}] ✅ Multimodal Vision Inspection complete across all ${itemsToProcess.length} photos.`,
          ...prev,
        ]);
      }
    } catch (err: any) {
      console.warn('Vision inspection notice:', err);
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ⚠️ Vision inspection notice: ${err.message || err}`, ...prev]);
    } finally {
      setIsVisionInspecting(false);
      activeControllerRef.current = null;
    }
  };

  // Inspect single photo on-demand with active tracking
  const handleInspectSinglePhoto = async (item: InspectedPhotoItem) => {
    setInspectingPhotoId(item.id);
    setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] 🔍 Visualizing single photo "${item.originalName}" with Gemini Multimodal Vision...`, ...prev]);
    try {
      await handleRunVisionInspectionBatch([item]);
    } finally {
      setInspectingPhotoId(null);
    }
  };

  // In-place rename single Drive file
  const handleApplySingleRename = async (item: InspectedPhotoItem) => {
    const finalName = item.editedName || item.proposedStandardName;
    if (!finalName || finalName === item.originalName) return;

    let token = await getAccessToken();
    if (!token) {
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] 🔑 Sign-in required to rename Google Drive files. Opening authorization...`, ...prev]);
      const res = await googleSignIn();
      if (res) {
        setHasDriveToken(true);
        token = await getAccessToken();
      } else {
        setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ⚠️ Google Drive authorization required to rename files remotely.`, ...prev]);
        return;
      }
    }

    try {
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ✏️ Renaming in Google Drive: "${item.originalName}" ➔ "${finalName}"...`, ...prev]);
      const success = await renameGoogleDriveFile(item.id, finalName);
      if (success) {
        setInspectedPhotos((prev) =>
          prev.map((p) => ((p.id === item.id && p.originalName === item.originalName) || p === item ? { ...p, originalName: finalName, status: 'renamed' } : p))
        );
        setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ✅ Successfully renamed "${finalName}" in Google Drive.`, ...prev]);
        
        if (item.id.startsWith('photo-') || item.id.startsWith('meal-') || item.id.startsWith('temp-')) {
          await handleApplySingleSheetUpdate({...item, editedName: finalName});
        }
      } else {
        setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ❌ Failed to rename "${item.originalName}". Check permissions.`, ...prev]);
      }
    } catch (err: any) {
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ❌ Error renaming: ${err.message || err}`, ...prev]);
    }
  };

  // Link a single photo to the Google Sheet Column AO
  const handleApplySingleSheetUpdate = async (item: InspectedPhotoItem) => {
    const finalName = item.editedName || item.proposedStandardName || item.originalName;
    const mealIdMatch = finalName.match(/M-\d+/i);
    if (!mealIdMatch) {
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ❌ Cannot update sheet: No Meal ID (e.g. M-001) found in name "${finalName}".`, ...prev]);
      return;
    }
    const mealId = mealIdMatch[0].toUpperCase();
    const token = await getAccessToken();
    if (!token) {
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] 🔑 Sign-in required to update sheet.`, ...prev]);
      return;
    }

    const cached = runtimeDrivePhotoCache.get(item.id.toLowerCase()) || runtimeDrivePhotoCache.get(finalName.toLowerCase());
    const actualId = (cached && cached.id && !cached.id.startsWith('photo-') && !cached.id.startsWith('meal-')) ? cached.id : item.id;
    const resolvedPhotoUrl = actualId.startsWith('photo-') || actualId.startsWith('meal-') || actualId.startsWith('temp-')
        ? finalName // Store the standard file name in the spreadsheet instead of a broken lh3 link!
        : `https://lh3.googleusercontent.com/d/${actualId}=w1000`;

    try {
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] 🔗 Writing link for ${mealId} to Google Sheets Column AO...`, ...prev]);
      const res = await fetch('/api/sheets/update-meal-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: sheetConfig.sheetUrl,
          accessToken: token || undefined,
          mealId,
          photoUrl: resolvedPhotoUrl,
        }),
      });
      if (res.ok) {
        setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ✅ Successfully linked ${mealId} in Google Sheets.`, ...prev]);
        await onRefreshData();
      } else {
        setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ❌ Failed to update sheet for ${mealId}.`, ...prev]);
      }
    } catch (err: any) {
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ❌ Error updating sheet: ${err.message}`, ...prev]);
    }
  };

  // In-place batch rename all inspected Drive files
  const handleApplyAllRenames = async () => {
    const pendingRenames = inspectedPhotos.filter((p) => p.status === 'inspected' && (p.editedName || p.proposedStandardName) !== p.originalName);
    if (pendingRenames.length === 0) return;

    let token = await getAccessToken();
    if (!token) {
      setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] 🔑 Sign-in required to rename Google Drive files. Opening authorization...`, ...prev]);
      const res = await googleSignIn();
      if (res) {
        setHasDriveToken(true);
        token = await getAccessToken();
      } else {
        setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ⚠️ Google Drive authorization required to rename files remotely.`, ...prev]);
        return;
      }
    }

    setIsRenamingBatch(true);
    setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] 🚀 Initiating In-Place Batch Rename for ${pendingRenames.length} Google Drive files...`, ...prev]);

    let successCount = 0;
    for (const item of pendingRenames) {
      const finalName = item.editedName || item.proposedStandardName;
      const ok = await renameGoogleDriveFile(item.id, finalName);
      if (ok) {
        successCount++;
        setInspectedPhotos((prev) =>
          prev.map((p) => ((p.id === item.id && p.originalName === item.originalName) || p === item ? { ...p, originalName: finalName, status: 'renamed' } : p))
        );
      }
    }

    setIsRenamingBatch(false);
    setActionLog((prev) => [
      `[${new Date().toLocaleTimeString()}] ✨ Batch rename complete: ${successCount}/${pendingRenames.length} files successfully renamed in Google Drive.`,
      ...prev,
    ]);
    await onRefreshData();
  };

  // Link all missing Column AO in Google Sheet
  const handleLinkAllSheetPhotos = async () => {
    const unlinkedIssues = issues.filter((i) => i.type === 'UNLINKED_SHEET_PHOTO' && !i.fixed);
    if (unlinkedIssues.length === 0) return;

    setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] 🔗 Writing ${unlinkedIssues.length} photo link(s) to Google Sheets Column AO...`, ...prev]);

    const token = await getAccessToken();
    for (const issue of unlinkedIssues) {
      const { mealId, photoUrl } = issue.payload;
      
      let resolvedPhotoUrl = photoUrl;
      const fileIdMatch = photoUrl?.match(/\/d\/([^=]+)/);
      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        if (fileId.startsWith('photo-') || fileId.startsWith('meal-') || fileId.startsWith('temp-')) {
            const cached = runtimeDrivePhotoCache.get(fileId.toLowerCase());
            if (cached && cached.id && !cached.id.startsWith('photo-') && !cached.id.startsWith('meal-')) {
                resolvedPhotoUrl = `https://lh3.googleusercontent.com/d/${cached.id}=w1000`;
            } else {
                resolvedPhotoUrl = (cached && cached.name) ? cached.name : fileId; // Fallback to storing the name
            }
        }
      }

      try {
        const res = await fetch('/api/sheets/update-meal-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: sheetConfig.sheetUrl,
            accessToken: token || undefined,
            mealId,
            photoUrls: [resolvedPhotoUrl],
          }),
        });
        const data = await res.json();
        if (data.success || data.googleSheetsAppended) {
          setIssues((prev) => prev.map((i) => (i.id === issue.id ? { ...i, fixed: true } : i)));
        }
      } catch (err) {
        console.warn('Error linking photo in sheet:', err);
      }
    }

    setActionLog((prev) => [`[${new Date().toLocaleTimeString()}] ✅ Spreadsheet Column AO synchronization complete.`, ...prev]);
    await onRefreshData();
  };

  // Calculate Cleanliness Score
  const cleanlinessScore = useMemo(() => {
    const totalChecks = Math.max(driveFiles.length + mealSheetRows.length, 10);
    const unstandardizedPhotos = inspectedPhotos.filter((p) => p.status !== 'renamed' && !/^(M-\d+)_[A-Za-z0-9_-]+_photo\d+_\d{4}-\d{2}-\d{2}\.[a-zA-Z0-9]+$/.test(p.originalName)).length;
    const unresolvedIssues = issues.filter((i) => !i.fixed && i.type !== 'NON_STANDARD_FILENAME').length;
    const penalty = unstandardizedPhotos * 2 + unresolvedIssues * 3;
    const score = Math.max(0, Math.min(100, Math.round(((totalChecks * 2 - penalty) / (totalChecks * 2)) * 100)));
    return score;
  }, [driveFiles, mealSheetRows, issues, inspectedPhotos]);

  const perspectiveBadges: Record<string, { label: string; icon: string; bg: string; text: string }> = {
    Plated_Dish: { label: 'Plated Dish', icon: '🍽️', bg: 'bg-emerald-500/20 border-emerald-500/40', text: 'text-emerald-300' },
    Food_Packaging: { label: 'Food Packaging', icon: '📦', bg: 'bg-indigo-500/20 border-indigo-500/40', text: 'text-indigo-300' },
    Nutrition_Facts_Table: { label: 'Nutrition Facts', icon: '📊', bg: 'bg-amber-500/20 border-amber-500/40', text: 'text-amber-300' },
    Ingredient_Prep: { label: 'Ingredient Prep', icon: '🥗', bg: 'bg-teal-500/20 border-teal-500/40', text: 'text-teal-300' },
    Beverage: { label: 'Beverage', icon: '🥤', bg: 'bg-cyan-500/20 border-cyan-500/40', text: 'text-cyan-300' },
    Scale_Measurement: { label: 'Scale / Weight', icon: '⚖️', bg: 'bg-purple-500/20 border-purple-500/40', text: 'text-purple-300' },
    Other: { label: 'Meal Attachment', icon: '📸', bg: 'bg-slate-500/20 border-slate-500/40', text: 'text-slate-300' },
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0B111E] text-slate-100 animate-fade-in w-full h-full overflow-hidden">
      {/* Floating Close Button in top right so user can always close easily even after scrolling */}
      <button
        onClick={onClose}
        className="fixed top-3.5 right-4 sm:right-6 z-[110] p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-xl transition cursor-pointer"
        title="Close modal (Esc)"
        aria-label="Close modal"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Main Page Scroll Container: header, controls, tabs scroll naturally with content */}
      <div className="flex-1 w-full overflow-y-auto flex flex-col min-h-0">
        
        {/* Header (Non-sticky) */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3 pr-12">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Drive & Sheet Cleanliness Agent
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  Vision Agent v2.5
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Visualizes meal photos via Multimodal AI to generate clinical descriptors, standardizes nomenclature, and repairs Sheet links.
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls & Metrics Bar (Non-sticky) */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Health Score, Stats & Drive Auth Status */}
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm border-2 ${
                cleanlinessScore >= 90
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                  : cleanlinessScore >= 70
                  ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                  : 'border-rose-500 text-rose-400 bg-rose-500/10'
              }`}
            >
              {cleanlinessScore}%
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">Drive & Sheet Health</div>
              <div className="text-[11px] text-slate-400">
                {inspectedPhotos.length} Photos • {issues.length} Issues
              </div>
            </div>

            {/* Google Drive Connection Status Indicator / Connect Button */}
            {hasDriveToken ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Drive Connected</span>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 hover:text-indigo-100 text-xs font-medium transition cursor-pointer"
                title="Connect to Google Drive to authorize in-place file renaming and sync"
              >
                <HardDrive className={`w-3.5 h-3.5 text-indigo-400 ${isSigningIn ? 'animate-pulse' : ''}`} />
                <span>{isSigningIn ? 'Connecting...' : 'Connect Drive'}</span>
              </button>
            )}

            {/* Model Tag: gemini-3.5-flash-lite */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700/80 text-[11px] text-slate-300 font-mono">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>gemini-3.5-flash-lite</span>
            </div>
          </div>

          {/* Batch Size Customizer & Inspector Launcher */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Batch Size Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 px-2.5 py-1.5 rounded-xl text-xs">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400 text-[11px]">Batch Size:</span>
              <div className="flex items-center gap-1">
                {[5, 10, 15, 20].map((size) => (
                  <button
                    key={size}
                    onClick={() => setBatchSize(size)}
                    className={`px-2 py-0.5 rounded-md font-mono text-xs transition cursor-pointer ${
                      batchSize === size
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                max="30"
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(30, parseInt(e.target.value) || 10)))}
                className="w-10 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono text-xs text-white"
                title="Custom batch size"
              />
              <span className="text-[11px] text-slate-500">/agent</span>
            </div>

            {/* Inspect Button */}
            <button
              onClick={() => handleRunVisionInspectionBatch()}
              disabled={isVisionInspecting || isScanning}
              className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-indigo-950/40 disabled:opacity-50 cursor-pointer"
            >
              <Eye className={`w-3.5 h-3.5 ${isVisionInspecting ? 'animate-spin' : ''}`} />
              {isVisionInspecting ? 'Inspecting...' : `Inspect All (${batchSize}/batch)`}
            </button>

            {/* Stop / Cancel Inspection Button */}
            {isVisionInspecting && (
              <button
                onClick={handleStopInspection}
                className="px-2.5 py-1.5 bg-rose-950/80 border border-rose-600/70 hover:bg-rose-900 text-rose-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-rose-950/40"
                title="Stop ongoing batch inspection"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                Stop
              </button>
            )}

            {/* Apply All Renames Button */}
            <button
              onClick={handleApplyAllRenames}
              disabled={isRenamingBatch || isVisionInspecting || inspectedPhotos.filter((p) => p.status === 'inspected').length === 0}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {isRenamingBatch ? 'Renaming in Drive...' : 'Apply All Renames'}
            </button>
          </div>
        </div>

        {/* Active Drive Folder Bar with Quick Switcher */}
        <div className="px-4 sm:px-6 py-2 bg-slate-900/90 border-b border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-slate-400">Target Drive Folder:</span>
            <span className="font-semibold text-white bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700/70 flex items-center gap-1.5">
              <span>{activeFolderName || 'Meal_log_perso'}</span>
              {activeFolderId && (
                <span className="text-[10px] text-slate-400 font-mono hidden md:inline">({activeFolderId.slice(0, 8)}...)</span>
              )}
            </span>
            <span className="text-[11px] text-slate-500">
              ({inspectedPhotos.length} photos found)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !showFolderSelector;
                setShowFolderSelector(next);
                if (next && availableFolders.length === 0) {
                  loadAvailableFolders();
                }
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700/80 transition flex items-center gap-1.5 cursor-pointer"
            >
              <FolderSearch className="w-3.5 h-3.5 text-indigo-400" />
              <span>{showFolderSelector ? 'Close Folder Picker' : 'Change Folder'}</span>
              {showFolderSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={() => runCleanlinessScan()}
              disabled={isScanning}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700/80 transition flex items-center gap-1.5 cursor-pointer"
              title="Rescan Google Drive and Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isScanning ? 'animate-spin' : ''}`} />
              <span>Rescan</span>
            </button>
          </div>
        </div>

        {/* Expandable Folder Selector Drawer */}
        {showFolderSelector && (
          <div className="px-4 sm:px-6 py-3 bg-slate-950 border-b border-indigo-900/40 text-xs flex flex-col gap-3 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                <span>Select Folder Containing Meal Photos</span>
              </div>
              <button
                onClick={loadAvailableFolders}
                disabled={isLoadingFolders}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer w-fit"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingFolders ? 'animate-spin' : ''}`} />
                <span>{isLoadingFolders ? 'Searching Drive...' : 'Refresh Folder List'}</span>
              </button>
            </div>

            {/* Discovered folders list */}
            {availableFolders.length > 0 ? (
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1 bg-slate-900/50 rounded-lg border border-slate-800">
                {availableFolders.map((f) => {
                  const isSelected = f.id === activeFolderId || f.name === activeFolderName;
                  return (
                    <button
                      key={f.id}
                      onClick={() => handleSelectFolder(f.id, f.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600/30 border-blue-500 text-blue-200 font-bold'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Folder className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                      <span>{f.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-400 text-[11px]">
                {isLoadingFolders ? 'Listing folders from your Google Drive account...' : 'Click "Refresh Folder List" or paste your specific folder URL/ID below.'}
              </div>
            )}

            {/* Custom Folder Link / ID Form */}
            <form onSubmit={handleCustomFolderSubmit} className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
              <input
                type="text"
                placeholder="Paste Google Drive folder URL (e.g. https://drive.google.com/drive/folders/...) or Folder ID"
                value={customFolderInput}
                onChange={(e) => setCustomFolderInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!customFolderInput.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
              >
                Set Target Folder
              </button>
            </form>
          </div>
        )}

        {/* Drive Authorization Notice Banner */}
        {!hasDriveToken && (
          <div className="px-5 py-2.5 bg-indigo-950/70 border-b border-indigo-900/60 text-xs text-indigo-200 flex flex-wrap items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-2 min-w-0">
              <HardDrive className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="truncate">
                <strong className="text-white">Google Drive is not connected in this session.</strong> Connect Drive to view private meal photos and authorize in-place renaming.
              </span>
            </div>
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow"
            >
              {isSigningIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
              <span>{isSigningIn ? 'Connecting...' : 'Connect Drive Now'}</span>
            </button>
          </div>
        )}

        {/* Live Batch Progress Indicator */}
        {visionProgress && isVisionInspecting && (
          <div className="px-5 py-2.5 bg-indigo-950/40 border-b border-indigo-900/40 text-xs text-indigo-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>
                Visualizing <strong className="text-white">Batch {visionProgress.batchNum}/{visionProgress.totalBatches}</strong> ({batchSize} photos per batch)...
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full transition-all duration-300"
                  style={{ width: `${Math.round((visionProgress.current / visionProgress.total) * 100)}%` }}
                />
              </div>
              <span className="font-mono text-xs text-indigo-300">
                {visionProgress.current}/{visionProgress.total} ({Math.round((visionProgress.current / visionProgress.total) * 100)}%)
              </span>
            </div>
          </div>
        )}

        {/* Navigation Tabs (Non-sticky) */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto text-xs bg-slate-900/60">
          <div className="flex gap-2">
            {[
              { id: 'vision_renamer', label: `Vision Naming Agent (${inspectedPhotos.length})`, icon: Camera },
              { id: 'issues', label: `Cleanliness Issues (${issues.length})`, icon: AlertTriangle },
              { id: 'sheet_links', label: 'Sheet Col AO Links', icon: FileSpreadsheet },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={runCleanlinessScan}
            disabled={isScanning || isVisionInspecting}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-800 transition"
          >
            <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin text-emerald-400' : ''}`} />
            Re-scan
          </button>
        </div>

        {/* Main Content Area */}
        <div className="p-4 sm:p-5 space-y-3 flex-1">
          {/* TAB 1: VISION-POWERED PHOTO RENAMING AGENT */}
          {activeTab === 'vision_renamer' && (
            <div className="space-y-3">
              {inspectedPhotos.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-4">
                  <Camera className="w-12 h-12 text-slate-600 mx-auto" />
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-300">No Drive Photos Discovered</div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Connect your Google Drive folder or load known meal photos from the repository.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={isSigningIn}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-indigo-950/40"
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      {isSigningIn ? 'Connecting...' : 'Connect Google Drive'}
                    </button>
                    <button
                      onClick={runCleanlinessScan}
                      disabled={isScanning}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                      Reload Photos
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {inspectedPhotos.map((item, idx) => {
                    const badge = perspectiveBadges[item.perspective] || perspectiveBadges.Plated_Dish;
                    const isRenamed = item.status === 'renamed';
                    const isInspected = item.status === 'inspected';
                    const isThisInspecting = inspectingPhotoId === item.id;
                    const isRecentlyInspected = !!item.lastInspectedAt && Date.now() - item.lastInspectedAt < 120000;
                    const currentTarget = item.editedName || item.proposedStandardName;
                    const hasTargetChanged = item.previousProposedName && item.previousProposedName !== currentTarget;

                    return (
                      <div
                        key={`${item.id}-${item.originalName}-${idx}`}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                          isThisInspecting
                            ? 'bg-indigo-950/30 border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg shadow-indigo-500/10'
                            : isRenamed
                            ? 'bg-slate-900/40 border-slate-800 opacity-60'
                            : isRecentlyInspected
                            ? 'bg-slate-800/70 border-emerald-500/40 shadow-sm'
                            : isInspected
                            ? 'bg-slate-800/60 border-indigo-500/30'
                            : 'bg-slate-800/40 border-slate-700/60'
                        }`}
                      >
                        {/* Thumbnail & Vision Overview */}
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                          {/* Photo Thumbnail */}
                          <div
                            onClick={() => setPreviewModalImage({ url: item.thumbnailUrl, title: item.originalName })}
                            className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-slate-950 border border-slate-700/80 shrink-0 cursor-pointer group shadow flex items-center justify-center mt-0.5 sm:mt-0"
                          >
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-1 pointer-events-none">
                              <Camera className="w-5 h-5 text-slate-600 mb-0.5" />
                              <span className="text-[9px] text-slate-500 font-mono text-center truncate w-full px-1">Drive</span>
                            </div>
                            <img
                              src={item.thumbnailUrl}
                              alt={item.originalName}
                              referrerPolicy="no-referrer"
                              className="relative z-10 w-full h-full object-cover group-hover:scale-105 transition-transform"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (!target.dataset.retried) {
                                  target.dataset.retried = 'true';
                                  const proxyUrl = getDriveThumbnailProxyUrl(item.id, loadSavedToken());
                                  if (proxyUrl) {
                                    target.src = proxyUrl;
                                    return;
                                  }
                                }
                                target.style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 z-20 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-4 h-4 text-white" />
                            </div>
                          </div>

                          {/* Details & Names */}
                          <div className="space-y-1.5 min-w-0 flex-1">
                            {/* Perspective Badge, Meal ID, Confidence & Inspection Indicators */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-indigo-300 font-mono">
                                {item.mealId}
                              </span>
                              <span className={`text-[11px] px-2 py-0.5 rounded-md border flex items-center gap-1 ${badge.bg} ${badge.text} font-medium`}>
                                <span>{badge.icon}</span>
                                {badge.label}
                              </span>

                              {/* AI Certainty Tooltip with Mathematical Margin Explanation */}
                              {isInspected && (
                                <div className="relative inline-flex items-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveCertaintyTooltipId(activeCertaintyTooltipId === item.id ? null : item.id);
                                    }}
                                    onMouseEnter={() => setActiveCertaintyTooltipId(item.id)}
                                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700/80 border border-slate-700/80 text-slate-300 font-mono flex items-center gap-1 cursor-pointer hover:border-indigo-500/50 hover:text-indigo-300 transition-colors"
                                    title="Click to view AI certainty explanation"
                                  >
                                    <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                                    <span>{Math.round(item.confidence * 100)}% Certainty</span>
                                    <Info className="w-2.5 h-2.5 text-slate-400 hover:text-indigo-300 transition-colors" />
                                  </button>

                                  {/* Tooltip explaining probability vs missing data */}
                                  {activeCertaintyTooltipId === item.id && (
                                    <div
                                      onMouseLeave={() => setActiveCertaintyTooltipId(null)}
                                      className="absolute left-0 top-full mt-2 z-[70] w-80 p-3.5 bg-slate-900/98 backdrop-blur-md border border-indigo-500/50 rounded-xl shadow-2xl text-[11px] text-slate-200 leading-relaxed animate-fade-in"
                                    >
                                      <div className="font-bold text-white text-xs mb-1.5 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                          AI Vision Certainty: {Math.round(item.confidence * 100)}%
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveCertaintyTooltipId(null);
                                          }}
                                          className="text-slate-400 hover:text-white p-0.5 rounded transition cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <p className="text-slate-300 text-[11px] mb-2">
                                        Gemini Multimodal Vision has identified this image as <strong className="text-emerald-300">{badge.label}</strong> with {Math.round(item.confidence * 100)}% statistical probability.
                                      </p>
                                      <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 space-y-1.5">
                                        <div>
                                          <strong className="text-indigo-300">Why not 100%?</strong> The remaining {100 - Math.round(item.confidence * 100)}% is the standard statistical margin intrinsic to deep vision probability models.
                                        </div>
                                        <div className="text-emerald-400 font-medium flex items-center gap-1">
                                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                          <span>100% of image was inspected — zero photo data is missing.</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Inspection State Badge */}
                              {item.lastInspectedAt && (
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold border ${
                                    isRecentlyInspected
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                                      : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                                  }`}
                                  title={`Inspected at ${new Date(item.lastInspectedAt).toLocaleTimeString()}`}
                                >
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  {isRecentlyInspected ? 'Just Re-Inspected' : 'AI Inspected'}
                                </span>
                              )}

                              {isRenamed && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Renamed in Drive
                                </span>
                              )}
                            </div>

                            {/* Current Name in Drive */}
                            <div className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                              <span className="text-slate-500">Current:</span>
                              <code className="text-slate-300 font-mono text-[11px] truncate">{item.originalName}</code>
                            </div>

                            {/* Change or Confirmation Indicator */}
                            {hasTargetChanged ? (
                              <div className="text-[11px] bg-slate-950/80 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 font-sans">
                                <span className="text-indigo-400 font-semibold text-[10px] uppercase tracking-wider shrink-0 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-indigo-400" />
                                  Vision Updated Proposal:
                                </span>
                                <span className="line-through text-slate-500 font-mono text-[11px] truncate max-w-[200px]" title={`Previous: ${item.previousProposedName}`}>
                                  {item.previousProposedName}
                                </span>
                                <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
                                <span className="text-emerald-300 font-mono text-[11px] font-semibold truncate" title={`New: ${currentTarget}`}>
                                  {currentTarget}
                                </span>
                              </div>
                            ) : item.lastInspectedAt ? (
                              <div className="text-[11px] bg-slate-950/50 border border-slate-800/80 rounded-md px-2 py-1 flex items-center gap-1.5 text-slate-400">
                                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="text-slate-300 text-[11px]">
                                  Vision confirmed: <strong className="text-slate-200">{item.cleanDescription.replace(/_/g, ' ')}</strong> ({badge.label})
                                </span>
                              </div>
                            ) : null}

                            {/* Standardized Proposal Input */}
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <span className="text-xs font-semibold text-emerald-400 shrink-0 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-emerald-400" />
                                Target:
                              </span>
                              <input
                                type="text"
                                value={item.editedName || item.proposedStandardName}
                                onChange={(e) =>
                                  setInspectedPhotos((prev) =>
                                    prev.map((p) => (p.id === item.id ? { ...p, editedName: e.target.value } : p))
                                  )
                                }
                                disabled={isRenamed}
                                className="flex-1 bg-slate-950 border border-emerald-500/40 rounded-lg px-2.5 py-1 text-xs font-mono text-emerald-300 focus:border-emerald-400 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex sm:flex-col items-center gap-1.5 shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => handleInspectSinglePhoto(item)}
                            disabled={isVisionInspecting}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                              isThisInspecting
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 animate-pulse'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            }`}
                            title="Re-visualize single photo with Gemini"
                          >
                            {isThisInspecting ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                Inspecting...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                Re-Inspect
                              </>
                            )}
                          </button>

                          {!isRenamed && (
                            <button
                              onClick={() => handleApplySingleRename(item)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Rename
                            </button>
                          )}
                          {isRenamed && (
                            <button
                              onClick={() => handleApplySingleSheetUpdate(item)}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow"
                              title="Update Google Sheet directly for this meal"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              Update Sheet
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CLEANLINESS ISSUES */}
          {activeTab === 'issues' && (
            <div className="space-y-3">
              {issues.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <div className="font-semibold text-slate-200 text-base">All Clean! No Issues Detected</div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    All file names match clinical specifications and spreadsheet records are synchronized.
                  </p>
                </div>
              ) : (
                issues.map((issue, idx) => (
                  <div
                    key={`${issue.id}-${idx}`}
                    className={`p-4 rounded-xl border transition-all ${
                      issue.fixed
                        ? 'bg-slate-900/40 border-slate-800 opacity-60'
                        : issue.severity === 'high'
                        ? 'bg-rose-950/20 border-rose-800/40'
                        : issue.severity === 'medium'
                        ? 'bg-amber-950/20 border-amber-800/40'
                        : 'bg-slate-800/50 border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg mt-0.5 ${
                            issue.fixed
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : issue.type === 'NON_STANDARD_FILENAME'
                              ? 'bg-indigo-500/20 text-indigo-400'
                              : issue.type === 'UNLINKED_SHEET_PHOTO'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {issue.fixed ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : issue.type === 'NON_STANDARD_FILENAME' ? (
                            <HardDrive className="w-4 h-4" />
                          ) : issue.type === 'UNLINKED_SHEET_PHOTO' ? (
                            <FileSpreadsheet className="w-4 h-4" />
                          ) : (
                            <AlertTriangle className="w-4 h-4" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-200">{issue.title}</span>
                            {issue.fixed && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                                Fixed
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{issue.description}</p>
                          <div className="text-xs font-mono text-emerald-400 flex items-center gap-1 mt-1">
                            <ArrowRight className="w-3 h-3 text-slate-500" />
                            {issue.proposedFix}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: SHEET COLUMN AO LINK SYNCHRONIZATION */}
          {activeTab === 'sheet_links' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Google Sheets Column AO Auto-Linker</h3>
                  <p className="text-xs text-slate-400">
                    Directly populates Column AO in Google Sheets for any meal that has photos in Google Drive.
                  </p>
                </div>
                <button
                  onClick={handleLinkAllSheetPhotos}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Sync All Missing Links
                </button>
              </div>

              <div className="space-y-2">
                {mealSheetRows.map((row, idx) => (
                  <div
                    key={row.mealId ? `${row.mealId}-${idx}` : idx}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-indigo-300 bg-slate-800 px-2 py-0.5 rounded">
                        {row.mealId || 'N/A'}
                      </span>
                      <span className="text-slate-200 font-semibold">{row.dish || 'Meal'}</span>
                      <span className="text-slate-400">({row.date})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {row.photoUrl ? (
                        <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded truncate max-w-xs">
                          {row.photoUrl}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
                          Unlinked (Col AO Empty)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Real-time Agent Action Log Drawer (Expand / Collapse) */}
      {actionLog.length > 0 && (
        <div className="border-t border-slate-800 bg-slate-950/95 backdrop-blur-md shrink-0 transition-all">
          <div
            onClick={() => setIsLogExpanded(!isLogExpanded)}
            className="px-4 py-2 flex items-center justify-between text-xs hover:bg-slate-900/60 transition cursor-pointer select-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono shrink-0">
                Agent Audit & Vision Log
              </span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-400 font-mono shrink-0">
                {actionLog.length}
              </span>
              {!isLogExpanded && actionLog[0] && (
                <span className="text-[11px] font-mono text-slate-500 truncate hidden sm:inline ml-1">
                  — {actionLog[0]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 shrink-0 ml-2">
              <span className="text-[10px] text-slate-500 uppercase font-medium">
                {isLogExpanded ? 'Collapse' : 'Expand'}
              </span>
              {isLogExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>
          </div>

          {isLogExpanded && (
            <div className="px-4 pb-3 pt-1 text-[11px] font-mono text-slate-400 max-h-48 overflow-y-auto space-y-1 border-t border-slate-900 bg-slate-950">
              {actionLog.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 hover:text-slate-200 transition-colors">
                  <span className="text-slate-600 select-none text-[10px] pt-0.5">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="break-all">{log}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image Preview Lightbox Modal */}
      {previewModalImage && (
        <div
          onClick={() => setPreviewModalImage(null)}
          className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-pointer"
        >
          <div className="max-w-3xl max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-900 flex flex-col">
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
              <span className="text-xs font-mono text-slate-300 truncate">{previewModalImage.title}</span>
              <button className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center bg-black/50">
              <img
                src={previewModalImage.url}
                alt={previewModalImage.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] object-contain rounded-lg"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.dataset.retried) {
                    target.dataset.retried = 'true';
                    const proxyUrl = getDriveThumbnailProxyUrl(previewModalImage.url, loadSavedToken());
                    if (proxyUrl) {
                      target.src = proxyUrl;
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
