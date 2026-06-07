import {
  buildForecast,
  buildMetrics,
  buildSchedule,
  buildTopology,
  scriptedAnalyze,
} from '../demo/demoData.js';

export function isDemoMode(env = import.meta.env, loc = globalThis.location) {
  return env?.VITE_DEMO === '1' || Boolean(loc?.hostname?.startsWith('demo.'));
}

export const DEMO = isDemoMode();

function parseJsonBody(body) {
  if (!body) return {};
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function jsonResponse(payload, init = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => (typeof payload === 'string' ? { ok: true } : payload),
    text: async () => text,
  };
}

export async function demoFetch(url, opts = {}) {
  const path = String(url).split('?')[0];

  if (path === '/api/auth-check' || path === '/api/login') return jsonResponse({ ok: true });
  if (path === '/api/sync' || path === '/api/metrics') return jsonResponse(buildMetrics());
  if (path === '/api/forecast') return jsonResponse(buildForecast());
  if (path === '/api/schedule') return jsonResponse(buildSchedule());
  if (path === '/api/infra/topology') return jsonResponse(buildTopology());
  if (path === '/api/analyze') return jsonResponse(scriptedAnalyze(parseJsonBody(opts.body)));
  if (path === '/api/entry') {
    const body = parseJsonBody(opts.body);
    return jsonResponse({
      date: body.date || new Date().toISOString().slice(0, 10),
      mood: body.mood ?? 4,
      food_before_20: body.food_before_20 ?? true,
      note: body.note || '',
    });
  }

  return jsonResponse({});
}

export function apiFetch(url, opts) {
  return DEMO ? demoFetch(url, opts) : fetch(url, opts);
}
