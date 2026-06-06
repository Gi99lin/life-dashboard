/**
 * Life Dashboard — main entry point
 */
import './styles/main.css';
import { loadMetrics } from './utils/dataLoader.js';
import { renderQuickEntry, loadEntryForDate } from './components/QuickEntry.js';
import { initWeather } from './components/WeatherForecast.js';
import { openScheduleEditor } from './components/ScheduleEditor.js';
import { attachMetricTooltips, enhanceSourceLinks, initGlobalTooltip } from './utils/tooltip.js';
import { initChartTheme } from './utils/palette.js';

// V2 Imports
import { initAuth, showLoginModal } from './components/LoginModal.js';
import { renderLiveSchedule } from './components/LiveSchedule.js';
import { renderServerMetrics } from './components/ServerMetrics.js';
import { renderHero } from './components/Hero.js';
import { renderLiveStrip, updateLiveNow } from './components/LiveStrip.js';
import { renderDomains } from './components/Domains.js';
import { renderCorrelationPanel } from './components/CorrelationPanel.js';
import { renderOverviewTrends } from './components/OverviewTrends.js';
import { activateAnalyticsDeep, analyticsTabForTarget, renderAnalyticsDeep } from './components/AnalyticsDeep.js';
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
  initChartTheme();

  // Cookies are sent automatically — no fetch wrapper needed

  // V2 live sockets (cookies sent via handshake)
  const socket = io('/');

  socket.on('connect_error', (err) => {
    if (err.message === 'Unauthorized') showLoginModal('Сессия истекла');
  });

  socket.on('docker_pulse', (state) => {
    updateLiveInfra(state);
  });

  socket.on('now_pulse', (state) => {
    updateLiveNow(state);
  });

  // Fetch Live Schedule
  let scheduleData = null;
  try {
    const sRes = await fetch('/api/schedule');
    const sData = await sRes.json();
    scheduleData = sData;
    const sCont = document.getElementById('liveSchedule');
    if (sCont) renderLiveSchedule(sCont, sData);
  } catch(e) {
    console.error("No schedule data", e);
  }

  const data = await loadMetrics();
  setSyncDot(data.days ? 'ok' : 'error');

  renderHero(document.getElementById('hero'), data);
  renderLiveStrip(document.getElementById('liveStrip'), data, scheduleData);
  renderDomains(document.getElementById('domains'), data);
  renderCorrelationPanel(document.getElementById('corrPanel'), data);
  renderOverviewTrends(document.getElementById('trendsPanel'), data);

  // Weather
  initWeather();

  // Tooltip system
  initGlobalTooltip();
  enhanceMetricInteractions(document);

  // Quick entry
  const quickEntry = document.getElementById('quickEntry');
  if (quickEntry) renderQuickEntry(quickEntry);

  // QuickEntry modal wiring
  const qeOverlay = document.getElementById('quickEntryOverlay');
  const qeCloseBtn = document.getElementById('qeModalClose');

  function openQuickEntry(date) {
    if (qeOverlay) {
      const dateStr = date || new Date().toISOString().slice(0, 10);
      const dateEl = document.getElementById('qeModalDate');
      if (dateEl) dateEl.textContent = dateStr;
      qeOverlay.classList.add('open');
      loadEntryForDate(dateStr);
    }
  }

  if (qeCloseBtn) qeCloseBtn.addEventListener('click', () => qeOverlay?.classList.remove('open'));
  if (qeOverlay) qeOverlay.addEventListener('click', (e) => {
    if (e.target === qeOverlay) qeOverlay.classList.remove('open');
  });

  // Programmatic opener for the manual mood/food entry modal. Its old trigger
  // (the calendar heatmap) was removed in the Overview redesign; kept as a hook
  // so the manual-entry path isn't lost (a UI trigger can be re-added later).
  window.__openQuickEntry = openQuickEntry;

  // Schedule editor — click on schedule widget opens editor
  const schedWidget = document.querySelector('.schedule-widget-pane');
  if (schedWidget) {
    schedWidget.style.cursor = 'pointer';
    schedWidget.addEventListener('click', () => openScheduleEditor());
  }

  // Tab switching
  let analyticsLoaded = false;
  let metricsLoaded = false;
  const tabs = document.getElementById('tabs');
  const appsTrigger = tabs?.querySelector('.apps-tab-trigger');
  const appsMenu = document.getElementById('appsMenu');

  function ensureAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    const analyticsEl = document.getElementById('analyticsDeep');
    renderAnalyticsDeep(analyticsEl, data);
    enhanceMetricInteractions(analyticsEl);
  }

  // Server metrics need a visible container (Chart.js measures it), so render
  // on first Infrastructure-tab open.
  function ensureServerMetrics() {
    if (metricsLoaded) return;
    metricsLoaded = true;
    const el = document.getElementById('serverMetrics');
    if (el) renderServerMetrics(el);
  }

  function loadAppIframe(tab) {
    const iframe = tab?.querySelector('iframe[data-src]');
    if (iframe && !iframe.getAttribute('src')) {
      iframe.setAttribute('src', iframe.dataset.src);
    }
  }

  function activateTab(tabName, activeControl) {
    document.querySelectorAll('#tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    activeControl?.classList.add('active');

    const target = document.getElementById(`tab-${tabName}`);
    if (target) target.classList.add('active');

    // Lock body scroll when iframe tab is active
    const isAppTab = target?.classList.contains('app-iframe-tab');
    document.body.classList.toggle('app-mode', isAppTab);
    if (isAppTab) loadAppIframe(target);

    // Lazy-render charts on first visit (canvas must be visible so Chart.js
    // measures the container correctly).
    if (tabName === 'analytics') ensureAnalytics();
    if (tabName === 'devops') ensureServerMetrics();
  }

  window.__openAnalytics = (target, params = {}) => {
    const tab = analyticsTabForTarget(target);
    const analyticsButton = tabs?.querySelector('.tab[data-tab="analytics"]');
    activateTab('analytics', analyticsButton);
    activateAnalyticsDeep(document.getElementById('analyticsDeep'), tab, params);
  };

  tabs?.addEventListener('click', (e) => {
    const appItem = e.target.closest('.app-menu-item');
    if (appItem) {
      activateTab(appItem.dataset.tab, appsTrigger);
      appsMenu?.classList.remove('open');
      appsTrigger?.setAttribute('aria-expanded', 'false');
      return;
    }

    const trigger = e.target.closest('.apps-tab-trigger');
    if (trigger) {
      const open = !appsMenu?.classList.contains('open');
      appsMenu?.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', String(open));
      return;
    }

    const btn = e.target.closest('.tab[data-tab]');
    if (!btn) return;
    activateTab(btn.dataset.tab, btn);
    appsMenu?.classList.remove('open');
    appsTrigger?.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener('click', (e) => {
    // Correlation-matrix cells bind their own click handlers (CorrelationPanel on
    // the Overview, AnalyticsDeep inside the Analytics tab), so they are not
    // handled here — only generic [data-drill] links are.
    const drill = e.target.closest('[data-drill]');
    if (drill) {
      window.__openAnalytics?.(drill.dataset.drill || 'body');
      return;
    }

    if (!tabs?.contains(e.target)) {
      appsMenu?.classList.remove('open');
      appsTrigger?.setAttribute('aria-expanded', 'false');
    }
  });

}

function enhanceMetricInteractions(root) {
  attachMetricTooltips(root);
  enhanceSourceLinks(root);
}

function updateLiveInfra(state) {
  const el = document.getElementById('liveInfra');
  const containers = state?.containers || [];
  if (!el || !containers.length) return;

  const ok = containers.filter((container) => container.state === 'running').length;
  const total = containers.length;
  const value = el.querySelector('.lv');
  if (value) value.innerHTML = `<span class="dot"></span>${ok}/${total} ok`;
}

init();
