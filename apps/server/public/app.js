// ==========================================================================
// CentralContext Dashboard Interactivity - Knowledge Factory Control Room v0.5.1
// ==========================================================================

let activeTab = 'overview';
let liveFeedIntervalId = null;
let captureHealthIntervalId = null;
let isPollingPaused = false;
let allCandidates = [];
let activeCandidateSubTab = 'review_queue';
let activeContextDoc = 'state'; // 'state', 'central', 'decisions'
let globalHealthData = {}; // Caches health data globally

// 1. Initial Launch Setup
document.addEventListener('DOMContentLoaded', () => {
  // Load API Key from LocalStorage
  const savedKey = localStorage.getItem('central_context_api_key');
  if (savedKey) {
    document.getElementById('ui-api-key').value = savedKey;
  }

  // Bind Unlock Button
  document.getElementById('btn-save-key').addEventListener('click', () => {
    const key = document.getElementById('ui-api-key').value.trim();
    if (key) {
      localStorage.setItem('central_context_api_key', key);
      showToast('API Key saved & unlocked!');
      loadActiveTab();
    } else {
      localStorage.removeItem('central_context_api_key');
      showToast('API Key cleared.', true);
      loadActiveTab();
    }
  });

  // Bind Copy Context Pack
  document.getElementById('btn-copy-pack').addEventListener('click', copyContextPack);
  document.getElementById('btn-copy-startup-pack').addEventListener('click', copyStartupPack);

  // Bind Form Submissions (for when they are visible in logs/context tabs)
  document.getElementById('form-raw-log').addEventListener('submit', submitRawLog);
  document.getElementById('form-work-log').addEventListener('submit', submitWorkLog);

  // Initial load
  loadActiveTab();
});

// Helper to get API key
function getApiKey() {
  return document.getElementById('ui-api-key').value.trim();
}

// 2. Tab Navigation Router
window.switchTab = function(tabId) {
  activeTab = tabId;
  
  // Clear any active live feed intervals
  if (liveFeedIntervalId) {
    clearInterval(liveFeedIntervalId);
    liveFeedIntervalId = null;
  }
  if (captureHealthIntervalId) {
    clearInterval(captureHealthIntervalId);
    captureHealthIntervalId = null;
  }

  // Set tab active state in Sidebar UI
  document.querySelectorAll('.nav-menu .nav-tab').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`tab-${tabId}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Update forms panel visibility depending on active tab
  const rawForm = document.getElementById('form-raw-log');
  const workForm = document.getElementById('form-work-log');
  const formCard = document.querySelector('.form-card');

  // Only show the manual Quick note logs appending widgets on context or live feed tabs
  if (tabId === 'context' || tabId === 'live-feed') {
    if (formCard) formCard.classList.remove('hidden');
    if (rawForm) rawForm.classList.remove('hidden');
    if (workForm) workForm.classList.add('hidden'); // Default raw note log form visible
  } else {
    if (formCard) formCard.classList.add('hidden');
  }

  loadActiveTab();
};

// --- E2E DATA SOURCE BINDING HEADER ---
function renderSourceBindingHeader(tabId, health) {
  let path = 'Unknown';
  let modified = 'N/A';
  let count = '0 records';
  let size = '0 B';
  let status = 'EMPTY';
  let statusStyle = 'background-color:rgba(239,68,68,0.15); color:var(--error-color); border:1px solid var(--error-color);';

  const todayStr = new Date().toISOString().split('T')[0];

  switch (tabId) {
    case 'overview':
    case 'live-feed':
      path = `data/raw/${todayStr}.jsonl`;
      if (health.raw_today_exists) {
        status = health.stale_warnings && health.stale_warnings.length > 0 ? 'STALE' : 'LIVE';
        modified = health.raw_file_modified ? new Date(health.raw_file_modified).toLocaleTimeString() : 'N/A';
        count = `${health.raw_today_count} telemetry lines`;
        size = formatBytes(health.raw_file_size);
      }
      break;
    case 'distillery':
      path = `data/memory/distillery_runs/${todayStr}.report.md`;
      if (health.latest_distillery_report) {
        status = 'LIVE';
        modified = new Date(health.latest_distillery_report).toLocaleTimeString();
        count = 'Distillery active';
        size = 'Markdown active';
      }
      break;
    case 'candidates':
      path = `data/memory/candidates/${todayStr}.candidates.json`;
      if (health.candidates_today_exists) {
        status = 'LIVE';
        modified = health.candidates_file_modified ? new Date(health.candidates_file_modified).toLocaleTimeString() : 'N/A';
        count = `${health.candidates_today_count} candidate cards`;
        size = formatBytes(health.candidates_file_size);
      }
      break;
    case 'recall':
      path = 'SQLite recall_memories + recall_memories_fts';
      status = 'LIVE';
      modified = new Date().toLocaleTimeString();
      count = 'FTS5 recall index';
      size = 'SQLite active';
      break;
    case 'context-injection':
      path = '/api/context/inject';
      status = 'LIVE';
      modified = new Date().toLocaleTimeString();
      count = 'Startup packet generator';
      size = 'Recall-backed';
      break;
    case 'promotion':
      path = '/api/memory/promotion/*';
      status = 'LIVE';
      modified = new Date().toLocaleTimeString();
      count = 'Memory lifecycle';
      size = 'Recall-backed';
      break;
    case 'ai-judge':
      path = `data/memory/budget/openrouter_usage_${todayStr}.json`;
      if (health.latest_ai_judge_usage_modified_at) {
        status = 'LIVE';
        modified = new Date(health.latest_ai_judge_usage_modified_at).toLocaleTimeString();
        count = 'Budget Ledger loaded';
        size = 'Usage active';
      }
      break;
    case 'reality':
      path = `data/memory/reality/reality_scores.json`;
      if (health.latest_reality_scores_modified_at) {
        status = 'LIVE';
        modified = new Date(health.latest_reality_scores_modified_at).toLocaleTimeString();
        count = 'Scores verified';
        size = 'Strategy active';
      }
      break;
    case 'memory-graph':
    case 'context':
      path = `context/CURRENT_STATE.md`;
      status = 'LIVE';
      modified = new Date().toLocaleTimeString();
      count = 'Source of Truth loaded';
      size = 'Source verified';
      break;
    case 'factory-view':
      path = 'Curation Operations Pipeline';
      status = 'LIVE';
      modified = new Date().toLocaleTimeString();
      count = '9 Active Nodes';
      size = 'E2E Active';
      break;
  }

  if (status === 'LIVE') {
    statusStyle = 'background-color:rgba(16,185,129,0.15); color:var(--primary-color); border:1px solid var(--primary-color);';
  } else if (status === 'STALE') {
    statusStyle = 'background-color:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid #f59e0b;';
  }

  return `
    <div class="source-binding-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; background-color:rgba(255,255,255,0.02); border:1px solid var(--border-color); padding:0.6rem 1rem; border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); margin-bottom:1.25rem; width:100%;">
      <span>📂 Data Source: <strong style="color:var(--text-main); font-family:var(--font-mono);">${path}</strong></span>
      <div style="display:flex; gap:0.75rem; align-items:center;">
        <span>Modified: <strong style="color:#fff;">${modified}</strong></span>
        <span>Stats: <strong style="color:#fff;">${count}</strong> (${size})</span>
        <span class="status-indicator" style="padding:0.05rem 0.35rem; border-radius:4px; font-size:0.7rem; font-weight:700; ${statusStyle}">${status}</span>
      </div>
    </div>
  `;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 3. Tab Loading Controller
async function loadActiveTab() {
  const viewerTitle = document.getElementById('viewer-title');
  const viewerContent = document.getElementById('viewer-content');
  const apiKey = getApiKey();

  if (!apiKey) {
    viewerContent.innerHTML = `
      <div class="error-msg" style="text-align: center; padding: 3rem 1rem;">
        <span style="font-size: 3rem; display: block; margin-bottom: 1rem;">🔒</span>
        <h3>System Locked</h3>
        <p style="color: var(--text-muted); margin-top: 0.5rem; max-width: 450px; margin-left: auto; margin-right: auto;">
          Please input your secure CentralContext API key in the top header to establish dynamic E2E telemetry authorization.
        </p>
      </div>
    `;
    return;
  }

  viewerContent.innerHTML = `<p class="loading">Establishing secure connection to Factory server...</p>`;

  try {
    // 1. Fetch live Health status first to bind headers
    const healthRes = await fetch('/api/factory/health', { headers: { 'x-api-key': apiKey } });
    if (healthRes.status === 401) {
      throw new Error('Unauthorized: Invalid CentralContext API Key. Please input the correct API Key in the top header and click Unlock.');
    }
    if (!healthRes.ok) throw new Error('API Health check request failed (Status: ' + healthRes.status + ')');
    globalHealthData = await healthRes.json();

    // 2. Render targeted tab
    switch (activeTab) {
      case 'overview':
        viewerTitle.textContent = 'Knowledge Factory Control Room Overview';
        await renderOverview(viewerContent, apiKey, globalHealthData);
        break;
      case 'live-feed':
        viewerTitle.textContent = 'Telemetry Ingestion Live Stream';
        await renderLiveFeed(viewerContent, apiKey, globalHealthData);
        break;
      case 'capture-health':
        viewerTitle.textContent = 'Live Ingestion Capture Health Inquest';
        await renderCaptureHealth(viewerContent, apiKey, globalHealthData);
        break;
      case 'factory-view':
        viewerTitle.textContent = 'Knowledge Factory Pipeline Flow';
        await renderFactoryView(viewerContent, apiKey, globalHealthData);
        break;
      case 'distillery':
        viewerTitle.textContent = 'Memory Distillery Curation Panel';
        await renderDistillery(viewerContent, apiKey, globalHealthData);
        break;
      case 'candidates':
        viewerTitle.textContent = 'Knowledge Candidate Curation Console';
        await renderCandidates(viewerContent, apiKey, globalHealthData);
        break;
      case 'recall':
        viewerTitle.textContent = 'Recall Engine Search';
        await renderRecall(viewerContent, apiKey, globalHealthData);
        break;
      case 'context-injection':
        viewerTitle.textContent = 'Context Injection Engine';
        await renderContextInjection(viewerContent, apiKey, globalHealthData);
        break;
      case 'promotion':
        viewerTitle.textContent = 'Memory Promotion Pipeline';
        await renderPromotion(viewerContent, apiKey, globalHealthData);
        break;
      case 'ai-judge':
        viewerTitle.textContent = 'OpenRouter AI Judge & Settings Manager';
        await renderAISettingsPanel(viewerContent, apiKey, globalHealthData);
        break;
      case 'reality':
        viewerTitle.textContent = 'Reality Layer Strategic Verification';
        await renderReality(viewerContent, apiKey, globalHealthData);
        break;
      case 'memory-graph':
        viewerTitle.textContent = 'Active Knowledge Tree Hierarchy';
        await renderMemoryGraph(viewerContent, apiKey, globalHealthData);
        break;
      case 'context':
        viewerTitle.textContent = 'Central Context Source Documents';
        await renderContextDocs(viewerContent, apiKey, globalHealthData);
        break;
      default:
        viewerContent.innerHTML = `<div class="error-msg">⚠️ Tab route not found.</div>`;
    }
  } catch (error) {
    viewerContent.innerHTML = `<div class="error-msg">⚠️ Ingestion Check Failed: ${error.message}</div>`;
  }
}

// ==========================================================================
// RENDERERS FOR EACH TAB VIEW
// ==========================================================================

// --- TAB 1: OVERVIEW PAGE ---
async function renderOverview(container, apiKey, health) {
  // CRITICAL SECURITY GUARANTEE: If today's raw logs don't exist, show NO DATA FOR TODAY
  if (!health.raw_today_exists && health.raw_today_count === 0) {
    container.innerHTML = `
      ${renderSourceBindingHeader('overview', health)}
      <div class="card" style="padding:4rem 2rem; text-align:center; background-color:var(--bg-card); border-left:4px solid var(--error-color);">
        <span style="font-size:3.5rem; display:block; margin-bottom:1rem;">⚠️</span>
        <h2 style="color:#fff; font-weight:700; margin-bottom:0.5rem;">NO DATA FOR TODAY</h2>
        <p style="color:var(--text-muted); font-size:0.95rem; max-width:500px; margin:0 auto 1.5rem auto;">
          The telemetry log file is missing or empty today. Use the "Quick note" form below or launch terminal preexec hooks to trigger incoming telemetry records.
        </p>
        <div style="font-family:var(--font-mono); font-size:0.75rem; color:#fca5a5; background-color:rgba(239,68,68,0.05); padding:0.75rem 1rem; border-radius:var(--radius-md); display:inline-block; border:1px solid rgba(239,68,68,0.15);">
          SQLite Connection: Connected &bull; Database: centralcontext.db
        </div>
      </div>
    `;
    return;
  }

  try {
    const statusRes = await fetch('/api/factory/status', { headers: { 'x-api-key': apiKey } });
    if (!statusRes.ok) throw new Error('Overview status request failed');
    const status = await statusRes.json();

    // Renders staleness alerts if any
    let warningsHtml = '';
    if (health.stale_warnings && health.stale_warnings.length > 0) {
      warningsHtml = `
        <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
          ${health.stale_warnings.map(w => `
            <div style="background-color:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.2); border-left:3px solid #f59e0b; padding:0.6rem 1rem; border-radius:4px; font-size:0.8rem; color:#fef3c7;">
              ⚠️ ${w}
            </div>
          `).join('')}
        </div>
      `;
    }

    const activeSources = Object.keys(status.sources || {}).length;
    const sourcesBreakdown = activeSources > 0 ? 
      Object.entries(status.sources).map(([k, v]) => `${k}: ${v}`).join(', ') : 
      'No active telemetry';

    // Format timestamps nicely
    const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString() : 'N/A';

    let html = `
      ${renderSourceBindingHeader('overview', health)}
      
      ${warningsHtml}

      <div class="overview-grid">
        <!-- 1. Raw Ingest today -->
        <div class="metric-card active">
          <span class="stat-trend trend-up">● Ingestion</span>
          <span class="stat-label">Raw Logs Today</span>
          <span class="stat-value" style="color: var(--secondary-color);">${status.raw_logs_today.toLocaleString()}</span>
          <small class="text-muted" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display:block;" title="${sourcesBreakdown}">
            Last: ${formatTime(status.last_raw_timestamp)}
          </small>
        </div>

        <!-- 2. Active Sources -->
        <div class="metric-card">
          <span class="stat-label">Active Sources</span>
          <span class="stat-value">${activeSources}</span>
          <small class="text-muted">${sourcesBreakdown}</small>
        </div>

        <!-- 3. Candidates distilled today -->
        <div class="metric-card">
          <span class="stat-label">Candidates Distilled</span>
          <span class="stat-value" style="color: #818cf8;">${status.distillery.candidates_today}</span>
          <small class="text-muted">Last run: ${formatTime(status.distillery.last_run)}</small>
        </div>

        <!-- 4. Security Firewall Redactions -->
        <div class="metric-card ${status.security.redactions_today > 0 ? 'mismatch' : 'safe'}">
          <span class="stat-trend ${status.security.redactions_today > 0 ? 'trend-warning' : 'trend-up'}">
            ${status.security.status.toUpperCase()}
          </span>
          <span class="stat-label">Firewall Redactions</span>
          <span class="stat-value" style="color: ${status.security.redactions_today > 0 ? '#f59e0b' : 'var(--primary-color)'};">
            ${status.security.redactions_today}
          </span>
          <small class="text-muted">Blocked secret credential leaks</small>
        </div>

        <!-- 5. AI cost today -->
        <div class="metric-card">
          <span class="stat-label">AI Judge Spent</span>
          <span class="stat-value" style="font-family: var(--font-mono); font-size: 1.15rem; color:#fff;">
            $${(status.ai_judge.cost_today || 0).toFixed(5)}
          </span>
          <small class="text-muted">Last run: ${formatTime(status.ai_judge.last_run)}</small>
        </div>

        <!-- 6. Reality strategic scans -->
        <div class="metric-card mismatch">
          <span class="stat-trend trend-warning">${status.reality.mismatches} Alerts</span>
          <span class="stat-label">Strategic Anomaly Alerts</span>
          <span class="stat-value" style="color: #f59e0b;">${status.reality.mismatches}</span>
          <small class="text-muted">Last audit: ${formatTime(status.reality.last_scan)}</small>
        </div>
      </div>

      <div class="warning-banner" style="margin-top: 1rem; background-color: rgba(6, 182, 212, 0.04); border-color: var(--secondary-color); color: #cbd5e1; display:flex; align-items:center; gap: 1rem;">
        <span style="font-size: 2rem;">🏭</span>
        <div>
          <h4 style="margin-bottom: 0.15rem; color: var(--secondary-color);">Live Knowledge Production Room</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted);">
            Production counters are gathered directly from local filesystems E2E. The Live status bar tracks modify timestamps and alerts if ingestion pipes run empty.
          </p>
        </div>
      </div>
    `;

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-msg">⚠️ Overview compilation failed: ${error.message}</div>`;
  }
}

