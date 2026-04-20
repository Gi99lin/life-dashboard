/**
 * Life Dashboard — main entry point
 */
import './styles/main.css';
import { loadMetrics, getDays } from './utils/dataLoader.js';
import { renderStatCards } from './components/StatCards.js';
import { renderTrendChart } from './components/TrendChart.js';
import { renderTimeBreakdown } from './components/TimeBreakdown.js';
import { renderMoodHeatmap } from './components/MoodHeatmap.js';
import { renderQuickEntry, loadEntryForDate } from './components/QuickEntry.js';
import { initWeather } from './components/WeatherForecast.js';
import { openScheduleEditor } from './components/ScheduleEditor.js';
import { initGlobalTooltip } from './utils/tooltip.js';

// V2 Imports
import { initAuth, showLoginModal } from './components/LoginModal.js';
import { renderLiveSchedule } from './components/LiveSchedule.js';
import { renderDevOpsHUD } from './components/DevOpsHUD.js';
import { renderHealthCharts } from './components/HealthCharts.js';
import { renderServerMetrics } from './components/ServerMetrics.js';
import { io } from 'socket.io-client';

function setGreeting() {
  const el = document.getElementById('greeting');
  if (!el) return;

  const hour = new Date().getHours();
  let text;
  if (hour >= 5 && hour < 12) text = 'Доброе утро';
  else if (hour >= 12 && hour < 18) text = 'Добрый день';
  else text = 'Добрый вечер';

  el.textContent = text;
}

function setDate() {
  const el = document.getElementById('dateDisplay');
  if (!el) return;

  const now = new Date();
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const weekdays = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  el.textContent = `${now.getDate()} ${months[now.getMonth()]}, ${weekdays[now.getDay()]}`;
}

function setSyncDot(status) {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  dot.className = 'sync-dot' + (status === 'error' ? ' error' : '');
}

async function init() {
  // Check auth via cookie
  const authed = await initAuth();
  if (!authed) {
    showLoginModal();
    return;
  }

  setGreeting();
  setDate();

  // Cookies are sent automatically — no fetch wrapper needed

  // V2 live sockets (cookies sent via handshake)
  const socket = io('/');

  socket.on('connect_error', (err) => {
    if (err.message === 'Unauthorized') showLoginModal('Сессия истекла');
  });

  socket.on('docker_pulse', (state) => {
    const el = document.getElementById('agentRooms');
    if (el) renderDevOpsHUD(el, state);
  });
  
  socket.on('agent_pulse', (state) => {
    const el = document.getElementById('agentRooms');
    if (el) renderDevOpsHUD(el, state);
  });

  // Fetch Live Schedule
  try {
    const sRes = await fetch('/api/schedule');
    const sData = await sRes.json();
    const sCont = document.getElementById('liveSchedule');
    if (sCont) renderLiveSchedule(sCont, sData);
  } catch(e) {
    console.error("No schedule data", e);
  }

  const data = await loadMetrics();
  setSyncDot(data.days ? 'ok' : 'error');

  // Stat cards
  const statContainer = document.getElementById('statCards');
  if (statContainer) renderStatCards(statContainer, data);

  // Weather
  initWeather();

  // Trend chart
  const trendCanvas = document.getElementById('trendChart');
  if (trendCanvas) renderTrendChart(trendCanvas, data, 30);

  // Period selector
  const periodSelector = document.getElementById('periodSelector');
  if (periodSelector) {
    periodSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.period-btn');
      if (!btn) return;
      periodSelector.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = parseInt(btn.dataset.days);
      renderTrendChart(trendCanvas, data, days);
    });
  }

  // Time breakdown
  const timeCanvas = document.getElementById('timeChart');
  if (timeCanvas) renderTimeBreakdown(timeCanvas, data);

  // Mood heatmap
  const heatmapEl = document.getElementById('moodHeatmap');
  if (heatmapEl) renderMoodHeatmap(heatmapEl, data);

  // Tooltip system
  initGlobalTooltip();

  // Quick entry
  const quickEntry = document.getElementById('quickEntry');
  if (quickEntry) renderQuickEntry(quickEntry);

  // QuickEntry modal wiring
  const qeOverlay = document.getElementById('quickEntryOverlay');
  const qeCloseBtn = document.getElementById('qeModalClose');
  const quickAddBtn = document.getElementById('quickAddBtn');

  function openQuickEntry(date) {
    if (qeOverlay) {
      const dateStr = date || new Date().toISOString().slice(0, 10);
      const dateEl = document.getElementById('qeModalDate');
      if (dateEl) dateEl.textContent = dateStr;
      qeOverlay.classList.add('open');
      loadEntryForDate(dateStr);
    }
  }

  if (quickAddBtn) quickAddBtn.addEventListener('click', () => openQuickEntry());
  if (qeCloseBtn) qeCloseBtn.addEventListener('click', () => qeOverlay?.classList.remove('open'));
  if (qeOverlay) qeOverlay.addEventListener('click', (e) => {
    if (e.target === qeOverlay) qeOverlay.classList.remove('open');
  });

  // Expose openQuickEntry globally for MoodHeatmap clicks
  window.__openQuickEntry = openQuickEntry;

  // Schedule editor — click on schedule widget opens editor
  const schedWidget = document.querySelector('.schedule-widget-pane');
  if (schedWidget) {
    schedWidget.style.cursor = 'pointer';
    schedWidget.addEventListener('click', () => openScheduleEditor());
  }

  // Health Charts (V2)
  renderHealthCharts(data);

  // Tab switching
  document.getElementById('tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(`tab-${btn.dataset.tab}`);
    if (target) target.classList.add('active');

    // Lock body scroll when iframe tab is active
    const isAppTab = target?.classList.contains('app-iframe-tab');
    document.body.classList.toggle('app-mode', isAppTab);
  });

  // Sub-tab switching (Infrastructure)
  let metricsLoaded = false;
  document.getElementById('devopsSubTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sub-tab');
    if (!btn) return;
    const parent = btn.closest('.tab-content');
    parent.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    parent.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(`subtab-${btn.dataset.subtab}`);
    if (target) target.classList.add('active');

    // Lazy-load server metrics on first visit
    if (btn.dataset.subtab === 'resources' && !metricsLoaded) {
      metricsLoaded = true;
      const el = document.getElementById('serverMetrics');
      if (el) renderServerMetrics(el);
    }
  });
}

init();
