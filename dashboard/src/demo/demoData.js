function pad(n) { return String(n).padStart(2, '0'); }

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function buildFindings() {
  return [
    {
      type: 'threshold',
      title: 'Сон <6.5ч → продуктивность −34%',
      subtitle: 'обсуждается сейчас',
      metrics: ['Сон', 'Код'],
      stat: -34,
      evidence: { view: 'distribution', x: 'Сон', y: 'Код', annotations: [{ label: 'короткий сон' }] },
      explanation: 'В дни короткого сна кодовых часов заметно меньше.',
      sources: ['Garmin', 'WakaTime'],
    },
    {
      type: 'correlation',
      title: 'Сон ↔ Наст · r=+0.62',
      subtitle: 'p<0.01 · 30 дней',
      metrics: ['Сон', 'Наст'],
      stat: 0.62,
      evidence: { view: 'correlation', x: 'Сон', y: 'Наст', annotations: [{ label: 'выходные выше тренда' }] },
      explanation: 'Больше сна связано с лучшим настроением.',
      sources: ['Garmin', 'Obsidian'],
    },
    {
      type: 'anomaly',
      title: '3 апр — стресс 78, ×2 нормы',
      subtitle: 'сон в ночь 5.1ч',
      metrics: ['Стр'],
      stat: 2.1,
      evidence: { view: 'timeline', x: 'Стр', y: null, annotations: [{ label: 'стресс-спайк' }] },
      explanation: 'Изолированный пик стресса после короткого сна.',
      sources: ['Garmin'],
    },
    {
      type: 'record',
      title: 'Глубокая работа — 9 дней подряд',
      subtitle: 'прошлый рекорд 6',
      metrics: ['Код'],
      stat: 9,
      evidence: { view: 'timeline', x: 'Код', y: null, annotations: [{ label: 'стрик' }] },
      explanation: 'Серия дней с устойчивой глубокой работой.',
      sources: ['WakaTime', 'GitHub'],
    },
    {
      type: 'pattern',
      title: 'Выходные: сон +1.2ч',
      subtitle: 'шаги −3100 · 12 нед',
      metrics: ['Сон'],
      stat: 1.2,
      evidence: { view: 'weekday', x: 'Сон', y: null, annotations: [{ label: 'выходные' }] },
      explanation: 'По выходным сон длиннее, но активность ниже.',
      sources: ['Garmin'],
    },
    {
      type: 'driver',
      title: 'Рычаг готовности — Сон +0.63',
      subtitle: 'сильнее всех',
      metrics: ['Сон', 'Готов'],
      stat: 0.63,
      evidence: { view: 'correlation', x: 'Сон', y: 'Готов', annotations: [{ label: 'главный рычаг' }] },
      explanation: 'Сон сильнее остальных факторов связан с readiness.',
      sources: ['Garmin'],
    },
  ];
}