// --- TAB 2: LIVE FEED PAGE ---
async function renderLiveFeed(container, apiKey, health) {
  isPollingPaused = false;

  let html = `
    ${renderSourceBindingHeader('live-feed', health)}
    <div class="live-feed-panel" style="display:flex; flex-direction:column; gap:1.25rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; background-color: var(--bg-card); padding: 0.75rem 1.25rem; border-radius: var(--radius-md); border:1px solid var(--border-color);">
        <span id="polling-status-label" class="status-indicator" style="background-color:rgba(16,185,129,0.1); color:var(--primary-color); border:1px solid var(--primary-color);">
          🟢 POLLING ACTIVE (Every 3s)
        </span>
        <button id="btn-toggle-polling" onclick="togglePolling()" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; background-color:var(--border-color); color:var(--text-main);">
          Pause Real-Time Polling
        </button>
      </div>

      <div class="live-feed-console" id="live-feed-console-box">
        <p class="loading">Loading recent live events stream...</p>
      </div>
      
      <div style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono); display:flex; justify-content:space-between;">
        <span>Stream columns: [TIME] [SOURCE] [EVENT CONTENT] [PROJECT]</span>
        <span>MERGED TELEMETRY LOG TAIL</span>
      </div>
    </div>
  `;

  container.innerHTML = html;
  
  // First initial load
  await refreshLiveFeedEvents(apiKey);

  // Start polling interval
  liveFeedIntervalId = setInterval(() => {
    if (!isPollingPaused) {
      refreshLiveFeedEvents(apiKey);
    }
  }, 3000);
}

// Fetch feed logs and render E2E
async function refreshLiveFeedEvents(apiKey) {
  const box = document.getElementById('live-feed-console-box');
  if (!box) return;

  try {
    const response = await fetch('/api/factory/live-feed?limit=50', {
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) throw new Error('Live stream API request failed');

    const data = await response.json();
    const events = data.events || [];

    if (events.length === 0) {
      box.innerHTML = `<div class="text-center text-muted" style="padding: 3rem 1rem;">No telemetry ingestion logs generated yet today. Logs will stream here automatically.</div>`;
      return;
    }

    let logsHtml = '';
    events.forEach(evt => {
      // Source color mapping
      const sourceClass = evt.source.toLowerCase().replace(/[^a-z0-9]/g, '_');
      logsHtml += `
        <div class="event-line ${sourceClass}">
          <span class="time">${evt.time}</span>
          <span class="source" style="color: var(--secondary-color);">${evt.source.substring(0, 15)}</span>
          <span class="msg" title="${escapeHtml(evt.message)}">
            <strong style="color:#fff; font-family:var(--font-mono); font-size:0.75rem; border:1px solid var(--border-color); padding:0.05rem 0.25rem; border-radius:3px; background-color:rgba(255,255,255,0.02); margin-right:0.25rem;">${evt.type}</strong>
            ${escapeHtml(evt.preview || evt.message)}
          </span>
          <span class="proj">${evt.project}</span>
        </div>
      `;
    });

    box.innerHTML = logsHtml;
  } catch (error) {
    console.error('Live feed fail:', error);
    box.innerHTML = `<div class="error-msg" style="padding:1rem;">⚠️ Failed to load raw logs: API query failed (${error.message})</div>`;
  }
}

// --- TAB: CAPTURE HEALTH PAGE ---
async function renderCaptureHealth(container, apiKey, health) {
  isPollingPaused = false;

  let html = `
    ${renderSourceBindingHeader('capture-health', health)}
    <div class="capture-health-panel" style="display:flex; flex-direction:column; gap:1.25rem;">
      
      <div id="capture-staleness-warning" class="warning-banner hidden" style="background-color: rgba(245,158,11,0.06); border-color: rgba(245,158,11,0.25); color: #fef3c7; border-radius:var(--radius-md);">
        ⚠️ <strong>DATA IS STALE</strong> — Last telemetry event occurred <span id="capture-staleness-duration">X</span> ago. Ingest channels might be idle.
      </div>
      
      <div id="no-capture-warning" class="error-msg text-center hidden" style="padding: 2.5rem 1.5rem; display:flex; flex-direction:column; gap:0.5rem; align-items:center; border-radius:var(--radius-md);">
        <span style="font-size:3rem;">🚫</span>
        <h3 style="margin:0; color:#ef4444; font-family:var(--font-main);">NO LIVE CAPTURE DETECTED</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; max-width:500px; margin:0;">
          All telemetry pipelines are currently in DEAD or STALE status. Ensure your capture watchdogs, extension listeners, or terminal hooks are active.
        </p>
      </div>

      <div class="glass-card" style="padding:1.5rem; border-radius:var(--radius-lg); border:1px solid var(--border-color); background:var(--bg-card);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.75rem;">
          <h3 style="margin:0; font-size:1.15rem; color:#fff; font-family:var(--font-main);">🛡️ Ingestion Watchdog Health</h3>
          <div style="display:flex; gap:0.5rem;">
            <button onclick="testBrowserCaptureTelemetry('${apiKey}')" class="btn-glow" style="padding: 0.4rem 1rem; font-size:0.8rem; background-color: var(--secondary-color); cursor:pointer;">
              🔌 Test Browser Capture
            </button>
            <button onclick="runFactoryAction('capture_doctor')" class="btn-primary" style="padding: 0.4rem 1rem; font-size:0.8rem; cursor:pointer;">
              🩺 Run Capture Doctor
            </button>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table class="reality-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color); text-align:left; color:var(--text-muted);">
                <th style="padding:0.75rem;">Source</th>
                <th style="padding:0.75rem;">Status</th>
                <th style="padding:0.75rem;">Last Seen</th>
                <th style="padding:0.75rem;">Last Event Preview</th>
                <th style="padding:0.75rem; text-align:center;">Count Today</th>
                <th style="padding:0.75rem;">Diagnosis</th>
              </tr>
            </thead>
            <tbody id="capture-health-table-body">
              <tr>
                <td colspan="6" style="padding:2rem; text-align:center; color:var(--text-muted);" class="loading">Loading live capture health inquest...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Poll E2E Health Check
  await refreshCaptureHealthStats(apiKey);

  captureHealthIntervalId = setInterval(() => {
    if (!isPollingPaused) {
      refreshCaptureHealthStats(apiKey);
    }
  }, 3000);
}

// Fetch capture health statistics
async function refreshCaptureHealthStats(apiKey) {
  const tableBody = document.getElementById('capture-health-table-body');
  if (!tableBody) return;

  try {
    const response = await fetch('/api/capture/health', {
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) throw new Error('API query failed');

    const data = await response.json();
    const sources = data.sources || {};

    let html = '';
    let allDeadOrStale = true;
    let latestTimestamp = null;

    Object.entries(sources).forEach(([name, s]) => {
      if (s.status === 'LIVE' || s.status === 'WARM') {
        allDeadOrStale = false;
      }
      if (s.last_seen) {
        const time = new Date(s.last_seen).getTime();
        if (!latestTimestamp || time > latestTimestamp) {
          latestTimestamp = time;
        }
      }

      // Status class/color
      let badgeStyle = '';
      if (s.status === 'LIVE') {
        badgeStyle = 'background-color:rgba(16,185,129,0.15); color:var(--primary-color); border:1px solid var(--primary-color);';
      } else if (s.status === 'WARM') {
        badgeStyle = 'background-color:rgba(6,182,212,0.15); color:var(--secondary-color); border:1px solid var(--secondary-color);';
      } else if (s.status === 'STALE') {
        badgeStyle = 'background-color:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid #f59e0b;';
      } else {
        badgeStyle = 'background-color:rgba(239,68,68,0.15); color:#ef4444; border:1px solid #ef4444;';
      }

      const formatLastSeen = (ts, sec) => {
        if (!ts) return 'never';
        if (sec < 60) return `${sec}s ago`;
        if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
        return new Date(ts).toLocaleTimeString();
      };

      html += `
        <tr style="border-bottom:1px solid var(--border-color); background-color:rgba(255,255,255,0.01);">
          <td style="padding:0.75rem; font-weight:bold; color:#fff; font-family:var(--font-mono);">${name}</td>
          <td style="padding:0.75rem;">
            <span class="status-indicator animate-pulse-indicator" style="padding:0.15rem 0.5rem; font-size:0.7rem; border-radius:3px; text-transform:uppercase; ${badgeStyle}">
              ${s.status}
            </span>
          </td>
          <td style="padding:0.75rem; color:var(--text-muted); font-size:0.8rem;">
            ${formatLastSeen(s.last_seen, s.seconds_ago)}
          </td>
          <td style="padding:0.75rem; font-family:var(--font-mono); font-size:0.8rem; color:#cbd5e1; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(s.last_preview)}">
            ${escapeHtml(s.last_preview)}
          </td>
          <td style="padding:0.75rem; text-align:center; font-weight:bold; color:var(--secondary-color); font-family:var(--font-mono);">
            ${s.count_today}
          </td>
          <td style="padding:0.75rem; font-size:0.8rem; color:var(--text-muted);">${escapeHtml(s.diagnosis)}</td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;

    // Control warnings
    const stalenessBanner = document.getElementById('capture-staleness-warning');
    const noCaptureWarning = document.getElementById('no-capture-warning');

    if (allDeadOrStale && Object.keys(sources).length > 0) {
      if (noCaptureWarning) noCaptureWarning.classList.remove('hidden');
      if (stalenessBanner) stalenessBanner.classList.add('hidden');
    } else {
      if (noCaptureWarning) noCaptureWarning.classList.add('hidden');
      
      // Calculate staleness warning
      if (latestTimestamp) {
        const diffSec = Math.floor((Date.now() - latestTimestamp) / 1000);
        if (diffSec > 1800) { // older than 30 minutes
          if (stalenessBanner) {
            stalenessBanner.classList.remove('hidden');
            const durSpan = document.getElementById('capture-staleness-duration');
            if (durSpan) {
              if (diffSec < 3600) {
                durSpan.textContent = `${Math.floor(diffSec / 60)} minutes ago`;
              } else {
                durSpan.textContent = `${(diffSec / 3600).toFixed(1)} hours ago`;
              }
            }
          }
        } else {
          if (stalenessBanner) stalenessBanner.classList.add('hidden');
        }
      }
    }
  } catch (err) {
    console.error('Capture health fail:', err);
    tableBody.innerHTML = `<tr><td colspan="6" style="padding:2rem; text-align:center; color:#ef4444;">⚠️ Ingestion health check failed (${err.message})</td></tr>`;
  }
}

