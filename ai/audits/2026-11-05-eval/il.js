// Session-only hook used by the eval. Appends each InstructionsLoaded event to the file in IL_LOG.
const fs = require('fs');
let s = '';
process.stdin.on('data', d => (s += d));
process.stdin.on('end', () => {
  try {
    const e = JSON.parse(s);
    fs.appendFileSync(process.env.IL_LOG, JSON.stringify({ file: e.file_path, why: e.load_reason, type: e.memory_type }) + '\n');
  } catch { /* the eval treats a missing log as "unknown" */ }
});
