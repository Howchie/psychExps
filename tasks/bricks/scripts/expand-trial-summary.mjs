#!/usr/bin/env node
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

function usage(code = 0) {
  console.log([
    'Usage:',
    '  node tasks/bricks/scripts/expand-trial-summary.mjs --input <path/to/bricks_trial_summary.csv> [--output <path>]',
    '',
    'What it does:',
    '  - Parses Bricks trial summary CSV rows safely (supports quoted JSON cells).',
    '  - Expands key JSON columns into analysis-friendly scalar columns.',
    '  - Writes an expanded CSV next to input by default: *_expanded.csv',
  ].join('\n'));
  process.exit(code);
}

function parseArgs(argv) {
  const out = { input: '', output: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--input' && argv[i + 1]) {
      out.input = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--output' && argv[i + 1]) {
      out.output = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (!arg.startsWith('-') && !out.input) {
      out.input = String(arg);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.input) throw new Error('Missing --input CSV path.');
  if (!out.output) {
    const ext = path.extname(out.input);
    const base = ext ? out.input.slice(0, -ext.length) : out.input;
    out.output = `${base}_expanded.csv`;
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((values) => {
    const out = {};
    for (let i = 0; i < headers.length; i += 1) {
      out[headers[i]] = values[i] ?? '';
    }
    return out;
  });
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : String(value);
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function recordsToCsv(records) {
  if (!Array.isArray(records) || records.length === 0) return '';
  const keys = [];
  const seen = new Set();
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  const lines = [keys.join(',')];
  for (const rec of records) {
    lines.push(keys.map((key) => csvCell(rec[key])).join(','));
  }
  return lines.join('\n');
}

function safeJson(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (!(text.startsWith('{') || text.startsWith('['))) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function setIfFinite(target, key, value) {
  if (Number.isFinite(value)) target[key] = value;
}

function flattenObject(obj, prefix, out, maxDepth = 3, depth = 0) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  if (depth >= maxDepth) return;
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}_${k}`;
    if (v === null || v === undefined) {
      out[key] = '';
    } else if (Array.isArray(v)) {
      out[`${key}_count`] = v.length;
    } else if (typeof v === 'object') {
      flattenObject(v, key, out, maxDepth, depth + 1);
    } else {
      out[key] = v;
    }
  }
}

function summarizeArray(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return { count: 0, mean: null };
  const vals = numbers.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return { count: 0, mean: null };
  const sum = vals.reduce((a, b) => a + b, 0);
  return { count: vals.length, mean: sum / vals.length };
}

function expandRecord(row) {
  const out = { ...row };

  const difficulty = safeJson(row.difficulty_estimate);
  if (difficulty && typeof difficulty === 'object' && !Array.isArray(difficulty)) {
    flattenObject(difficulty, 'difficulty', out, 2);
  }

  const game = safeJson(row.game);
  if (game && typeof game === 'object' && !Array.isArray(game)) {
    flattenObject(game?.stats || {}, 'game_stats', out, 2);
    out.game_events_count = Array.isArray(game?.events) ? game.events.length : '';
    out.game_bricks_remaining = game?.bricks ? Object.keys(game.bricks).length : '';
  }

  const drt = safeJson(row.drt);
  if (drt && typeof drt === 'object' && !Array.isArray(drt)) {
    out.drt_enabled = drt.enabled === true;
    flattenObject(drt?.stats || {}, 'drt_stats', out, 2);
    out.drt_events_count = Array.isArray(drt?.events) ? drt.events.length : '';
  }

  const perf = safeJson(row.performance);
  if (perf && typeof perf === 'object' && !Array.isArray(perf)) {
    flattenObject(perf, 'perf', out, 2);
  }

  const deltas = safeJson(row.performance_deltas);
  if (Array.isArray(deltas)) {
    const summary = summarizeArray(deltas);
    out.performance_deltas_count_expanded = summary.count;
    out.performance_deltas_mean_expanded = summary.mean ?? '';
  }

  const practiceResults = safeJson(row.practice_press_results);
  if (Array.isArray(practiceResults)) {
    const numeric = practiceResults.map((v) => (v === true ? 1 : 0));
    const summary = summarizeArray(numeric);
    out.practice_press_results_count_expanded = summary.count;
    out.practice_press_results_correct_rate_expanded = summary.mean ?? '';
  }

  const scopeTotals = safeJson(row.stats_scope_totals);
  if (scopeTotals && typeof scopeTotals === 'object' && !Array.isArray(scopeTotals)) {
    flattenObject(scopeTotals, 'totals', out, 3);
  }

  const surveys = safeJson(row.surveys);
  if (Array.isArray(surveys)) {
    out.surveys_count_expanded = surveys.length;
    const firstScores = surveys[0]?.scores;
    if (firstScores && typeof firstScores === 'object' && !Array.isArray(firstScores)) {
      flattenObject(firstScores, 'survey0_scores', out, 2);
    }
  }

  const timeline = safeJson(row.timeline_events);
  if (Array.isArray(timeline)) {
    out.timeline_events_count_expanded = timeline.length;
  }

  const drtRows = safeJson(row.drt_response_rows);
  if (Array.isArray(drtRows)) {
    out.drt_response_rows_count_expanded = drtRows.length;
  }

  const config = safeJson(row.config_snapshot);
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    out.config_trial_mode = config?.trial?.mode ?? '';
    out.config_trial_max_time_sec = asNumber(config?.trial?.maxTimeSec) ?? '';
    out.config_completion_mode = config?.bricks?.completionMode ?? '';
    out.config_target_hold_ms = asNumber(config?.bricks?.completionParams?.target_hold_ms) ?? '';
    out.config_hold_floor_ms = asNumber(config?.bricks?.completionParams?.hold_floor_ms) ?? '';
    out.config_ui_show_hud =
      config?.display?.ui?.showHUD ??
      config?.ui?.showHUD ??
      '';
    out.config_drt_enabled = config?.task?.modules?.drt?.enabled ?? '';
    out.config_drt_scope = config?.task?.modules?.drt?.scope ?? '';
  }

  return out;
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const text = await readFile(input, 'utf8');
  const records = parseCsv(text);
  if (records.length === 0) {
    throw new Error('Input CSV has no records.');
  }
  const expanded = records.map(expandRecord);
  const csv = recordsToCsv(expanded);
  await writeFile(output, csv, 'utf8');
  console.log(JSON.stringify({
    input,
    output,
    rows: expanded.length,
    columns: Object.keys(expanded[0] || {}).length,
  }, null, 2));
}

main().catch((error) => {
  console.error(`expand-trial-summary failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
