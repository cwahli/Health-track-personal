import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Terminal,
  X,
  Image as ImageIcon,
  Camera,
  Send,
  Copy,
  Check,
  PlusCircle,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FolderSync,
  HeartPulse,
  Scale,
  Apple,
  UploadCloud,
  Code2,
  FileText,
  Braces,
  Layers,
  FileDown,
  Download,
  ShieldCheck,
  Zap,
  Edit3,
  Trash2,
  Plus,
} from 'lucide-react';
import { LoggedMeal, MealLogRow } from '../types';
import { GOOGLE_DRIVE_FOLDER_ID, GOOGLE_DRIVE_FOLDER_URL } from '../data/googleDriveFolderData';
import {
  uploadImageToGoogleDrive,
  uploadMultipleImagesToGoogleDrive,
  rollbackUploadedDriveFiles,
  verifyDriveFilesExist,
} from '../utils/driveUploader';
import { getAccessToken, isGoogleDriveAuthorized, googleSignIn } from '../utils/googleAuth';
import { compressImageToTargetSize, formatBytes } from '../utils/imageCompressor';
import { DiagnosticTracker } from '../utils/diagnosticReport';
import { getDailyNutrientLedger } from '../utils/dashboardFoodLedger';
import exifr from 'exifr';

interface FoodNutritionAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMeal: (meal: LoggedMeal, sheetRows?: MealLogRow[]) => void;
  onDeleteMeal?: (mealId: string) => Promise<void> | void;
  defaultMealId?: string;
  defaultMealSlot?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Late Night';
  defaultDateStr?: string;
  initialSelectedFile?: File | null;
  initialSelectedFiles?: File[] | null;
}

export interface StagedPhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  compressedSizeFormatted?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  timestamp: string;
  text?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageFileName?: string;
  imageFileNames?: string[];
  imageSizeFormatted?: string;
  driveFileUrl?: string;
  driveFileUrls?: string[];
  driveFileIds?: string[];
  pendingImageFile?: File;
  pendingImageFiles?: File[];
  isSavedToJournal?: boolean;
  savedMealId?: string;
  // Agent review data
  analysis?: {
    dishName: string;
    totalDishWeightG?: number;
    portionWeightG?: number;
    weightDifferenceDetected?: boolean;
    weightClarificationPrompt?: string;
    confirmedWeightG?: number;
    mealDiagnosis: string;
    dailyDiagnosis: string;
    clinicalSummary: string;
    rows: MealLogRow[];
    columnHeaders: string[];
    tsvFormatted: string;
    aggregatedTotals: {
      calories: number;
      protein: number;
      totalFat: number;
      saturatedFat: number;
      carbs: number;
      fiber: number;
      sodium: number;
      potassium: number;
      addedSugars: number;
    };
    atwaterEvaluation?: {
      totalWeightG: number;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      atwaterSum: number;
      atwaterDiff: number;
      caloricDensity: number;
      withinTolerance: boolean;
    };
    modelUsed: string;
  };
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', tag: 'Default • Fast' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', tag: 'High Precision' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', tag: 'Deep Reasoning' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash Latest', tag: 'Production' },
];

