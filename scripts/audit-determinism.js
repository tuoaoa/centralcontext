const fs = require('fs');
const { execSync } = require('child_process');
const outputs = [];
for (let i = 0; i < 3; i++) {
  execSync('node scripts/generate-daily-digest.js', { stdio: 'ignore' });
  outputs.push(fs.readFileSync('context/DAILY_DIGEST.md', 'utf8'));
}
const same = outputs[0] === outputs[1] && outputs[1] === outputs[2];
console.log('Determinism with DB present:', same ? 'PASS' : 'FAIL');
if (!same) {
  fs.writeFileSync('digest_run_0.md', outputs[0]);
  fs.writeFileSync('digest_run_1.md', outputs[1]);
  fs.writeFileSync('digest_run_2.md', outputs[2]);
}
