import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  Activity,
  Sheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Utensils,
  TrendingUp,
  Heart,
  Droplets,
  Zap,
  SlidersHorizontal,
  ExternalLink,
} from "lucide-react";
import { RAW_INITIAL_SHEET_CSV } from "./data/initialSheetData";
import { INITIAL_LOGGED_MEALS } from "./data/initialMealLogs";
import { INITIAL_MEAL_LOG_ROWS } from "./data/initialMealSheetRows";
import {
  parseSpreadsheetCSV,
  parseMealLogCSV,
  buildMealsFromSheetRows,
} from "./utils/csvParser";
import {
  SheetConfig,
  SheetState,
  NavigationTab,
  LoggedMeal,
  MealLogRow,
} from "./types";
import { formatDriveImageUrl, MealPhotoItem } from "./utils/driveImage";
import { getAccessToken, googleSignIn } from "./utils/googleAuth";
import { fetchGoogleDriveFolderFiles } from "./utils/driveUploader";
import { Header } from "./components/Header";
import { DaySelector } from "./components/DaySelector";
import { DiagnosisBanner } from "./components/DiagnosisBanner";
import { KeyMetricsGrid } from "./components/KeyMetricsGrid";
import { NutrientAllowanceTracker } from "./components/NutrientAllowanceTracker";
import { TrendsAndAllowanceChart } from "./components/TrendsAndAllowanceChart";
import { PersonalizedRecommendations } from "./components/PersonalizedRecommendations";
import { SheetConnectionModal } from "./components/SheetConnectionModal";
import { MealSimulatorModal } from "./components/MealSimulatorModal";
import { AskNutritionistModal } from "./components/AskNutritionistModal";
import { FoodNutritionAgentModal } from "./components/FoodNutritionAgentModal";
import { MealLogView } from "./components/MealLogView";
import { DailyMealView } from "./components/DailyMealView";
import { SpreadsheetGridView } from "./components/SpreadsheetGridView";
import { HealthProfileView } from "./components/HealthProfileView";
import { DriveFolderModal } from "./components/DriveFolderModal";
import { DriveFolderFile } from "./data/googleDriveFolderData";

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<NavigationTab>("dashboard");
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

  // Orphaned Photos State
  const [orphanedPhotos, setOrphanedPhotos] = useState<DriveFolderFile[]>([]);
  const [highestDriveId, setHighestDriveId] = useState<number>(0);

  // Meal Logs State - Merge with default Google Sheet drive photo metadata if missing and guarantee unique IDs
  const [meals, setMeals] = useState<LoggedMeal[]>(() => {
    try {
      const saved = localStorage.getItem("nutrihealth_logged_meals");
      let baseList = INITIAL_LOGGED_MEALS;
      if (saved) {
        const parsed: LoggedMeal[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Clean any legacy unsplash stock photos and merge metadata
          const enriched = parsed.map((m) => {
            const isGenericStock =
              m.imageUrl && m.imageUrl.includes("unsplash.com");
            const cleanImageUrl = isGenericStock ? undefined : m.imageUrl;

            const match = INITIAL_LOGGED_MEALS.find(
              (init) =>
                init.id === m.id ||
                init.foodName.toLowerCase() === m.foodName.toLowerCase() ||
                (init.mealId &&
                  m.mealId &&
                  init.mealId.toUpperCase() === m.mealId.toUpperCase()),
            );
            if (match) {
              return {
                ...m,
                mealId: m.mealId || match.mealId,
                driveFileName: m.driveFileName || match.driveFileName,
                driveFileId: m.driveFileId || match.driveFileId,
                imageUrl: cleanImageUrl || match.imageUrl,
                clinicalNote: m.clinicalNote || match.clinicalNote,
              };
            }
            return {
              ...m,
              imageUrl: cleanImageUrl,
            };
          });
          baseList = enriched;
        }
      }

      // Deduplicate to guarantee no identical IDs or duplicated meals
      const seenIds = new Set<string>();
      const seenMealKeys = new Set<string>();
      const deduplicated: LoggedMeal[] = [];

      for (let i = 0; i < baseList.length; i++) {
        const m = baseList[i];
        const compositeKey =
          m.mealId && m.dateStr ? `${m.dateStr}_${m.mealId}`.toUpperCase() : "";
        if (compositeKey && seenMealKeys.has(compositeKey)) {
          continue; // Discard duplicate entry for same date and meal code
        }
        if (compositeKey) seenMealKeys.add(compositeKey);

        let finalId = m.id;
        if (!finalId || seenIds.has(finalId)) {
          finalId = `meal-${m.dateStr || m.dayKey || "day"}-${m.mealId || "item"}-${i + 1}`;
        }
        seenIds.add(finalId);
        deduplicated.push({ ...m, id: finalId });
      }

      return deduplicated.length > 0 ? deduplicated : INITIAL_LOGGED_MEALS;
    } catch {
      return INITIAL_LOGGED_MEALS;
    }
  });

  const handleUpdateMealPhoto = (
    mealId: string,
    imageUrl: string,
    driveFileName?: string,
  ) => {
    setMeals((prev) =>
      prev.map((m) => {
        if (m.id === mealId || m.mealId === mealId) {
          return {
            ...m,
            imageUrl,
            driveFileName: driveFileName || m.driveFileName,
          };
        }
        return m;
      }),
    );
    setUpdateNotification("Meal photo updated with actual picture!");
    setTimeout(() => setUpdateNotification(null), 3500);
  };

  const handleSetMealTopPhoto = async (
    meal: LoggedMeal,
    selectedPhoto: MealPhotoItem,
    newOrderedPhotos: MealPhotoItem[],
  ): Promise<boolean> => {
    // 1. Reconstruct photo URLs list with selected photo at index 0
    const existingUrls =
      meal.photoUrls && meal.photoUrls.length > 0
        ? meal.photoUrls
        : meal.imageUrl
          ? [meal.imageUrl]
          : [];

    const newUrls = newOrderedPhotos.map((p) => {
      const match = existingUrls.find((u) => {
        if (p.fileId && u.includes(p.fileId)) return true;
        if (p.fileName && u.includes(p.fileName)) return true;
        if (p.url && (u === p.url || p.url.includes(u))) return true;
        return false;
      });
      return match || p.driveUrl || p.url;
    });

    const newPhotoUrlString = newUrls.join(", ");
    const newFileNames = newOrderedPhotos
      .map((p) => p.fileName)
      .filter(Boolean)
      .join(", ");
    const targetMealId = meal.mealId || meal.id;

    // 2. Immediate local state update for fast reactive card preview
    setMeals((prev) =>
      prev.map((m) => {
        if (m.id === meal.id || (m.mealId && m.mealId === targetMealId)) {
          return {
            ...m,
            imageUrl: newUrls[0] || newPhotoUrlString,
            photoUrls: newUrls,
            driveFileName: newFileNames || m.driveFileName,
          };
        }
        return m;
      }),
    );

    setMealSheetRows((prev) =>
      prev.map((r) => {
        if (
          r.mealId &&
          targetMealId &&
          r.mealId.trim().toUpperCase() === targetMealId.trim().toUpperCase()
        ) {
          return {
            ...r,
            photoUrl: newPhotoUrlString,
          };
        }
        return r;
      }),
    );

    try {
      const stored = localStorage.getItem("nutrihealth_logged_meals");
      if (stored) {
        const parsed = JSON.parse(stored);
        const updated = parsed.map((m: any) => {
          if (m.id === meal.id || (m.mealId && m.mealId === targetMealId)) {
            return {
              ...m,
              imageUrl: newUrls[0] || newPhotoUrlString,
              photoUrls: newUrls,
              driveFileName: newFileNames || m.driveFileName,
            };
          }
          return m;
        });
        localStorage.setItem(
          "nutrihealth_logged_meals",
          JSON.stringify(updated),
        );
      }
    } catch (e) {
      console.warn("Could not save to localStorage", e);
    }

    // 3. Update in Google Sheet
    const targetSheetUrl =
      sheetConfig.sheetUrl ||
      localStorage.getItem("nutrihealth_sheet_url") ||
      "";
    if (!targetSheetUrl) {
      setIsConnectModalOpen(true);
      setUpdateNotification(
        "Top photo updated locally. Connect Google Sheet to persist changes to spreadsheet.",
      );
      setTimeout(() => setUpdateNotification(null), 4500);
      return true;
    }

    let token = await getAccessToken();
    if (!token) {
      setUpdateNotification("Authorizing with Google to update spreadsheet...");
      try {
        const authRes = await googleSignIn();
        if (!authRes?.accessToken) {
          setUpdateNotification(
            "Top photo updated locally. Google sign-in required to update spreadsheet.",
          );
          setTimeout(() => setUpdateNotification(null), 4000);
          return true;
        }
        token = authRes.accessToken;
      } catch (authErr) {
        console.warn("Google sign-in cancelled:", authErr);
        setUpdateNotification("Top photo updated locally.");
        setTimeout(() => setUpdateNotification(null), 3000);
        return true;
      }
    }

    try {
      const res = await fetch("/api/sheets/update-meal-photos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mealId: targetMealId,
          photoUrl: newPhotoUrlString,
          sheetUrl: targetSheetUrl,
          accessToken: token,
        }),
      });

      const data = await res.json();
      if (data.success || data.googleSheetsUpdated) {
        setUpdateNotification("Top preview photo updated in Google Sheet!");
        setTimeout(() => setUpdateNotification(null), 3500);
        return true;
      } else {
        console.warn(
          "Google Sheet photo update notice:",
          data.error || data.message,
        );
        setUpdateNotification("Updated locally. " + (data.message || ""));
        setTimeout(() => setUpdateNotification(null), 3500);
        return true;
      }
    } catch (apiErr: any) {
      console.warn("Error calling update-meal-photos:", apiErr);
      setUpdateNotification(
        "Updated locally. Sheet sync will retry on next sync.",
      );
      setTimeout(() => setUpdateNotification(null), 3500);
      return true;
    }
  };

  const handleDeleteMealPhoto = async (
    meal: LoggedMeal,
    deletedPhoto: MealPhotoItem,
    newOrderedPhotos: MealPhotoItem[],
  ): Promise<boolean> => {
    // 1. Reconstruct photo URLs list with deleted photo removed
    const existingUrls =
      meal.photoUrls && meal.photoUrls.length > 0
        ? meal.photoUrls
        : meal.imageUrl
          ? [meal.imageUrl]
          : [];

    const newUrls = newOrderedPhotos.map((p) => {
      const match = existingUrls.find((u) => {
        if (p.fileId && u.includes(p.fileId)) return true;
        if (p.fileName && u.includes(p.fileName)) return true;
        if (p.url && (u === p.url || p.url.includes(u))) return true;
        return false;
      });
      return match || p.driveUrl || p.url;
    });

    const newPhotoUrlString = newUrls.join(", ");
    const newFileNames = newOrderedPhotos
      .map((p) => p.fileName)
      .filter(Boolean)
      .join(", ");
    const targetMealId = meal.mealId || meal.id;

    // 2. Immediate local state update for fast reactive card preview
    setMeals((prev) =>
      prev.map((m) => {
        if (m.id === meal.id || (m.mealId && m.mealId === targetMealId)) {
          return {
            ...m,
            imageUrl: newUrls[0] || newPhotoUrlString,
            photoUrls: newUrls,
            driveFileName: newFileNames || m.driveFileName,
          };
        }
        return m;
      }),
    );

    setMealSheetRows((prev) =>
      prev.map((r) => {
        if (
          r.mealId &&
          targetMealId &&
          r.mealId.trim().toUpperCase() === targetMealId.trim().toUpperCase()
        ) {
          return {
            ...r,
            photoUrl: newPhotoUrlString,
          };
        }
        return r;
      }),
    );

    try {
      const stored = localStorage.getItem("nutrihealth_logged_meals");
      if (stored) {
        const parsed = JSON.parse(stored);
        const updated = parsed.map((m: any) => {
          if (m.id === meal.id || (m.mealId && m.mealId === targetMealId)) {
            return {
              ...m,
              imageUrl: newUrls[0] || newPhotoUrlString,
              photoUrls: newUrls,
              driveFileName: newFileNames || m.driveFileName,
            };
          }
          return m;
        });
        localStorage.setItem(
          "nutrihealth_logged_meals",
          JSON.stringify(updated),
        );
      }
    } catch (e) {
      console.warn("Could not save to localStorage", e);
    }

    // 3. Update in Google Sheet
    const targetSheetUrl =
      sheetConfig.sheetUrl ||
      localStorage.getItem("nutrihealth_sheet_url") ||
      "";
    if (!targetSheetUrl) {
      setIsConnectModalOpen(true);
      setUpdateNotification(
        "Photo deleted locally. Connect Google Sheet to persist changes to spreadsheet.",
      );
      setTimeout(() => setUpdateNotification(null), 4500);
      return true;
    }

    let token = await getAccessToken();
    if (!token) {
      setUpdateNotification("Authorizing with Google to update spreadsheet...");
      try {
        const authRes = await googleSignIn();
        if (!authRes?.accessToken) {
          setUpdateNotification(
            "Photo deleted locally. Google sign-in required to update spreadsheet.",
          );
          setTimeout(() => setUpdateNotification(null), 4000);
          return true;
        }
        token = authRes.accessToken;
      } catch (authErr) {
        console.warn("Google sign-in cancelled:", authErr);
        setUpdateNotification("Photo deleted locally.");
        setTimeout(() => setUpdateNotification(null), 3000);
        return true;
      }
    }

    try {
      const res = await fetch("/api/sheets/update-meal-photos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mealId: targetMealId,
          photoUrl: newPhotoUrlString,
          sheetUrl: targetSheetUrl,
          accessToken: token,
        }),
      });

      const data = await res.json();
      if (data.success || data.googleSheetsUpdated) {
        setUpdateNotification("Photo deleted in Google Sheet!");
        setTimeout(() => setUpdateNotification(null), 3500);
        return true;
      } else {
        console.warn(
          "Google Sheet photo update notice:",
          data.error || data.message,
        );
        setUpdateNotification("Updated locally. " + (data.message || ""));
        setTimeout(() => setUpdateNotification(null), 3500);
        return true;
      }
    } catch (apiErr: any) {
      console.warn("Error calling update-meal-photos:", apiErr);
      setUpdateNotification(
        "Updated locally. Sheet sync will retry on next sync.",
      );
      setTimeout(() => setUpdateNotification(null), 3500);
      return true;
    }
  };

  const handleResetDefaultMeals = () => {
    setMeals(INITIAL_LOGGED_MEALS);
    try {
      localStorage.setItem(
        "nutrihealth_logged_meals",
        JSON.stringify(INITIAL_LOGGED_MEALS),
      );
    } catch (e) {
      console.warn("Could not save to localStorage", e);
    }
    setUpdateNotification(
      "Resynced all meals with Google Sheet Drive attachments!",
    );
    setTimeout(() => setUpdateNotification(null), 3500);
  };

  const handleDownloadDebug = () => {
    try {
      const debugData = {
        timestamp: new Date().toISOString(),
        localStorage: {
          nutrihealth_sheet_url: localStorage.getItem("nutrihealth_sheet_url"),
          nutrihealth_logged_meals: localStorage.getItem(
            "nutrihealth_logged_meals",
          )
            ? JSON.parse(localStorage.getItem("nutrihealth_logged_meals")!)
            : null,
          nutrihealth_meal_sheet_rows: localStorage.getItem(
            "nutrihealth_meal_sheet_rows",
          )
            ? JSON.parse(localStorage.getItem("nutrihealth_meal_sheet_rows")!)
            : null,
          nutrihealth_diagnoses: localStorage.getItem("nutrihealth_diagnoses")
            ? JSON.parse(localStorage.getItem("nutrihealth_diagnoses")!)
            : null,
          nutrihealth_sheet_csv: localStorage.getItem("nutrihealth_sheet_csv"),
        },
        reactState: {
          mealsCount: meals.length,
          mealsRaw: meals,
          mealSheetRowsCount: mealSheetRows.length,
          mealSheetRowsRaw: mealSheetRows,
          sheetState: sheetState,
        },
      };

      setDebugJsonPayload(JSON.stringify(debugData, null, 2));
    } catch (e) {
      console.error("Failed to generate debug file:", e);
      alert("Failed to generate debug file. Check console.");
    }
  };

  // Component rows in the 38-column Google Sheet "meal log" format
  const [mealSheetRows, setMealSheetRows] = useState<MealLogRow[]>(() => {
    try {
      const saved = localStorage.getItem("nutrihealth_meal_sheet_rows_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return INITIAL_MEAL_LOG_ROWS;
    } catch {
      return INITIAL_MEAL_LOG_ROWS;
    }
  });

  // Save meals to local storage whenever changed
  useEffect(() => {
    try {
      localStorage.setItem("nutrihealth_logged_meals", JSON.stringify(meals));
    } catch (e) {
      console.warn("Could not persist meals to localStorage", e);
    }
  }, [meals]);

  // Persist mealSheetRows to local storage
  useEffect(() => {
    try {
      localStorage.setItem(
        "nutrihealth_meal_sheet_rows_v2",
        JSON.stringify(mealSheetRows),
      );
    } catch (e) {
      console.warn("Could not persist mealSheetRows to localStorage", e);
    }
  }, [mealSheetRows]);

  const handleAddMeal = (
    newMealData: Omit<LoggedMeal, "id"> | LoggedMeal,
    newSheetRows?: MealLogRow[],
  ) => {
    const googleSheetId =
      newMealData.mealId ||
      (newSheetRows && newSheetRows.length > 0
        ? newSheetRows[0].mealId
        : undefined);

    // Keep primary id distinct from the medical code mealId
    const uniqueId =
      "id" in newMealData && newMealData.id && !newMealData.id.startsWith("M-")
        ? newMealData.id
        : `meal-${newMealData.dateStr || newMealData.dayKey || "day"}-${googleSheetId || "custom"}-${Date.now()}`;

    const created: LoggedMeal = {
      ...newMealData,
      id: uniqueId,
      mealId: googleSheetId || newMealData.mealId || "",
    };

    setMeals((prev) => {
      // If a meal with the same mealId and date already exists, update it rather than duplicating
      const existingIndex = prev.findIndex(
        (m) =>
          (created.mealId &&
            m.mealId &&
            m.mealId.toUpperCase() === created.mealId.toUpperCase() &&
            m.dateStr === created.dateStr) ||
          m.id === created.id,
      );
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = { ...created, id: prev[existingIndex].id };
        return updated;
      }
      return [created, ...prev];
    });

    // Append or replace component rows in the Google Sheet "meal log" tab state
    if (newSheetRows && newSheetRows.length > 0) {
      setMealSheetRows((prev) => {
        const filtered = created.mealId
          ? prev.filter(
              (r) => r.mealId?.toUpperCase() !== created.mealId.toUpperCase(),
            )
          : prev;
        return [...newSheetRows, ...filtered];
      });
    }

    // Instantly refresh the entire dashboard state from the live sheet
    fetchLiveData(undefined, true);

    if (created.driveFileName || created.imageUrl) {
      setUpdateNotification(
        `Logged "${created.foodName}" & photo synced to Google Drive! Appended ${newSheetRows?.length || 1} rows to "meal log" tab.`,
      );
    } else {
      setUpdateNotification(
        `Logged "${created.foodName}" successfully into meal journal & Google Sheet tab!`,
      );
    }
    setTimeout(() => setUpdateNotification(null), 4500);
  };

  const handleDeleteMeal = async (id: string) => {
    // Prevent overlapping deletes
    if (isDeletingMealId) return;

    // Capture meal before removing if present
    const mealToDelete = meals.find(
      (m) =>
        m.id === id ||
        (m.mealId && id && m.mealId.toUpperCase() === id.toUpperCase()),
    );
    const sheetUrl = sheetConfig.sheetUrl;

    if (!mealToDelete && !sheetUrl) return;

    setIsDeletingMealId(id);
    const targetMealCode = mealToDelete?.mealId || id;

    // Attempt to delete from Google Sheet if connected
    if (sheetUrl) {
      try {
        const { getAccessToken } = await import("./utils/googleAuth");
        const token = await getAccessToken();

        if (!token) {
          throw new Error("Authentication required to delete.");
        }

        // Delete from Google Drive if there are images
        if (mealToDelete?.imageUrl) {
          const { extractDriveFileId } = await import("./utils/driveImage");
          const { deleteImageFromGoogleDrive } =
            await import("./utils/driveUploader");

          const urls = mealToDelete.imageUrl
            .split(",")
            .map((u) => u.trim())
            .filter(Boolean);
          for (const u of urls) {
            const fId = extractDriveFileId(u);
            if (fId) {
              await deleteImageFromGoogleDrive(fId).catch((e) =>
                console.warn(`Could not delete photo ${fId}:`, e),
              );
            }
          }

          if (mealToDelete.driveFileId) {
            await deleteImageFromGoogleDrive(mealToDelete.driveFileId).catch(
              (e) =>
                console.warn(
                  `Could not delete photo ${mealToDelete.driveFileId}:`,
                  e,
                ),
            );
          }
        }

        const res = await fetch("/api/sheets/delete-meal-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mealId: targetMealCode,
            sheetUrl,
            accessToken: token,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          console.log("Successfully deleted from sheet:", data.message);

          // Re-fetch to ensure sync is perfectly aligned
          setTimeout(() => {
            fetchLiveData(undefined, true);
          }, 1000);

          // Actually update local state now that it succeeded
          setMeals((prev) =>
            prev.filter(
              (m) =>
                m.id !== id &&
                (!mealToDelete || m.id !== mealToDelete.id) &&
                (!targetMealCode ||
                  m.mealId?.toUpperCase() !== targetMealCode.toUpperCase()),
            ),
          );
          setUpdateNotification("Meal removed from journal & synced.");
        } else {
          const errText = await res.text();
          console.error("Delete from sheet failed:", errText);
          throw new Error("Failed to delete from sheet: " + errText);
        }
      } catch (err: any) {
        console.warn("Failed to delete meal from sheet:", err);
        setUpdateNotification(`❌ Delete failed: ${err.message}`);
        setIsDeletingMealId(null);
        setTimeout(() => setUpdateNotification(null), 4000);
        return; // Early return on error
      }
    } else {
      // If no sheet URL, just delete locally
      setMeals((prev) =>
        prev.filter(
          (m) =>
            m.id !== id &&
            (!mealToDelete || m.id !== mealToDelete.id) &&
            (!targetMealCode ||
              m.mealId?.toUpperCase() !== targetMealCode.toUpperCase()),
        ),
      );
      setUpdateNotification("Meal removed from journal.");
    }

    setIsDeletingMealId(null);
    setTimeout(() => setUpdateNotification(null), 3000);
  };

  // Initialize state with the provided raw spreadsheet CSV
  const [sheetState, setSheetState] = useState<SheetState>(() => {
    try {
      return parseSpreadsheetCSV(RAW_INITIAL_SHEET_CSV);
    } catch (e) {
      console.warn("Failed to parse initial spreadsheet CSV:", e);
      throw e;
    }
  });

  const [sheetConfig, setSheetConfig] = useState<SheetConfig>({
    sheetUrl: localStorage.getItem("nutrihealth_sheet_url") || "",
    sheetId: "",
    autoSync: true,
    syncIntervalSeconds: 30,
    lastSyncedAt: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    status: "synced",
    errorMessage: null,
  });

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [debugJsonPayload, setDebugJsonPayload] = useState<string | null>(null);
  const [isDeletingMealId, setIsDeletingMealId] = useState<string | null>(null);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isMealSimulatorOpen, setIsMealSimulatorOpen] =
    useState<boolean>(false);
  const [isAskCoachOpen, setIsAskCoachOpen] = useState<boolean>(false);
  const [isLogMealOpen, setIsLogMealOpen] = useState<boolean>(false);
  const [editingMeal, setEditingMeal] = useState<LoggedMeal | null>(null);
  const [updateNotification, setUpdateNotification] = useState<string | null>(
    null,
  );

  const pollTimerRef = useRef<any>(null);

  // Fetch data from connected Google Sheet via server proxy
  const fetchLiveData = useCallback(
    async (customUrl?: string, silent = false) => {
      const targetUrl =
        customUrl !== undefined ? customUrl : sheetConfig.sheetUrl;
      // Animate the sync icon so the user sees live synchronization visually
      setIsRefreshing(true);

      try {
        const endpoint = targetUrl
          ? `/api/sheets/fetch?url=${encodeURIComponent(targetUrl)}`
          : `/api/sheets/fetch`;

        const { getAccessToken, clearSavedToken } =
          await import("./utils/googleAuth");
        const token = await getAccessToken();

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: targetUrl,
            accessToken: token || undefined,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 401 && data.isAuthError) {
            clearSavedToken();
            throw new Error(
              "Your Google session has expired. Please Re-Connect to Google Drive.",
            );
          }
          throw new Error(data.error || "Failed to fetch spreadsheet data");
        }

        if (data.success && (data.csv || data.mealLogCSV)) {
          if (data.csv) {
            const parsed = parseSpreadsheetCSV(data.csv);
            setSheetState((prev) => ({
              ...parsed,
              selectedDayKey: prev.selectedDayKey || parsed.selectedDayKey,
            }));
          }

          if (data.mealLogSyncSuccess || data.mealLogCSV) {
            try {
              const parsedRows = data.mealLogCSV
                ? parseMealLogCSV(data.mealLogCSV)
                : [];
              if (parsedRows.length > 0) {
                setMealSheetRows(parsedRows);
              }
              const builtMeals = buildMealsFromSheetRows(parsedRows);

              setMeals((prevMeals) => {
                const prevMap = new Map<string, LoggedMeal>();
                prevMeals.forEach((m) => {
                  if (m.mealId) prevMap.set(m.mealId.toUpperCase(), m);
                  if (m.mealId && m.dateStr)
                    prevMap.set(`${m.dateStr}_${m.mealId}`.toUpperCase(), m);
                  if (m.id) prevMap.set(m.id, m);
                });

                const initialMap = new Map<string, LoggedMeal>();
                INITIAL_LOGGED_MEALS.forEach((m) => {
                  if (m.mealId) initialMap.set(m.mealId.toUpperCase(), m);
                  if (m.mealId && m.dateStr)
                    initialMap.set(`${m.dateStr}_${m.mealId}`.toUpperCase(), m);
                });

                // Map and enrich meals from the sheet
                const updatedMeals = builtMeals.map((bm) => {
                  const keyWithDate =
                    bm.mealId && bm.dateStr
                      ? `${bm.dateStr}_${bm.mealId}`.toUpperCase()
                      : "";
                  const keyId = bm.mealId ? bm.mealId.toUpperCase() : "";

                  let pm =
                    (keyWithDate ? prevMap.get(keyWithDate) : undefined) ||
                    (keyId ? prevMap.get(keyId) : undefined);

                  // Only fallback to initialMap (hardcoded demo data) if the food name matches closely
                  // This prevents live sheet meals (like M-028 Quaker) from inheriting demo photos (like M-028 Peanuts PXL...jpg)
                  if (!pm) {
                    const fallback =
                      initialMap.get(keyWithDate) || initialMap.get(keyId);
                    if (
                      fallback &&
                      fallback.foodName.trim().toUpperCase() ===
                        bm.foodName.trim().toUpperCase()
                    ) {
                      pm = fallback;
                    }
                  }

                  const resolvedImg =
                    bm.imageUrl ||
                    pm?.imageUrl ||
                    (bm.driveFileName
                      ? formatDriveImageUrl(bm.driveFileName, bm.mealId)
                      : undefined);
                  const resolvedFileName =
                    bm.driveFileName ||
                    pm?.driveFileName ||
                    (bm.foodName
                      ? `${bm.foodName.replace(/[^a-zA-Z0-9]/g, "_")}.jpg`
                      : undefined);
                  const resolvedPhotoUrls =
                    bm.photoUrls && bm.photoUrls.length > 0
                      ? bm.photoUrls
                      : pm?.photoUrls && pm.photoUrls.length > 0
                        ? pm.photoUrls
                        : bm.imageUrl
                          ? bm.imageUrl
                              .split(/[,;\n]+/)
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : pm?.imageUrl
                            ? pm.imageUrl
                                .split(/[,;\n]+/)
                                .map((s) => s.trim())
                                .filter(Boolean)
                            : undefined;

                  return {
                    ...bm,
                    id: pm?.id || bm.id,
                    imageUrl: resolvedImg || undefined,
                    photoUrls:
                      resolvedPhotoUrls && resolvedPhotoUrls.length > 0
                        ? resolvedPhotoUrls
                        : undefined,
                    driveFileName: resolvedFileName,
                    driveFileId: bm.driveFileId || pm?.driveFileId,
                    driveFileIds: bm.driveFileIds || pm?.driveFileIds,
                    clinicalNote:
                      bm.clinicalNote ||
                      bm.mealDiagnosis ||
                      pm?.clinicalNote ||
                      pm?.mealDiagnosis,
                    mealDiagnosis: bm.mealDiagnosis || pm?.mealDiagnosis,
                    dailyDiagnosis: bm.dailyDiagnosis || pm?.dailyDiagnosis,
                    time:
                      bm.time && bm.time !== "12:00 PM"
                        ? bm.time
                        : pm?.time || "12:00 PM",
                  };
                });

                // Deduplicate and guarantee unique IDs across all meals
                const combined = [...updatedMeals];
                const seenIds = new Set<string>();
                const seenKeys = new Set<string>();
                const deduplicated: LoggedMeal[] = [];
                for (let i = 0; i < combined.length; i++) {
                  const m = combined[i];
                  const compositeKey =
                    m.mealId && m.dateStr
                      ? `${m.dateStr}_${m.mealId}`.toUpperCase()
                      : "";
                  if (compositeKey && seenKeys.has(compositeKey)) {
                    continue; // Skip duplicate meal on the same date with same mealId
                  }
                  if (compositeKey) seenKeys.add(compositeKey);

                  let finalId = m.id;
                  if (!finalId || seenIds.has(finalId)) {
                    finalId = `meal-${m.dateStr || m.dayKey || "date"}-${m.mealId || "item"}-${i + 1}`;
                  }
                  seenIds.add(finalId);
                  deduplicated.push({ ...m, id: finalId });
                }

                // Sort deduplicated by date descending (newest first), then time, then mealId
                deduplicated.sort((a, b) => {
                  const parseDateVal = (d?: string) => {
                    if (!d) return 0;
                    if (d.includes("/")) {
                      const [day, month, year] = d.split("/");
                      return new Date(`${year}-${month}-${day}`).getTime() || 0;
                    }
                    return new Date(d).getTime() || 0;
                  };
                  const dateA = parseDateVal(a.dateStr || a.dayKey);
                  const dateB = parseDateVal(b.dateStr || b.dayKey);
                  if (dateB !== dateA) return dateB - dateA;

                  const numA =
                    parseInt((a.mealId || "").replace(/\D/g, ""), 10) || 0;
                  const numB =
                    parseInt((b.mealId || "").replace(/\D/g, ""), 10) || 0;
                  return numB - numA;
                });

                return deduplicated;
              });
            } catch (e) {
              console.warn("Failed to parse meal log CSV:", e);
            }
          }

          // Now fetch Drive Files and check for orphans
          if (token) {
            try {
              const driveFiles = await fetchGoogleDriveFolderFiles();

              let maxDriveNum = 0;
              const orphans: DriveFolderFile[] = [];

              const rawMealLog = data.mealLogCSV || "";

              driveFiles.forEach((f) => {
                if (f.mealId) {
                  const match = f.mealId.match(/M-(\d+)/i);
                  if (match) {
                    const num = parseInt(match[1], 10);
                    if (!isNaN(num) && num > maxDriveNum) maxDriveNum = num;
                  }
                  // Check if this photo's URL, ID, or Filename is bound to ANY row in the sheet
                  const existsInSheet = rawMealLog.includes(f.id) || rawMealLog.includes(f.name);

                  if (!existsInSheet) {
                    orphans.push(f);
                  }
                }
              });

              setHighestDriveId(maxDriveNum);
              setOrphanedPhotos(orphans);
            } catch (e) {
              console.warn(
                "Failed to fetch drive files for orphan detection",
                e,
              );
            }
          }

          const syncTime = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          setSheetConfig((prev) => ({
            ...prev,
            lastSyncedAt: syncTime,
            status: "synced",
            errorMessage: null,
          }));
        }
      } catch (err: any) {
        console.warn("Sheet sync note:", err.message);
        setSheetConfig((prev) => ({
          ...prev,
          status: "error",
          errorMessage: err.message,
        }));
      } finally {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    },
    [sheetConfig.sheetUrl],
  );

  // Setup background auto-sync polling
  useEffect(() => {
    if (!sheetConfig.autoSync) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const intervalMs = (sheetConfig.syncIntervalSeconds || 30) * 1000;
    pollTimerRef.current = setInterval(() => {
      fetchLiveData(undefined, true);
    }, intervalMs);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [sheetConfig.autoSync, sheetConfig.syncIntervalSeconds, fetchLiveData]);

  // Initial load
  useEffect(() => {
    fetchLiveData(undefined, true);
  }, []);

  const handleSaveConfig = async (
    url: string,
    autoSync: boolean,
    interval: number,
  ) => {
    setIsRefreshing(true);
    try {
      // First, fetch the data which tests the connection and updates all state including meal logs
      await fetchLiveData(url, false);

      localStorage.setItem("nutrihealth_sheet_url", url);

      setSheetConfig((prev) => ({
        ...prev,
        sheetUrl: url,
        autoSync,
        syncIntervalSeconds: interval,
        status: "synced",
        errorMessage: null,
      }));

      setUpdateNotification("Connected to Google Sheet successfully!");
      setTimeout(() => setUpdateNotification(null), 4000);
    } catch (err: any) {
      setSheetConfig((prev) => ({
        ...prev,
        status: "error",
        errorMessage: err.message,
      }));
      throw err;
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResetToDefault = () => {
    const parsed = parseSpreadsheetCSV(RAW_INITIAL_SHEET_CSV);
    setSheetState(parsed);
    localStorage.removeItem("nutrihealth_sheet_url");
    setSheetConfig({
      sheetUrl: "",
      sheetId: "",
      autoSync: true,
      syncIntervalSeconds: 30,
      lastSyncedAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      status: "synced",
      errorMessage: null,
    });
  };

  const activeCol =
    sheetState.columns.find((c) => c.key === sheetState.selectedDayKey) ||
    sheetState.columns[0];
  const activeDiagnosis =
    sheetState.diagnoses[sheetState.selectedDayKey] ||
    sheetState.diagnoses["baseline"];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Toast Notification */}
      {updateNotification && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{updateNotification}</span>
        </div>
      )}

      {/* Main App Bar with Navigation Tabs */}
      <Header
        sheetConfig={sheetConfig}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenConnectModal={() => setIsConnectModalOpen(true)}
        onOpenMealSimulator={() => setIsMealSimulatorOpen(true)}
        onOpenAskCoach={() => setIsAskCoachOpen(true)}
        onOpenLogMeal={() => {
          if (!sheetConfig.sheetUrl) {
            setUpdateNotification(
              "Please connect a Google Sheet to log meals.",
            );
            setIsConnectModalOpen(true);
          } else {
            setIsLogMealOpen(true);
          }
        }}
        onOpenDriveModal={() => setIsDriveModalOpen(true)}
        onResyncSheetAttachments={handleResetDefaultMeals}
        onDownloadDebug={handleDownloadDebug}
        onManualRefresh={() => {
          if (!sheetConfig.sheetUrl) {
            setUpdateNotification("Please connect a Google Sheet to sync.");
            setIsConnectModalOpen(true);
          } else {
            fetchLiveData(undefined, false);
          }
        }}
        isRefreshing={isRefreshing}
        lastSyncedText={sheetConfig.lastSyncedAt || ""}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* TAB 1: HEALTH DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="space-y-6 animate-fade-in">
            {/* Day Selector Navigation */}
            <DaySelector
              columns={sheetState.columns}
              selectedDayKey={sheetState.selectedDayKey}
              onSelectDay={(key) =>
                setSheetState((prev) => ({ ...prev, selectedDayKey: key }))
              }
            />

            {/* Clinical Diagnosis Card */}
            <DiagnosisBanner
              diagnosis={activeDiagnosis}
              dayLabel={activeCol.label}
              isBaseline={activeCol.isRollingBaseline}
            />

            {/* Key Metrics Grid */}
            <KeyMetricsGrid
              nutrients={sheetState.nutrients}
              selectedDayKey={sheetState.selectedDayKey}
            />

            {/* Analytics & Longitudinal Trends */}
            <TrendsAndAllowanceChart
              nutrients={sheetState.nutrients}
              columns={sheetState.columns}
              selectedDayKey={sheetState.selectedDayKey}
            />

            {/* Personalized AI Health & Nutrition Strategy */}
            <PersonalizedRecommendations
              selectedDayKey={sheetState.selectedDayKey}
              dayLabel={activeCol.label}
              nutrients={sheetState.nutrients}
              diagnosisText={activeDiagnosis?.raw}
            />

            {/* Complete 30+ Nutrient Allowance Matrix */}
            <NutrientAllowanceTracker
              nutrients={sheetState.nutrients}
              selectedDayKey={sheetState.selectedDayKey}
            />
          </div>
        )}

        {/* TAB 2: HEALTH PROFILE & LABS */}
        {activeTab === "health" && (
          <HealthProfileView
            sheetState={sheetState}

            onOpenAskCoach={() => setIsAskCoachOpen(true)}
          />
        )}

        {/* TAB 3: MEAL LOG */}
        {activeTab === "meal-log" && (
          <MealLogView
            meals={meals}
            columns={sheetState.columns}
            onAddMeal={handleAddMeal}
            onDeleteMeal={handleDeleteMeal}
            onReviewMeal={(meal) => {
              setEditingMeal(meal);
              setIsLogMealOpen(true);
            }}
            isDeletingMealId={isDeletingMealId}

            onResetDefaultMeals={handleResetDefaultMeals}
            onUpdateMealPhoto={handleUpdateMealPhoto}
            onSetMealTopPhoto={handleSetMealTopPhoto}
            onDeleteMealPhoto={handleDeleteMealPhoto}
            orphanedPhotos={orphanedPhotos}
            onRecoverOrphan={(photo) => {
              const parsedRows = mealSheetRows;
              const sheetRowsWithSameId = parsedRows.filter(
                (r) => r.mealId?.toUpperCase() === photo.mealId?.toUpperCase(),
              );

              // If the sheet already has rows for this mealId, and those rows have a different photo,
              // it's a collision (meaning this photo belongs to a DIFFERENT meal).
              const isCollision =
                sheetRowsWithSameId.length > 0 &&
                sheetRowsWithSameId.some(
                  (r) =>
                    r.photoUrl &&
                    r.photoUrl.length > 5 &&
                    !r.photoUrl.includes(photo.id) &&
                    !r.photoUrl.includes(photo.name),
                );

              // Create a dummy meal just to pass the photo to the review modal
              const dummyMeal: LoggedMeal = {
                id: `orphan-${photo.id}`,
                mealId: isCollision ? "" : photo.mealId || "",
                isRecoveredNewMeal: isCollision,
                foodName:
                  photo.name.replace(/_/g, " ").replace(/\.[^/.]+$/, "") ||
                  "Recovered Meal",
                imageUrl: photo.url,
                photoUrls: [photo.url],
                driveFileName: photo.name,
                driveFileId: photo.id,
                dateStr: new Date().toISOString().split("T")[0], // default to today
                dayKey: new Date().toISOString().split("T")[0],
                time: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                mealType: "Snack",
                portion: "1 portion",
                calories: 0,
                protein: 0,
                totalFat: 0,
                saturatedFat: 0,
                carbs: 0,
                fiber: 0,
                sodium: 0,
                addedSugars: 0,
              };
              setEditingMeal(dummyMeal);
              setIsLogMealOpen(true);
            }}
            onDeleteOrphan={async (photo) => {
              // Optional: delete from drive here
              try {
                const { deleteImageFromGoogleDrive } =
                  await import("./utils/driveUploader");
                await deleteImageFromGoogleDrive(photo.id);
                setOrphanedPhotos((prev) =>
                  prev.filter((p) => p.id !== photo.id),
                );
              } catch (e) {
                console.warn("Failed to delete orphaned photo", e);
              }
            }}
          />
        )}

        {/* TAB 4: DAILY MEAL */}
        {activeTab === "daily-meal" && (
          <DailyMealView
            columns={sheetState.columns}
            selectedDayKey={sheetState.selectedDayKey}
            onSelectDay={(key) =>
              setSheetState((prev) => ({ ...prev, selectedDayKey: key }))
            }
            meals={meals}
            nutrients={sheetState.nutrients}
            clinicalDiagnoses={sheetState.clinicalDiagnoses}

            onUpdateMealPhoto={handleUpdateMealPhoto}
            onSetMealTopPhoto={handleSetMealTopPhoto}
            onDeleteMealPhoto={handleDeleteMealPhoto}
          />
        )}

        {/* TAB 5: SPREADSHEET GRID */}
        {activeTab === "spreadsheet" && (
          <SpreadsheetGridView
            sheetState={sheetState}
            mealSheetRows={mealSheetRows}
            onOpenConnectModal={() => setIsConnectModalOpen(true)}
            onManualRefresh={() => {
              if (!sheetConfig.sheetUrl) {
                setUpdateNotification("Please connect a Google Sheet to sync.");
                setIsConnectModalOpen(true);
              } else {
                fetchLiveData(undefined, false);
              }
            }}
            isRefreshing={isRefreshing}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            © 2026 NutriHealth Dashboard. Direct native connection with Google
            Sheets.
          </p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Target LDL: &lt;15g Sat Fat</span>
            <span>•</span>
            <span>Target Renal: &lt;1,200mg Sodium</span>
            <span>•</span>
            <span>Oat Beta-Glucan Soluble Fiber</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <DriveFolderModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        onSelectPhoto={(photo: DriveFolderFile) => {
          setUpdateNotification(`Selected "${photo.name}" from Google Drive!`);
          setTimeout(() => setUpdateNotification(null), 3000);
        }}
      />
      <SheetConnectionModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        sheetConfig={sheetConfig}
        onSaveConfig={handleSaveConfig}
        onResetToDefault={handleResetToDefault}
      />

      {debugJsonPayload && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950 p-4 sm:p-8 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Debug JSON Output</h2>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`data:text/json;charset=utf-8,${encodeURIComponent(debugJsonPayload)}`}
                download={`debug-nutrihealth-${new Date().toISOString().replace(/[:.]/g, "-")}.json`}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-sm transition-colors block text-center"
              >
                Download File
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(debugJsonPayload);
                  alert("Copied to clipboard! Please paste this in the chat.");
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setDebugJsonPayload(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          <textarea
            readOnly
            className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-xl p-4 font-mono text-xs sm:text-sm text-green-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
            value={debugJsonPayload}
          />
        </div>
      )}

      <MealSimulatorModal
        isOpen={isMealSimulatorOpen}
        onClose={() => setIsMealSimulatorOpen(false)}
        nutrients={sheetState.nutrients}
        selectedDayKey={sheetState.selectedDayKey}
      />

      <AskNutritionistModal
        isOpen={isAskCoachOpen}
        onClose={() => setIsAskCoachOpen(false)}
        nutrients={sheetState.nutrients}
        selectedDayKey={sheetState.selectedDayKey}
        dayLabel={activeCol.label}
        diagnosis={activeDiagnosis}
      />

      <FoodNutritionAgentModal
        isOpen={isLogMealOpen}
        onClose={() => {
          setEditingMeal(null);
          setIsLogMealOpen(false);
        }}
        onAddMeal={handleAddMeal}
        onDeleteMeal={handleDeleteMeal}
        initialEditingMeal={editingMeal}
        highestDriveId={highestDriveId}
      />
    </div>
  );
}
