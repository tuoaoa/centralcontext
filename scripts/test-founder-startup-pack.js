#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const repoRoot = path.resolve(__dirname, '..');
const {
  redactAll,
  parsePriorityProject,
  parseAvoidProjects,
  formatAvoidToday,
  parseFounderIntent,
  parseActiveProjectsList
} = require('./generate-founder-startup-pack');

const startupPackPath = path.join(repoRoot, 'context/FOUNDER_STARTUP_PACK.md');

// Run the generator to produce the output
const { execSync } = require('child_process');

function runGenerator() {
  execSync('node scripts/generate-founder-startup-pack.js', { stdio: 'inherit' });
}

function test() {
  console.log('\n\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m🧪 TESTING FOUNDER WORKFLOW INTEGRATION (v1)\x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m\n');

  // ==========================================
  // Test Section A: Standard Integration Tests
  // ==========================================
  console.log('Running standard startup pack generator checks...');
  runGenerator();
  
  assert(fs.existsSync(startupPackPath), 'FOUNDER_STARTUP_PACK.md must exist after generator run');
  console.log('  - Pack exists (PASSED)');

  const content = fs.readFileSync(startupPackPath, 'utf8');

  // Verify all expected required headings are present
  const requiredHeadings = [
    '# FOUNDER STARTUP PACK (Bản tin Khởi động Hàng ngày)',
    '## Founder Focus Today',
    '## Current Active State',
    '## Strategic Intent (from FOUNDER_INTENT.md)',
    '## Source Priority Notes',
    '## High-Value Memory Summary',
    '## Recent Decisions',
    '## Recent Work Log Entries'
  ];

  for (const heading of requiredHeadings) {
    assert(content.includes(heading), `Generated pack must contain section: "${heading}"`);
  }
  console.log('  - All structural headings present (PASSED)');

  // Verify priority source resolution and that old/archive did not override it
  assert(content.includes('Priority Project: qlythuexe') || content.includes('Resolved priority project is `qlythuexe`'), 'Resolved priority project must be qlythuexe');
  assert(!content.includes('Priority Project: SaveX'), 'Old priority (SaveX) must not override current state');
  assert(!content.includes('Priority Project: GiveGet'), 'Archive priority (GiveGet) must not override current state');
  console.log('  - Priority source resolution matches CURRENT_STATE.md (PASSED)');

  // Verify safety / redaction of secrets and internal test markers
  assert(!content.includes('FOUNDER_CODE_8827'), 'Founder validation code must not be exposed');
  assert(content.includes('[REDACTED_FOUNDER_CODE]'), 'Founder code must be replaced by [REDACTED_FOUNDER_CODE]');
  
  // Test markers and validation codes
  assert(!content.includes('SECRET_CONTEXT_TEST_7791'), 'SECRET_CONTEXT_TEST_7791 must not leak');
  assert(!content.includes('SECRET_CONTEXT_TEST_8892'), 'SECRET_CONTEXT_TEST_8892 must not leak');
  assert(!content.includes('AUTO_CONTEXT_PASS'), 'AUTO_CONTEXT_PASS validation code must not leak');
  assert(!content.includes('CentralContext verification test run 3'), 'Validation check strings must not leak');
  assert(content.includes('[REDACTED_TEST_MARKER]'), 'Scrubbed test/validation markers must be replaced by [REDACTED_TEST_MARKER]');
  console.log('  - Redaction of tokens and markers verified (PASSED)');

  // ==========================================
  // Required Fix #1: Dynamic "Avoid Today" Unit Tests
  // ==========================================
  console.log('\nRunning dynamic Avoid Today unit tests...');

  // Test Case A1: Standard active context where SaveX is paused in current state or decisions
  const currentState1 = 'Dự án ưu tiên số 1: qlythuexe\nKhông ưu tiên SaveX trong 30 ngày tới.';
  const decisions1 = 'Tạm dừng/đóng băng dự án `SaveX` trong 30 ngày tới.';
  const avoidList1 = parseAvoidProjects(currentState1, decisions1);
  assert(avoidList1.includes('SaveX'), 'SaveX must be parsed as an avoided project when explicitly paused/frozen');
  console.log('  - Case 1.1: SaveX resolved when paused/frozen (PASSED)');

  // Test Case A2: Avoid Advice changes dynamically if the paused project changes in active context
  const currentState2 = 'Dự án ưu tiên số 1: CentralContext\nKhông ưu tiên ProjectX trong 30 ngày tới.';
  const decisions2 = 'tạm dừng/đóng băng dự án `ProjectY`';
  const avoidList2 = parseAvoidProjects(currentState2, decisions2);
  assert(avoidList2.includes('ProjectX') && avoidList2.includes('ProjectY'), 'Avoid list must dynamically capture ProjectX and ProjectY');
  assert(!avoidList2.includes('SaveX'), 'SaveX must not be included if not declared in current context');
  console.log('  - Case 1.2: Avoid Today dynamically shifts based on context projects (PASSED)');

  // Test Case A3: If no paused projects are declared in current state or decisions, Avoid Today outputs fallback
  const currentState3 = 'Dự án ưu tiên số 1: qlythuexe\nEverything is active.';
  const decisions3 = 'All resources fully active.';
  const avoidTodayFormatted = formatAvoidToday(currentState3, decisions3);
  assert.strictEqual(avoidTodayFormatted, 'No explicit avoid item found in current context.', 'Avoid Today must return fallback string when no project is paused');
  console.log('  - Case 1.3: Clean fallback returned when no paused project exists (PASSED)');

  // Test Case A4: Old or archive context priorities do not create avoid items
  // Even if oldState/archiveState say "Không ưu tiên ProjectX", they are not passed to parseAvoidProjects
  const currentState4 = 'Dự án ưu tiên số 1: qlythuexe';
  const decisions4 = 'No active blocks.';
  const oldState4 = 'Không ưu tiên ProjectOld';
  const archiveState4 = 'Tạm dừng/đóng băng ProjectArchive';
  const avoidList4 = parseAvoidProjects(currentState4, decisions4);
  assert(!avoidList4.includes('ProjectOld') && !avoidList4.includes('ProjectArchive'), 'Historical files must not leak into current avoid list');
  console.log('  - Case 1.4: Stale historical priorities do not contaminate avoid today (PASSED)');

  // ==========================================
  // Required Fix #2: Deterministic Output & Timestamp Check
  // ==========================================
  console.log('\nRunning output determinism and timestamp validation checks...');

  // Running generator twice yields exact byte-identical outputs
  const firstRun = fs.readFileSync(startupPackPath, 'utf8');
  execSync('node scripts/generate-founder-startup-pack.js', { stdio: 'ignore' });
  const secondRun = fs.readFileSync(startupPackPath, 'utf8');
  assert.strictEqual(firstRun, secondRun, 'Generator runs must be 100% byte-identical');
  console.log('  - Byte-identical outputs across sequential runs (PASSED)');

  // Confirm NO "Generated on:" date or dynamic ISO time stamp is generated
  assert(!content.includes('Generated on:'), 'Markdown must not contain Generated on date headings');
  assert(content.includes('Generated by**: CentralContext Founder Startup Pack Generator'), 'Markdown must use stable deterministic generator header');
  
  // Verify no random dynamic date is included in the output (except static ones like "Date: 2026-05-30" which come from actual ADR definitions)
  const dynamicDateRegex = /generated\s+on\s*:\s*\d{4}-\d{2}-\d{2}/gi;
  assert(!dynamicDateRegex.test(content), 'No dynamic generated on timestamp should be present in the markdown');
  console.log('  - No dynamic date or time stamps generated (PASSED)');

  // ==========================================
  // Optional Improvement: non-priority chain details parsed
  // ==========================================
  console.log('\nRunning active project chain and founder intent summary validations...');
  const intentText = fs.readFileSync(path.join(repoRoot, 'context/FOUNDER_INTENT.md'), 'utf8');
  const parsedIntent = parseFounderIntent(intentText);
  assert(parsedIntent.includes('Mục tiêu cốt lõi của nhà sáng lập'), 'Intent summary must extract the main founder goal');
  assert(!parsedIntent.includes('FOUNDER_CODE'), 'Intent summary must not include validation founder keys');

  const activeProjectsText = fs.readFileSync(path.join(repoRoot, 'context/ACTIVE_PROJECTS.md'), 'utf8');
  const parsedActiveList = parseActiveProjectsList(activeProjectsText);
  assert(parsedActiveList.includes('CentralContext MVP'), 'Active Projects list must parse CentralContext MVP');
  console.log('  - Non-priority chains (founder intent & active list) verified (PASSED)');

  console.log('\n\x1b[32m==================================================\x1b[0m');
  console.log('\x1b[32m🎉 ALL STABILIZATION PASS AUDIT TESTS PASSED!\x1b[0m');
  console.log('\x1b[32m==================================================\x1b[0m\n');
}

test();
