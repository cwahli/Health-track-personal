import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /const normalize = \(s: string\) => \(s \|\| ''\)\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\]\/g, ''\);/g;
const replacement = `const normalize = (s: string) => {
    let clean = (s || '').toLowerCase();
    // Remove anything in parentheses like "(g)" or "(kcal)"
    clean = clean.replace(/\\(.*?\\)/g, '');
    return clean.replace(/[^a-z0-9]/g, '');
  };`;

code = code.replace(regex, replacement);
fs.writeFileSync('server.ts', code);