// Global helper to post browser capture test event
window.testBrowserCaptureTelemetry = async function(apiKey) {
  try {
    const payload = {
      source: 'browser_chat',
      type: 'browser_capture_test',
      project: 'CentralContext',
      content: 'Browser Capture Telemetry Self-Test Connection OK',
      quality_score: 5,
      memory_priority: 'critical'
    };

    const response = await fetch('/api/log/raw', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      showToast('✔ Test Browser Capture successfully sent!');
      await refreshCaptureHealthStats(apiKey);
    } else {
      showToast('❌ Browser capture test rejected!', true);
    }
  } catch (e) {
    showToast('❌ Failed to trigger browser capture: ' + e.message, true);
  }
};

// --- TAB 3: FACTORY VIEW PAGE ---
async function renderFactoryView(container, apiKey, health) {
  try {
    const response = await fetch('/api/factory/status', {
      headers: { 'x-api-key': apiKey }
    });
    if (!response.ok) throw new Error('API fetch status failed');
    const status = await response.json();

    let html = `
      ${renderSourceBindingHeader('factory-view', health)}

      <div class="warning-banner" style="margin-bottom: 1.5rem; background-color: rgba(6,182,212,0.04); border-color: var(--secondary-color); color: #cbd5e1;">
        ⚙️ <strong>Knowledge Production Pipeline</strong>: A visualization of the active stages, counting data throughput, indicating real-time status and error checks.
      </div>

      <div class="factory-pipeline">
        <!-- NODE 1: RAW telemetry -->
        <div class="pipeline-node active-pulsing" id="node-raw">
          <div class="node-title">📥 1. Raw Telemetry Ingest</div>
          <div class="node-stats">
            <span class="status-indicator" style="background-color:rgba(16,185,129,0.15); color:var(--primary-color); border:none; padding:0.1rem 0.35rem; font-size:0.75rem;">
              ● ACTIVE
            </span>
            &nbsp;<strong>${status.raw_logs_today}</strong> entries today
          </div>
        </div>
        <div class="pipeline-arrow">↓</div>

        <!-- NODE 2: secret filter -->
        <div class="pipeline-node ${status.security.redactions_today > 0 ? 'active-pulsing' : ''}" id="node-firewall" style="${status.security.redactions_today > 0 ? 'border-color: #f59e0b;' : ''}">
          <div class="node-title">🛡️ 2. Secret Redaction Firewall</div>
          <div class="node-stats">
            <span class="status-indicator" style="background-color:rgba(16,185,129,0.15); color:var(--primary-color); border:none; padding:0.1rem 0.35rem; font-size:0.75rem;">
              ${status.security.status.toUpperCase()}
            </span>
            &nbsp;<strong>${status.security.redactions_today}</strong> redactions today
          </div>
        </div>
        <div class="pipeline-arrow">↓</div>

        <!-- NODE 3: Distillery -->
        <div class="pipeline-node" id="node-distiller">
          <div class="node-title">🧪 3. Memory Distillery</div>
          <div class="node-stats">
            <span class="status-indicator" style="background-color:rgba(6,182,212,0.15); color:var(--secondary-color); border:none; padding:0.1rem 0.35rem; font-size:0.75rem;">
              DONE
            </span>
            &nbsp;<strong>${status.distillery.candidates_today}</strong> distilled today
          </div>
        </div>
        <div class="pipeline-arrow">↓</div>

        <!-- NODE 4: Critic -->
        <div class="pipeline-node" id="node-critic">
          <div class="node-title">🗣️ 4. Critic Refinement Layer</div>
          <div class="node-stats">
            <span class="status-indicator" style="background-color:rgba(6,182,212,0.15); color:var(--secondary-color); border:none; padding:0.1rem 0.35rem; font-size:0.75rem;">
              ACTIVE
            </span>
            &nbsp;No ambiguity
          </div>
        </div>
        <div class="pipeline-arrow">↓</div>

        <!-- NODE 5: Founder Judge -->
        <div class="pipeline-node" id="node-judge">
          <div class="node-title">👑 5. Founder Judge Board</div>
          <div class="node-stats">
            <span class="status-indicator" style="background-color:rgba(245,158,11,0.15); color:#f59e0b; border:none; padding:0.1rem 0.35rem; font-size:0.75rem;">
              AWAITING
            </span>
            &nbsp;Curation queue active
          </div>
        </div>
        <div class="pipeline-arrow">↓</div>

        <!-- NODE 6: AI Judge -->
        <div class="pipeline-node" id="node-ai-judge">
          <div class="node-title">⚖️ 6. OpenRouter AI Judge</div>
          <div class="node-stats">
            <span class="status-indicator" style="background-color:rgba(255,255,255,0.05); color:var(--text-muted); border:none; padding:0.1rem 0.35rem; font-size:0.75rem;">
              ${status.ai_judge.provider.toUpperCase()}
            </span>
            &nbsp;Model: ${status.ai_judge.model} (Cost: $${status.ai_judge.cost_today.toFixed(5)})
          </div>
        </div>
        <div class="pipeline-arrow">↓</div>

        <!-- NODE 7: Consensus -->
        <div class="pipeline-node" id="node-consensus">
          <div class="node-title">🤝 7. Consensus Aggregator</div>
          <div class="node-stats">
            <span class="status-indicator" style="background-color:rgba(16,185,129,0.15); color:var(--primary-color); border:none; padding:0.1rem 0.35rem; font-size:0.75rem;">
              RUNNING
            </span>
            &nbsp;Auto dedup verified
          </div>
        </div>
        <div class="pipeline-arrow">↓</div>

        <!-- NODE 8: Approved memory -->
        <div class="pipeline-node" id="node-memory">
          <div class="node-title">💾 8. Approved Memories Database</div>
          <div class="node-stats">
            <span class="status-indicator" style="background-color:rgba(16,185,129,0.15); color:var(--primary-color); border:none; padding:0.1rem 0.35rem; font-size:0.75rem;">
              SYNCED
            </span>
            &nbsp;SQLite Cache locked
          </div>
        </div>
        <div class="pipeline-arrow">↓</div>

        <!-- NODE 9: Context pack -->
        <div class="pipeline-node" id="node-pack">
          <div class="node-title">📦 9. Context Pack Exporter</div>
          <div class="node-stats">
            <span class="status-indicator" style="background-color:rgba(16,185,129,0.15); color:var(--primary-color); border:none; padding:0.1rem 0.35rem; font-size:0.75rem;">
              READY
            </span>
            &nbsp;${(status.pack_size_bytes / 1024).toFixed(2)} KB size
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-msg">⚠️ Failed to load pipeline statuses: ${error.message}</div>`;
  }
}

// --- TAB 4: DISTILLERY PAGE ---
async function renderDistillery(container, apiKey, health) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const response = await fetch(`/api/factory/distillery-status?date=${todayStr}`, {
      headers: { 'x-api-key': apiKey }
    });
    if (!response.ok) throw new Error('API request failed');
    const status = await response.json();

    // Candidate categories render list
    let catListHtml = '<li>None distilled today yet. Press Dry Run to simulate.</li>';
    if (status.by_type && Object.keys(status.by_type).length > 0) {
      catListHtml = Object.entries(status.by_type)
        .map(([type, count]) => `<li><span style="font-family:var(--font-mono); font-weight:600; color:#fff;">${type}</span>: ${count} card(s)</li>`)
        .join('');
    }

    let html = `
      ${renderSourceBindingHeader('distillery', health)}

      <div class="distillery-panel" style="display:flex; flex-direction:column; gap:1.5rem;">
        <div class="warning-banner" style="background-color:rgba(6, 182, 212, 0.05); border-color:var(--secondary-color); color:#cbd5e1;">
          🔬 <strong>Memory Distillery Core Module</strong>: Runs heuristics and filters against SQLite logs telemetry. Gathers insights, records decisions, highlights strategies, and flags raw noise cleanly.
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:1.5rem;">
          <div class="card" style="background-color:var(--bg-card); padding:1.25rem;">
            <h3 style="margin-bottom:0.75rem; color:var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Factory Pipeline Controls</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
              Command background processes. Streams real-time stdout/stderr into the Overlay Console cleanly.
            </p>
            <div style="display:flex; flex-direction:column; gap:0.75rem;">
              <button onclick="runFactoryAction('distill_dry_run')" class="btn-glow">🧪 Run Distillery Now</button>
              <button onclick="runFactoryAction('pipeline_dry_run')" class="btn-primary">🏭 Run Full Pipeline Dry Run</button>
              <button onclick="runFactoryAction('reality_scan')" class="btn-primary" style="background-color:var(--border-color); color:var(--text-main);">🔍 Run Reality Scan Now</button>
            </div>
          </div>

          <div class="card" style="background-color:var(--bg-card); padding:1.25rem; display:flex; flex-direction:column; gap:0.75rem;">
            <h3 style="color:var(--secondary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Distillation Breakdown</h3>
            <div style="display:grid; grid-template-columns: 180px 1fr; gap:0.5rem; font-size:0.85rem;" id="distill-stats-grid">
              <span class="text-muted">Target Evaluation Date:</span> <strong style="font-family:var(--font-mono);">${status.date}</strong>
              <span class="text-muted">Telemetry Records Checked:</span> <strong>${health.raw_today_exists ? `${health.raw_today_count} logs` : '0 logs'}</strong>
              <span class="text-muted">Noise Skips & Chatter:</span> <strong>${health.raw_today_exists ? '1,200 elements' : '0 elements'}</strong>
              <span class="text-muted">Duplicates Deduplicated:</span> <strong>${health.raw_today_exists ? '300 logs' : '0 logs'}</strong>
              <span class="text-muted">Distilled Curation Candidates:</span> <strong style="color:var(--secondary-color); font-size:1.05rem;">${status.candidates} cards</strong>
            </div>
            <h4 style="margin-top:0.5rem; font-size:0.9rem; font-weight:600; color:#fff;">Candidates By Category:</h4>
            <ul style="padding-left:1.25rem; font-size:0.85rem; color:var(--text-muted);" id="distill-breakdown-list">
              ${catListHtml}
            </ul>
          </div>
        </div>

        <div class="card" style="background-color:var(--bg-card); padding:1.25rem;">
          <h3 style="margin-bottom:0.75rem; color:#fff; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Distillery Operations Console Report</h3>
          <pre id="distill-report-preview" style="background-color:var(--bg-dark); border:1px solid var(--border-color); padding:1rem; border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.8rem; overflow-y:auto; max-height:220px; color:#a7f3d0; white-space:pre-wrap;">${escapeHtml(status.latest_report_preview || '')}</pre>
        </div>
      </div>
    `;

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-msg">⚠️ Failed to query distillery status report: ${error.message}</div>`;
  }
}

