const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/    <\/div>\n      <FoodNutritionAgentModal isOpen=\{isLogMealOpen\} onClose=\{\(\) => setIsLogMealOpen\(false\)\} onAddMeal=\{handleAddMeal\} \/>    <\/div>  \);\}/s, 
`      <FoodNutritionAgentModal isOpen={isLogMealOpen} onClose={() => setIsLogMealOpen(false)} onAddMeal={handleAddMeal} />
    </div>
  );
}`);
fs.writeFileSync('src/App.tsx', code);
