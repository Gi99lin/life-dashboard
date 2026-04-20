const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const VAULT_PATH = '/Users/ivanakimkin/Documents/1';
const dateStr = new Date().toISOString().slice(0, 10);
const schedulePath = join(VAULT_PATH, 'Жизнь', 'Daily', `${dateStr}-schedules.md`);

console.log("Path:", schedulePath, "Exists:", existsSync(schedulePath));

if (existsSync(schedulePath)) {
  const content = readFileSync(schedulePath, 'utf-8');
  const lines = content.split('\n');
  let blocks = [];
  for (const line of lines) {
     const m = line.match(/\|\s*(\d{2}:\d{2})-(\d{2}:\d{2})\s*\|\s*(.*?)\s*\|/);
     if (m) {
         blocks.push({ start: m[1], end: m[2], activity: m[3].trim() });
     }
  }
  
  const now = new Date();
  const curHm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  
  console.log("curHm:", curHm);
  
  let current = null;
  let next = null;
  
  for (let i=0; i<blocks.length; i++) {
      const b = blocks[i];
      if (curHm >= b.start && curHm < b.end) {
          current = b;
          next = blocks[i+1] || null;
          break;
      } else if (b.start > curHm && !current) {
          next = b;
          break;
      }
  }
  
  console.log({ current, next, blocks });
}