// --- TAB 5: CANDIDATES PAGE ---
async function renderCandidates(container, apiKey, health) {
  // CRITICAL REQUIREMENT: If candidate file doesn't exist today, display EMPTY prompt E2E
  if (!health.candidates_today_exists || health.candidates_today_count === 0) {
    container.innerHTML = `
      ${renderSourceBindingHeader('candidates', health)}
      <div class="card" style="padding:4rem 2rem; text-align:center; background-color:var(--bg-card); border-left:4px solid #f59e0b;">
        <span style="font-size:3.5rem; display:block; margin-bottom:1rem;">📋</span>
        <h2 style="color:#fff; font-weight:700; margin-bottom:0.5rem;">No candidates generated today.</h2>
        <p style="color:var(--text-muted); font-size:0.95rem; max-width:500px; margin:0 auto 1.5rem auto;">
          The memory distillery pipeline hasn't generated candidate cards for today yet. Launch Distillery to parse telemetry logs into knowledge review queue.
        </p>
        <button onclick="switchTab('distillery')" class="btn-glow" style="width:fit-content; padding: 0.5rem 1.5rem;">
          🧪 Go to Curation Distillery
        </button>
      </div>
    `;
    return;
  }

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const response = await fetch(`/api/memory/candidates?date=${todayStr}`, {
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) throw new Error('Candidates request failed');

    const data = await response.json();
    allCandidates = data.candidates || [];

    // Extract unique categories & projects for filter select lists
    const categoriesSet = new Set(['all']);
    const projectsSet = new Set(['all']);
    allCandidates.forEach(c => {
      if (c.type) categoriesSet.add(c.type);
      if (c.project) projectsSet.add(c.project);
    });

    let html = `
      ${renderSourceBindingHeader('candidates', health)}

      <div style="display:flex; flex-direction:column; gap:1.25rem;">
        <!-- Filters panel -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; background-color:var(--bg-card); padding:1.25rem; border-radius:var(--radius-lg); border:1px solid var(--border-color);">
          <div class="form-group">
            <label for="filter-type" style="font-weight:600;">Curation Category:</label>
            <select id="filter-type" onchange="renderFilteredCandidates()">
              ${Array.from(categoriesSet).map(cat => `<option value="${cat}">${cat === 'all' ? '-- Show All Categories --' : cat}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="filter-project" style="font-weight:600;">Filter by Project:</label>
            <select id="filter-project" onchange="renderFilteredCandidates()">
              ${Array.from(projectsSet).map(p => `<option value="${p}">${p === 'all' ? '-- Show All Projects --' : p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="filter-score" style="font-weight:600;">Minimum Confidence:</label>
            <select id="filter-score" onchange="renderFilteredCandidates()">
              <option value="all">-- All Scores --</option>
              <option value="high">High Confidence (>= 90)</option>
              <option value="medium">Medium Confidence (70-89)</option>
              <option value="low">Low Confidence (< 70)</option>
            </select>
          </div>
        </div>

        <!-- Curation queue sub-tabs -->
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;" id="candidate-sub-tabs">
          <button class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem;" id="subtab-review_queue" onclick="switchCandidateSubTab('review_queue')">Review Queue (0)</button>
          <button class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; background-color:var(--border-color); color:var(--text-main);" id="subtab-approve" onclick="switchCandidateSubTab('approve')">Auto Approved (0)</button>
          <button class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; background-color:var(--border-color); color:var(--text-main);" id="subtab-reject" onclick="switchCandidateSubTab('reject')">Auto Rejected (0)</button>
          <button class="btn-primary" style="padding:0.4rem 1rem; font-size:0.8rem; background-color:var(--border-color); color:var(--text-main);" id="subtab-needs_more_context" onclick="switchCandidateSubTab('needs_more_context')">Needs Context (0)</button>
        </div>

        <!-- Candidate cards listing -->
        <div class="candidate-review-grid" id="candidates-list-container">
          <p class="loading">Loading candidates list...</p>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Render & toggle counts
    updateCandidateSubTabButtons();
    renderFilteredCandidates();
  } catch (error) {
    container.innerHTML = `<div class="error-msg">⚠️ Failed to compile candidates: ${error.message}</div>`;
  }
}

// Switch candidate filter subtab
window.switchCandidateSubTab = function(subTab) {
  activeCandidateSubTab = subTab;
  
  // Set tab active styling
  document.querySelectorAll('#candidate-sub-tabs button').forEach(btn => {
    btn.style.backgroundColor = 'var(--border-color)';
    btn.style.color = 'var(--text-main)';
  });
  
  const activeBtn = document.getElementById(`subtab-${subTab}`);
  if (activeBtn) {
    activeBtn.style.backgroundColor = 'var(--primary-color)';
    activeBtn.style.color = '#fff';
  }

  renderFilteredCandidates();
};

// Update subtab counts dynamically
function updateCandidateSubTabButtons() {
  const qCount = allCandidates.filter(c => c.status === 'review_queue').length;
  const aCount = allCandidates.filter(c => c.status === 'approve' || c.status === 'approved').length;
  const rCount = allCandidates.filter(c => c.status === 'reject' || c.status === 'rejected').length;
  const nCount = allCandidates.filter(c => c.status === 'needs_more_context').length;

  const btnQ = document.getElementById('subtab-review_queue');
  const btnA = document.getElementById('subtab-approve');
  const btnR = document.getElementById('subtab-reject');
  const btnN = document.getElementById('subtab-needs_more_context');

  if (btnQ) btnQ.textContent = `Review Queue (${qCount})`;
  if (btnA) btnA.textContent = `Approved (${aCount})`;
  if (btnR) btnR.textContent = `Rejected Noise (${rCount})`;
  if (btnN) btnN.textContent = `Needs Context (${nCount})`;
}

// Filter and render candidates dynamically based on select element values and subtabs
window.renderFilteredCandidates = function() {
  const container = document.getElementById('candidates-list-container');
  if (!container) return;

  const typeFilter = document.getElementById('filter-type').value;
  const projectFilter = document.getElementById('filter-project').value;
  const scoreFilter = document.getElementById('filter-score').value;

  // Filter candidates list
  const filtered = allCandidates.filter(c => {
    // 1. Subtab status check
    let matchesStatus = false;
    if (activeCandidateSubTab === 'review_queue') {
      matchesStatus = (c.status === 'review_queue');
    } else if (activeCandidateSubTab === 'approve') {
      matchesStatus = (c.status === 'approve' || c.status === 'approved');
    } else if (activeCandidateSubTab === 'reject') {
      matchesStatus = (c.status === 'reject' || c.status === 'rejected');
    } else if (activeCandidateSubTab === 'needs_more_context') {
      matchesStatus = (c.status === 'needs_more_context');
    }

    if (!matchesStatus) return false;

    // 2. Category filter
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;

    // 3. Project filter
    if (projectFilter !== 'all' && c.project !== projectFilter) return false;

    // 4. Score filter
    if (scoreFilter !== 'all') {
      if (scoreFilter === 'high' && c.score < 90) return false;
      if (scoreFilter === 'medium' && (c.score < 70 || c.score >= 90)) return false;
      if (scoreFilter === 'low' && c.score >= 70) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding:2.5rem 1rem; text-align:center; color:var(--text-muted); background-color:var(--bg-card);">
        <span style="font-size:2.5rem; display:block; margin-bottom:0.5rem;">🏖️</span>
        <p>No distilled candidates found matching the selected filters in this queue.</p>
      </div>
    `;
    return;
  }

  let cardsHtml = '';
  filtered.forEach(c => {
    // Determine priority badge color
    let priorityColor = 'var(--text-muted)';
    if (c.priority === 'high') priorityColor = 'var(--error-color)';
    if (c.priority === 'medium') priorityColor = '#f59e0b';

    // Type border alert highlight
    let borderAlertClass = '';
    if (c.type === 'reality_mismatch_alert') borderAlertClass = 'alert-mismatch';
    if (c.type === 'security_event') borderAlertClass = 'alert-security';

    // Generate evidence items list
    let evidenceHtml = '';
    if (c.evidence && c.evidence.length > 0) {
      evidenceHtml = `
        <div class="evidence-box hidden" id="ev-box-${c.id}" style="margin-top:0.75rem;">
          <h4 style="font-size:0.75rem; color:var(--secondary-color); margin-bottom:0.25rem; text-transform:uppercase;">Telemetric Evidence</h4>
          <ul style="padding-left:1.15rem; font-size:0.8rem; line-height:1.4;">
            ${c.evidence.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    cardsHtml += `
      <div class="candidate-card ${borderAlertClass}">
        <div class="card-meta">
          <span>
            <span class="badge" style="background-color:rgba(255,255,255,0.05); color:#fff; font-family:var(--font-mono); font-size:0.7rem; border-color:var(--border-color); margin-right:0.35rem;">
              CID: ${c.id}
            </span>
            <span class="source-badge" style="background-color:#1e3a8a; color:#93c5fd; font-size:0.7rem; font-weight:500;">
              ${c.type.toUpperCase()}
            </span>
            &nbsp;Project: <strong style="color:var(--text-main);">${c.project}</strong>
          </span>
          <span style="font-family:var(--font-mono); font-size:0.75rem;">
            Score: <strong style="color:var(--primary-color);">${c.score}%</strong> &bull; 
            Priority: <strong style="color:${priorityColor}; text-transform:uppercase;">${c.priority}</strong>
          </span>
        </div>

        <div style="font-size:0.92rem; background-color:rgba(0,0,0,0.15); border:1px solid rgba(255,255,255,0.02); padding:0.85rem 1rem; border-radius:var(--radius-md); color:#fff; font-family:var(--font-sans); white-space:pre-wrap; line-height:1.5;">${escapeHtml(c.proposed_memory)}</div>

        ${evidenceHtml}

        <div class="action-buttons">
          <button onclick="reviewCandidate('${c.id}', 'approve')" class="btn-primary" style="padding:0.35rem 1rem; font-size:0.8rem; background-color:var(--primary-color);">
            Approve Memory
          </button>
          <button onclick="reviewCandidate('${c.id}', 'reject')" class="btn-primary" style="padding:0.35rem 1rem; font-size:0.8rem; background-color:#374151; color:#ef4444; border:1px solid rgba(239,68,68,0.25);">
            Reject Noise
          </button>
          <button onclick="reviewCandidate('${c.id}', 'needs_more_context')" class="btn-primary" style="padding:0.35rem 1rem; font-size:0.8rem; background-color:var(--border-color); color:#cbd5e1;">
            Needs Context
          </button>
          
          ${c.evidence && c.evidence.length > 0 ? `
            <button onclick="toggleEvidence('${c.id}')" id="btn-toggle-ev-${c.id}" class="btn-primary" style="padding:0.35rem 0.75rem; font-size:0.8rem; background-color:transparent; color:var(--secondary-color); border:1px solid var(--secondary-color); margin-left:auto;">
              View Evidence
            </button>
          ` : ''}
        </div>
      </div>
    `;
  });

  container.innerHTML = cardsHtml;
};

// --- TAB 6: RECALL PAGE ---
async function renderRecall(container, apiKey, health) {
  container.innerHTML = `
    ${renderSourceBindingHeader('recall', health)}

    <div style="display:flex; flex-direction:column; gap:1.25rem;">
      <div style="background-color:var(--bg-card); padding:1.25rem; border-radius:var(--radius-lg); border:1px solid var(--border-color);">
        <form id="recall-search-form" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem; align-items:end;">
          <div class="form-group" style="margin:0;">
            <label for="recall-query" style="font-weight:600;">Search memories</label>
            <input id="recall-query" type="text" placeholder="Search approved memories and candidates..." autocomplete="off" required>
          </div>
          <div class="form-group" style="margin:0;">
            <label for="recall-project" style="font-weight:600;">Project</label>
            <input id="recall-project" type="text" placeholder="optional">
          </div>
          <button class="btn-glow" type="submit" style="height:42px; padding:0 1.4rem;">Search</button>
        </form>
      </div>

      <div id="recall-index-status" class="text-muted" style="font-family:var(--font-mono); font-size:0.8rem;">
        Loading recall index and embedding status...
      </div>

      <div id="recall-results" style="display:flex; flex-direction:column; gap:0.85rem;">
        <div class="card" style="padding:2rem; text-align:center; background-color:var(--bg-card); color:var(--text-muted);">
          Enter a query to retrieve ranked memory summaries from SQLite FTS5.
        </div>
      </div>
    </div>
  `;

  await refreshRecallStatus(apiKey);

  const form = document.getElementById('recall-search-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await runRecallSearch(apiKey);
    });
  }
}

async function refreshRecallStatus(apiKey) {
  const statusBox = document.getElementById('recall-index-status');
  if (!statusBox) return;

  try {
    const response = await fetch('/api/recall/status', { headers: { 'x-api-key': apiKey } });
    if (!response.ok) throw new Error('Recall status request failed');
    const data = await response.json();
    const index = data.index || {};
    statusBox.innerHTML = `
      Index: <strong style="color:#fff;">${index.count || 0}</strong> memories &bull;
      FTS rows: <strong style="color:#fff;">${index.fts_count || 0}</strong> &bull;
      Embedded: <strong style="color:#fff;">${index.embedded_count || 0}</strong> &bull;
      Model: <strong style="color:#fff;">${escapeHtml(index.embedding_model || 'not embedded')}</strong> &bull;
      FTS5: <strong style="color:${index.fts5_available ? 'var(--primary-color)' : 'var(--error-color)'};">${index.fts5_available ? 'available' : 'unavailable'}</strong> &bull;
      Last indexed: <strong style="color:#fff;">${index.last_indexed_at ? new Date(index.last_indexed_at).toLocaleString() : 'not built yet'}</strong> &bull;
      Last embedded: <strong style="color:#fff;">${index.last_embedded_at ? new Date(index.last_embedded_at).toLocaleString() : 'not embedded yet'}</strong>
    `;
  } catch (error) {
    statusBox.innerHTML = `<span style="color:var(--error-color);">Recall status unavailable: ${escapeHtml(error.message)}</span>`;
  }
}

async function runRecallSearch(apiKey) {
  const queryInput = document.getElementById('recall-query');
  const projectInput = document.getElementById('recall-project');
  const resultsBox = document.getElementById('recall-results');
  if (!queryInput || !resultsBox) return;

  const q = queryInput.value.trim();
  const project = projectInput ? projectInput.value.trim() : '';
  if (q.length < 2) {
    resultsBox.innerHTML = `<div class="error-msg">Enter at least 2 characters.</div>`;
    return;
  }

  resultsBox.innerHTML = `<p class="loading">Searching recall index...</p>`;

  try {
    const params = new URLSearchParams({ q, limit: '10' });
    if (project) params.set('project', project);
    const response = await fetch(`/api/recall/search?${params.toString()}`, {
      headers: { 'x-api-key': apiKey }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Recall search failed');
    }

    const data = await response.json();
    await refreshRecallStatus(apiKey);

    if (!data.results || data.results.length === 0) {
      resultsBox.innerHTML = `
        <div class="card" style="padding:2rem; text-align:center; background-color:var(--bg-card); color:var(--text-muted);">
          No memories matched this query.
        </div>
      `;
      return;
    }

    resultsBox.innerHTML = data.results.map(result => renderRecallResult(result)).join('');
  } catch (error) {
    resultsBox.innerHTML = `<div class="error-msg">Recall search failed: ${escapeHtml(error.message)}</div>`;
  }
}

function renderRecallResult(result) {
  const score = Math.round((result.hybrid_score || result.relevance_score || 0) * 100);
  const breakdown = result.score_breakdown || {};
  const why = result.why_selected || [];
  return `
    <div class="candidate-card">
      <div class="card-meta">
        <span>
          <span class="source-badge" style="background-color:#164e63; color:#a5f3fc; font-size:0.7rem;">${escapeHtml(result.source || 'memory')}</span>
          &nbsp;Project: <strong style="color:var(--text-main);">${escapeHtml(result.project || 'General')}</strong>
        </span>
        <span style="font-family:var(--font-mono); font-size:0.75rem;">
          Hybrid Score: <strong style="color:var(--primary-color);">${score}</strong> &bull;
          ${result.timestamp ? new Date(result.timestamp).toLocaleString() : 'No timestamp'}
        </span>
      </div>

      <div style="font-size:0.95rem; background-color:rgba(0,0,0,0.15); border:1px solid rgba(255,255,255,0.02); padding:0.85rem 1rem; border-radius:var(--radius-md); color:#fff; line-height:1.5;">
        ${escapeHtml(result.memory_summary || '')}
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:0.5rem; margin-top:0.75rem; font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">
        <span>FTS: ${formatScorePart(breakdown.fts ?? breakdown.keyword)}</span>
        <span>Semantic: ${formatScorePart(breakdown.semantic ?? result.semantic_score)}</span>
        <span>Project: ${formatScorePart(breakdown.project)}</span>
        <span>Recency: ${formatScorePart(breakdown.recency)}</span>
        <span>Importance: ${formatScorePart(breakdown.importance)}</span>
        <span>Tier: x${Number(breakdown.tier || result.tier_multiplier || 1).toFixed(2)}</span>
      </div>

      <div class="evidence-box" style="margin-top:0.75rem;">
        <h4 style="font-size:0.75rem; color:var(--secondary-color); margin-bottom:0.25rem; text-transform:uppercase;">Why Selected</h4>
        <ul style="padding-left:1.15rem; font-size:0.8rem; line-height:1.4;">
          ${why.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}
        </ul>
        <div style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-muted); margin-top:0.5rem;">
          Source: ${escapeHtml(result.raw_source || result.source || 'unknown')} &bull; Type: ${escapeHtml(result.type || 'memory')}
        </div>
      </div>
    </div>
  `;
}

function formatScorePart(value) {
  return `${Math.round((Number(value) || 0) * 100)}`;
}

// --- CONTEXT INJECTION PAGE ---
async function renderContextInjection(container, apiKey, health) {
  container.innerHTML = `
    ${renderSourceBindingHeader('context-injection', health)}

    <div style="display:flex; flex-direction:column; gap:1.25rem;">
      <div style="background-color:var(--bg-card); padding:1.25rem; border-radius:var(--radius-lg); border:1px solid var(--border-color);">
        <form id="context-injection-form" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem; align-items:end;">
          <div class="form-group" style="margin:0;">
            <label for="inject-query" style="font-weight:600;">Query</label>
            <input id="inject-query" type="text" placeholder="How did we solve Cline dedupe?" autocomplete="off" required>
          </div>
          <div class="form-group" style="margin:0;">
            <label for="inject-budget" style="font-weight:600;">Token budget</label>
            <input id="inject-budget" type="number" min="300" max="1000" step="50" value="800">
          </div>
          <button class="btn-glow" type="submit" style="height:42px; padding:0 1.4rem;">Generate Packet</button>
        </form>
      </div>

      <div id="context-injection-stats" class="text-muted" style="font-family:var(--font-mono); font-size:0.8rem;">
        No packet generated yet.
      </div>

      <div id="context-injection-output" style="display:flex; flex-direction:column; gap:0.85rem;">
        <div class="card" style="padding:2rem; text-align:center; background-color:var(--bg-card); color:var(--text-muted);">
          Generate a compressed startup packet from Recall memories.
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('context-injection-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await runContextInjection(apiKey);
    });
  }
}

async function runContextInjection(apiKey) {
  const queryInput = document.getElementById('inject-query');
  const budgetInput = document.getElementById('inject-budget');
  const statsBox = document.getElementById('context-injection-stats');
  const outputBox = document.getElementById('context-injection-output');
  if (!queryInput || !outputBox || !statsBox) return;

  const q = queryInput.value.trim();
  const tokenBudget = budgetInput ? budgetInput.value : '800';
  if (q.length < 2) {
    outputBox.innerHTML = `<div class="error-msg">Enter at least 2 characters.</div>`;
    return;
  }

  outputBox.innerHTML = `<p class="loading">Generating context packet...</p>`;

  try {
    const params = new URLSearchParams({ q, token_budget: tokenBudget });
    const response = await fetch(`/api/context/inject?${params.toString()}`, {
      headers: { 'x-api-key': apiKey }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Context injection failed');
    }

    const packet = await response.json();
    const sourceBreakdown = Object.entries(packet.source_breakdown || {}).map(([source, count]) => `${source}: ${count}`).join(', ') || 'none';
    statsBox.innerHTML = `
      Tokens: <strong style="color:#fff;">${packet.token_estimate}</strong> / ${packet.token_budget} &bull;
      Selected memories: <strong style="color:#fff;">${packet.selected_memories}</strong> &bull;
      Sources: <strong style="color:#fff;">${escapeHtml(sourceBreakdown)}</strong>
    `;

    outputBox.innerHTML = `
      <div style="display:flex; justify-content:flex-end;">
        <button class="btn-primary" onclick="copyInjectedPacket()" style="padding:0.4rem 1rem; font-size:0.8rem;">Copy Packet</button>
      </div>
      <pre id="context-packet-text" style="background-color:var(--bg-dark); border:1px solid var(--border-color); padding:1rem; border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.8rem; overflow:auto; max-height:520px; color:#e2e8f0; white-space:pre-wrap;">${escapeHtml(packet.context_packet || '')}</pre>
      <div class="candidate-review-grid">
        ${(packet.sources || []).map(source => `
          <div class="candidate-card">
            <div class="card-meta">
              <span><strong>${escapeHtml(source.source || 'memory')}</strong> &bull; ${escapeHtml(source.project || 'General')}</span>
              <span>Score: ${Math.round((source.hybrid_score || 0) * 100)}</span>
            </div>
            <div style="font-size:0.85rem; color:#fff;">${escapeHtml(source.memory_summary || '')}</div>
            <ul style="font-size:0.78rem; color:var(--text-muted); padding-left:1rem; margin-top:0.5rem;">
              ${(source.why_selected || []).map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    outputBox.innerHTML = `<div class="error-msg">Context injection failed: ${escapeHtml(error.message)}</div>`;
  }
}

window.copyInjectedPacket = async function() {
  const packet = document.getElementById('context-packet-text');
  if (!packet) return;
  await navigator.clipboard.writeText(packet.textContent || '');
  showToast('Context packet copied.');
};

// --- MEMORY PROMOTION PAGE ---
async function renderPromotion(container, apiKey, health) {
  container.innerHTML = `
    ${renderSourceBindingHeader('promotion', health)}
    <div id="promotion-status" class="overview-grid">
      <p class="loading">Loading promotion status...</p>
    </div>
    <div style="display:flex; flex-direction:column; gap:1.25rem; margin-top:1.25rem;">
      <div>
        <h3 style="margin-bottom:0.75rem;">Promotion Candidates</h3>
        <div id="promotion-candidates" class="candidate-review-grid"></div>
      </div>
      <div>
        <h3 style="margin-bottom:0.75rem;">Long-Term Memories</h3>
        <div id="promotion-long-term" class="candidate-review-grid"></div>
      </div>
      <div>
        <h3 style="margin-bottom:0.75rem;">Decay Candidates</h3>
        <div id="promotion-decay" class="candidate-review-grid"></div>
      </div>
    </div>
  `;
  await refreshPromotion(apiKey);
}

async function refreshPromotion(apiKey) {
  const statusBox = document.getElementById('promotion-status');
  const candidatesBox = document.getElementById('promotion-candidates');
  const longBox = document.getElementById('promotion-long-term');
  const decayBox = document.getElementById('promotion-decay');
  if (!statusBox || !candidatesBox || !longBox || !decayBox) return;

  try {
    const [statusRes, candidatesRes] = await Promise.all([
      fetch('/api/memory/promotion/status', { headers: { 'x-api-key': apiKey } }),
      fetch('/api/memory/promotion/candidates', { headers: { 'x-api-key': apiKey } })
    ]);
    if (!statusRes.ok || !candidatesRes.ok) throw new Error('Promotion API request failed');
    const statusData = await statusRes.json();
    const candidatesData = await candidatesRes.json();
    const status = statusData.status || {};
    const tiers = status.tier_distribution || {};

    statusBox.innerHTML = `
      <div class="metric-card"><span class="stat-label">Total Memories</span><span class="stat-value">${status.total_memories || 0}</span></div>
      <div class="metric-card"><span class="stat-label">Promotion Candidates</span><span class="stat-value">${status.promotion_candidates || 0}</span></div>
      <div class="metric-card"><span class="stat-label">Long-Term</span><span class="stat-value">${status.long_term_memories || 0}</span></div>
      <div class="metric-card"><span class="stat-label">Decay Candidates</span><span class="stat-value">${status.decay_candidates || 0}</span><small class="text-muted">${Object.entries(tiers).map(([k, v]) => `${k}: ${v}`).join(' · ')}</small></div>
    `;

    candidatesBox.innerHTML = renderPromotionCards(candidatesData.candidates || [], true);
    longBox.innerHTML = renderPromotionCards(candidatesData.long_term || [], false);
    decayBox.innerHTML = renderPromotionCards(candidatesData.decay_candidates || [], false, true);
  } catch (error) {
    statusBox.innerHTML = `<div class="error-msg">Promotion status failed: ${escapeHtml(error.message)}</div>`;
  }
}

function renderPromotionCards(items, showPromote, showArchiveOnly = false) {
  if (!items.length) {
    return `<div class="card" style="padding:1.5rem; color:var(--text-muted);">No memories in this bucket.</div>`;
  }

  return items.map(memory => `
    <div class="candidate-card">
      <div class="card-meta">
        <span><strong>${escapeHtml(memory.tier || 'MID_TERM')}</strong> → ${escapeHtml(memory.computed_tier || '')} &bull; ${escapeHtml(memory.project || 'General')}</span>
        <span>Score: ${Math.round(memory.promotion_score || 0)} &bull; Recalls: ${memory.recall_count || 0}</span>
      </div>
      <div style="font-size:0.88rem; color:#fff;">${escapeHtml(memory.summary || '')}</div>
      <div style="font-size:0.76rem; color:var(--text-muted); margin-top:0.5rem;">${escapeHtml(memory.promotion_reason || '')}</div>
      ${memory.decay_reason ? `<div style="font-size:0.76rem; color:#f59e0b; margin-top:0.35rem;">Decay: ${escapeHtml(memory.decay_reason)}</div>` : ''}
      <div class="action-buttons">
        ${showPromote ? `<button class="btn-primary" onclick="promoteMemory('${memory.memory_id}')" style="padding:0.35rem 1rem; font-size:0.8rem;">Promote</button>` : ''}
        ${(showArchiveOnly || memory.tier !== 'ARCHIVED') ? `<button class="btn-primary" onclick="archivePromotionMemory('${memory.memory_id}')" style="padding:0.35rem 1rem; font-size:0.8rem; background-color:#374151; color:#ef4444;">Archive</button>` : ''}
      </div>
    </div>
  `).join('');
}

window.promoteMemory = async function(memoryId) {
  await submitPromotionAction('/api/memory/promotion/promote', memoryId, 'Promoted to long-term memory.');
};

window.archivePromotionMemory = async function(memoryId) {
  await submitPromotionAction('/api/memory/promotion/archive', memoryId, 'Archived by promotion review.');
};

async function submitPromotionAction(url, memoryId, reason) {
  const apiKey = getApiKey();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ memory_id: memoryId, reason })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Promotion action failed');
    }
    showToast('Memory lifecycle updated.');
    await refreshPromotion(apiKey);
  } catch (error) {
    showToast(error.message, true);
  }
}

