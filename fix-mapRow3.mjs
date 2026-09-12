import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /const targetIdx = headers\.length > 0 \? getIndex\(\.\.\.possibleNames\) \: defaultIdx;/g;

const replacement = `let targetIdx = headers.length > 0 ? getIndex(...possibleNames) : defaultIdx;
    if (targetIdx === -1) targetIdx = defaultIdx;`;

code = code.replace(regex, replacement);
fs.writeFileSync('server.ts', code);
