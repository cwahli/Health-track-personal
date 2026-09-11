const fs = require('fs');
let code = fs.readFileSync('src/utils/driveUploader.ts', 'utf8');

code = code.replace(
  `    if (!response.ok) {
       console.warn(\`Failed to delete Google Drive file \${fileId}:\`, await response.text());
       return false;
    }`,
  `    if (!response.ok) {
       const errText = await response.text();
       if (response.status === 404) {
         console.warn(\`File \${fileId} already deleted from Drive (404).\`);
         return true; // Consider it a success if it's already gone
       }
       console.warn(\`Failed to delete Google Drive file \${fileId}:\`, errText);
       throw new Error(\`Drive API Error \${response.status}: \${errText}\`);
    }`
);

fs.writeFileSync('src/utils/driveUploader.ts', code);