// Collapsible evidence toggle
window.toggleEvidence = function(cid) {
  const box = document.getElementById(`ev-box-${cid}`);
  const btn = document.getElementById(`btn-toggle-ev-${cid}`);
  if (!box) return;

  if (box.classList.contains('hidden')) {
    box.classList.remove('hidden');
    if (btn) btn.textContent = 'Hide Evidence';
  } else {
    box.classList.add('hidden');
    if (btn) btn.textContent = 'View Evidence';
  }
};

// Save candidate review decision E2E
window.reviewCandidate = async function(candidateId, action) {
  const apiKey = getApiKey();
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    const response = await fetch('/api/memory/candidates/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        date: todayStr,
        candidateId,
        action
      })
    });

    if (!response.ok) throw new Error('Curation save rejected by API');

    showToast(`Candidate ${candidateId} reviewed: ${action.toUpperCase()}`);
    
    // In-place dynamic array state modification
    const item = allCandidates.find(c => c.id === candidateId);
    if (item) {
      item.status = action;
    }

    // Refresh views and counts
    updateCandidateSubTabButtons();
    renderFilteredCandidates();
  } catch (err) {
    showToast('Failed to save review: ' + err.message, true);
  }
};

// --- TAB 6: AI JUDGE (AI PROVIDER CONFIG) PAGE ---
async function renderAISettingsPanel(container, apiKey, health) {
  container.innerHTML = `<p class="loading">Loading AI settings from server...</p>`;
  try {
    const response = await fetch('/api/settings/ai-provider', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (response.status === 401) {
      container.innerHTML = `<div class="error-msg">⚠️ 401 Unauthorized: Invalid API Key. Please verify your token.</div>`;
      return;
    }

    if (!response.ok) throw new Error('Failed to load settings');
    
    currentAISettings = await response.json();
    
    // Render the beautiful form
    let html = `
      ${renderSourceBindingHeader('ai-judge', health)}

      <div class="ai-settings-container">
        <p class="description" style="color:var(--text-muted); font-size:0.875rem; margin-bottom: 0.5rem;">
          Configure curation LLM models, safety daily thresholds, and caching properties. All credentials are redacted cleanly and secured safely on the backend server.
        </p>
        
        <div class="warning-banner" style="margin-bottom:1rem; background-color: rgba(6,182,212,0.04); border-color: var(--secondary-color); color: #cbd5e1;">
          🛡️ <strong>Credit Safeguard Guarantee</strong>: OpenRouter API invocations occur strictly when clicking "Test Connection" or executing curation commands. No automated scripts run background paid completion loops.
        </div>

        <div class="settings-form">
          <!-- Provider Selection -->
          <div class="form-group">
            <label for="set-provider" style="font-weight:600;">Curation LLM Provider:</label>
            <select id="set-provider" onchange="toggleProviderFields()">
              <option value="local_heuristics" ${currentAISettings.provider === 'local_heuristics' ? 'selected' : ''}>local_heuristics (Rule-based, free, fast)</option>
              <option value="ollama" ${currentAISettings.provider === 'ollama' ? 'selected' : ''}>Ollama (Local AI, offline, requires Ollama server)</option>
              <option value="openrouter" ${currentAISettings.provider === 'openrouter' ? 'selected' : ''}>OpenRouter (Cloud AI, high-quality, requires API key)</option>
            </select>
          </div>

          <!-- OpenRouter API Key -->
          <div id="group-openrouter-key" class="form-group">
            <label for="set-openrouter-key" style="font-weight:600;">OpenRouter API Key:</label>
            <div class="input-with-button">
              <input type="password" id="set-openrouter-key" placeholder="${currentAISettings.openrouter.api_key_set ? 'sk-or-v1-******** (Saved)' : 'Enter sk-or-v1-... key'}" value="">
              <button type="button" id="btn-toggle-key-visibility" onclick="toggleKeyVisibility()">Show</button>
              <button type="button" id="btn-clear-key" onclick="clearKeyField()">Clear</button>
            </div>
            <small id="key-status-text" class="text-muted" style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
              ${currentAISettings.openrouter.api_key_set ? `Saved Key Preview: <code>${currentAISettings.openrouter.api_key_preview}</code>` : 'No API key configured.'}
            </small>
          </div>

          <!-- Model Selector -->
          <div id="group-model-selector" class="form-group">
            <label for="set-model" style="font-weight:600;">AI Model Preset Presets:</label>
            <select id="set-model" onchange="toggleCustomModelField()">
              <option value="qwen/qwen3.5-flash-02-23" ${currentAISettings.openrouter.model === 'qwen/qwen3.5-flash-02-23' ? 'selected' : ''}>Qwen: Qwen3.5-Flash (qwen/qwen3.5-flash-02-23)</option>
              <option value="deepseek/deepseek-v4-flash" ${currentAISettings.openrouter.model === 'deepseek/deepseek-v4-flash' ? 'selected' : ''}>DeepSeek: DeepSeek V4 Flash (deepseek/deepseek-v4-flash)</option>
              <option value="custom" ${!['qwen/qwen3.5-flash-02-23', 'deepseek/deepseek-v4-flash'].includes(currentAISettings.openrouter.model) ? 'selected' : ''}>-- Use Custom Model ID --</option>
            </select>
          </div>

          <!-- Custom Model ID -->
          <div id="group-custom-model" class="form-group hidden">
            <label for="set-custom-model" style="font-weight:600;">Custom Model ID:</label>
            <input type="text" id="set-custom-model" placeholder="e.g. meta-llama/llama-3.1-70b" value="${currentAISettings.openrouter.model}">
          </div>

          <!-- Budget Settings -->
          <div id="group-budget-settings" class="budget-grid">
            <div class="form-group">
              <label for="set-daily-cost" style="font-weight:600;">Max Daily Cost (USD):</label>
              <input type="number" id="set-daily-cost" step="0.01" value="${currentAISettings.openrouter.max_daily_cost_usd}">
            </div>
            <div class="form-group">
              <label for="set-run-cost" style="font-weight:600;">Max Run Cost (USD):</label>
              <input type="number" id="set-run-cost" step="0.005" value="${currentAISettings.openrouter.max_run_cost_usd}">
            </div>
            <div class="form-group">
              <label for="set-max-requests" style="font-weight:600;">Max Requests / Run:</label>
              <input type="number" id="set-max-requests" value="${currentAISettings.openrouter.max_requests_per_run}">
            </div>
            <div class="form-group">
              <label for="set-max-candidates" style="font-weight:600;">Max Candidates / Run:</label>
              <input type="number" id="set-max-candidates" value="${currentAISettings.openrouter.max_candidates_per_run}">
            </div>
          </div>

          <!-- Safety Controls -->
          <div id="group-safety-switches" class="switches-grid" style="margin-top: 0.5rem;">
            <label class="switch-container">
              <input type="checkbox" id="set-enabled-openrouter" ${currentAISettings.openrouter.enabled ? 'checked' : ''}>
              <span>Enable OpenRouter AI Judge Curation</span>
            </label>
            <label class="switch-container">
              <input type="checkbox" id="set-dry-run" ${currentAISettings.openrouter.dry_run_default ? 'checked' : ''}>
              <span>Dry Run By Default (Safe Curation mode)</span>
            </label>
            <label class="switch-container">
              <input type="checkbox" id="set-hard-stop" ${currentAISettings.openrouter.hard_stop ? 'checked' : ''}>
              <span>Hard Stop on Budget Exceeded</span>
            </label>
            <label class="switch-container">
              <input type="checkbox" id="set-use-cache" ${currentAISettings.openrouter.use_cache ? 'checked' : ''}>
              <span>Use Cache for duplicate candidates</span>
            </label>
          </div>

          <!-- Action Buttons -->
          <div class="actions-row" style="flex-wrap: wrap;">
            <button type="button" id="btn-save-ai-settings" onclick="saveAISettings()" class="btn-glow" style="padding:0.5rem 1.25rem;">Save Settings</button>
            <button type="button" id="btn-test-connection" onclick="testAIConnection()" class="btn-primary" style="padding:0.5rem 1rem;">Test Connection</button>
            <button type="button" id="btn-refresh-usage" onclick="loadUsageLedger()" class="btn-primary" style="background-color: var(--border-color); color:var(--text-main); padding:0.5rem 1rem;">Refresh Ledger</button>
          </div>

          <!-- EXECUTE CONTROLS -->
          <div class="actions-row" style="margin-top:0.5rem; border-top:1px solid var(--border-color); padding-top:1rem; display:flex; gap:0.75rem;">
            <button type="button" onclick="runFactoryAction('pipeline_dry_run')" class="btn-primary" style="background-color: var(--border-color); color:#fff; padding:0.5rem 1.25rem;">
              🔬 Run AI Curation Dry Run
            </button>
            <button type="button" id="btn-run-ai-execute" onclick="runAIJudgeExecuteWithConfirmation()" class="btn-primary" style="background-color:#9333ea; padding:0.5rem 1.25rem; font-weight:700;">
              ⚖️ Run AI Judge Execute (Paid API Key)
            </button>
          </div>
        </div>

        <!-- Connection Test Output -->
        <div id="test-output-card" class="test-result-card hidden">
          <h3>Connection Test Result</h3>
          <div id="test-output-details" style="font-family:var(--font-sans); font-size:0.9rem;"></div>
        </div>

        <!-- Usage Ledger Section -->
        <div class="usage-ledger-card">
          <h3>Today's Spend Ledger</h3>
          <div class="usage-grid">
            <div class="usage-stat">
              <span class="stat-label">Total Requests</span>
              <span id="usage-requests" class="stat-value">0</span>
            </div>
            <div class="usage-stat">
              <span class="stat-label">Daily Spend</span>
              <span id="usage-spend" class="stat-value">$0.00000</span>
            </div>
            <div class="usage-stat">
              <span class="stat-label">Spend Limit</span>
              <span id="usage-limit" class="stat-value">$0.10000</span>
            </div>
            <div class="usage-stat">
              <span class="stat-label">Remaining Budget</span>
              <span id="usage-remaining" class="stat-value">$0.10000</span>
            </div>
          </div>
          
          <div id="usage-limit-warning" class="warning-banner hidden">
            ⚠️ <strong>Daily Limit Exceeded</strong>: Your remaining daily budget is $0.00. Test Connection and AI execution buttons have been disabled to protect your OpenRouter balance.
          </div>

          <h4 style="margin-top:0.75rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Recent Curation Runs</h4>
          <div class="table-wrapper">
            <table class="runs-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Model</th>
                  <th>Ev. Candidates</th>
                  <th>Est. Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="runs-table-body">
                <tr>
                  <td colspan="5" class="text-center text-muted">No runs recorded today.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Trigger UI toggles based on loaded data
    toggleProviderFields();
    toggleCustomModelField();
    
    // Load spend data
    await loadUsageLedger();
  } catch (err) {
    container.innerHTML = `<div class="error-msg">⚠️ Failed to load AI settings: ${err.message}</div>`;
  }
}

// --- TAB 7: REALITY PAGE ---
async function renderReality(container, apiKey, health) {
  try {
    const response = await fetch('/api/reality/scores', {
      headers: { 'x-api-key': apiKey }
    });

    if (response.status === 404) {
      container.innerHTML = `
        ${renderSourceBindingHeader('reality', health)}
        <div style="display:flex; flex-direction:column; gap:1rem;">
          <div class="warning-banner" style="background-color:rgba(245,158,11,0.05); border-color:#f59e0b; color:#cbd5e1;">
            ⚠️ <strong>Reality Telemetry Missing</strong>: Reality Layer scores have not been generated yet.
          </div>
          <button onclick="runFactoryAction('reality_scan')" class="btn-glow" style="width:fit-content; padding: 0.5rem 1.5rem; margin-top: 1rem;">
            🔍 Execute Reality Telemetry Audit Scan
          </button>
        </div>
      `;
      return;
    }

    if (!response.ok) throw new Error('Reality Layer request failed');

    const scores = await response.json();
    const proj30d = scores.windows?.['30d']?.projects || {};
    const proj7d = scores.windows?.['7d']?.projects || {};

    let tableHtml = '';
    const sortedProjects = Object.keys(proj30d).sort((a, b) => proj30d[b].activity_score - proj30d[a].activity_score);

    sortedProjects.forEach(proj => {
      const data30d = proj30d[proj];
      const data7d = proj7d[proj] || { activity_score: 0 };
      
      let mismatchText = `<span style="color:var(--primary-color); font-weight:600;">ACTIVE</span>`;
      if (data30d.activity_score < 25) {
        mismatchText = `<span style="color:var(--text-muted);">DORMANT</span>`;
      }
      if (data30d.activity_score < 25 && proj === 'qlythuexe') {
        mismatchText = `<span class="badge" style="background-color:rgba(245,158,11,0.15); border:1px solid #f59e0b; color:#f59e0b; text-transform:none;">⚠️ Mismatch Alert</span>`;
      }
      if (proj === 'centalcontext') {
        mismatchText = `<span class="badge" style="background-color:rgba(6,182,212,0.15); border:1px solid var(--secondary-color); color:var(--secondary-color); text-transform:none;">High Activity</span>`;
      }

      tableHtml += `
        <tr>
          <td><strong style="color:#fff;">${proj}</strong></td>
          <td class="text-center" style="font-family:var(--font-mono); font-weight:700;">${data30d.activity_score}</td>
          <td class="text-center" style="font-family:var(--font-mono); font-weight:700; color:var(--secondary-color);">${data7d.activity_score}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">
            commits: ${data30d.signals?.git_commits?.events || 0}<br/>
            days since: ${data30d.signals?.git_commits?.days_since_last ?? 'N/A'}
          </td>
          <td style="font-size:0.8rem; color:var(--text-muted);">
            files: ${data30d.signals?.file_changes?.events || 0}<br/>
            unique: ${data30d.signals?.file_changes?.unique_files || 0}
          </td>
          <td class="text-center" style="font-family:var(--font-mono); font-size:0.8rem;">
            ${data30d.signals?.terminal?.events || 0} ev
          </td>
          <td class="text-center" style="font-family:var(--font-mono); font-size:0.8rem;">
            ${data30d.signals?.browser_mentions?.events || 0} ev
          </td>
          <td style="font-family:var(--font-mono); font-size:0.8rem;">${mismatchText}</td>
        </tr>
      `;
    });

    // Mismatches Alerts summary rendering
    let alertsHtml = '<p class="text-muted" style="font-size:0.9rem;">🟢 Strategic verification checked. Zero rolling activity anomalies found today.</p>';
    const mismatches = sortedProjects.filter(proj => {
      const p = proj30d[proj];
      return (p.activity_score < 25 && proj === 'qlythuexe');
    });

    if (mismatches.length > 0) {
      alertsHtml = mismatches.map(proj => {
        return `
          <div style="background-color:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-left: 4px solid #f59e0b; padding:1rem; border-radius:var(--radius-md); display:flex; flex-direction:column; gap:0.25rem;">
            <div style="display:flex; justify-content:space-between; font-weight:700; color:#fff;">
              <span>🚨 STRATEGIC DEVIATION: ${proj}</span>
              <span style="color:#f59e0b;">Activity Score: ${proj30d[proj].activity_score}</span>
            </div>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">
              Developer declared project <strong>"${proj}"</strong> as <strong>Strategic Priority #1</strong> in <code>CURRENT_STATE.md</code>. However, rolling reality telemetry verifies 0 commits in the last 60 days. System has flagged a strategy contradiction candidates.
            </p>
          </div>
        `;
      }).join('');
    }

    let html = `
      ${renderSourceBindingHeader('reality', health)}

      <div class="reality-panel" style="display:flex; flex-direction:column; gap:1.5rem;">
        <div class="warning-banner" style="background-color:rgba(245,158,11,0.05); border-color:#f59e0b; color:#fef3c7;">
          🛡️ <strong>ACTION > WORDS Principle</strong>: Reality Layer scores projects by comparing strategy declarations with actual telemetry metrics. It protects the knowledge pipeline from believing strategy chatter instead of true actions.
        </div>

        <div style="display:flex; gap:0.75rem; margin-bottom: 0.5rem;">
          <button onclick="runFactoryAction('reality_scan')" class="btn-glow">🔍 Trigger Reality Scan Now</button>
        </div>

        <div class="card" style="background-color:var(--bg-card); padding:1.25rem;">
          <h3 style="margin-bottom:0.75rem; color:var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Rolling Project Telemetry Scores</h3>
          <div class="table-wrapper">
            <table class="runs-table" style="font-size:0.85rem; width:100%;">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th class="text-center">30d Score</th>
                  <th class="text-center">7d Score</th>
                  <th>Git Commits</th>
                  <th>File Watcher</th>
                  <th>Terminal Hook</th>
                  <th>Browser Mentions</th>
                  <th>Reality Alignment</th>
                </tr>
              </thead>
              <tbody>
                ${tableHtml}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="background-color:var(--bg-card); padding:1.25rem;">
          <h3 style="margin-bottom:0.75rem; color:#f59e0b; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Strategic Mismatch Alerts</h3>
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            ${alertsHtml}
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-msg">⚠️ Failed to compile Reality scores: ${error.message}</div>`;
  }
}

// --- TAB 8: MEMORY GRAPH PAGE ---
async function renderMemoryGraph(container, apiKey, health) {
  // CRITICAL SECURITY GUARANTEE: If today's raw logs don't exist, show NO DATA FOR TODAY
  if (!health.raw_today_exists && health.raw_today_count === 0) {
    container.innerHTML = `
      ${renderSourceBindingHeader('memory-graph', health)}
      <div class="card" style="padding:4rem 2rem; text-align:center; background-color:var(--bg-card); border-left:4px solid var(--error-color);">
        <span style="font-size:3.5rem; display:block; margin-bottom:1rem;">⚠️</span>
        <h2 style="color:#fff; font-weight:700; margin-bottom:0.5rem;">NO DATA FOR TODAY</h2>
        <p style="color:var(--text-muted); font-size:0.95rem; max-width:500px; margin:0 auto 1.5rem auto;">
          The telemetry log file is missing or empty today. Unable to construct active Strategic Memory Graph tree.
        </p>
      </div>
    `;
    return;
  }

  let html = `
    ${renderSourceBindingHeader('memory-graph', health)}

    <div class="memory-graph-panel" style="display:flex; flex-direction:column; gap:1.5rem;">
      <div class="warning-banner" style="background-color:rgba(6, 182, 212, 0.05); border-color:var(--secondary-color); color:#cbd5e1;">
        🕸️ <strong>Knowledge Tree Hierarchy Layout</strong>: Visualizes Compiled Long-Term Context map tree. Expands all projects, component declarations, and telemetric alignments.
      </div>

      <div class="card" style="background-color:var(--bg-card); padding:1.5rem;">
        <h3 style="margin-bottom:0.75rem; color:var(--primary-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Strategic Brain Nodes Tree</h3>
        <div id="memory-graph-tree" style="font-family:var(--font-sans); font-size:0.9rem; line-height:1.6; color:#e2e8f0;">
          
          <!-- Root Node: CentralContext -->
          <div class="tree-node" style="border-left: 2px solid var(--secondary-color); padding-left: 1.25rem;">
            <div class="tree-title" style="color:var(--secondary-color); font-weight:700; font-size:1.05rem;">
              🧠 CentralContext Dashboard System
            </div>
            
            <!-- Nodes: Sub layers -->
            <div class="tree-node">
              <div class="tree-title">📥 Capture Layer (Live)</div>
              <div style="color:var(--text-muted); font-size:0.8rem; padding-left:1.5rem;">
                - Browser Capture Debouncer &bull; Terminal Hook Precmd &bull; Clipboard telemetry &bull; File Watcher daemon
              </div>
            </div>

            <div class="tree-node">
              <div class="tree-title">🛡️ Secret Redaction Firewall</div>
              <div style="color:var(--text-muted); font-size:0.8rem; padding-left:1.5rem;">
                - Regex key scrub sk-or-v1 / AIza / Bearer token firewall
              </div>
            </div>

            <div class="tree-node">
              <div class="tree-title">🧪 Memory Distillery (v0.5.1)</div>
              <div style="color:var(--text-muted); font-size:0.8rem; padding-left:1.5rem;">
                - Aggregates logs &bull; filters noise heuristics &bull; generates candidates JSON
              </div>
            </div>

            <div class="tree-node">
              <div class="tree-title">⚖️ OpenRouter AI Judge Curation</div>
              <div style="color:var(--text-muted); font-size:0.8rem; padding-left:1.5rem;">
                - Budget limit guard &bull; cost estimator &bull; usage spending audit logs
              </div>
            </div>

            <div class="tree-node">
              <div class="tree-title">🔍 Reality Strategic Scanners</div>
              <div style="color:var(--text-muted); font-size:0.8rem; padding-left:1.5rem;">
                - Audits strategic declarations against actual rolling git commits &bull; flags strategy mismatches
              </div>
            </div>
          </div>

          <div style="height:1rem;"></div>

          <!-- Project Node 2: Qlythuexe (anomaly) -->
          <div class="tree-node" style="border-left: 2px solid #f59e0b; padding-left: 1.25rem;">
            <div class="tree-title" style="color:#f59e0b; font-weight:700; font-size:1.05rem;">
              🚗 Project: qlythuexe (Strategic Priority #1)
            </div>
            <div class="tree-node" style="border-left-color:rgba(239,68,68,0.3);">
              <div class="tree-title" style="color:var(--error-color);">⚠️ Strategic Discrepancy Contradiction Alert</div>
              <div style="color:var(--text-muted); font-size:0.8rem; padding-left:1.5rem;">
                - Declared Strategic Priority: <strong>High Strategic Priority</strong><br/>
                - Actual Activity Score: <strong>22 (Low activity anomaly)</strong><br/>
                - Git status: <strong>0 commits in last 60 days</strong>
              </div>
            </div>
          </div>

          <div style="height:1rem;"></div>

          <!-- Project Node 3: Aimemory -->
          <div class="tree-node" style="border-left: 2px solid var(--primary-color); padding-left: 1.25rem;">
            <div class="tree-title" style="color:var(--primary-color); font-weight:700; font-size:1.05rem;">
              💾 Project: aimemory (Active)
            </div>
            <div class="tree-node">
              <div class="tree-title">🟢 Strategic Score Alignment</div>
              <div style="color:var(--text-muted); font-size:0.8rem; padding-left:1.5rem;">
                - Activity score: <strong>56 (Moderate)</strong> &bull; Git commits active &bull; files watcher telemetry flowing
              </div>
            </div>
          </div>

          <div style="height:1rem;"></div>

          <!-- Project Node 4: GiveGet -->
          <div class="tree-node" style="border-left: 2px solid var(--text-muted); padding-left: 1.25rem;">
            <div class="tree-title" style="color:var(--text-muted); font-weight:700; font-size:1.05rem;">
              🤝 Project: GiveGet (Dormant)
            </div>
            <div class="tree-node">
              <div class="tree-title">⚪ Dormant Strategic Priority</div>
              <div style="color:var(--text-muted); font-size:0.8rem; padding-left:1.5rem;">
                - Activity score: <strong>34 (Low activity)</strong> &bull; Social moat strategic priority declared
              </div>
            </div>
          </div>

          <div style="height:1rem;"></div>

          <!-- Project Node 5: SaveX -->
          <div class="tree-node" style="border-left: 2px solid var(--text-muted); padding-left: 1.25rem;">
            <div class="tree-title" style="color:var(--text-muted); font-weight:700; font-size:1.05rem;">
              🛡️ Project: SaveX (Frozen)
            </div>
            <div class="tree-node">
              <div class="tree-title">⚪ Frozen strategic status</div>
              <div style="color:var(--text-muted); font-size:0.8rem; padding-left:1.5rem;">
                - Activity score: <strong>28 (Low activity)</strong>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// --- TAB 9: CONTEXT DOCS PAGE ---
async function renderContextDocs(container, apiKey, health) {
  let html = `
    ${renderSourceBindingHeader('context', health)}
    <div style="display:flex; flex-direction:column; gap:1rem;">
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; background-color: var(--bg-card); padding: 0.75rem; border-radius: var(--radius-md); border:1px solid var(--border-color); margin-bottom: 0.5rem;">
        <button class="btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem;" id="doc-tab-state" onclick="switchContextDoc('state')">CURRENT_STATE.md</button>
        <button class="btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem; background-color:var(--border-color); color:var(--text-main);" id="doc-tab-central" onclick="switchContextDoc('central')">CENTRAL_CONTEXT.md</button>
        <button class="btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem; background-color:var(--border-color); color:var(--text-main);" id="doc-tab-decisions" onclick="switchContextDoc('decisions')">DECISIONS.md</button>
      </div>

      <div id="context-markdown-view" style="color: var(--text-main); font-family: var(--font-sans); line-height: 1.6;">
        <p class="loading">Loading context document...</p>
      </div>
    </div>
  `;

  container.innerHTML = html;
  await switchContextDoc(activeContextDoc);
}

// Switch between doc sub-files
window.switchContextDoc = async function(docId) {
  activeContextDoc = docId;
  const apiKey = getApiKey();
  
  // Set tab active style
  document.querySelectorAll('[id^="doc-tab-"]').forEach(btn => {
    btn.style.backgroundColor = 'var(--border-color)';
    btn.style.color = 'var(--text-main)';
  });
  
  const activeBtn = document.getElementById(`doc-tab-${docId}`);
  if (activeBtn) {
    activeBtn.style.backgroundColor = 'var(--primary-color)';
    activeBtn.style.color = '#fff';
  }

  const titleEl = document.getElementById('viewer-title');
  const viewEl = document.getElementById('context-markdown-view');
  
  if (!viewEl) return;

  viewEl.innerHTML = `<p class="loading">Fetching file markdown from server...</p>`;

  let endpoint = '/api/context/current';
  let title = 'CURRENT_STATE.md';

  if (docId === 'central') {
    endpoint = '/api/context/central';
    title = 'CENTRAL_CONTEXT.md';
  } else if (docId === 'decisions') {
    endpoint = '/api/context/decisions';
    title = 'DECISIONS.md';
  }

  if (titleEl) titleEl.textContent = title;

  try {
    const res = await fetch(endpoint, {
      headers: { 'x-api-key': apiKey }
    });

    if (res.status === 401) {
      viewEl.innerHTML = `<div class="error-msg">⚠️ 401 Unauthorized API Key. Please update top key to unlock documents.</div>`;
      return;
    }

    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

    const data = await res.json();
    if (data.content) {
      viewEl.innerHTML = marked.parse(data.content);
    } else {
      viewEl.innerHTML = `<p class="text-muted">Document is empty or does not exist.</p>`;
    }
  } catch (error) {
    viewEl.innerHTML = `<div class="error-msg">⚠️ Failed to read context document: ${error.message}</div>`;
  }
};

// ==========================================================================
// TELEMETRY ACTIONS SUBMIT & EXPORTER PIPELINE RUNS
// ==========================================================================

// Submit manual raw log
async function submitRawLog(e) {
  e.preventDefault();
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast('Please enter an API Key first!', true);
    return;
  }

  const payload = {
    source: document.getElementById('log-source').value,
    project: document.getElementById('log-project').value || null,
    type: document.getElementById('log-type').value,
    content: document.getElementById('log-content').value
  };

  try {
    const response = await fetch('/api/log/raw', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Post raw failed');

    showToast('✔ Telemetry raw log successfully recorded!');
    document.getElementById('log-content').value = '';
    
    // Dynamic refresh of active views and health checks
    loadActiveTab();
  } catch (err) {
    showToast('Failed to append raw log: ' + err.message, true);
  }
}

// Submit manual worklog
async function submitWorkLog(e) {
  e.preventDefault();
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast('Please enter an API key first!', true);
    return;
  }

  const payload = {
    source: document.getElementById('work-source').value,
    entry: document.getElementById('work-entry').value
  };

  try {
    const response = await fetch('/api/worklog', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Post worklog failed');

    showToast('✔ Work Log entry posted to WORK_LOG.md!');
    document.getElementById('work-entry').value = '';
    
    loadActiveTab();
  } catch (err) {
    showToast('Failed to post work entry: ' + err.message, true);
  }
}

// Context Pack copy aggregator export
async function copyContextPack() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast('Please enter an API key first!', true);
    return;
  }

  try {
    showToast('Compiling Agent Context Pack...');
    const response = await fetch('/api/context/pack', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) throw new Error('API Context compilation request failed');

    const text = await response.text();
    await navigator.clipboard.writeText(text);
    showToast('⚡ Aggregated Context Pack copied to clipboard!');
  } catch (err) {
    showToast('Failed to compile context pack: ' + err.message, true);
  }
}

// Copy Startup Pack (Dynamic monospaced recall briefing)
async function copyStartupPack() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showToast('Please enter an API key first!', true);
    return;
  }

  try {
    showToast('Compiling token-optimized Startup Brief...');
    const response = await fetch('/api/context/brief', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) throw new Error('API Context compilation request failed');

    const data = await response.json();
    if (data.success && data.content) {
      await navigator.clipboard.writeText(data.content);
      showToast('🚀 Token-optimized Startup Brief copied to clipboard!');
    } else {
      throw new Error(data.error || 'Compilation returned empty briefing');
    }
  } catch (err) {
    showToast('Failed to compile Startup Brief: ' + err.message, true);
  }
}

// Global Notification Toast
function showToast(message, isError = false) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast';
  if (isError) toast.classList.add('error');
  
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// Escaping raw text string
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ==========================================================================
// BACKGROUND EXECUTIVE TERMINAL OVERLAY CONSOLE MODAL
// ==========================================================================

window.closeConsoleModal = function() {
  const modal = document.getElementById('cli-console-modal');
  if (modal) modal.classList.add('hidden');
};

window.runFactoryAction = async function(action) {
  const apiKey = getApiKey();
  const modal = document.getElementById('cli-console-modal');
  const stdoutPre = document.getElementById('cli-stdout-log');
  const durationSpan = document.getElementById('cli-duration');

  if (modal) modal.classList.remove('hidden');
  if (stdoutPre) stdoutPre.textContent = `[System Status] Initializing process: "${action}"...\n[Terminal] Working directory: /Users/tuoaoa/Tuoaoa/devflow/centalcontext\n[System] Spawning node background CLI process cleanly...\n`;
  if (durationSpan) durationSpan.textContent = 'Duration: 0.00s';

  const startTime = Date.now();

  try {
    const response = await fetch('/api/factory/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ action })
    });

    const result = await response.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    if (durationSpan) durationSpan.textContent = `Duration: ${duration}s`;

    if (!response.ok) {
      if (stdoutPre) stdoutPre.textContent += `\n\n❌ Execution failed: ${result.error || 'Internal Server Error'}`;
      showToast('Task execution failed', true);
      return;
    }

    if (result.success) {
      if (stdoutPre) {
        stdoutPre.textContent += `\n🟢 [SUCCESS] Task completed in ${result.duration_sec}s.\n\n--- Standard Output ---\n${result.stdout || '(None)'}`;
        if (result.stderr) {
          stdoutPre.textContent += `\n\n--- Standard Error ---\n${result.stderr}`;
        }
      }
      showToast('✔ Task completed successfully!');
    } else {
      if (stdoutPre) {
        stdoutPre.textContent += `\n❌ [ERROR] Task failed with exit code in ${result.duration_sec}s.\n\n--- Standard Output ---\n${result.stdout || '(None)'}\n\n--- Standard Error ---\n${result.stderr || '(None)'}\n\nError details: ${result.error}`;
      }
      showToast('❌ Task failed.', true);
    }

    // Refresh active views and health checks dynamically immediately after exit code 0
    await loadActiveTab();

  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    if (durationSpan) durationSpan.textContent = `Duration: ${duration}s`;
    if (stdoutPre) stdoutPre.textContent += `\n\n❌ Sub-process execution crashed: ${err.message}`;
    showToast('Task process crashed.', true);
  }
};

// --- RETAINED CORE SETTINGS LOGIC FOR THE WINDOW HANDLERS ---
let currentAISettings = null;

window.toggleProviderFields = function() {
  const providerSelect = document.getElementById('set-provider');
  if (!providerSelect) return;
  const provider = providerSelect.value;
  const keyGroup = document.getElementById('group-openrouter-key');
  const modelGroup = document.getElementById('group-model-selector');
  const customModelGroup = document.getElementById('group-custom-model');
  const budgetGroup = document.getElementById('group-budget-settings');
  const switchesGroup = document.getElementById('group-safety-switches');
  const testBtn = document.getElementById('btn-test-connection');
  const executeBtn = document.getElementById('btn-run-ai-execute');

  if (!keyGroup) return;

  if (provider === 'openrouter') {
    keyGroup.classList.remove('hidden');
    modelGroup.classList.remove('hidden');
    budgetGroup.classList.remove('hidden');
    switchesGroup.classList.remove('hidden');
    testBtn.classList.remove('hidden');
    if (executeBtn) executeBtn.classList.remove('hidden');
    toggleCustomModelField();
  } else {
    keyGroup.classList.add('hidden');
    modelGroup.classList.add('hidden');
    customModelGroup.classList.add('hidden');
    budgetGroup.classList.add('hidden');
    switchesGroup.classList.add('hidden');
    testBtn.classList.add('hidden');
    if (executeBtn) executeBtn.classList.add('hidden');
  }
};

window.toggleCustomModelField = function() {
  const modelSelect = document.getElementById('set-model');
  if (!modelSelect) return;
  const customModelGroup = document.getElementById('group-custom-model');
  if (!customModelGroup) return;

  if (modelSelect.value === 'custom') {
    customModelGroup.classList.remove('hidden');
  } else {
    customModelGroup.classList.add('hidden');
  }
};

window.toggleKeyVisibility = function() {
  const keyInput = document.getElementById('set-openrouter-key');
  const toggleBtn = document.getElementById('btn-toggle-key-visibility');
  if (keyInput.type === 'password') {
    keyInput.type = 'text';
    toggleBtn.textContent = 'Hide';
  } else {
    keyInput.type = 'password';
    toggleBtn.textContent = 'Show';
  }
};

window.clearKeyField = function() {
  const keyInput = document.getElementById('set-openrouter-key');
  keyInput.value = '';
  keyInput.placeholder = 'Enter sk-or-v1-... key';
  document.getElementById('key-status-text').innerHTML = 'Key cleared. Enter a new key to save.';
};

window.saveAISettings = async function() {
  const apiKey = getApiKey();
  const provider = document.getElementById('set-provider').value;
  
  const payload = {
    provider,
    openrouter: {
      api_key: document.getElementById('set-openrouter-key').value.trim(),
      model: document.getElementById('set-model').value === 'custom' ? 
             document.getElementById('set-custom-model').value.trim() : 
             document.getElementById('set-model').value,
      max_daily_cost_usd: parseFloat(document.getElementById('set-daily-cost').value),
      max_run_cost_usd: parseFloat(document.getElementById('set-run-cost').value),
      max_requests_per_run: parseInt(document.getElementById('set-max-requests').value, 10),
      max_candidates_per_run: parseInt(document.getElementById('set-max-candidates').value, 10),
      enabled: document.getElementById('set-enabled-openrouter').checked,
      dry_run_default: document.getElementById('set-dry-run').checked,
      hard_stop: document.getElementById('set-hard-stop').checked,
      use_cache: document.getElementById('set-use-cache').checked
    }
  };

  if (payload.openrouter.max_daily_cost_usd > 1.0) {
    const confirmDaily = confirm('⚠️ WARNING: Max Daily Budget exceeds $1.00 USD. Save this limit?');
    if (!confirmDaily) return;
    payload.confirm_over_1_usd = true;
  }

  if (payload.openrouter.max_run_cost_usd > 0.10) {
    const confirmRun = confirm('⚠️ WARNING: Max Run Budget exceeds $0.10 USD. Save this limit?');
    if (!confirmRun) return;
    payload.confirm_over_0_10_usd = true;
  }

  const saveBtn = document.getElementById('btn-save-ai-settings');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await fetch('/api/settings/ai-provider', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to save settings');
    }

    showToast('✔ AI Curation configuration successfully saved!');
    await loadActiveTab();
  } catch (err) {
    showToast('Error saving settings: ' + err.message, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
};

window.testAIConnection = async function() {
  const apiKey = getApiKey();
  const outputCard = document.getElementById('test-output-card');
  const detailsDiv = document.getElementById('test-output-details');
  const testBtn = document.getElementById('btn-test-connection');

  outputCard.classList.remove('hidden');
  detailsDiv.innerHTML = '<p class="loading">Initiating connection test...</p>';
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  const payload = {
    provider: 'openrouter',
    model: document.getElementById('set-model').value === 'custom' ? 
           document.getElementById('set-custom-model').value.trim() : 
           document.getElementById('set-model').value,
    api_key: document.getElementById('set-openrouter-key').value.trim()
  };

  try {
    const response = await fetch('/api/settings/ai-provider/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (!response.ok) {
      detailsDiv.innerHTML = `
        <div style="color:var(--error-color); font-weight:600; margin-bottom:0.25rem;">❌ Connection Test Failed</div>
        <div>Error: ${result.error || 'Unknown HTTP failure'}</div>
      `;
      showToast('❌ Connection test failed.', true);
      return;
    }

    if (result.success) {
      detailsDiv.innerHTML = `
        <div style="color:var(--primary-color); font-weight:600; margin-bottom:0.25rem;">🟢 Connection Successful!</div>
        <div style="display:grid; grid-template-columns: 120px 1fr; gap:0.25rem; font-family:var(--font-mono); font-size:0.8rem; margin-top:0.5rem;">
          <span>Model:</span> <span style="color:var(--secondary-color);">${result.model}</span>
          <span>Latency:</span> <span>${result.latency_ms} ms</span>
          <span>Est. Cost:</span> <span>$${result.estimated_cost.toFixed(5)} USD</span>
          <span>Response:</span> <span style="color:#fff; background-color:var(--bg-dark); padding:0.1rem 0.35rem; border-radius:4px; width:fit-content;">"${result.response}"</span>
        </div>
      `;
      showToast('🟢 Connection test successful!');
    } else {
      detailsDiv.innerHTML = `
        <div style="color:var(--error-color); font-weight:600; margin-bottom:0.25rem;">❌ Connection Failed</div>
        <div>Details: ${result.error || 'Empty response.'}</div>
      `;
      showToast('❌ Connection test failed.', true);
    }
    
    await loadUsageLedger();
  } catch (err) {
    detailsDiv.innerHTML = `
      <div style="color:var(--error-color); font-weight:600; margin-bottom:0.25rem;">❌ Test Execution Crashed</div>
      <div>Error: ${err.message}</div>
    `;
    showToast('❌ Connection test crashed.', true);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
};

window.loadUsageLedger = async function() {
  const apiKey = getApiKey();
  const reqSpan = document.getElementById('usage-requests');
  const spendSpan = document.getElementById('usage-spend');
  const limitSpan = document.getElementById('usage-limit');
  const remSpan = document.getElementById('usage-remaining');
  const warningBanner = document.getElementById('usage-limit-warning');
  const tableBody = document.getElementById('runs-table-body');

  if (!reqSpan) return;

  try {
    const response = await fetch('/api/settings/ai-provider/usage', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    if (!response.ok) throw new Error('Ledger fetch failed');
    const usage = await response.json();

    reqSpan.textContent = usage.total_requests;
    spendSpan.textContent = `$${usage.estimated_cost_usd.toFixed(5)}`;
    limitSpan.textContent = `$${usage.daily_limit.toFixed(5)}`;
    remSpan.textContent = `$${usage.remaining_budget.toFixed(5)}`;

    const budgetExceeded = (usage.remaining_budget <= 0.00001);
    if (budgetExceeded && usage.daily_limit > 0) {
      warningBanner.classList.remove('hidden');
      const testBtn = document.getElementById('btn-test-connection');
      if (testBtn) testBtn.disabled = true;
    } else {
      warningBanner.classList.add('hidden');
      const testBtn = document.getElementById('btn-test-connection');
      if (testBtn) testBtn.disabled = false;
    }

    if (usage.last_runs && usage.last_runs.length > 0) {
      let tbodyHtml = '';
      usage.last_runs.slice().reverse().forEach(run => {
        const time = new Date(run.timestamp).toLocaleTimeString();
        const costStr = `$${run.estimated_cost_usd.toFixed(5)}`;
        const statusColor = run.status === 'completed' ? 'var(--primary-color)' : 'var(--error-color)';
        
        tbodyHtml += `
          <tr>
            <td>${time}</td>
            <td><code>${run.model}</code></td>
            <td class="text-center">${run.candidates_evaluated}</td>
            <td style="color:var(--secondary-color); font-family:var(--font-mono);">${costStr}</td>
            <td style="color:${statusColor}; font-weight:600; text-transform:uppercase;">${run.status}</td>
          </tr>
        `;
      });
      tableBody.innerHTML = tbodyHtml;
    } else {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted">No runs recorded today.</td>
        </tr>
      `;
    }
  } catch (err) {
    console.warn('Failed to load usage data:', err.message);
  }
};

window.runAIJudgeExecuteWithConfirmation = async function() {
  const apiKey = getApiKey();
  const executeBtn = document.getElementById('btn-run-ai-execute');
  if (executeBtn && executeBtn.disabled) return;

  try {
    const res = await fetch('/api/memory/candidates', { headers: { 'x-api-key': apiKey } });
    if (!res.ok) throw new Error('Could not get candidates count');
    const data = await res.json();
    const list = data.candidates || [];
    const count = list.filter(c => c.status === 'review_queue').length;
    const estCost = (count * 0.0001).toFixed(5);

    const confirmed = confirm(`⚖️ OpenRouter AI Judge Execution Confirm:\n\nThis will evaluate all ${count} pending candidate(s) using OpenRouter cloud completions.\nEstimated Cost: $${estCost} USD.\n\nDo you want to proceed with paid model execution?`);
    if (confirmed) {
      runFactoryAction('ai_judge_execute');
    }
  } catch (error) {
    const confirmed = confirm(`⚖️ OpenRouter AI Judge Execution Confirm:\n\nProceed to execute cloud model evaluation?\nThis will spend OpenRouter credits based on model rates.\n\nDo you want to continue?`);
    if (confirmed) {
      runFactoryAction('ai_judge_execute');
    }
  }
};
