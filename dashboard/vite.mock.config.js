// TEMPORARY mock config — renders dashboard with fake data for design review.
// Not committed. Run: npx vite --config vite.mock.config.js
import { defineConfig } from 'vite';

function pad(n) { return String(n).padStart(2, '0'); }
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function buildMetrics() {
  const days = {};
  const today = new Date();
  const clamp = (value) => Math.max(0, Math.min(100, value));
  for (let i = 119; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  for (const d of ds) {
    const g = d.garmin;
    const calm = clamp(100 - g.stress_avg);
    const hrv = clamp(Math.round((g.hrv - 57) / 57 * 100 + 50));
    const score = Math.round(0.35 * g.sleep_score + 0.30 * g.body_battery_max + 0.20 * calm + 0.15 * hrv);
    d.readiness = {
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
      ai_brief: {
        text: 'Сон 7.4ч поднял восстановление, стресс ниже нормы. Глубокой работы 6.2ч — выше обычного.',
        sources: ['Garmin', 'GitHub', 'WakaTime', 'Obsidian'],
        generated_at: new Date().toISOString(),
      },
      now: { activity: 'coding', project: 'omniroute', focus_min: 41, source: 'WakaTime' },
    },
  };
}

function buildForecast() {
  const icons = ['☀️', '🌤️', '⛅', '🌧️', '⛈️'];
  const now = new Date();
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    const t = new Date(now);
    t.setHours(h, 0, 0, 0);
    const time = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(h)}:00`;
    hourly.push({ time, icon: icons[Math.floor(Math.random() * 3)], temp: 14 + Math.round(Math.sin(h / 4) * 6) });
  }
  const days = [{
    icon: '🌤️', desc: 'Переменная облачность',
    sunrise: `${pad(now.getMonth() + 1)}T05:12`.padStart(16, '2026-'),
    sunset: '2026-06-04T21:34',
    max: 22, min: 12,
  }];
  // fix sunrise format
  days[0].sunrise = '2026-06-04T05:12';
  return {
    current: { temp: 19, humidity: 54, wind: 11, feels_like: 18, pressure: 1014 },
    days,
    hourly,
  };
}

function buildSchedule() {
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
  const current = blocks.find(b => b.start <= hm && b.end > hm) || null;
  return { current, next: blocks.find(b => b.start > hm) || null, blocks };
}

const mockApi = () => ({
  name: 'mock-api',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url.split('?')[0];
      const json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
      if (url === '/api/auth-check') { res.statusCode = 200; return res.end('ok'); }
      if (url === '/api/sync') return json(buildMetrics());
      if (url === '/api/forecast') return json(buildForecast());
      if (url === '/api/schedule') return json(buildSchedule());
      if (url.startsWith('/socket.io')) { res.statusCode = 200; return res.end(''); }
      next();
    });
  },
});

export default defineConfig({
  root: '.',
  plugins: [mockApi()],
  server: { port: 5174, open: false },
});
