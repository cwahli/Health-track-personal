const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "const [isRefreshing, setIsRefreshing] = useState<boolean>(false);",
  "const [isRefreshing, setIsRefreshing] = useState<boolean>(false);\n  const [isDeletingMealId, setIsDeletingMealId] = useState<string | null>(null);"
);

code = code.replace(
  `  const handleDeleteMeal = async (id: string) => {
    // Capture meal before removing
    const mealToDelete = meals.find((m) => m.id === id);

    // Optimistically update local state
    setMeals((prev) => prev.filter((m) => m.id !== id));

    // Attempt to delete from Google Sheet if connected
    const sheetUrl = sheetConfig.sheetUrl;
    if (sheetUrl) {
      try {
        const { getAccessToken } = await import("./utils/googleAuth");
        const token = await getAccessToken();
        if (token) {
          // Delete from Google Drive if there's an image
          if (mealToDelete?.imageUrl) {
            const { extractDriveFileId } = await import("./utils/driveImage");
            const { deleteImageFromGoogleDrive } =
              await import("./utils/driveUploader");
            const driveFileId =
              mealToDelete.driveFileId ||
              extractDriveFileId(mealToDelete.imageUrl);
            if (driveFileId) {
              const deletedFromDrive =
                await deleteImageFromGoogleDrive(driveFileId);
              if (deletedFromDrive) {
                console.log(
                  \`Successfully deleted image from Google Drive: \${driveFileId}\`,
                );
              }
            }
          }

          const res = await fetch("/api/sheets/delete-meal-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mealId: id,
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
          } else {
            console.error("Delete from sheet failed:", await res.text());
          }
        }
      } catch (err) {
        console.warn("Failed to delete meal from sheet:", err);
      }
    }

    setUpdateNotification("Meal removed from journal.");
    setTimeout(() => setUpdateNotification(null), 3000);
  };`,
  `  const handleDeleteMeal = async (id: string) => {
    // Prevent overlapping deletes
    if (isDeletingMealId) return;

    // Capture meal before removing
    const mealToDelete = meals.find((m) => m.id === id);
    if (!mealToDelete) return;

    setIsDeletingMealId(id);

    // Attempt to delete from Google Sheet if connected
    const sheetUrl = sheetConfig.sheetUrl;
    if (sheetUrl) {
      try {
        const { getAccessToken } = await import("./utils/googleAuth");
        const token = await getAccessToken();
        
        if (!token) {
          throw new Error("Authentication required to delete.");
        }

        // Delete from Google Drive if there's an image
        if (mealToDelete?.imageUrl) {
          const { extractDriveFileId } = await import("./utils/driveImage");
          const { deleteImageFromGoogleDrive } =
            await import("./utils/driveUploader");
          const driveFileId =
            mealToDelete.driveFileId ||
            extractDriveFileId(mealToDelete.imageUrl);
          if (driveFileId) {
            const deletedFromDrive =
              await deleteImageFromGoogleDrive(driveFileId);
            if (deletedFromDrive) {
              console.log(
                \`Successfully deleted image from Google Drive: \${driveFileId}\`,
              );
            }
          }
        }

        const res = await fetch("/api/sheets/delete-meal-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mealId: id,
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
          setMeals((prev) => prev.filter((m) => m.id !== id));
          setUpdateNotification("Meal removed from journal & synced.");
        } else {
          const errText = await res.text();
          console.error("Delete from sheet failed:", errText);
          throw new Error("Failed to delete from sheet: " + errText);
        }
      } catch (err: any) {
        console.warn("Failed to delete meal from sheet:", err);
        setUpdateNotification(\`❌ Delete failed: \${err.message}\`);
        setIsDeletingMealId(null);
        setTimeout(() => setUpdateNotification(null), 4000);
        return; // Early return on error
      }
    } else {
       // If no sheet URL, just delete locally
       setMeals((prev) => prev.filter((m) => m.id !== id));
       setUpdateNotification("Meal removed from journal.");
    }

    setIsDeletingMealId(null);
    setTimeout(() => setUpdateNotification(null), 3000);
  };`
);

code = code.replace(
  `            onDeleteMeal={handleDeleteMeal}`,
  `            onDeleteMeal={handleDeleteMeal}
            isDeletingMealId={isDeletingMealId}`
);

fs.writeFileSync('src/App.tsx', code);
