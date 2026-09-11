const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(/onOpenConnectModal=\{\(\) => setIsConnectModalOpen\(true\)\}/, 
`onOpenConnectModal={() => setIsConnectModalOpen(true)}
        onOpenMealSimulator={() => setIsMealSimulatorOpen(true)}`);
fs.writeFileSync('src/App.tsx', code);
