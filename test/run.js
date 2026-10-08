/* Chạy toàn bộ test:  node test/run.js */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const files = ['geom.js', 'engine.js', 'ai.js'];
let failed = 0;

for (const f of files) {
  console.log('\n======== test/' + f + ' ========');
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}

console.log('\n========================================');
if (failed === 0) console.log('★ TẤT CẢ TEST PASSED (' + files.length + '/3)');
else console.log('✗ ' + failed + '/3 file FAILED');
process.exit(failed ? 1 : 0);
