import { hybridRecallSearch, HybridRecallResult } from './recall-embeddings';

const { redactSecrets } = require('../../../scripts/lib/secret-redactor');

export interface InjectedSource {
  source: string;
  project?: string | null;
  timestamp?: string | null;
  hybrid_score: number;
  memory_summary: string;
  why_selected: string[];
}

export interface ContextInjectionPacket {
  query: string;
  token_estimate: number;
  token_budget: number;
  selected_memories: number;
  context_packet: string;
  sources: InjectedSource[];
  source_breakdown: Record<string, number>;
}

export async function generateContextInjectionPacket(query: string, options: {
  project?: string;
  tokenBudget?: number;
  recallResults?: HybridRecallResult[];
  embedText?: (text: string) => Promise<number[]>;
} = {}): Promise<ContextInjectionPacket> {
  const cleanQuery = redactSecrets(query.trim());
  const tokenBudget = clampTokenBudget(options.tokenBudget || 800);
  const recallResults = options.recallResults || await hybridRecallSearch(cleanQuery, {
    project: options.project,
    limit: 30,
    trackRecalls: false,
    embedText: options.embedText
  });

  const selected = selectMemoriesForInjection(recallResults, cleanQuery, tokenBudget);
  const contextPacket = redactSecrets(renderContextPacket(cleanQuery, selected, tokenBudget));
  const finalPacket = enforceTokenBudget(contextPacket, tokenBudget);

  return {
    query: cleanQuery,
    token_estimate: estimateTokens(finalPacket),
    token_budget: tokenBudget,
    selected_memories: selected.length,
    context_packet: finalPacket,
    sources: selected.map(memory => ({
      source: memory.source,
      project: memory.project,
      timestamp: memory.timestamp,
      hybrid_score: memory.hybrid_score,
      memory_summary: redactSecrets(memory.memory_summary),
      why_selected: memory.why_selected.map(reason => redactSecrets(reason))
    })),
    source_breakdown: selected.reduce((acc, memory) => {
      acc[memory.source] = (acc[memory.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };
}

export function selectMemoriesForInjection(results: HybridRecallResult[], query: string, tokenBudget: number): HybridRecallResult[] {
  const seen = new Set<string>();
  const ranked = results
    .map(memory => ({ memory, selectionScore: scoreForSelection(memory, query) }))
    .sort((a, b) => b.selectionScore - a.selectionScore);

  const selected: HybridRecallResult[] = [];
  let usedTokens = 180;
  const memoryBudget = Math.max(80, Math.floor(tokenBudget * 0.58));

  for (const item of ranked) {
    const memory = item.memory;
    const fingerprint = fingerprintSummary(memory.memory_summary);
    if (!fingerprint || seen.has(fingerprint)) continue;

    const cost = estimateTokens(memory.memory_summary) + 16;
    if (selected.length > 0 && usedTokens + cost > memoryBudget) continue;

    seen.add(fingerprint);
    selected.push(memory);
    usedTokens += cost;

    if (selected.length >= 10) break;
  }

  return selected;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function renderContextPacket(query: string, memories: HybridRecallResult[], tokenBudget: number): string {
  const byProject = unique(memories.map(memory => memory.project || '').filter(Boolean));
  const lessons = memories.filter(memory => /lesson|bug|failure|error|security|dedupe|fix/i.test(`${memory.type || ''} ${memory.memory_summary}`));
  const decisions = memories.filter(memory => /decision|architecture|source of truth|approved|preference/i.test(`${memory.type || ''} ${memory.memory_summary}`));
  const warnings = memories.filter(memory => /warning|risk|reality|mismatch|secret|credential/i.test(`${memory.type || ''} ${memory.memory_summary}`));

  const lines: string[] = [];
  lines.push(`# CENTRALCONTEXT STARTUP PACK`);
  lines.push(`[Query: ${query}] [Budget: ${tokenBudget} tokens]`);
  lines.push('');
  lines.push('## CURRENT FOCUS');
  lines.push(`- Answer or continue work on: ${query}`);
  if (byProject.length) lines.push(`- Project context: ${byProject.slice(0, 3).join(', ')}`);
  lines.push('');

  lines.push('## RELEVANT MEMORIES');
  appendMemoryBullets(lines, memories.slice(0, 6));
  lines.push('');

  lines.push('## IMPORTANT LESSONS');
  appendMemoryBullets(lines, lessons.slice(0, 3), '- No specific lessons surfaced beyond the relevant memories.');
  lines.push('');

  lines.push('## ACTIVE DECISIONS');
  appendMemoryBullets(lines, decisions.slice(0, 3), '- No active decisions surfaced for this query.');
  lines.push('');

  lines.push('## REALITY WARNINGS');
  appendMemoryBullets(lines, warnings.slice(0, 3), '- No reality or security warnings surfaced for this query.');
  lines.push('');

  lines.push('## PROJECT CONTEXT');
  if (byProject.length) {
    byProject.slice(0, 5).forEach(project => lines.push(`- ${project}`));
  } else {
    lines.push('- General CentralContext context.');
  }
  lines.push('');
  lines.push('## USAGE NOTE');
  lines.push('- Use this packet as startup context. It is compressed from ranked memories, not a full telemetry export.');

  return lines.join('\n');
}

function appendMemoryBullets(lines: string[], memories: HybridRecallResult[], emptyMessage = '- No matching memories selected.'): void {
  if (memories.length === 0) {
    lines.push(emptyMessage);
    return;
  }

  memories.forEach(memory => {
    const project = memory.project ? ` [${memory.project}]` : '';
    const score = Number(memory.hybrid_score || 0).toFixed(2);
    lines.push(`- (${memory.source}, score ${score})${project} ${compressSentence(memory.memory_summary)}`);
  });
}

function scoreForSelection(memory: HybridRecallResult, query: string): number {
  const sourceBoost = memory.source === 'approved_memory' ? 0.18 : memory.source === 'candidate' ? 0.08 : 0;
  const projectBoost = memory.project && query.toLowerCase().includes(String(memory.project).toLowerCase()) ? 0.08 : 0;
  const confidenceProxy = Math.max(memory.semantic_score || 0, memory.fts_score || 0) * 0.08;
  const recencyBoost = (memory.recency_score || 0) * 0.04;
  const importanceBoost = (memory.importance_score || 0) * 0.08;
  return (memory.hybrid_score || 0) + sourceBoost + projectBoost + confidenceProxy + recencyBoost + importanceBoost;
}

function enforceTokenBudget(packet: string, tokenBudget: number): string {
  if (estimateTokens(packet) <= tokenBudget) return packet;

  const lines = packet.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const candidate = [...kept, line].join('\n');
    if (estimateTokens(candidate) > tokenBudget - 12) break;
    kept.push(line);
  }
  kept.push('[TRUNCATED TO TOKEN BUDGET]');
  return kept.join('\n');
}

function compressSentence(text: string): string {
  const clean = redactSecrets(String(text || '').replace(/\s+/g, ' ').trim());
  if (clean.length <= 220) return clean;
  return `${clean.slice(0, 217)}...`;
}

function fingerprintSummary(text: string): string {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean).slice(0, 24);
  return words.join(' ');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clampTokenBudget(value: number): number {
  if (!Number.isFinite(value)) return 800;
  return Math.min(Math.max(Math.floor(value), 300), 1000);
}
