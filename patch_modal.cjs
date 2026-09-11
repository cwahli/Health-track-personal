const fs = require('fs');
let code = fs.readFileSync('src/components/FoodNutritionAgentModal.tsx', 'utf8');

code = code.replace(
  `      } catch (driveErr) {
        console.warn('Google Drive upload on save meal note:', driveErr);
      }`,
  `      } catch (driveErr: any) {
        console.warn('Google Drive upload on save meal note:', driveErr);
        setSavingStatusMsg(\`❌ Drive Upload Failed: \${driveErr.message}\`);
        setTimeout(() => {
          setIsSavingMealId(null);
          setSavingStatusMsg(null);
        }, 7000);
        return; // Abort save if Drive upload fails
      }`
);

fs.writeFileSync('src/components/FoodNutritionAgentModal.tsx', code);
