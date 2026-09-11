const fs = require('fs');
let code = fs.readFileSync('src/components/MealLogView.tsx', 'utf8');

code = code.replace(
  "  onDeleteMeal: (id: string) => void;",
  "  onDeleteMeal: (id: string) => void;\n  isDeletingMealId?: string | null;"
);

code = code.replace(
  "  onDeleteMeal,",
  "  onDeleteMeal,\n  isDeletingMealId,"
);

code = code.replace(
  `                        <Trash2 className="w-3.5 h-3.5" />`,
  `                        {isDeletingMealId === meal.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}`
);

// We need to import Loader2
if (!code.includes("Loader2")) {
  code = code.replace(
    "  Trash2,",
    "  Trash2,\n  Loader2,"
  );
}

fs.writeFileSync('src/components/MealLogView.tsx', code);