export const FoodNutritionAgentModal: React.FC<FoodNutritionAgentModalProps> = ({
  isOpen,
  onClose,
  onAddMeal,
  onDeleteMeal,
  defaultMealId = 'M-027',
  defaultMealSlot = 'Breakfast',
  defaultDateStr = '2026-09-08',
  initialSelectedFile = null,
  initialSelectedFiles = null,
}) => {
  // Selected model defaults to flash 3.5 lite per user instructions
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash-lite');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Raw view toggle (>_ terminal icon)
  const [showRawTSVView, setShowRawTSVView] = useState(false);

  // Accordion for "Data used by agent"
  const [isDataAccordionOpen, setIsDataAccordionOpen] = useState(false);
  const [dataAccordionTab, setDataAccordionTab] = useState<'overview' | 'prompt' | 'payload' | 'schema'>('overview');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleCopyText = (text: string, sectionKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionKey);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const [photoDateStr, setPhotoDateStr] = useState<string>('');
  const [dailyNutrientLedgerTable, setDailyNutrientLedgerTable] = useState<string>('');
  
  const [activeMealId, setActiveMealId] = useState<string>(defaultMealId);

  useEffect(() => {
    if (isOpen) {
      setActiveMealId(defaultMealId);
      const fetchNextId = async () => {
        try {
          const sheetUrl = localStorage.getItem('nutrihealth_sheet_url') || '';
          let accessToken = await getAccessToken();
          const idRes = await fetch(`/api/sheets/next-meal-id?sheetUrl=${encodeURIComponent(sheetUrl)}&token=${encodeURIComponent(accessToken || '')}`);
          if (idRes.ok) {
             const idData = await idRes.json();
             if (idData.nextMealId) setActiveMealId(idData.nextMealId);
          }
        } catch(e) {
          console.warn('Could not fetch next meal ID:', e);
        }
      };
      fetchNextId();
    }
  }, [isOpen, defaultMealId]);

  // Active chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'greeting',
      sender: 'agent',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: 'Hello! Tell me or upload photos of what you are planning to eat, and I will analyze health benefits, risk factors, and full 38-column Google Sheet nutrient breakdown with Atwater energy validation and zero-duplication clinical diagnosis.',
    },
  ]);

  // Multi-image input state
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhotoItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [copiedTsvMessageId, setCopiedTsvMessageId] = useState<string | null>(null);
  const [isSavingMealId, setIsSavingMealId] = useState<string | null>(null);
  const [savingStatusMsg, setSavingStatusMsg] = useState<string | null>(null);

  // Deleting whole meal & starting new state
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<ChatMessage | null>(null);
  const [isDeletingWholeMeal, setIsDeletingWholeMeal] = useState(false);
  const [deleteSuccessBanner, setDeleteSuccessBanner] = useState<string | null>(null);

  // Editing component rows inside chat message
  const [editingRowIndex, setEditingRowIndex] = useState<{ msgId: string; rowIndex: number } | null>(null);
  const [customWeights, setCustomWeights] = useState<Record<string, string>>({});
  const [selectedDiscrepancyRow, setSelectedDiscrepancyRow] = useState<Record<string, number | 'all'>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAnalyzing]);

  // Load dashboard-food daily nutrient ledger
  useEffect(() => {
    try {
      const ledger = getDailyNutrientLedger(photoDateStr || defaultDateStr);
      setDailyNutrientLedgerTable(ledger.formattedTable);
    } catch (e) {
      console.warn('Failed to compute daily nutrient ledger:', e);
    }
  }, [photoDateStr, defaultDateStr]);

  // Handle initial selected files if provided
  useEffect(() => {
    if (initialSelectedFiles && initialSelectedFiles.length > 0) {
      handleFilesSelected(initialSelectedFiles);
    } else if (initialSelectedFile) {
      handleFilesSelected([initialSelectedFile]);
    }
  }, [initialSelectedFile, initialSelectedFiles]);

  const handleFilesSelected = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    const newStaged: StagedPhotoItem[] = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const previewUrl = URL.createObjectURL(file);

      let finalFile = file;
      let compInfo = formatBytes(file.size);
      try {
        const comp = await compressImageToTargetSize(file, 200 * 1024);
        finalFile = comp.file;
        if (comp.wasCompressed) {
          compInfo = `${formatBytes(comp.originalSize)} → ${formatBytes(comp.compressedSize)} (<200 KB)`;
        }
      } catch (e) {
        // use default size info
      }

      newStaged.push({
        id: `staged-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        file: finalFile,
        previewUrl,
        compressedSizeFormatted: compInfo,
      });
    }

    setStagedPhotos((prev) => [...prev, ...newStaged]);
  };

  const handleRemoveStagedPhoto = (id: string) => {
    setStagedPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleClearStagedPhotos = (revoke: boolean = true) => {
    if (revoke) {
      stagedPhotos.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
    }
    setStagedPhotos([]);
    
    // Delay clearing the physical DOM inputs to prevent the browser from severing 
    // the underlying file handles before FileReader can finish reading them into memory.
    setTimeout(() => {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }, 3000);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() && stagedPhotos.length === 0) return;

    const userText = inputText.trim();
    const currentStaged = [...stagedPhotos];

    // Reset input fields immediately but DO NOT revoke preview URLs so chat bubbles can display them
    setInputText('');
    handleClearStagedPhotos(false);

    const userMessageId = `msg-user-${Date.now()}`;
    const previewUrls = currentStaged.map((p) => p.previewUrl);
    const fileNames = currentStaged.map((p) => p.file.name);
    const rawFiles = currentStaged.map((p) => p.file);

    const userMsg: ChatMessage = {
      id: userMessageId,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: userText || (currentStaged.length > 0 ? `Review attached ${currentStaged.length} meal photo(s) for Google Sheet` : ''),
      imageUrl: previewUrls[0] || undefined,
      imageUrls: previewUrls,
      imageFileName: fileNames[0] || undefined,
      imageFileNames: fileNames,
      imageSizeFormatted: currentStaged[0]?.compressedSizeFormatted,
      pendingImageFile: rawFiles[0],
      pendingImageFiles: rawFiles,
    };

    setMessages((prev) => [...prev, userMsg]);

    // Check if user is asking to adjust a specific ingredient in the existing meal analysis
    const lastAgentMsg = [...messages].reverse().find(
      (m) => m.sender === 'agent' && m.analysis && m.analysis.rows && m.analysis.rows.length > 0
    );

    if (currentStaged.length === 0 && lastAgentMsg && lastAgentMsg.analysis) {
      const lower = userText.toLowerCase();
      // Look for target weight in grams (e.g., "to 200", "set ... to 200", "200g", "200 g")
      const weightMatch = lower.match(/(?:to\s*|set\s*|is\s*|=|\b)(\d+(?:\.\d+)?)\s*(?:g|grams?|\b)/i);
      if (weightMatch) {
        const targetWeight = Number(weightMatch[1]);
        if (targetWeight > 0) {
          const rows = lastAgentMsg.analysis.rows;
          let matchedIdx = -1;
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const name = ((r.dishName || '') + ' ' + (r.ingredient || '')).toLowerCase();
            const words = name.split(/[\s,()/-]+/).filter(w => w.length >= 3);
            if (words.some(w => lower.includes(w))) {
              matchedIdx = i;
              break;
            }
          }

          if (matchedIdx >= 0) {
            handleScaleMealWeight(lastAgentMsg.id, targetWeight, matchedIdx);

            const matchedRow = rows[matchedIdx];
            const targetName = matchedRow.dishName || matchedRow.ingredient;
            const otherRows = rows.filter((_, idx) => idx !== matchedIdx);
            const otherNames = otherRows.map(r => `${r.dishName || r.ingredient} (${r.weightG}g)`).join(', ');

            const confirmationMsg: ChatMessage = {
              id: `msg-agent-${Date.now()}`,
              sender: 'agent',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              text: `✅ Updated **${targetName}** to **${targetWeight}g** and recalculated all 38 nutrient columns proportionately.\n\n${
                otherRows.length > 0 ? `*Unmodified ingredients preserved:* ${otherNames}.` : ''
              }`,
            };

            setMessages(prev => [...prev, confirmationMsg]);
            setIsAnalyzing(false);
            setAnalysisStatus('');
            return;
          }
        }
      }
    }

    setIsAnalyzing(true);
    setAnalysisStatus(`Analyzing ${currentStaged.length} photo(s) with ${selectedModel}...`);

    const tracker = DiagnosticTracker.getInstance();
    tracker.recordBreadcrumb('chat_send', 'agent_dispatcher', {
      userText,
      photoCount: currentStaged.length,
      model: selectedModel,
    });

    try {
      // 1. Extract EXIF date from first photo if available
      let extractedDateStr = photoDateStr || defaultDateStr || new Date().toISOString().split('T')[0];
      if (rawFiles.length > 0) {
        try {
          const exif = await exifr.parse(rawFiles[0]);
          if (exif && exif.DateTimeOriginal) {
            const d = new Date(exif.DateTimeOriginal);
            extractedDateStr = d.toISOString().split('T')[0];
          } else if (rawFiles[0].lastModified) {
            const d = new Date(rawFiles[0].lastModified);
            extractedDateStr = d.toISOString().split('T')[0];
          }
        } catch (e) {
          if (rawFiles[0].lastModified) {
            const d = new Date(rawFiles[0].lastModified);
            extractedDateStr = d.toISOString().split('T')[0];
          }
        }
        setPhotoDateStr(extractedDateStr);
      }

      // 2. Prepare images as base64 for Gemini (files are already compressed <200KB during staging phase)
      const compressedFilesToStore: File[] = [];
      const preparedImages: Array<{ base64: string; mimeType: string; fileName: string }> = [];

      if (rawFiles.length > 0) {
        setAnalysisStatus(`Preparing ${rawFiles.length} photo(s) for analysis...`);
        for (let i = 0; i < rawFiles.length; i++) {
          const fileToUse = rawFiles[i];
          compressedFilesToStore.push(fileToUse);

          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(fileToUse);
          });

          preparedImages.push({
            base64,
            mimeType: fileToUse.type || 'image/jpeg',
            fileName: fileToUse.name,
          });
        }
        userMsg.pendingImageFiles = compressedFilesToStore;
        userMsg.pendingImageFile = compressedFilesToStore[0];
      }

      // 3. Fetch live or local daily nutrient ledger context
      let dailyLedgerContent = dailyNutrientLedgerTable;
      try {
        const ledgerRes = await fetch(`/api/sheets/daily-nutrients?dateStr=${encodeURIComponent(extractedDateStr)}`);
        if (ledgerRes.ok) {
          const ledgerData = await ledgerRes.json();
          if (ledgerData.formattedTable) {
            dailyLedgerContent = ledgerData.formattedTable;
            setDailyNutrientLedgerTable(dailyLedgerContent);
          }
        }
      } catch (e) {
        console.warn('Could not fetch server ledger, using local calculation:', e);
      }

      setAnalysisStatus(`Gemini (${selectedModel}) calculating clinical diagnosis & 38-column rows...`);

      // 4. Call backend Gemini endpoint
      const startTime = Date.now();
      const response = await fetch('/api/gemini/analyze-meal-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: preparedImages,
          imageBase64: preparedImages[0]?.base64, // backward compat
          mimeType: preparedImages[0]?.mimeType || 'image/jpeg',
          userMessage: userText,
          preferredModel: selectedModel,
          mealId: activeMealId,
          mealSlot: defaultMealSlot,
          dateStr: extractedDateStr,
          dailyNutrientsContext: dailyLedgerContent,
          existingAnalysis: lastAgentMsg?.analysis,
        }),
      });

      const latencyMs = Date.now() - startTime;
      tracker.recordNetwork('POST', '/api/gemini/analyze-meal-photo', latencyMs, response.status);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to analyze meal photo');
      }

      const result = await response.json();

      // Record dispatch into DiagnosticTracker
      tracker.recordDispatch({
        name: 'AnalyzeMealPhoto',
        userText,
        receivedParams: { mealId: activeMealId, dateStr: extractedDateStr, photoCount: preparedImages.length },
        systemInstruction: 'Analyze meal with Atwater macro consistency and zero duplication clinical diagnosis',
        userPrompt: userText,
        rawEmission: result,
        model: result.modelUsed || selectedModel,
        latencyMs,
        tokens: 0,
      });

      // Update gate result in tracker
      if (result.atwaterEvaluation) {
        tracker.updateLedgerAndGate({
          dishName: result.dishName,
          totalWeightG: result.atwaterEvaluation.totalWeightG,
          calories: result.atwaterEvaluation.calories,
          protein: result.atwaterEvaluation.protein,
          carbs: result.atwaterEvaluation.carbs,
          fat: result.atwaterEvaluation.fat,
          fiber: result.aggregatedTotals?.fiber ?? 0,
          agentMessage: result.clinicalSummary,
          comprehensiveNutrients: {
            'Calories': `${result.aggregatedTotals?.calories ?? 0} kcal`,
            'Protein': `${result.aggregatedTotals?.protein ?? 0} g`,
            'Carbohydrates': `${result.aggregatedTotals?.carbs ?? 0} g`,
            'Total Fat': `${result.aggregatedTotals?.totalFat ?? 0} g`,
            'Saturated Fat': `${result.aggregatedTotals?.saturatedFat ?? 0} g`,
            'Sodium': `${result.aggregatedTotals?.sodium ?? 0} mg`,
            'Dietary Fiber': `${result.aggregatedTotals?.fiber ?? 0} g`
          }
        });
      }

      // Add agent response
      const agentMsgId = `msg-agent-${Date.now()}`;
      const agentMsg: ChatMessage = {
        id: agentMsgId,
        sender: 'agent',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pendingImageFile: compressedFilesToStore[0],
        pendingImageFiles: compressedFilesToStore,
        imageFileName: fileNames[0],
        imageFileNames: fileNames,
        imageUrls: previewUrls,
        analysis: {
          dishName: result.dishName || 'Reviewed Dish',
          totalDishWeightG: result.totalDishWeightG,
          portionWeightG: result.portionWeightG,
          weightDifferenceDetected: result.weightDifferenceDetected,
          weightClarificationPrompt: result.weightClarificationPrompt,
          mealDiagnosis: result.mealDiagnosis || result.clinicalSummary || '',
          dailyDiagnosis: result.dailyDiagnosis || result.clinicalSummary || '',
          clinicalSummary: result.clinicalSummary || 'Clinical nutrient breakdown complete.',
          rows: result.rows || [],
          columnHeaders: result.columnHeaders || [],
          tsvFormatted: result.tsvFormatted || '',
          aggregatedTotals: result.aggregatedTotals || {
            calories: 0,
            protein: 0,
            totalFat: 0,
            saturatedFat: 0,
            carbs: 0,
            fiber: 0,
            sodium: 0,
            potassium: 0,
            addedSugars: 0,
          },
          atwaterEvaluation: result.atwaterEvaluation,
          modelUsed: result.modelUsed || selectedModel,
        },
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch (error: any) {
      console.warn('Food & Nutrition Agent error:', error);
      tracker.recordLog(`Analysis error: ${error.message}`);
      const errorMsg: ChatMessage = {
        id: `msg-agent-err-${Date.now()}`,
        sender: 'agent',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `⚠️ I encountered an issue analyzing the meal photo(s): ${error.message || 'Server error'}. Please try again or re-upload.`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const handleCopyTSV = (tsvText: string, messageId: string) => {
    navigator.clipboard.writeText(tsvText);
    setCopiedTsvMessageId(messageId);
    setTimeout(() => {
      setCopiedTsvMessageId(null);
    }, 2500);
  };

  // Helper to cleanly scale all 38 nutrient columns for a single ingredient row
  const scaleSingleRow = (oldRow: MealLogRow, ratio: number, explicitWeightG?: number): MealLogRow => {
    const scale = (val: any) => {
      const num = Number(val);
      if (isNaN(num)) return val;
      const res = num * ratio;
      return Number.isInteger(res) ? res : Number(res.toFixed(1));
    };

    const newWeight = explicitWeightG !== undefined
      ? explicitWeightG
      : (Number.isInteger(Number(oldRow.weightG) * ratio)
          ? Number(oldRow.weightG) * ratio
          : Number((Number(oldRow.weightG) * ratio).toFixed(1)));

    return {
      ...oldRow,
      weightG: newWeight,
      calories: Math.round((Number(oldRow.calories) || 0) * ratio),
      protein: scale(oldRow.protein),
      totalFat: scale(oldRow.totalFat),
      saturatedFat: scale(oldRow.saturatedFat),
      carbs: scale(oldRow.carbs),
      fiber: scale(oldRow.fiber),
      totalSugars: scale(oldRow.totalSugars),
      sodium: Math.round((Number(oldRow.sodium) || 0) * ratio),
      potassium: Math.round((Number(oldRow.potassium) || 0) * ratio),
      calcium: Math.round((Number(oldRow.calcium) || 0) * ratio),
      iron: scale(oldRow.iron),
      magnesium: Math.round((Number(oldRow.magnesium) || 0) * ratio),
      phosphorus: Math.round((Number(oldRow.phosphorus) || 0) * ratio),
      zinc: scale(oldRow.zinc),
      selenium: scale(oldRow.selenium),
      vitaminA: scale(oldRow.vitaminA),
      vitaminC: scale(oldRow.vitaminC),
      vitaminD: scale(oldRow.vitaminD),
      vitaminE: scale(oldRow.vitaminE),
      vitaminK: scale(oldRow.vitaminK),
      vitaminB12: scale(oldRow.vitaminB12),
      folate: scale(oldRow.folate),
      vitaminB6: scale(oldRow.vitaminB6),
      thiaminB1: scale(oldRow.thiaminB1),
      riboflavinB2: scale(oldRow.riboflavinB2),
      niacinB3: scale(oldRow.niacinB3),
      monounsaturatedFat: scale(oldRow.monounsaturatedFat),
      polyunsaturatedFat: scale(oldRow.polyunsaturatedFat),
      transFat: scale(oldRow.transFat),
      cholesterol: scale(oldRow.cholesterol),
      addedSugars: scale(oldRow.addedSugars),
    };
  };

  // Editable row handler inside the component breakdown table
  const handleUpdateAnalysisRow = (msgId: string, rowIndex: number, field: keyof MealLogRow, value: any) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.analysis) return msg;
        const updatedRows = [...msg.analysis.rows];
        const oldRow = updatedRows[rowIndex];
        if (!oldRow) return msg;
        
        let target = { ...oldRow, [field]: value };

        // Auto-scale macros if weightG is edited
        if (field === 'weightG') {
          const oldWeight = Number(oldRow.weightG) || 0;
          const newWeight = Number(value) || 0;
          if (oldWeight > 0 && newWeight > 0) {
            const ratio = newWeight / oldWeight;
            target = scaleSingleRow(oldRow, ratio, newWeight);
          }
        }

        // Auto-recalculate energy if protein, carbs, fat edited directly
        if (field === 'protein' || field === 'carbs' || field === 'totalFat') {
          const p = field === 'protein' ? Number(value) || 0 : Number(target.protein) || 0;
          const c = field === 'carbs' ? Number(value) || 0 : Number(target.carbs) || 0;
          const f = field === 'totalFat' ? Number(value) || 0 : Number(target.totalFat) || 0;
          target.calories = Math.round(p * 4 + c * 4 + f * 9);
        }
        
        updatedRows[rowIndex] = target;

        const agg = {
          calories: updatedRows.reduce((sum, r) => sum + (Number(r.calories) || 0), 0),
          protein: Number(updatedRows.reduce((sum, r) => sum + (Number(r.protein) || 0), 0).toFixed(1)),
          totalFat: Number(updatedRows.reduce((sum, r) => sum + (Number(r.totalFat) || 0), 0).toFixed(1)),
          saturatedFat: Number(updatedRows.reduce((sum, r) => sum + (Number(r.saturatedFat) || 0), 0).toFixed(1)),
          carbs: Number(updatedRows.reduce((sum, r) => sum + (Number(r.carbs) || 0), 0).toFixed(1)),
          fiber: Number(updatedRows.reduce((sum, r) => sum + (Number(r.fiber) || 0), 0).toFixed(1)),
          sodium: Math.round(updatedRows.reduce((sum, r) => sum + (Number(r.sodium) || 0), 0)),
          potassium: Math.round(updatedRows.reduce((sum, r) => sum + (Number(r.potassium) || 0), 0)),
          addedSugars: Number(updatedRows.reduce((sum, r) => sum + (Number(r.addedSugars) || 0), 0).toFixed(1)),
        };

        const totalWeight = updatedRows.reduce((sum, r) => sum + (Number(r.weightG) || 0), 0);
        const atwaterSum = Math.round(agg.protein * 4 + agg.carbs * 4 + agg.totalFat * 9 + agg.fiber * 2);
        const atwaterDiff = Math.abs(agg.calories - atwaterSum);

        const headers = msg.analysis.columnHeaders || [];
        const tsvFormatted = [
          headers.join('\t'),
          ...updatedRows.map(r => [
            r.dishName, r.mealId, r.date, r.mealSlot, r.ingredient,
            r.weightG, r.calories, r.protein, r.totalFat, r.saturatedFat,
            r.carbs, r.fiber, r.totalSugars, r.sodium, r.potassium,
            r.calcium, r.iron, r.magnesium, r.phosphorus, r.vitaminA,
            r.vitaminC, r.vitaminD, r.vitaminE, r.vitaminK, r.vitaminB6,
            r.vitaminB12, r.folate, r.cholesterol
          ].join('\t'))
        ].join('\n');

        return {
          ...msg,
          analysis: {
            ...msg.analysis,
            rows: updatedRows,
            aggregatedTotals: agg,
            tsvFormatted,
            atwaterEvaluation: {
              totalWeightG: totalWeight,
              calories: agg.calories,
              protein: agg.protein,
              carbs: agg.carbs,
              fat: agg.totalFat,
              atwaterSum,
              atwaterDiff,
              caloricDensity: totalWeight > 0 ? Number((agg.calories / totalWeight).toFixed(1)) : 0,
              withinTolerance: atwaterDiff <= Math.max(30, agg.calories * 0.08),
            },
          },
        };
      })
    );
  };

  // Scales either a single targeted ingredient row (default) or all rows proportionally
  const handleScaleMealWeight = (msgId: string, targetWeightG: number, targetRowIndex: number | 'all' = 0) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.analysis) return msg;

        let scaledRows = [...msg.analysis.rows];

        if (targetRowIndex === 'all') {
          const currentTotal = msg.analysis.rows.reduce((sum, r) => sum + (Number(r.weightG) || 0), 0);
          if (currentTotal <= 0) return msg;
          const ratio = targetWeightG / currentTotal;
          scaledRows = msg.analysis.rows.map((row) => scaleSingleRow(row, ratio));
        } else {
          const rowIndex = typeof targetRowIndex === 'number' ? targetRowIndex : 0;
          const targetRow = scaledRows[rowIndex];
          if (!targetRow) return msg;
          const oldWeight = Number(targetRow.weightG) || 0;
          if (oldWeight <= 0) return msg;
          const ratio = targetWeightG / oldWeight;
          // Scale ONLY the targeted row; keep all other rows strictly untouched
          scaledRows = scaledRows.map((row, idx) => (idx === rowIndex ? scaleSingleRow(row, ratio, targetWeightG) : row));
        }

        const agg = {
          calories: scaledRows.reduce((sum, r) => sum + (Number(r.calories) || 0), 0),
          protein: Number(scaledRows.reduce((sum, r) => sum + (Number(r.protein) || 0), 0).toFixed(1)),
          totalFat: Number(scaledRows.reduce((sum, r) => sum + (Number(r.totalFat) || 0), 0).toFixed(1)),
          saturatedFat: Number(scaledRows.reduce((sum, r) => sum + (Number(r.saturatedFat) || 0), 0).toFixed(1)),
          carbs: Number(scaledRows.reduce((sum, r) => sum + (Number(r.carbs) || 0), 0).toFixed(1)),
          fiber: Number(scaledRows.reduce((sum, r) => sum + (Number(r.fiber) || 0), 0).toFixed(1)),
          sodium: Math.round(scaledRows.reduce((sum, r) => sum + (Number(r.sodium) || 0), 0)),
          potassium: Math.round(scaledRows.reduce((sum, r) => sum + (Number(r.potassium) || 0), 0)),
          addedSugars: Number(scaledRows.reduce((sum, r) => sum + (Number(r.addedSugars) || 0), 0).toFixed(1)),
        };

        const totalWeight = scaledRows.reduce((sum, r) => sum + (Number(r.weightG) || 0), 0);
        const atwaterSum = Math.round(agg.protein * 4 + agg.carbs * 4 + agg.totalFat * 9 + agg.fiber * 2);
        const atwaterDiff = Math.abs(agg.calories - atwaterSum);

        const headers = msg.analysis.columnHeaders || [];
        const tsvFormatted = [
          headers.join('\t'),
          ...scaledRows.map(r => [
            r.dishName, r.mealId, r.date, r.mealSlot, r.ingredient,
            r.weightG, r.calories, r.protein, r.totalFat, r.saturatedFat,
            r.carbs, r.fiber, r.totalSugars, r.sodium, r.potassium,
            r.calcium, r.iron, r.magnesium, r.phosphorus, r.vitaminA,
            r.vitaminC, r.vitaminD, r.vitaminE, r.vitaminK, r.vitaminB6,
            r.vitaminB12, r.folate, r.cholesterol
          ].join('\t'))
        ].join('\n');

        return {
          ...msg,
          analysis: {
            ...msg.analysis,
            rows: scaledRows,
            aggregatedTotals: agg,
            tsvFormatted,
            atwaterEvaluation: {
              totalWeightG: totalWeight,
              calories: agg.calories,
              protein: agg.protein,
              carbs: agg.carbs,
              fat: agg.totalFat,
              atwaterSum,
              atwaterDiff,
              caloricDensity: totalWeight > 0 ? Number((agg.calories / totalWeight).toFixed(1)) : 0,
              withinTolerance: atwaterDiff <= Math.max(30, agg.calories * 0.08),
            },
            weightDifferenceDetected: false, // Hide warning once resolved
            confirmedWeightG: targetWeightG,
          },
        };
      })
    );
  };

  const handleDeleteAnalysisRow = (msgId: string, rowIndex: number) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.analysis || msg.analysis.rows.length <= 1) return msg;
        const updatedRows = msg.analysis.rows.filter((_, idx) => idx !== rowIndex);
        // Guarantee zero-duplication: Row 0 has diagnosis; row 1..N has empty string
        if (updatedRows.length > 0) {
          updatedRows[0] = {
            ...updatedRows[0],
            mealDiagnosis: msg.analysis.mealDiagnosis,
            dailyDiagnosis: msg.analysis.dailyDiagnosis,
          };
          for (let i = 1; i < updatedRows.length; i++) {
            updatedRows[i] = {
              ...updatedRows[i],
              mealDiagnosis: '',
              dailyDiagnosis: '',
            };
          }
        }
        const agg = {
          calories: updatedRows.reduce((sum, r) => sum + (Number(r.calories) || 0), 0),
          protein: updatedRows.reduce((sum, r) => sum + (Number(r.protein) || 0), 0),
          totalFat: updatedRows.reduce((sum, r) => sum + (Number(r.totalFat) || 0), 0),
          saturatedFat: updatedRows.reduce((sum, r) => sum + (Number(r.saturatedFat) || 0), 0),
          carbs: updatedRows.reduce((sum, r) => sum + (Number(r.carbs) || 0), 0),
          fiber: updatedRows.reduce((sum, r) => sum + (Number(r.fiber) || 0), 0),
          sodium: updatedRows.reduce((sum, r) => sum + (Number(r.sodium) || 0), 0),
          potassium: updatedRows.reduce((sum, r) => sum + (Number(r.potassium) || 0), 0),
          addedSugars: updatedRows.reduce((sum, r) => sum + (Number(r.addedSugars) || 0), 0),
        };
        return {
          ...msg,
          analysis: {
            ...msg.analysis,
            rows: updatedRows,
            aggregatedTotals: agg,
          },
        };
      })
    );
  };

  const handleAddAnalysisRow = (msgId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || !msg.analysis) return msg;
        const baseRow = msg.analysis.rows[0] || {};
        const newRow: MealLogRow = {
          dishName: baseRow.dishName || 'Custom Component',
          mealId: baseRow.mealId || activeMealId,
          date: baseRow.date || defaultDateStr || new Date().toISOString().split('T')[0],
          mealSlot: baseRow.mealSlot || defaultMealSlot,
          ingredient: 'Additional Component',
          weightG: 50,
          calories: 50,
          protein: 2,
          totalFat: 1,
          saturatedFat: 0.2,
          carbs: 8,
          fiber: 1,
          totalSugars: 1,
          sodium: 20,
          potassium: 80,
          calcium: 10,
          iron: 0.5,
          magnesium: 15,
          phosphorus: 20,
          zinc: 0.3,
          selenium: 2,
          vitaminA: 10,
          vitaminC: 2,
          vitaminD: 0,
          vitaminE: 0.5,
          vitaminK: 5,
          vitaminB12: 0.1,
          folate: 10,
          vitaminB6: 0.1,
          thiaminB1: 0.05,
          riboflavinB2: 0.05,
          niacinB3: 0.5,
          monounsaturatedFat: 0.5,
          polyunsaturatedFat: 0.3,
          transFat: 0,
          cholesterol: 0,
          addedSugars: 0,
          sourceRef: 'User Added',
          photoUrl: baseRow.photoUrl || '',
          mealDiagnosis: '',
          dailyDiagnosis: '',
        };
        const updatedRows = [...msg.analysis.rows, newRow];
        const agg = {
          calories: updatedRows.reduce((sum, r) => sum + (Number(r.calories) || 0), 0),
          protein: updatedRows.reduce((sum, r) => sum + (Number(r.protein) || 0), 0),
          totalFat: updatedRows.reduce((sum, r) => sum + (Number(r.totalFat) || 0), 0),
          saturatedFat: updatedRows.reduce((sum, r) => sum + (Number(r.saturatedFat) || 0), 0),
          carbs: updatedRows.reduce((sum, r) => sum + (Number(r.carbs) || 0), 0),
          fiber: updatedRows.reduce((sum, r) => sum + (Number(r.fiber) || 0), 0),
          sodium: updatedRows.reduce((sum, r) => sum + (Number(r.sodium) || 0), 0),
          potassium: updatedRows.reduce((sum, r) => sum + (Number(r.potassium) || 0), 0),
          addedSugars: updatedRows.reduce((sum, r) => sum + (Number(r.addedSugars) || 0), 0),
        };
        return {
          ...msg,
          analysis: {
            ...msg.analysis,
            rows: updatedRows,
            aggregatedTotals: agg,
          },
        };
      })
    );
  };

  const handleSaveToMealJournal = async (msg: ChatMessage) => {
    if (!msg.analysis || isSavingMealId) return;
    setIsSavingMealId(msg.id);

    const tracker = DiagnosticTracker.getInstance();
    const jobId = `job_save_${Date.now()}`;
    tracker.recordBreadcrumb('save_meal_start', 'meal_log_pipeline', {
      jobId,
      mealId: activeMealId,
      rowCount: msg.analysis.rows.length,
    });

    // 0. Ensure user has a valid Google Session before doing anything
    let accessToken = await getAccessToken();
    if (!accessToken) {
      setSavingStatusMsg('Session expired. Prompting Google Sign-in...');
      try {
        const authResult = await googleSignIn();
        if (authResult && authResult.accessToken) {
          accessToken = authResult.accessToken;
        } else {
          setSavingStatusMsg('❌ Save cancelled (Sign-in required)');
          setTimeout(() => { setIsSavingMealId(null); setSavingStatusMsg(null); }, 4000);
          return;
        }
      } catch (err: any) {
        console.warn('Auto sign-in failed:', err);
        setSavingStatusMsg('❌ Sign-in failed. Please try again.');
        setTimeout(() => { setIsSavingMealId(null); setSavingStatusMsg(null); }, 4000);
        return;
      }
    }

    const totals = msg.analysis.aggregatedTotals;

    // Find linked images or pending files from user message or agent message
    const relatedUserMsg = messages.find(
      (m) => m.sender === 'user' && (m.imageUrl || m.driveFileUrl || m.pendingImageFile || (m.pendingImageFiles && m.pendingImageFiles.length > 0))
    );

    const filesToUpload: File[] =
      msg.pendingImageFiles ||
      relatedUserMsg?.pendingImageFiles ||
      (msg.pendingImageFile ? [msg.pendingImageFile] : []) ||
      (relatedUserMsg?.pendingImageFile ? [relatedUserMsg.pendingImageFile] : []);

    let uploadedDriveFileUrls: string[] = relatedUserMsg?.driveFileUrls || [];
    let uploadedDriveFileIds: string[] = relatedUserMsg?.driveFileIds || [];
    let primaryDriveUrl = relatedUserMsg?.driveFileUrl || '';
    let driveFileName = relatedUserMsg?.imageFileName || `${activeMealId}_dish.jpg`;

    // 1. Upload to Google Drive concurrently with strict rollback guarantee
    if (filesToUpload.length > 0 && uploadedDriveFileUrls.length === 0) {
      try {
        setSavingStatusMsg(`Uploading ${filesToUpload.length} photo(s) to Google Drive ("Personal food")...`);
        const dateToUse = photoDateStr || defaultDateStr || new Date().toISOString().split('T')[0];

        const uploadResults = await uploadMultipleImagesToGoogleDrive(filesToUpload, {
          mealId: activeMealId,
          dishName: msg.analysis?.dishName || 'Custom_Dish',
          dateStr: dateToUse,
        });

        uploadedDriveFileUrls = uploadResults.map((r) => r.fileId ? `https://lh3.googleusercontent.com/d/${r.fileId}=w1000` : (r.webViewLink || r.thumbnailUrl));
        uploadedDriveFileIds = uploadResults.map((r) => r.fileId);
        primaryDriveUrl = uploadedDriveFileUrls[0] || '';
        driveFileName = uploadResults[0]?.fileName || `${activeMealId}_dish.jpg`;

        tracker.recordPhotoUrls(uploadedDriveFileUrls);
        tracker.recordLog(`Successfully uploaded ${uploadedDriveFileUrls.length} file(s) to Google Drive`);

        // Update user message with Drive URLs
        if (relatedUserMsg) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === relatedUserMsg.id
                ? {
                    ...m,
                    driveFileUrl: primaryDriveUrl,
                    driveFileUrls: uploadedDriveFileUrls,
                    driveFileIds: uploadedDriveFileIds,
                  }
                : m
            )
          );
        }
      } catch (driveErr: any) {
        console.warn('Google Drive multi-upload error:', driveErr);
        tracker.recordLog(`Drive multi-upload failed: ${driveErr.message}`);
        setSavingStatusMsg(`❌ Drive Upload Failed: ${driveErr.message}`);
        setTimeout(() => {
          setIsSavingMealId(null);
          setSavingStatusMsg(null);
        }, 7000);
        return; // Abort save if Drive upload fails
      }
    }

    // 2. Append rows to Google Sheet "meal log" tab with zero-duplication enforcement
    setSavingStatusMsg(`Appending ${msg.analysis.rows.length} component rows to spreadsheet "meal log" tab...`);

    const allDriveUrlsJoined = uploadedDriveFileUrls.join(', ') || primaryDriveUrl;

    // Enforce Zero-Duplication Rule: Row 0 gets mealDiagnosis and dailyDiagnosis. Rows 1..N get empty strings.
    const enrichedRows = msg.analysis.rows.map((r: any, idx: number) => ({
      ...r,
      photoUrl: allDriveUrlsJoined,
      mealDiagnosis: idx === 0 ? (msg.analysis?.mealDiagnosis || msg.analysis?.clinicalSummary || '') : '',
      dailyDiagnosis: idx === 0 ? (msg.analysis?.dailyDiagnosis || msg.analysis?.clinicalSummary || '') : '',
    }));

    try {
      const sheetUrl = localStorage.getItem('nutrihealth_sheet_url') || '';
      const appendRes = await fetch('/api/sheets/append-meal-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: enrichedRows,
          sheetUrl,
          accessToken,
        }),
      });

      if (!appendRes.ok) {
        const errorData = await appendRes.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to append to Google Sheet: ${appendRes.statusText}`);
      }

      const responseData = await appendRes.json();
      if (sheetUrl && !responseData.googleSheetsAppended) {
        throw new Error(responseData.googleSheetError || 'Failed to sync to Google Sheet (Token may be expired or permissions missing).');
      }

      // Check verification snapshot
      if (responseData.verified) {
        tracker.recordLog(`Pre/Post snapshot verified: +${responseData.appendedCount} rows in sheet`);
      }

      // 3. Post-verification: Verify Drive files exist
      if (uploadedDriveFileIds.length > 0) {
        try {
          const driveVerification = await verifyDriveFilesExist(uploadedDriveFileIds);
          if (!driveVerification.allExist) {
            console.warn('Some drive files could not be confirmed:', driveVerification);
          }
        } catch (e) {
          console.warn('Drive post-verification non-fatal check error:', e);
        }
      }
    } catch (sheetErr: any) {
      console.warn('Server sheet append error:', sheetErr);
      tracker.recordLog(`Sheet append failed: ${sheetErr.message}. Initiating compensating rollback of Drive photos.`);

      // COMPENSATING ROLLBACK: Delete newly uploaded Drive photos so Drive and Sheet never get out of sync!
      if (uploadedDriveFileIds.length > 0) {
        setSavingStatusMsg(`❌ Sheet append failed. Rolling back ${uploadedDriveFileIds.length} uploaded Drive photos...`);
        try {
          await rollbackUploadedDriveFiles(uploadedDriveFileIds);
          tracker.recordLog(`Compensating rollback complete: ${uploadedDriveFileIds.length} files purged from Drive`);
          setSavingStatusMsg(`❌ Save Failed: ${sheetErr.message}. Drive photos safely rolled back.`);
        } catch (rollbackErr: any) {
          console.warn('Rollback error:', rollbackErr);
          setSavingStatusMsg(`❌ Save Failed: ${sheetErr.message} (Rollback warning: ${rollbackErr.message})`);
        }
      } else {
        setSavingStatusMsg(`❌ Failed: ${sheetErr.message}`);
      }

      setTimeout(() => {
        setIsSavingMealId(null);
        setSavingStatusMsg(null);
      }, 8000);
      return;
    }

    // 4. Build LoggedMeal for the local meal journal
    const imageUrl = primaryDriveUrl || relatedUserMsg?.imageUrl || '';
    const flags: string[] = [];
    if (totals.saturatedFat <= 2.0) flags.push('🟢 Low Sat Fat');
    else if (totals.saturatedFat > 6.0) flags.push('🔴 High Sat Fat');

    if (totals.sodium <= 200) flags.push('🟢 Low Sodium');
    else if (totals.sodium > 800) flags.push('⚠️ High Sodium');

    if (totals.fiber >= 5) flags.push('🟢 High Fiber');
    if (totals.addedSugars > 15) flags.push('⚠️ High Sugar');

    const newMeal: LoggedMeal = {
      id: `meal-${Date.now()}`,
      mealId: activeMealId,
      dayKey: 'today',
      dateStr: photoDateStr || defaultDateStr,
      mealType: (defaultMealSlot as 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Late Night') || 'Breakfast',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      foodName: msg.analysis.dishName,
      portion: msg.analysis.rows.map((r) => `${r.ingredient} (${r.weightG}g)`).join(', ') || 'Standard Serving',
      imageUrl: imageUrl,
      driveFileName: driveFileName,
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      totalFat: Math.round(totals.totalFat * 10) / 10,
      saturatedFat: Math.round(totals.saturatedFat * 10) / 10,
      sodium: Math.round(totals.sodium),
      addedSugars: Math.round(totals.addedSugars * 10) / 10,
      fiber: Math.round(totals.fiber * 10) / 10,
      potassium: Math.round(totals.potassium),
      clinicalNote: (msg.analysis.mealDiagnosis || msg.analysis.clinicalSummary).slice(0, 160) + '...',
      flags,
    };

    // Pass newMeal AND enrichedRows to onAddMeal
    onAddMeal(newMeal, enrichedRows);

    tracker.recordEvent('meal_journal', 'meal_saved', 'succeeded');
    tracker.recordBreadcrumb('save_meal_complete', 'meal_journal', {
      mealId: activeMealId,
      dishName: msg.analysis.dishName,
    });

    // Mark as saved
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, isSavedToJournal: true, savedMealId: newMeal.id } : m))
    );

    setIsSavingMealId(null);
    setSavingStatusMsg(null);
  };

  /**
   * Delete the whole meal: removes from journal/Google Sheet if saved,
   * rolls back any uploaded Google Drive photos, clears staged data and chat exchange,
   * and resets the agent so the user can immediately start a fresh meal.
   */
  const executeDeleteWholeMeal = async (msg: ChatMessage) => {
    setIsDeletingWholeMeal(true);
    try {
      const tracker = DiagnosticTracker.getInstance();
      const mealCodeToDelete = msg.savedMealId || msg.analysis?.rows[0]?.mealId || activeMealId || '';

      tracker.recordBreadcrumb('delete_whole_meal_start', 'meal_log_pipeline', {
        msgId: msg.id,
        mealCode: mealCodeToDelete,
        wasSaved: !!msg.isSavedToJournal,
      });

      // 1. If meal was saved to journal / sheet, delete via onDeleteMeal callback
      if (msg.isSavedToJournal && onDeleteMeal && mealCodeToDelete) {
        await onDeleteMeal(mealCodeToDelete);
      }

      // 2. Clean up any uploaded Google Drive photos for this meal
      const driveFileIds = [
        ...(msg.driveFileIds || []),
        ...(messages.find((m) => m.sender === 'user' && m.driveFileIds)?.driveFileIds || []),
      ].filter(Boolean) as string[];

      if (driveFileIds.length > 0) {
        await rollbackUploadedDriveFiles(driveFileIds).catch((e) =>
          console.warn('Drive photo rollback error on delete:', e),
        );
      }

      // 3. Remove this meal's analysis message and its preceding user input message
      const msgIndex = messages.findIndex((m) => m.id === msg.id);
      let newMessages: ChatMessage[];
      if (msgIndex > 0 && messages[msgIndex - 1].sender === 'user') {
        newMessages = messages.filter((_, idx) => idx !== msgIndex && idx !== msgIndex - 1);
      } else {
        newMessages = messages.filter((m) => m.id !== msg.id);
      }

      // If no other analysis or user message remains, restore clean welcoming greeting
      if (newMessages.filter((m) => m.id !== 'greeting').length === 0) {
        newMessages = [
          {
            id: 'greeting',
            sender: 'agent',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: 'Hello! Tell me or upload photos of what you are planning to eat, and I will analyze health benefits, risk factors, and full 38-column Google Sheet nutrient breakdown with Atwater energy validation and zero-duplication clinical diagnosis.',
          },
        ];
      }
      setMessages(newMessages);

      // 4. Reset staged photos, text input, and file references so user can start a fresh meal
      setStagedPhotos([]);
      setInputText('');
      setEditingRowIndex(null);
      setIsSavingMealId(null);
      setSavingStatusMsg(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';

      tracker.recordBreadcrumb('delete_whole_meal_complete', 'meal_log_pipeline', {
        msgId: msg.id,
        mealCode: mealCodeToDelete,
      });

      setDeleteSuccessBanner('Meal deleted. You can now take/upload photos or describe what you plan to eat to start a new meal.');
      setTimeout(() => setDeleteSuccessBanner(null), 5000);
      setConfirmDeleteMsg(null);
    } catch (err: any) {
      console.warn('Error deleting whole meal:', err);
      setDeleteSuccessBanner(`⚠️ Could not complete delete: ${err.message || 'Unknown error'}`);
      setTimeout(() => setDeleteSuccessBanner(null), 5000);
    } finally {
      setIsDeletingWholeMeal(false);
    }
  };

  const handleResetToNewMeal = () => {
    setStagedPhotos([]);
    setInputText('');
    setEditingRowIndex(null);
    setIsSavingMealId(null);
    setSavingStatusMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    setMessages([
      {
        id: 'greeting',
        sender: 'agent',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: 'Hello! Tell me or upload photos of what you are planning to eat, and I will analyze health benefits, risk factors, and full 38-column Google Sheet nutrient breakdown with Atwater energy validation and zero-duplication clinical diagnosis.',
      },
    ]);
    setDeleteSuccessBanner('Started a new meal session. Upload photos or type to begin.');
    setTimeout(() => setDeleteSuccessBanner(null), 4000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0B111E] text-slate-100 animate-fade-in">
      {/* ================= HEADER ================= */}
      <div className="px-4 sm:px-8 py-4 border-b border-slate-800/80 bg-[#0B111E] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-950/70 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Food & Nutrition Agent
            </h2>
            {/* Model selection dropdown */}
            <div className="relative mt-0.5">
              <button
                type="button"
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="text-[11px] sm:text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>{AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.label || 'Gemini 3.5 Flash Lite'}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isModelDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 py-1 overflow-hidden animate-scale-up">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-400 border-b border-slate-800">
                      Select Agent Engine
                    </div>
                    {AVAILABLE_MODELS.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(model.id);
                          setIsModelDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800 transition-colors ${
                          selectedModel === model.id ? 'bg-indigo-950/60 text-indigo-300 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        <span>{model.label}</span>
                        <span className="text-[10px] text-slate-500">{model.tag}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Download Debug Report button (replaces button next to close) */}
            <button
              type="button"
              id="btn-download-debug-report"
              onClick={() => {
                const tracker = DiagnosticTracker.getInstance();
                tracker.recordLog('User clicked Download Debug Report button');
                tracker.downloadDiagnosticReport();
              }}
              title="Download Diagnostic Report (.md)"
              className="px-2.5 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-sm"
            >
              <FileDown className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Download Debug Report</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Delete Success Banner */}
        {deleteSuccessBanner && (
          <div className="mx-4 sm:mx-8 mt-2.5 p-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between shadow-lg shrink-0 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{deleteSuccessBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setDeleteSuccessBanner(null)}
              className="text-emerald-400 hover:text-emerald-200 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ================= DATA USED BY AGENT ACCORDION ================= */}
        <div className="border-b border-slate-800/80 bg-[#0E1626]/90 shrink-0">
          <div className="w-full px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60">
            <button
              type="button"
              onClick={() => setIsDataAccordionOpen(!isDataAccordionOpen)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Data used by agent</span>
              {isDataAccordionOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {/* Sub-tabs when open */}
            {isDataAccordionOpen && (
              <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDataAccordionTab('overview')}
                  className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    dataAccordionTab === 'overview'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>Clinical Targets</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDataAccordionTab('prompt')}
                  className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    dataAccordionTab === 'prompt'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>Full Instructions & Prompt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDataAccordionTab('payload')}
                  className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    dataAccordionTab === 'payload'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Code2 className="w-3 h-3" />
                  <span>Request Payload</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDataAccordionTab('schema')}
                  className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    dataAccordionTab === 'schema'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Braces className="w-3 h-3" />
                  <span>JSON Schema</span>
                </button>
              </div>
            )}
          </div>

          {isDataAccordionOpen && (
            <div className="p-4 text-[11px] text-slate-300 space-y-3 bg-[#0B111E]/95 animate-fade-in max-h-80 overflow-y-auto">
              {/* TAB 1: OVERVIEW & CLINICAL TARGETS */}
              {dataAccordionTab === 'overview' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/90 shadow-sm space-y-1">
                    <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <HeartPulse className="w-3.5 h-3.5" />
                      Clinical Safety Targets
                    </span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Deficit Target: <strong className="text-white">1,651 kcal</strong> • Saturated Fat: <strong className="text-white">&lt;15g</strong> (LDL 4.2) • Sodium: <strong className="text-white">&lt;1,200mg</strong> (eGFR 80) • Fiber: <strong className="text-white">&gt;25g</strong>.
                    </p>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/90 shadow-sm space-y-1">
                    <span className="font-semibold text-sky-400 flex items-center gap-1.5">
                      <FolderSync className="w-3.5 h-3.5" />
                      Google Drive Sync
                    </span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Folder: <span className="text-white font-mono">Personal food</span> ({GOOGLE_DRIVE_FOLDER_ID}). Photos auto-compressed to &lt;200 KB before upload.
                    </p>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/90 shadow-sm space-y-1">
                    <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Google Sheet Meal Log Schema
                    </span>
                    <p className="text-slate-300 leading-relaxed text-[11px]">
                      Direct mapping across all <strong className="text-white">38 standardized columns</strong> and USDA FoodData Central nutritional database references.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: FULL INSTRUCTIONS & PROMPT */}
              {dataAccordionTab === 'prompt' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200 font-semibold text-xs">System Prompt & Clinical Analysis Directives</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
                        Model: {selectedModel}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
`You are an elite Clinical Nutritionist and AI Dietitian reviewing a meal photo and description.
Task:
1. Identify all food items and individual component ingredients present in the photo/description.
2. Break down each component item into its own row following the exact 38-column structure of the patient's Google Sheet "meal log" tab.
3. For each component, provide scientifically accurate estimations of portion weight in grams (g) and all 30 micronutrients/macronutrients referenced to the USDA FoodData Central database.
4. Calculate aggregate totals (Calories, Protein, Fat, Saturated Fat, Carbohydrates, Fiber, Sodium, Potassium, Added Sugars).
5. Write an expert clinical summary discussing:
   - Specific Health Benefits
   - Cardiovascular / LDL Risk evaluation (Target: strict Sat Fat <15g/day, LDL 4.2 mmol/L)
   - Renal safety evaluation (Target: Sodium <1,200mg/day, eGFR 80 mL/min)
   - Glycemic impact (Added sugars ceiling <20g/day, HbA1c 40 mmol/mol)

Context:
Meal ID: ${activeMealId}
Meal Slot: ${defaultMealSlot}
Date: ${photoDateStr || defaultDateStr}
User Notes: ${inputText.trim() || (stagedPhotos.length > 0 ? `Review attached ${stagedPhotos.length} photo(s): ${stagedPhotos.map((p) => p.name).join(', ')}` : 'Analyze photo contents')}
Patient Clinical Baseline: {
  "caloricDeficitTarget": "1,651 kcal/day",
  "ldl": "4.2 mmol/L (Elevated, strict <15g sat-fat)",
  "egfr": "80 mL/min (Mild reduction, sodium restriction <1,200-1,500mg)",
  "hba1c": "40 mmol/mol (Pre-diabetic threshold, added sugars <20g)"
}

Google Sheet 38 Column Order:
1. Dish Name, 2. Meal ID, 3. Date, 4. Meal Slot, 5. Ingredient / Component, 6. Weight (g), 7. Calories (kcal), 8. Protein (g), 9. Total Fat (g), 10. Saturated Fat (g), 11. Carbohydrates (g), 12. Dietary Fiber (g), 13. Total Sugars (g), 14. Sodium (mg), 15. Potassium (mg), 16. Calcium (mg), 17. Iron (mg), 18. Magnesium (mg), 19. Phosphorus (mg), 20. Zinc (mg), 21. Selenium (mcg), 22. Vitamin A (mcg RAE), 23. Vitamin C (mg), 24. Vitamin D (mcg), 25. Vitamin E (mg), 26. Vitamin K (mcg), 27. Vitamin B12 (mcg), 28. Folate (mcg DFE), 29. Vitamin B6 (mg), 30. Thiamin B1 (mg), 31. Riboflavin B2 (mg), 32. Niacin B3 (mg NE), 33. Monounsaturated Fat (g), 34. Polyunsaturated Fat (g), 35. Trans Fat (g), 36. Cholesterol (mg), 37. Added Sugars (g), 38. USDA / Source Reference`,
                          'prompt'
                        )
                      }
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-[10px] font-medium transition cursor-pointer"
                    >
                      {copiedSection === 'prompt' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSection === 'prompt' ? 'Copied!' : 'Copy Prompt'}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-950 border border-slate-800/90 rounded-xl text-slate-300 font-mono text-[10.5px] leading-relaxed overflow-x-auto whitespace-pre-wrap select-text">
{`You are an elite Clinical Nutritionist and AI Dietitian reviewing a meal photo and description.
Task:
1. Identify all food items and individual component ingredients present in the photo/description.
2. Break down each component item into its own row following the exact 38-column structure of the patient's Google Sheet "meal log" tab.
3. For each component, provide scientifically accurate estimations of portion weight in grams (g) and all 30 micronutrients/macronutrients referenced to the USDA FoodData Central database.
4. Calculate aggregate totals (Calories, Protein, Fat, Saturated Fat, Carbohydrates, Fiber, Sodium, Potassium, Added Sugars).
5. Write an expert clinical summary discussing:
   - Specific Health Benefits
   - Cardiovascular / LDL Risk evaluation (Target: strict Sat Fat <15g/day, LDL 4.2 mmol/L)
   - Renal safety evaluation (Target: Sodium <1,200mg/day, eGFR 80 mL/min)
   - Glycemic impact (Added sugars ceiling <20g/day, HbA1c 40 mmol/mol)

Context:
Meal ID: ${activeMealId}
Meal Slot: ${defaultMealSlot}
Date: ${photoDateStr || defaultDateStr}
User Notes: ${inputText.trim() || (stagedPhotos.length > 0 ? `Review attached ${stagedPhotos.length} photo(s): ${stagedPhotos.map((p) => p.name).join(', ')}` : 'Analyze photo contents')}
Patient Clinical Baseline: {
  "caloricDeficitTarget": "1,651 kcal/day",
  "ldl": "4.2 mmol/L (Elevated, strict <15g sat-fat)",
  "egfr": "80 mL/min (Mild reduction, sodium restriction <1,200-1,500mg)",
  "hba1c": "40 mmol/mol (Pre-diabetic threshold, added sugars <20g)"
}

Google Sheet 38 Column Order:
1. Dish Name, 2. Meal ID, 3. Date, 4. Meal Slot, 5. Ingredient / Component, 6. Weight (g), 7. Calories (kcal), 8. Protein (g), 9. Total Fat (g), 10. Saturated Fat (g), 11. Carbohydrates (g), 12. Dietary Fiber (g), 13. Total Sugars (g), 14. Sodium (mg), 15. Potassium (mg), 16. Calcium (mg), 17. Iron (mg), 18. Magnesium (mg), 19. Phosphorus (mg), 20. Zinc (mg), 21. Selenium (mcg), 22. Vitamin A (mcg RAE), 23. Vitamin C (mg), 24. Vitamin D (mcg), 25. Vitamin E (mg), 26. Vitamin K (mcg), 27. Vitamin B12 (mcg), 28. Folate (mcg DFE), 29. Vitamin B6 (mg), 30. Thiamin B1 (mg), 31. Riboflavin B2 (mg), 32. Niacin B3 (mg NE), 33. Monounsaturated Fat (g), 34. Polyunsaturated Fat (g), 35. Trans Fat (g), 36. Cholesterol (mg), 37. Added Sugars (g), 38. USDA / Source Reference`}
                  </pre>
                </div>
              )}

              {/* TAB 3: OUTGOING REQUEST PAYLOAD */}
              {dataAccordionTab === 'payload' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200 font-semibold text-xs">Live Request Payload Preview</span>
                      <span className="text-[10px] text-slate-400">POST /api/gemini/analyze-meal-photo</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          JSON.stringify(
                            {
                              preferredModel: selectedModel,
                              mealId: activeMealId,
                              mealSlot: defaultMealSlot,
                              dateStr: photoDateStr || defaultDateStr,
                              userMessage: inputText.trim() || (stagedPhotos.length > 0 ? `Review attached ${stagedPhotos.length} photo(s): ${stagedPhotos.map((p) => p.name).join(', ')}` : ''),
                              hasImageAttachments: stagedPhotos.length > 0,
                              imagesCount: stagedPhotos.length,
                              attachedImages: stagedPhotos.map((p) => ({
                                fileName: p.name,
                                originalSize: formatBytes(p.file.size),
                                targetCompressedSize: '< 200 KB',
                              })),
                              patientContext: {
                                caloricDeficitTarget: '1,651 kcal/day',
                                ldl: '4.2 mmol/L (Elevated, strict <15g sat-fat)',
                                egfr: '80 mL/min (Mild reduction, sodium restriction <1,200-1,500mg)',
                                hba1c: '40 mmol/mol (Pre-diabetic threshold, added sugars <20g)',
                              },
                            },
                            null,
                            2
                          ),
                          'payload'
                        )
                      }
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-[10px] font-medium transition cursor-pointer"
                    >
                      {copiedSection === 'payload' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSection === 'payload' ? 'Copied!' : 'Copy Payload JSON'}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-950 border border-slate-800/90 rounded-xl text-emerald-300 font-mono text-[10.5px] leading-relaxed overflow-x-auto whitespace-pre select-text">
{JSON.stringify(
  {
    endpoint: '/api/gemini/analyze-meal-photo',
    method: 'POST',
    preferredModel: selectedModel,
    mealId: activeMealId,
    mealSlot: defaultMealSlot,
    dateStr: photoDateStr || defaultDateStr,
    userMessage: inputText.trim() || (stagedPhotos.length > 0 ? `Review attached ${stagedPhotos.length} photo(s): ${stagedPhotos.map((p) => p.name).join(', ')}` : ''),
    hasImageAttachments: stagedPhotos.length > 0,
    imagesCount: stagedPhotos.length,
    imageAttachments: stagedPhotos.map((p) => ({
      fileName: p.name,
      originalSize: formatBytes(p.file.size),
      compressionPolicy: 'Auto-compress to strictly < 200 KB before API call',
      base64Data: 'data:image/jpeg;base64,[...COMPRESSED_BINARY_IMAGE_DATA...]',
    })),
    patientContext: {
      caloricDeficitTarget: '1,651 kcal/day',
      ldl: '4.2 mmol/L (Elevated, strict <15g sat-fat)',
      egfr: '80 mL/min (Mild reduction, sodium restriction <1,200-1,500mg)',
      hba1c: '40 mmol/mol (Pre-diabetic threshold, added sugars <20g)',
    },
  },
  null,
  2
)}
                  </pre>
                </div>
              )}

              {/* TAB 4: EXPECTED JSON SCHEMA */}
              {dataAccordionTab === 'schema' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200 font-semibold text-xs">Structured JSON Output Schema</span>
                      <span className="text-[10px] text-indigo-400 font-mono">responseMimeType: application/json</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          JSON.stringify(
                            {
                              type: 'object',
                              properties: {
                                dishName: { type: 'string', description: 'Overall dish title' },
                                clinicalSummary: {
                                  type: 'string',
                                  description: 'Markdown formatted clinical assessment including Health Benefits, Cardiovascular / LDL Evaluation, Renal Safety, and Glycemic Guidance.',
                                },
                                rows: {
                                  type: 'array',
                                  description: 'Component ingredient breakdown matching 38-column Google Sheet meal log schema',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      dishName: { type: 'string' },
                                      mealId: { type: 'string' },
                                      date: { type: 'string' },
                                      mealSlot: { type: 'string' },
                                      ingredient: { type: 'string' },
                                      weightG: { type: 'number' },
                                      calories: { type: 'number' },
                                      protein: { type: 'number' },
                                      totalFat: { type: 'number' },
                                      saturatedFat: { type: 'number' },
                                      carbs: { type: 'number' },
                                      fiber: { type: 'number' },
                                      totalSugars: { type: 'number' },
                                      sodium: { type: 'number' },
                                      potassium: { type: 'number' },
                                      calcium: { type: 'number' },
                                      iron: { type: 'number' },
                                      magnesium: { type: 'number' },
                                      phosphorus: { type: 'number' },
                                      zinc: { type: 'number' },
                                      selenium: { type: 'number' },
                                      vitaminA: { type: 'number' },
                                      vitaminC: { type: 'number' },
                                      vitaminD: { type: 'number' },
                                      vitaminE: { type: 'number' },
                                      vitaminK: { type: 'number' },
                                      vitaminB12: { type: 'number' },
                                      folate: { type: 'number' },
                                      vitaminB6: { type: 'number' },
                                      thiaminB1: { type: 'number' },
                                      riboflavinB2: { type: 'number' },
                                      niacinB3: { type: 'number' },
                                      monounsaturatedFat: { type: 'number' },
                                      polyunsaturatedFat: { type: 'number' },
                                      transFat: { type: 'number' },
                                      cholesterol: { type: 'number' },
                                      addedSugars: { type: 'number' },
                                      sourceRef: { type: 'string', description: 'USDA FoodData Central ID reference' },
                                    },
                                    required: [
                                      'dishName', 'mealId', 'date', 'mealSlot', 'ingredient', 'weightG',
                                      'calories', 'protein', 'totalFat', 'saturatedFat', 'carbs',
                                      'fiber', 'sodium', 'potassium', 'addedSugars', 'sourceRef'
                                    ],
                                  },
                                },
                                aggregatedTotals: {
                                  type: 'object',
                                  properties: {
                                    calories: { type: 'number' },
                                    protein: { type: 'number' },
                                    totalFat: { type: 'number' },
                                    saturatedFat: { type: 'number' },
                                    carbs: { type: 'number' },
                                    fiber: { type: 'number' },
                                    sodium: { type: 'number' },
                                    potassium: { type: 'number' },
                                    addedSugars: { type: 'number' },
                                  },
                                  required: ['calories', 'protein', 'totalFat', 'saturatedFat', 'carbs', 'fiber', 'sodium', 'potassium', 'addedSugars'],
                                },
                              },
                              required: ['dishName', 'clinicalSummary', 'rows', 'aggregatedTotals'],
                            },
                            null,
                            2
                          ),
                          'schema'
                        )
                      }
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-[10px] font-medium transition cursor-pointer"
                    >
                      {copiedSection === 'schema' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSection === 'schema' ? 'Copied!' : 'Copy Schema JSON'}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-950 border border-slate-800/90 rounded-xl text-sky-300 font-mono text-[10.5px] leading-relaxed overflow-x-auto whitespace-pre select-text">
{JSON.stringify(
  {
    type: 'object',
    properties: {
      dishName: { type: 'string', description: 'Overall dish title' },
      clinicalSummary: {
        type: 'string',
        description: 'Markdown formatted clinical assessment (Health Benefits, Cardiovascular / LDL Evaluation, Renal Safety, Glycemic Guidance)',
      },
      rows: {
        type: 'array',
        description: 'Component ingredient rows matching 38-column Google Sheet meal log schema',
        items: {
          type: 'object',
          properties: {
            dishName: { type: 'string' },
            mealId: { type: 'string' },
            date: { type: 'string' },
            mealSlot: { type: 'string' },
            ingredient: { type: 'string' },
            weightG: { type: 'number' },
            calories: { type: 'number' },
            protein: { type: 'number' },
            totalFat: { type: 'number' },
            saturatedFat: { type: 'number' },
            carbs: { type: 'number' },
            fiber: { type: 'number' },
            totalSugars: { type: 'number' },
            sodium: { type: 'number' },
            potassium: { type: 'number' },
            calcium: { type: 'number' },
            iron: { type: 'number' },
            magnesium: { type: 'number' },
            phosphorus: { type: 'number' },
            zinc: { type: 'number' },
            selenium: { type: 'number' },
            vitaminA: { type: 'number' },
            vitaminC: { type: 'number' },
            vitaminD: { type: 'number' },
            vitaminE: { type: 'number' },
            vitaminK: { type: 'number' },
            vitaminB12: { type: 'number' },
            folate: { type: 'number' },
            vitaminB6: { type: 'number' },
            thiaminB1: { type: 'number' },
            riboflavinB2: { type: 'number' },
            niacinB3: { type: 'number' },
            monounsaturatedFat: { type: 'number' },
            polyunsaturatedFat: { type: 'number' },
            transFat: { type: 'number' },
            cholesterol: { type: 'number' },
            addedSugars: { type: 'number' },
            sourceRef: { type: 'string', description: 'USDA FoodData Central ID reference' },
          },
          required: [
            'dishName', 'mealId', 'date', 'mealSlot', 'ingredient', 'weightG',
            'calories', 'protein', 'totalFat', 'saturatedFat', 'carbs',
            'fiber', 'sodium', 'potassium', 'addedSugars', 'sourceRef'
          ],
        },
      },
      aggregatedTotals: {
        type: 'object',
        properties: {
          calories: { type: 'number' },
          protein: { type: 'number' },
          totalFat: { type: 'number' },
          saturatedFat: { type: 'number' },
          carbs: { type: 'number' },
          fiber: { type: 'number' },
          sodium: { type: 'number' },
          potassium: { type: 'number' },
          addedSugars: { type: 'number' },
        },
        required: ['calories', 'protein', 'totalFat', 'saturatedFat', 'carbs', 'fiber', 'sodium', 'potassium', 'addedSugars'],
      },
    },
    required: ['dishName', 'clinicalSummary', 'rows', 'aggregatedTotals'],
  },
  null,
  2
)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= CHAT MESSAGES CONTAINER ================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#0B111E]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} max-w-full`}
            >
              {/* Message Bubble */}
              <div
                className={`rounded-2xl text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600/90 text-white p-3.5 max-w-[85%] rounded-br-none shadow-md'
                    : 'bg-transparent text-slate-200 w-full p-0 space-y-3'
                }`}
              >
                {/* User Attachment Previews (Single or Multiple) */}
                {((msg.imageUrls && msg.imageUrls.length > 0) || msg.imageUrl) && (
                  <div className="mb-2 w-full">
                    <div className={`grid gap-2 ${((msg.imageUrls?.length || 1) > 1) ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
                      {(msg.imageUrls && msg.imageUrls.length > 0 ? msg.imageUrls : [msg.imageUrl!]).map((url, imgIdx) => (
                        <div key={imgIdx} className="relative rounded-xl overflow-hidden border border-indigo-400/40 shadow-sm bg-slate-900 group">
                          <img
                            src={url}
                            alt={`Meal photo ${imgIdx + 1}`}
                            className="w-full h-36 object-cover"
                          />
                          {msg.driveFileUrls && msg.driveFileUrls[imgIdx] && (
                            <a
                              href={msg.driveFileUrls[imgIdx]}
                              target="_blank"
                              rel="noreferrer"
                              className="absolute bottom-1 right-1 bg-black/80 hover:bg-black text-[10px] text-sky-300 px-1.5 py-0.5 rounded flex items-center gap-1 border border-slate-700"
                            >
                              <ExternalLink className="w-2.5 h-2.5" /> Drive
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                    {msg.imageSizeFormatted && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-indigo-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                        <span>
                          {msg.imageFileNames && msg.imageFileNames.length > 1
                            ? `${msg.imageFileNames.length} photos (${msg.imageFileNames.join(', ')})`
                            : msg.imageFileName || 'Meal photo'}{' '}
                          ({msg.imageSizeFormatted})
                        </span>
                        {msg.driveFileUrl && !msg.driveFileUrls && (
                          <a
                            href={msg.driveFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline ml-1 hover:text-white"
                          >
                            Drive link
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Regular text */}
                {msg.text && (
                  <p className={msg.sender === 'agent' ? 'text-slate-100 text-sm' : ''}>
                    {msg.text}
                  </p>
                )}

                {/* Agent Analysis Result */}
                {msg.analysis && (
                  <div className="space-y-4 w-full animate-fade-in">
                    {/* Clinical Summary Card */}
                    <div className="bg-[#111A2E] border border-slate-800/90 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-400" />
                          <h3 className="font-bold text-sm text-white">
                            {msg.analysis.dishName}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-300">
                            {msg.analysis.modelUsed}
                          </span>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMsg(msg)}
                            disabled={isDeletingWholeMeal || isSavingMealId === msg.id}
                            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 rounded-lg transition border border-transparent hover:border-rose-900/50 cursor-pointer flex items-center gap-1 text-[11px] disabled:opacity-50"
                            title="Delete whole meal and start a new one"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span className="hidden sm:inline text-rose-300/80 hover:text-rose-200">Delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Weight Discrepancy Warning */}
                      {msg.analysis.weightDifferenceDetected && msg.analysis.weightClarificationPrompt && (() => {
                        const promptLower = (msg.analysis.weightClarificationPrompt || '').toLowerCase();
                        const foundAutoIdx = msg.analysis.rows.findIndex(r => {
                          const name = ((r.dishName || '') + ' ' + (r.ingredient || '')).toLowerCase();
                          return name.split(/[\s,()/-]+/).some(w => w.length >= 4 && promptLower.includes(w));
                        });
                        const defaultIdx = foundAutoIdx >= 0 ? foundAutoIdx : 0;
                        const activeTargetIndex = selectedDiscrepancyRow[msg.id] ?? defaultIdx;

                        const isAll = activeTargetIndex === 'all';
                        const targetRow = typeof activeTargetIndex === 'number' ? msg.analysis.rows[activeTargetIndex] : null;
                        const targetName = targetRow ? (targetRow.dishName || targetRow.ingredient) : 'Entire Meal';
                        const currentWeight = targetRow ? Number(targetRow.weightG) || 0 : msg.analysis.rows.reduce((s, r) => s + (Number(r.weightG) || 0), 0);
                        const packageWeight = msg.analysis.totalDishWeightG || 0;

                        return (
                          <div className="mb-4 bg-amber-950/40 border border-amber-500/50 rounded-xl p-3.5 flex gap-3 items-start animate-fade-in shadow-md">
                            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                                <h5 className="text-xs font-bold text-amber-300">Weight Discrepancy Detected</h5>
                                {msg.analysis.rows.length > 1 && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[11px] text-amber-300/80 font-medium">Target Component:</span>
                                    <select
                                      value={activeTargetIndex}
                                      onChange={(e) => {
                                        const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                                        setSelectedDiscrepancyRow(prev => ({ ...prev, [msg.id]: val }));
                                      }}
                                      className="bg-slate-900 border border-amber-500/50 rounded px-2 py-1 text-xs text-amber-200 font-medium focus:outline-none focus:border-amber-400 cursor-pointer"
                                    >
                                      {msg.analysis.rows.map((row, rIdx) => (
                                        <option key={rIdx} value={rIdx}>
                                          {row.dishName || row.ingredient} ({row.weightG}g)
                                        </option>
                                      ))}
                                      <option value="all">Entire Meal (All components proportionally)</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-amber-200/90 leading-relaxed mb-3">
                                {msg.analysis.weightClarificationPrompt}
                              </p>
                              <div className="flex flex-col sm:flex-row flex-wrap items-center gap-2">
                                {packageWeight > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => handleScaleMealWeight(msg.id, packageWeight, activeTargetIndex)}
                                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 rounded-lg text-xs font-medium border border-amber-500/50 transition-colors shadow-sm text-left"
                                  >
                                    Log Full Package ({packageWeight}g) for {targetName}
                                  </button>
                                ) : null}
                                {currentWeight > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => handleScaleMealWeight(msg.id, currentWeight, activeTargetIndex)}
                                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/30 text-amber-300/90 rounded-lg text-xs font-medium border border-amber-500/30 transition-colors shadow-sm text-left"
                                  >
                                    Keep Portion ({currentWeight}g)
                                  </button>
                                ) : null}
                                <div className="flex items-center gap-2 sm:ml-auto w-full sm:w-auto">
                                  <span className="text-[11px] text-amber-300/80 whitespace-nowrap">Set {targetName}:</span>
                                  <input
                                    type="number"
                                    placeholder="Custom (g)"
                                    value={customWeights[msg.id] || ''}
                                    onChange={(e) => setCustomWeights(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const cw = Number(customWeights[msg.id]);
                                        if (cw > 0) {
                                          handleScaleMealWeight(msg.id, cw, activeTargetIndex);
                                        }
                                      }
                                    }}
                                    className="w-20 px-2 py-1.5 bg-amber-950/30 border border-amber-500/30 rounded-lg text-xs text-amber-200 placeholder-amber-700/50 focus:outline-none focus:border-amber-500"
                                  />
                                  <span className="text-xs text-amber-300/80 font-medium">g</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cw = Number(customWeights[msg.id]);
                                      if (cw > 0) {
                                        handleScaleMealWeight(msg.id, cw, activeTargetIndex);
                                      }
                                    }}
                                    disabled={!customWeights[msg.id] || Number(customWeights[msg.id]) <= 0}
                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors shrink-0 cursor-pointer"
                                  >
                                    Apply
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="prose prose-invert prose-xs text-xs text-slate-300 whitespace-pre-line leading-relaxed mb-3">
                        {msg.analysis.clinicalSummary}
                      </div>

                      {/* Meal Diagnosis Box (Row 0 populated) */}
                      {msg.analysis.mealDiagnosis && (
                        <div className="mb-3 bg-[#0D1527] border border-indigo-500/30 rounded-xl p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                            <HeartPulse className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Meal Diagnosis (Populated in Row 0 only)</span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed font-sans">
                            {msg.analysis.mealDiagnosis}
                          </p>
                        </div>
                      )}

                      {/* Daily Diagnosis Box (Row 0 populated) */}
                      {msg.analysis.dailyDiagnosis && (
                        <div className="mb-3 bg-[#0C1A24] border border-sky-500/30 rounded-xl p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
                            <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                            <span>Daily Diagnosis & Ledger Guidance (Populated in Row 0 only)</span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed font-sans">
                            {msg.analysis.dailyDiagnosis}
                          </p>
                        </div>
                      )}

                      {/* Atwater Thermodynamic Validation Gate */}
                      {msg.analysis.atwaterEvaluation && (
                        <div className="mb-3 bg-[#121626] border border-amber-500/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-2">
                            <Scale className="w-4 h-4 text-amber-400 shrink-0" />
                            <div>
                              <span className="font-semibold text-amber-200">Atwater Energy Balance: </span>
                              <span className="text-slate-300 font-mono">
                                {msg.analysis.atwaterEvaluation.calories} kcal vs Atwater {msg.analysis.atwaterEvaluation.atwaterSum} kcal
                                (Δ {msg.analysis.atwaterEvaluation.atwaterDiff} kcal)
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[10.5px]">
                            <span className="text-slate-400">
                              Density: {msg.analysis.atwaterEvaluation.caloricDensity} kcal/g
                            </span>
                            <span className={`px-2 py-0.5 rounded-full font-bold ${msg.analysis.atwaterEvaluation.withinTolerance ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-amber-950 text-amber-300 border border-amber-500/40'}`}>
                              {msg.analysis.atwaterEvaluation.withinTolerance ? '✓ Thermodynamic Gate Passed' : '⚠️ Minor Atwater Delta'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Macro Quick Badges */}
                      <div className="pt-3 border-t border-slate-800/70 flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-1 rounded-lg bg-amber-950/50 border border-amber-500/30 text-amber-300 font-semibold">
                          Calories: {Math.round(msg.analysis.aggregatedTotals.calories)} kcal
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 font-semibold">
                          Protein: {msg.analysis.aggregatedTotals.protein.toFixed(1)}g
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-amber-950/50 border border-amber-500/30 text-amber-300 font-semibold">
                          Carbs: {msg.analysis.aggregatedTotals.carbs.toFixed(1)}g
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-orange-950/50 border border-orange-500/30 text-orange-300 font-semibold">
                          Total Fat: {msg.analysis.aggregatedTotals.totalFat.toFixed(1)}g
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-rose-950/50 border border-rose-500/30 text-rose-300 font-semibold">
                          Sat Fat: {msg.analysis.aggregatedTotals.saturatedFat.toFixed(1)}g
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-sky-950/50 border border-sky-500/30 text-sky-300 font-semibold">
                          Sodium: {Math.round(msg.analysis.aggregatedTotals.sodium)}mg
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 font-semibold">
                          Fiber: {msg.analysis.aggregatedTotals.fiber.toFixed(1)}g
                        </span>
                      </div>
                    </div>

                    {/* Google Sheet "meal log" Table (38 columns) */}
                    <div className="bg-[#0E1626] border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-bold text-white">Google Sheet "meal log" Format</span>
                          <span className="text-[10px] text-slate-400">({msg.analysis.rows.length} component row{msg.analysis.rows.length > 1 ? 's' : ''})</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyTSV(msg.analysis!.tsvFormatted, msg.id)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-colors"
                          >
                            {copiedTsvMessageId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-300">Copied TSV!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                                <span>Copy for Google Sheet</span>
                              </>
                            )}
                          </button>

                          {isSavingMealId === msg.id && savingStatusMsg && (
                            <span className={`text-[11px] font-medium flex items-center gap-1 max-w-[200px] sm:max-w-xs ${savingStatusMsg.startsWith('❌') ? 'text-red-400' : 'text-amber-300 animate-pulse'}`}>
                              {!savingStatusMsg.startsWith('❌') && <UploadCloud className="w-3 h-3 text-amber-400 shrink-0" />}
                              <span className="truncate">{savingStatusMsg}</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleSaveToMealJournal(msg)}
                            disabled={msg.isSavedToJournal || isSavingMealId === msg.id}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                              msg.isSavedToJournal
                                ? 'bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 cursor-default'
                                : isSavingMealId === msg.id
                                ? 'bg-indigo-700 border border-indigo-500 text-white cursor-wait'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500'
                            }`}
                          >
                            {isSavingMealId === msg.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                <span>Saving & Appending...</span>
                              </>
                            ) : msg.isSavedToJournal ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Saved to Sheet & Drive</span>
                              </>
                            ) : (
                              <>
                                <PlusCircle className="w-3.5 h-3.5" />
                                <span>Save Meal</span>
                              </>
                            )}
                          </button>

                          {/* Bin button: Delete whole meal and start a new one */}
                          <button
                            type="button"
                            id={`btn-delete-whole-meal-${msg.id}`}
                            onClick={() => setConfirmDeleteMsg(msg)}
                            disabled={isDeletingWholeMeal || isSavingMealId === msg.id}
                            className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-rose-100 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border border-rose-800/60 transition-all cursor-pointer shadow-sm hover:border-rose-700 disabled:opacity-50"
                            title="Delete this whole meal and start a new one"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span>Delete Meal</span>
                          </button>

                          {!msg.isSavedToJournal && (
                            <button
                              type="button"
                              onClick={() => handleAddAnalysisRow(msg.id)}
                              className="px-2.5 py-1 bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-200 hover:text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-indigo-700/60 cursor-pointer transition-colors shadow-sm"
                              title="Add an extra ingredient/component row to this meal"
                            >
                              <Plus className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Add Row</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Horizontally scrollable 38-column table */}
                      <div className="overflow-x-auto max-h-72 text-[11px]">
                        <table className="w-full text-left border-collapse whitespace-nowrap">
                          <thead className="bg-slate-900/95 sticky top-0 border-b border-slate-800 text-slate-300 font-semibold">
                            <tr>
                              <th className="p-2 border-r border-slate-800 text-center w-12">Action</th>
                              <th className="p-2 border-r border-slate-800">Dish Name</th>
                              <th className="p-2 border-r border-slate-800">Meal ID</th>
                              <th className="p-2 border-r border-slate-800">Date</th>
                              <th className="p-2 border-r border-slate-800">Meal Slot</th>
                              <th className="p-2 border-r border-slate-800 text-indigo-300">Ingredient / Component</th>
                              <th className="p-2 border-r border-slate-800 text-right">Weight (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right text-amber-300">Calories (kcal)</th>
                              <th className="p-2 border-r border-slate-800 text-right text-indigo-300">Protein (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Total Fat (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right text-rose-300">Saturated Fat (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Carbs (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right text-emerald-300">Fiber (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Sugars (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right text-sky-300">Sodium (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right text-emerald-300">Potassium (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Calcium (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Iron (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Magnesium (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Phosphorus (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Zinc (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Selenium (mcg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Vit A (mcg RAE)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Vit C (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Vit D (mcg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Vit E (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Vit K (mcg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Vit B12 (mcg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Folate (mcg DFE)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Vit B6 (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Thiamin B1 (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Riboflavin B2 (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Niacin B3 (mg NE)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Mono Fat (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Poly Fat (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Trans Fat (g)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Cholesterol (mg)</th>
                              <th className="p-2 border-r border-slate-800 text-right">Added Sugars (g)</th>
                              <th className="p-2">USDA / Source Reference</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                            {msg.analysis.rows.map((r, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                                <td className="p-2 border-r border-slate-800/60 text-center">
                                  {!msg.isSavedToJournal && msg.analysis.rows.length > 1 ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAnalysisRow(msg.id, idx)}
                                      title="Delete this row (preserves Row 0 diagnoses)"
                                      className="p-1 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <span className="text-slate-600 text-[10px]">#{idx + 1}</span>
                                  )}
                                </td>
                                <td className="p-2 border-r border-slate-800/60 font-sans font-medium text-white">{r.dishName}</td>
                                <td className="p-2 border-r border-slate-800/60 text-slate-400">{r.mealId}</td>
                                <td className="p-2 border-r border-slate-800/60 text-slate-400">{r.date}</td>
                                <td className="p-2 border-r border-slate-800/60 text-slate-300">{r.mealSlot}</td>
                                <td className="p-2 border-r border-slate-800/60 font-sans font-semibold text-indigo-300">
                                  {!msg.isSavedToJournal ? (
                                    <input
                                      type="text"
                                      value={r.ingredient}
                                      onChange={(e) => handleUpdateAnalysisRow(msg.id, idx, 'ingredient', e.target.value)}
                                      className="bg-slate-900/90 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-indigo-200 focus:outline-none focus:border-indigo-500 w-36 font-sans"
                                    />
                                  ) : (
                                    r.ingredient
                                  )}
                                </td>
                                <td className="p-2 border-r border-slate-800/60 text-right">
                                  {!msg.isSavedToJournal ? (
                                    <input
                                      type="number"
                                      value={r.weightG}
                                      onChange={(e) => handleUpdateAnalysisRow(msg.id, idx, 'weightG', Number(e.target.value))}
                                      className="bg-slate-900/90 border border-slate-700 rounded px-1 py-0.5 text-xs text-right w-16 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                                    />
                                  ) : (
                                    r.weightG
                                  )}
                                </td>
                                <td className="p-2 border-r border-slate-800/60 text-right font-bold text-amber-400">{r.calories}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right text-indigo-300">
                                  {!msg.isSavedToJournal ? (
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={r.protein}
                                      onChange={(e) => handleUpdateAnalysisRow(msg.id, idx, 'protein', Number(e.target.value))}
                                      className="bg-slate-900/90 border border-slate-700 rounded px-1 py-0.5 text-xs text-right w-14 text-indigo-300 focus:outline-none focus:border-indigo-500 font-mono"
                                    />
                                  ) : (
                                    r.protein
                                  )}
                                </td>
                                <td className="p-2 border-r border-slate-800/60 text-right">
                                  {!msg.isSavedToJournal ? (
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={r.totalFat}
                                      onChange={(e) => handleUpdateAnalysisRow(msg.id, idx, 'totalFat', Number(e.target.value))}
                                      className="bg-slate-900/90 border border-slate-700 rounded px-1 py-0.5 text-xs text-right w-14 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                                    />
                                  ) : (
                                    r.totalFat
                                  )}
                                </td>
                                <td className="p-2 border-r border-slate-800/60 text-right text-rose-300">{r.saturatedFat}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">
                                  {!msg.isSavedToJournal ? (
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={r.carbs}
                                      onChange={(e) => handleUpdateAnalysisRow(msg.id, idx, 'carbs', Number(e.target.value))}
                                      className="bg-slate-900/90 border border-slate-700 rounded px-1 py-0.5 text-xs text-right w-14 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                                    />
                                  ) : (
                                    r.carbs
                                  )}
                                </td>
                                <td className="p-2 border-r border-slate-800/60 text-right text-emerald-300">{r.fiber}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.totalSugars}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right text-sky-300">{r.sodium}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right text-emerald-300">{r.potassium}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.calcium}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.iron}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.magnesium}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.phosphorus}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.zinc}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.selenium}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.vitaminA}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.vitaminC}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.vitaminD}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.vitaminE}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.vitaminK}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.vitaminB12}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.folate}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.vitaminB6}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.thiaminB1}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.riboflavinB2}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.niacinB3}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.monounsaturatedFat}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.polyunsaturatedFat}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.transFat}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.cholesterol}</td>
                                <td className="p-2 border-r border-slate-800/60 text-right">{r.addedSugars}</td>
                                <td className="p-2 font-sans text-slate-400">{r.sourceRef}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Raw TSV view when toggled */}
                      {showRawTSVView && (
                        <div className="p-3 bg-slate-950 border-t border-slate-800">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-mono text-slate-400">Raw TSV Format (Tab-Separated)</span>
                            <button
                              type="button"
                              onClick={() => handleCopyTSV(msg.analysis!.tsvFormatted, msg.id)}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300"
                            >
                              Copy TSV
                            </button>
                          </div>
                          <textarea
                            readOnly
                            value={msg.analysis.tsvFormatted}
                            rows={4}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 font-mono text-[10px] text-slate-300"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading status */}
          {isAnalyzing && (
            <div className="flex items-center gap-3 text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-500/30 p-3 rounded-2xl animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>{analysisStatus || 'Reviewing meal photo and generating Google Sheet rows...'}</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* ================= BOTTOM INPUT BAR (From user screenshot) ================= */}
        <div className="p-3 sm:p-4 bg-[#0B111E] border-t border-slate-800/80">
          {/* Staged photos carousel prior to send */}
          {stagedPhotos.length > 0 && (
            <div className="mb-2.5 flex items-center gap-2 overflow-x-auto pb-1 animate-scale-up">
              <div className="flex items-center gap-2">
                {stagedPhotos.map((photo, pIdx) => (
                  <div
                    key={photo.id}
                    className="relative flex items-center gap-2 bg-[#111A2E] border border-slate-700/90 rounded-xl p-1.5 pr-2 shrink-0 shadow-sm"
                  >
                    <img
                      src={photo.previewUrl}
                      alt={`Staged ${pIdx + 1}`}
                      className="w-10 h-10 object-cover rounded-lg border border-slate-700 shrink-0"
                    />
                    <div className="text-[11px] max-w-[140px] truncate">
                      <p className="font-semibold text-white truncate">{photo.file.name}</p>
                      <p className="text-[9.5px] text-emerald-400 truncate">
                        {photo.compressedSizeFormatted || '< 200 KB'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStagedPhoto(photo.id)}
                      className="p-1 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800/80 cursor-pointer ml-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {/* Add more button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-2 h-13 border border-dashed border-slate-700 hover:border-indigo-500/80 bg-slate-900/50 hover:bg-slate-800/60 rounded-xl text-[11px] text-slate-300 flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                <span>Add photo</span>
              </button>

              {/* Clear all staged photos bin button */}
              {stagedPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setStagedPhotos([])}
                  className="px-2 py-2 h-13 border border-rose-900/60 hover:border-rose-700 bg-rose-950/40 hover:bg-rose-900/60 rounded-xl text-[11px] text-rose-300 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  title="Clear all staged photos"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Clear all</span>
                </button>
              )}
            </div>
          )}

          {/* Input Row with Lower-Down Bin Button */}
          <div className="flex items-center gap-2">
            {/* Bin to delete current meal and start new one (lower down) */}
            {messages.some((m) => m.analysis || m.sender === 'user') && (
              <button
                type="button"
                id="btn-delete-whole-meal-lower"
                onClick={() => {
                  const lastAnalysis = messages.slice().reverse().find((m) => m.analysis);
                  if (lastAnalysis) {
                    setConfirmDeleteMsg(lastAnalysis);
                  } else {
                    handleResetToNewMeal();
                  }
                }}
                disabled={isDeletingWholeMeal}
                title="Delete current meal and start a new one"
                className="p-2.5 rounded-full bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-400 hover:text-rose-200 transition-colors cursor-pointer shrink-0 disabled:opacity-50 shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Input Pill Container */}
            <div className="bg-[#121A2C] border border-slate-800 rounded-full flex-1 flex items-center px-2 py-1.5 gap-2 shadow-inner focus-within:border-indigo-500/80 transition-colors">
            {/* Gallery Image Button (supports multiple selection) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload meal photos (select multiple)"
              className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800/80 transition-colors cursor-pointer relative"
            >
              <ImageIcon className="w-5 h-5" />
              {stagedPhotos.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                  {stagedPhotos.length}
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesSelected(e.target.files);
                }
              }}
            />

            {/* Camera Button */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              title="Take food photo with camera"
              className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              <Camera className="w-5 h-5" />
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesSelected(e.target.files);
                }
              }}
            />

            {/* Text Input */}
            <input
              type="text"
              placeholder={stagedPhotos.length > 0 ? `Describe these ${stagedPhotos.length} photo(s) or hit send...` : 'Type a message or describe food...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none px-2"
            />

            {/* Circular Send Button */}
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={(!inputText.trim() && stagedPhotos.length === 0) || isAnalyzing}
              className={`p-2 rounded-full transition-all flex items-center justify-center cursor-pointer shadow-md ${
                (inputText.trim() || stagedPhotos.length > 0) && !isAnalyzing
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-slate-800 text-slate-500 opacity-50 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4 translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>

        {/* Delete Whole Meal Confirmation Dialog */}
        {confirmDeleteMsg && (
          <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#111A2E] border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-xl bg-rose-950/80 border border-rose-600/40 flex items-center justify-center text-rose-400 mx-auto shadow-inner">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-base font-bold text-white">Delete Whole Meal?</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This will delete <strong className="text-white">"{confirmDeleteMsg.analysis?.dishName || 'this meal'}"</strong>
                  {confirmDeleteMsg.isSavedToJournal ? ' from your Google Sheet meal log and Drive,' : ''} clear all staged ingredients and diagnosis, and reset the agent so you can start a new meal.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteMsg(null)}
                  disabled={isDeletingWholeMeal}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-confirm-delete-whole-meal"
                  onClick={() => executeDeleteWholeMeal(confirmDeleteMsg)}
                  disabled={isDeletingWholeMeal}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isDeletingWholeMeal ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting Meal...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Yes, Delete & Start New</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
