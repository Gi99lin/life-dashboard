// Pure helpers for the Analytics AI analyst. No network calls live here.
const SRC = {
  garmin: 'Garmin',
  wakatime: 'WakaTime',
  github: 'GitHub',
  git: 'GitHub',
  manual: 'Obsidian',
};

const SYSTEM_PROMPT = [
  'Ты — лаконичный аналитик личного дашборда.',
  'Отвечай по-русски, опираясь ТОЛЬКО на переданные числа и находки.',
  '1–4 предложения.',
  'Если уместно показать график, добавь в конце блок',
  '```board\\n{"view":"correlation|timeline|weekday|distribution","x":"<метрика>","y":"<метрика|null>"}\\n```.',
].join(' ');

export function sourcesFor(days = []) {
  const present = new Set();
  for (const day of days) {
    for (const [key, label] of Object.entries(SRC)) {
      if (day?.[key]) present.add(label);
    }
  }
  return [...present];
}

export function buildAnalyzeContext(days = [], meta = {}) {
  const last = days[days.length - 1] || {};
  const garmin = last.garmin || {};
  const lines = [
    `Период: ${days.length} дн.`,
    [
      `Сегодня: сон ${garmin.sleep_hours ?? '—'}ч`,
      `стресс ${garmin.stress_avg ?? '—'}`,
      `настроение ${last.manual?.mood ?? '—'}/5`,
      `код ${last.wakatime?.total_h ?? '—'}ч.`,
    ].join(', '),
  ];

  for (const finding of (meta.findings || []).slice(0, 6)) {
    if (finding?.title) lines.push(`Находка: ${finding.title}`);
  }

  return lines.join('\n');
}

export function buildMessages(days = [], meta = {}, question = '') {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${buildAnalyzeContext(days, meta)}\n\nВопрос: ${question || 'Сделай разбор периода.'}`,
    },
  ];
}

export function selectPeriodDays(metrics = {}, period = 30) {
  const requested = Number(period) || 30;
  const count = Math.max(7, Math.min(365, requested));
  return Object.values(metrics.days || {})
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .slice(-count);
}

export function parseBoardDirective(text = '') {
  const match = String(text).match(/```board\s*([\s\S]*?)```/);
  if (!match) return { answer: String(text).trim(), board: null };

  let board = null;
  try {
    board = JSON.parse(match[1].trim());
  } catch {
    board = null;
  }

  return {
    answer: String(text).replace(match[0], '').trim(),
    board,
  };
}

function compactValue(value, suffix = '') {
  return value == null || value === '' ? '—' : `${value}${suffix}`;
}

export function fallbackAnswer(days = [], question = '') {
  const last = days[days.length - 1] || {};
  const garmin = last.garmin || {};
  const sleep = compactValue(garmin.sleep_hours, 'ч');
  const stress = compactValue(garmin.stress_avg);
  const mood = compactValue(last.manual?.mood, '/5');
  const summary = `По локальным данным за период: сон ${sleep}, стресс ${stress}, настроение ${mood}.`;
  const q = String(question || '').toLowerCase();
  let answer = `${summary} Это быстрая сводка без LLM: для свободного диалога подключи модель в env API-контейнера.`;

  if (/улучш|недел|совет|рекоменд/.test(q)) {
    answer = `${summary} Что улучшить: держать сон ближе к стабильным 7.5-8ч, не ставить тяжелые задачи на дни с высоким стрессом и каждый день фиксировать настроение, чтобы связь не терялась.`;
  } else if (/сон|продуктив|код|работ/.test(q)) {
    answer = `${summary} Для сна и продуктивности смотри на пары дней: если после короткого сна растет стресс или падает фокус, лучше сдвинуть глубокую работу на более спокойный слот.`;
  } else if (/аномал|скач|пик/.test(q)) {
    answer = `${summary} Аномалии стоит проверять по двум причинам: резкий стресс/сон в Garmin и перегруз по работе. Без LLM я могу только подсветить числа, а не строить глубокую гипотезу.`;
  }

  return {
    answer,
    sources: sourcesFor(days),
    board: null,
  };
}
