import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /const getIndex = \(\.\.\.possibleNames: string\[\]\) => \{\s*for \(const name of possibleNames\) \{\s*const target = headerMap\[normalize\(name\)\];\s*if \(target \!\=\= undefined\) return target;\s*\}\s*return -1;\s*\};/g;

const replacement = `const getIndex = (...possibleNames: string[]) => {
    for (const name of possibleNames) {
      const normName = normalize(name);
      if (headerMap[normName] !== undefined) return headerMap[normName];
      // Also try to find a header that includes this name
      for (const [hKey, hIdx] of Object.entries(headerMap)) {
        if (hKey.includes(normName) || normName.includes(hKey)) return hIdx;
      }
    }
    return -1;
  };`;

code = code.replace(regex, replacement);
fs.writeFileSync('server.ts', code);
