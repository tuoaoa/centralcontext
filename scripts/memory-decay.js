/**
 * CentralContext Memory Distillery v0.2
 * Memory Decay & Reinforcement Engine (scripts/memory-decay.js)
 * 
 * Purpose: Manage memory lifespans and prevent context bloat. 
 * - Decay: Reduce confidence for memories not mentioned in 90 days. Flag for archive at 180 days.
 * - Reinforcement: Merge duplicate facts, increase confidence, and update last_seen timestamp.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const approvedStorePath = path.join(rootDir, 'data/memory/approved/approved_memories.json');
const archiveStorePath = path.join(rootDir, 'data/memory/approved/archived_memories.json');

console.log(`\n\x1b[35m==================================================\x1b[0m`);
console.log(`\x1b[35m⏳ MEMORY DECAY & REINFORCEMENT ENGINE (v0.2)\x1b[0m`);
console.log(`\x1b[35m==================================================\x1b[0m`);
console.log(`Store Path: \x1b[36m${path.relative(rootDir, approvedStorePath)}\x1b[0m`);
console.log(`\x1b[35m--------------------------------------------------\x1b[0m\n`);

if (!fs.existsSync(approvedStorePath)) {
  console.log(`\x1b[33mNo approved memories database found. Clearance clean. Exiting.\x1b[0m\n`);
  process.exit(0);
}

let approvedMemories = [];
try {
  approvedMemories = JSON.parse(fs.readFileSync(approvedStorePath, 'utf8'));
} catch (e) {
  console.error('\x1b[31mError: Failed to parse approved memories database.\x1b[0m');
  process.exit(1);
}

if (approvedMemories.length === 0) {
  console.log(`\x1b[33mApproved memories database is empty. Curation ready.\x1b[0m\n`);
  process.exit(0);
}

const now = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
const DECAY_THRESHOLD = 90 * DAY_MS; // 90 days
const ARCHIVE_THRESHOLD = 180 * DAY_MS; // 180 days

let decayCount = 0;
let archiveCount = 0;
let reinforcedCount = 0;

const refinedMemories = [];
const archivedMemories = [];

// Load existing archives if any
let existingArchives = [];
if (fs.existsSync(archiveStorePath)) {
  try {
    existingArchives = JSON.parse(fs.readFileSync(archiveStorePath, 'utf8'));
  } catch (e) {}
}

// 1. Process Reinforcement (Merge identical / highly similar facts)
const groupedMemories = {};
approvedMemories.forEach(mem => {
  // Normalize text for simple exact deduplication
  const key = mem.proposed_memory.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (!groupedMemories[key]) {
    groupedMemories[key] = [];
  }
  groupedMemories[key].push(mem);
});

Object.keys(groupedMemories).forEach(key => {
  const duplicates = groupedMemories[key];
  const primary = duplicates[0];

  if (duplicates.length > 1) {
    // Reinforcement logic: increase confidence score by 10 per duplicate, cap at 100
    const originalConf = primary.confidence || 80;
    const bonus = (duplicates.length - 1) * 10;
    primary.confidence = Math.min(100, originalConf + bonus);
    
    // Set last_seen to the newest timestamp
    const timestamps = duplicates.map(d => Date.parse(d.timestamp || d.distilled_at || new Date().toISOString()));
    const newestTs = new Date(Math.max(...timestamps)).toISOString();
    primary.timestamp = newestTs;
    primary.last_seen = newestTs;

    // Concat evidence
    const allEvidence = [];
    duplicates.forEach(d => {
      if (Array.isArray(d.evidence)) allEvidence.push(...d.evidence);
      else if (d.evidence) allEvidence.push(d.evidence);
    });
    primary.evidence = Array.from(new Set(allEvidence)).slice(0, 5); // cap at 5 evidence points

    reinforcedCount += (duplicates.length - 1);
    console.log(`\x1b[32m✔ REINFORCED: "${primary.proposed_memory.substring(0, 50)}..." (+${bonus} confidence, cap 100)\x1b[0m`);
  }

  // 2. Process Decay on the merged/reinforced primary memory
  const lastSeenMs = Date.parse(primary.last_seen || primary.timestamp || new Date().toISOString());
  const elapsedMs = now - lastSeenMs;

  // For diagnostic testing, the user can pass `--simulate-decay <days>` to test the decay logic
  const simulateArgIndex = process.argv.indexOf('--simulate-decay');
  let simulatedElapsed = elapsedMs;
  if (simulateArgIndex !== -1 && process.argv[simulateArgIndex + 1]) {
    const simulatedDays = parseInt(process.argv[simulateArgIndex + 1]);
    simulatedElapsed = simulatedDays * DAY_MS;
    console.log(`[Simulation] Simulating decay of \x1b[33m${simulatedDays} days\x1b[0m...`);
  }

  if (simulatedElapsed >= ARCHIVE_THRESHOLD) {
    primary.archived_at = new Date().toISOString();
    primary.status = 'archived';
    archivedMemories.push(primary);
    archiveCount++;
    console.log(`\x1b[31m⚠ ARCHIVED:   "${primary.proposed_memory.substring(0, 50)}..." (No activity in 180 days)\x1b[0m`);
  } else if (simulatedElapsed >= DECAY_THRESHOLD) {
    const originalConf = primary.confidence || 80;
    // Reduce confidence by 15% (Decay rate)
    primary.confidence = Math.max(10, Math.round(originalConf * 0.85));
    primary.status = 'decayed';
    primary.last_decayed_at = new Date().toISOString();
    refinedMemories.push(primary);
    decayCount++;
    console.log(`\x1b[33m⚠ DECAYED:    "${primary.proposed_memory.substring(0, 50)}..." (Reduced confidence to ${primary.confidence})\x1b[0m`);
  } else {
    refinedMemories.push(primary);
  }
});

// Write updated lists back to files
fs.writeFileSync(approvedStorePath, JSON.stringify(refinedMemories, null, 2), 'utf8');
console.log(`\n\x1b[32m✔ Approved Memories database updated (Retained: ${refinedMemories.length}).\x1b[0m`);

if (archivedMemories.length > 0) {
  const allArchives = existingArchives.concat(archivedMemories);
  fs.writeFileSync(archiveStorePath, JSON.stringify(allArchives, null, 2), 'utf8');
  console.log(`\x1b[32m✔ Archived Memories saved to: ${path.relative(rootDir, archiveStorePath)} (Added: ${archiveCount}).\x1b[0m`);
}

console.log(`\n\x1b[35m--------------------------------------------------\x1b[0m`);
console.log(`Summary: Reinforced \x1b[32m${reinforcedCount}\x1b[0m duplicates | Decayed \x1b[33m${decayCount}\x1b[0m items | Archived \x1b[31m${archiveCount}\x1b[0m items.`);
console.log(`\x1b[35m==================================================\x1b[0m\n`);