export function buildMetrics() {
  const days = {};
  const today = new Date();
  const clamp = (value) => Math.max(0, Math.min(100, value));

  for (let i = 119; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dateKey(d);
    const wd = d.getDay();
    const weekend = wd === 0 || wd === 6;
    const wave = Math.sin(i / 7) * 0.5 + Math.sin(i / 23) * 0.3;
    const r = (a, b) => a + Math.random() * (b - a);

    const sleepH = +(6.4 + wave * 1.2 + r(-0.4, 0.6)).toFixed(1);
    const deep = +(sleepH * r(0.13, 0.20)).toFixed(1);
    const rem = +(sleepH * r(0.18, 0.24)).toFixed(1);
    const awake = +(sleepH * r(0.02, 0.07)).toFixed(1);
    const light = +(sleepH - deep - rem - awake).toFixed(1);
    const commits = weekend ? Math.round(r(0, 5)) : Math.round(r(2, 16) + (wave > 0.4 ? 6 : 0));
    const codeHours = +(commits > 0 ? Math.min(8.5, commits * r(0.22, 0.42) + r(0.2, 1.1)) : r(0, 0.4)).toFixed(1);
    const tsHours = +(codeHours * r(0.34, 0.50)).toFixed(1);
    const pyHours = +(codeHours * r(0.22, 0.36)).toFixed(1);
    const jsHours = Math.max(0, +(codeHours - tsHours - pyHours).toFixed(1));

    days[key] = {
      date: key,
      weekday: WD[wd],
      week_iso: isoWeek(d),
      manual: {
        mood: Math.max(1, Math.min(5, Math.round(3 + wave * 1.3 + r(-0.7, 0.7)))),
        note: '',
      },
      garmin: (() => {
        const rest = Math.round(r(50, 60));
        const calBase = Math.round(r(1500, 1750));
        const calActive = Math.round(r(350, 1100) + (weekend ? 300 : 0));
        return {
          sleep_hours: sleepH,
          sleep_score: Math.round(60 + wave * 18 + r(-6, 8)),
          sleep_phases: { deep_h: deep, light_h: light, rem_h: rem, awake_h: awake },
          body_battery_max: Math.round(62 + wave * 22 + r(-8, 10)),
          body_battery_min: Math.round(14 + wave * 8 + r(-4, 6)),
          steps: Math.round(r(3500, 13500) + (weekend ? 2500 : 0)),
          stress_avg: Math.round(34 - wave * 10 + r(-6, 8)),
          hrv: Math.round(r(45, 70)),
          rest_hr: rest,
          resting_hr: rest,
          max_hr: Math.round(r(128, 168)),
          min_hr: Math.round(r(44, 52)),
          spo2_avg: Math.round(r(95, 98)),
          spo2_low: Math.round(r(88, 93)),
          calories_active: calActive,
          calories_total: calBase + calActive,
        };
      })(),
      git: {
        commits,
        repos: commits > 0 ? ['life-dashboard', 'omniroute', 'collector'].slice(0, 1 + (commits % 3)) : [],
      },
      wakatime: {
        total_h: codeHours,
        by_language: codeHours > 0 ? {
          TypeScript: tsHours,
          Python: pyHours,
          JavaScript: jsHours,
        } : {},
        by_project: codeHours > 0 ? {
          'life-dashboard': +(codeHours * 0.55).toFixed(1),
          omniroute: +(codeHours * 0.30).toFixed(1),
          collector: +(codeHours * 0.15).toFixed(1),
        } : {},
        focus_h: +(codeHours * r(0.72, 0.92)).toFixed(1),
      },
      github: {
        prs_merged: commits > 0 ? Math.round(r(0, 3)) : 0,
        reviews: commits > 0 ? Math.round(r(0, 6)) : 0,
        streak: 0,
        langs: {},
        additions: null,
        deletions: null,
      },
      schedule: {
        wake_time: `0${6 + (wd % 2)}:${pad(Math.round(r(0, 55)))}`,
        hours_sleep: sleepH,
        hours_work: weekend ? +r(0, 2).toFixed(1) : +r(4, 8).toFixed(1),
        hours_projects: +r(0.5, 4).toFixed(1),
        hours_games: +r(0, 3).toFixed(1),
        hours_rest: +r(1, 4).toFixed(1),
        hours_food: +r(0.8, 2).toFixed(1),
      },
    };
  }

  const ds = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;
  for (const day of ds) {
    streak = day.git.commits > 0 ? streak + 1 : 0;
    day.github.streak = streak;
    const g = day.garmin;
    const calm = clamp(100 - g.stress_avg);
    const hrv = clamp(Math.round((g.hrv - 57) / 57 * 100 + 50));
    const score = Math.round(0.35 * g.sleep_score + 0.30 * g.body_battery_max + 0.20 * calm + 0.15 * hrv);
    day.readiness = {
      score: clamp(score),
      sleep: g.sleep_score,
      energy: g.body_battery_max,
      calm,
      hrv,
    };
  }

  return {
    days,
    meta: {
      generated: new Date().toISOString(),
      correlations: {
        labels: ['Сон', 'Наст', 'Стр', 'Код', 'Шаг', 'BB'],
        matrix: [
          [1, .62, -.38, -.12, .15, .55],
          [.62, 1, -.44, .28, .20, .40],
          [-.38, -.44, 1, .41, -.10, -.50],
          [-.12, .28, .41, 1, -.22, -.18],
          [.15, .20, -.10, -.22, 1, .12],
          [.55, .40, -.50, -.18, .12, 1],
        ],
        strongest: [
          { a: 'Сон', b: 'Наст', r: .62 },
          { a: 'Стр', b: 'BB', r: -.50 },
          { a: 'Код', b: 'Стр', r: .41 },
          { a: 'Сон', b: 'Стр', r: -.38 },
        ],
      },
      findings: buildFindings(),
      ai_brief: {
        text: 'Сон 7.4ч поднял восстановление, стресс ниже нормы. Глубокой работы 6.2ч — выше обычного.',
        sources: ['Garmin', 'GitHub', 'WakaTime', 'Obsidian'],
        generated_at: new Date().toISOString(),
      },
      now: { activity: 'Код', project: 'omniroute', focus_min: 41, source: 'WakaTime' },
    },
  };
}

export function scriptedAnalyze(body = {}) {
  const question = String(body.question || '').toLowerCase();
  const sources = ['Garmin', 'WakaTime', 'Obsidian'];

  if (question.includes('аномал') || question.includes('апрел')) {
    return {
      answer: '3 апреля выглядит как изолированный стресс-спайк: стресс 78 при сне около 5.1ч. Я вывел таймлайн стресса и отметил этот день.',
      sources: ['Garmin'],
      board: { view: 'timeline', x: 'Стр', y: null, annotations: [{ label: 'стресс 78' }] },
    };
  }

  if (question.includes('сон') || question.includes('настро')) {
    return {
      answer: 'Связь заметная: r=+0.62. В этом окне больше сна обычно совпадает с лучшим настроением, особенно в будни.',
      sources,
      board: { view: 'correlation', x: 'Сон', y: 'Наст', annotations: [{ label: 'выходные выше тренда' }] },
    };
  }

  if (question.includes('улучш')) {
    return {
      answer: 'Самый сильный рычаг — сон: цель на неделю удержать 7.2–7.6ч и не проваливаться ниже 6.5ч. Второй ход — ограничить длинные стрессовые код-сессии без перерывов.',
      sources,
      board: { view: 'correlation', x: 'Сон', y: 'Готов', annotations: [{ label: 'рычаг готовности' }] },
    };
  }

  return {
    answer: 'За 30 дней сон стабилен, но дни ниже 6.5ч заметно режут продуктивность. Главный рычаг готовности — сон, а самый явный выброс — стрессовый день после короткой ночи.',
    sources,
    board: { view: 'correlation', x: 'Сон', y: 'Наст', annotations: [{ label: 'авто-разбор' }] },
  };
}

export function buildForecast() {
  const icons = ['☀️', '🌤️', '⛅', '🌧️', '⛈️'];
  const now = new Date();
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const t = new Date(now);
    t.setHours(h, 0, 0, 0);
    hourly.push({
      time: `${dateKey(t)}T${pad(h)}:00`,
      icon: icons[Math.floor(Math.random() * 3)],
      temp: 14 + Math.round(Math.sin(h / 4) * 6),
    });
  }

  return {
    current: { temp: 19, humidity: 54, wind: 11, feels_like: 18, pressure: 1014 },
    days: [{
      icon: '🌤️',
      desc: 'Переменная облачность',
      sunrise: `${dateKey(now)}T05:12`,
      sunset: `${dateKey(now)}T21:34`,
      max: 22,
      min: 12,
    }],
    hourly,
  };
}

export function buildSchedule() {
  const blocks = [
    { start: '07:00', end: '08:00', activity: 'Подъём и зарядка' },
    { start: '08:00', end: '09:00', activity: 'Завтрак, чтение' },
    { start: '09:00', end: '13:00', activity: 'Глубокая работа' },
    { start: '13:00', end: '14:00', activity: 'Обед' },
    { start: '14:00', end: '18:00', activity: 'Проекты и код' },
    { start: '18:00', end: '19:30', activity: 'Спорт' },
    { start: '20:00', end: '22:00', activity: 'Отдых' },
  ];
  const now = new Date();
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    current: blocks.find((block) => block.start <= hm && block.end > hm) || null,
    next: blocks.find((block) => block.start > hm) || null,
    blocks,
  };
}

export function buildServerMetrics() {
  const nowSec = Math.floor(Date.now() / 1000);
  const N = 60;
  const r = (a, b) => a + Math.random() * (b - a);
  const cpu = [];
  const net = [];
  for (let i = 0; i < N; i++) {
    const t = nowSec - (N - 1 - i) * 60;
    const wave = Math.sin(i / 9) * 0.5 + 0.5;
    const user = +(6 + wave * 14 + r(-3, 4)).toFixed(1);
    const system = +(2 + wave * 5 + r(-1, 2)).toFixed(1);
    const iowait = +Math.max(0, r(0, 2.5)).toFixed(1);
    cpu.push({ t, user, system, iowait, idle: +Math.max(0, 100 - user - system - iowait).toFixed(1) });
    net.push({
      t,
      received: Math.round(Math.max(0, 120 + wave * 600 + r(-80, 200))),
      sent: Math.round(Math.max(0, 60 + wave * 260 + r(-40, 120))),
    });
  }

  return {
    system: {
      cpu,
      ram: { used: Math.round(r(8200, 10500)), free: Math.round(r(5000, 7000)) },
      disk: { used: 348, avail: 164 },
      net,
    },
    apps: {
      librechat: { containers: [{ name: 'librechat', state: 'running', status: 'Up 6 days' }], totalCpu: +r(4, 22).toFixed(1), totalMem: Math.round(r(640, 1100)) },
      omniroute: { containers: [{ name: 'omniroute-api', state: 'running', status: 'Up 12 days' }], totalCpu: +r(2, 14).toFixed(1), totalMem: Math.round(r(280, 520)) },
      guacamole: { containers: [{ name: 'guacamole', state: 'running', status: 'Up 9 days' }], totalCpu: +r(0.5, 5).toFixed(1), totalMem: Math.round(r(180, 360)) },
      netdata: { containers: [{ name: 'netdata', state: 'running', status: 'Up 21 days' }], totalCpu: +r(1, 6).toFixed(1), totalMem: Math.round(r(120, 240)) },
    },
  };
}

export function buildTopology(minutes = 60) {
  const nowSec = Math.floor(Date.now() / 1000);
  const N = Math.max(1, Math.min(Number(minutes) || 60, 180));
  const r = (a, b) => a + Math.random() * (b - a);
  const telemetry = { cpu: [], ram: [], net: [] };
  for (let i = 0; i < N; i++) {
    const t = nowSec - (N - 1 - i) * 60;
    const wave = Math.sin(i / 9) * 0.5 + 0.5;
    telemetry.cpu.push({ t, value: +(14 + wave * 18 + r(-3, 5)).toFixed(1) });
    telemetry.ram.push({ t, value: +(61 + Math.sin(i / 17) * 3 + r(-1, 1)).toFixed(1) });
    telemetry.net.push({ t, value: Math.round(140 + wave * 680 + r(-70, 160)) });
  }

  return {
    host: {
      name: 'gigglin-server',
      uptime: 'up 21 день',
      cpu: 24,
      ram: 64,
      disk: 68,
      net: '0.8M',
      vcpu: 8,
      ram_total: 16,
      os: 'Ubuntu 24.04 · Docker 27',
      containers: { total: 11, running: 10 },
    },
    telemetry,
    networks: [
      { name: 'librechat-net', services: [
        { name: 'LibreChat', tech: 'Node', purpose: 'Чат с LLM', status: 'running', cpu: 14, mem: 672, url: 'https://chat.gigglin.tech/', role: 'app' },
        { name: 'Postgres', tech: 'pg16', status: 'running', cpu: 2, mem: 410, role: 'db' },
        { name: 'Redis', tech: 'Redis', status: 'running', cpu: 1, mem: 64, role: 'cache' },
      ] },
      { name: 'omniroute-net', services: [
        { name: 'OmniRoute', tech: 'Go', purpose: 'LLM router', status: 'running', cpu: 3, mem: 519, url: 'https://omniroute.gigglin.tech/', role: 'app' },
        { name: 'Postgres', tech: 'pg16', status: 'running', cpu: 1, mem: 228, role: 'db' },
        { name: 'Redis', tech: 'Redis', status: 'running', cpu: 1, mem: 38, role: 'cache' },
      ] },
      { name: 'guacamole-net', services: [
        { name: 'Guacamole', tech: 'Java', purpose: 'Remote desktop', status: 'running', cpu: 1, mem: 281, url: 'https://rdp.gigglin.tech/', role: 'app' },
        { name: 'guacd', tech: 'C', status: 'running', cpu: 1, mem: 36, role: 'worker' },
        { name: 'Postgres', tech: 'pg16', status: 'running', cpu: 1, mem: 120, role: 'db' },
      ] },
      { name: 'dashboard-net', services: [
        { name: 'dashboard-api', tech: 'Node', purpose: 'этот дашборд', status: 'running', cpu: 2, mem: 88, role: 'app' },
        { name: 'collector', tech: 'Python', status: 'idle', cpu: 0, mem: 72, role: 'worker' },
      ] },
    ],
    standalone: [
      { name: 'nginx', role: 'gateway', status: 'running', cpu: 8 },
      { name: 'внешние LLM', id: 'external-llm', role: 'external', status: 'running' },
      { name: 'Netdata', role: 'monitor', status: 'running' },
      { name: 'work-vm', role: 'vm', status: 'running', tech: 'VNC', via: 'guacamole', reachable: true, open: 'https://rdp.gigglin.tech/' },
    ],
    edges: [
      { from: 'internet', to: 'nginx', type: 'http' },
      { from: 'nginx', to: 'librechat-net', type: 'http' },
      { from: 'nginx', to: 'omniroute-net', type: 'http' },
      { from: 'nginx', to: 'guacamole-net', type: 'http' },
      { from: 'nginx', to: 'dashboard-net', type: 'http' },
      { from: 'omniroute', to: 'external-llm', type: 'llm' },
      { from: 'guacamole', to: 'work-vm', type: 'vnc' },
      { from: 'Netdata', to: 'dashboard-net', type: 'monitor' },
    ],
  };
}
