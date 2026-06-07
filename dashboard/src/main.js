/**
 * Life Dashboard — main entry point
 */
import './styles/main.css';
import { loadMetrics } from './utils/dataLoader.js';
import { DEMO, apiFetch } from './utils/demo.js';
import { renderQuickEntry, loadEntryForDate } from './components/QuickEntry.js';
import { initWeather } from './components/WeatherForecast.js';
import { openScheduleEditor } from './components/ScheduleEditor.js';
import { attachMetricTooltips, enhanceSourceLinks, initGlobalTooltip } from './utils/tooltip.js';
import { initChartTheme } from './utils/palette.js';

// V2 Imports
import { initAuth, showLoginModal } from './components/LoginModal.js';
import { renderLiveSchedule } from './components/LiveSchedule.js';
import { renderHero } from './components/Hero.js';
import { renderLiveStrip, updateLiveNow } from './components/LiveStrip.js';
import { renderDomains } from './components/Domains.js';
import { renderCorrelationPanel } from './components/CorrelationPanel.js';
import { renderOverviewTrends } from './components/OverviewTrends.js';
import { renderFindings } from './components/Findings.js';
import { analystPeriodText, renderAnalystChat } from './components/AnalystChat.js';
import { renderEvidenceBoard, setBoardState } from './components/EvidenceBoard.js';
import { renderHostVitals } from './components/HostVitals.js';
import { renderLiveTelemetry } from './components/LiveTelemetry.js';
import { renderStackTopology } from './components/StackTopology.js';
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
  if (!DEMO) {
    const authed = await initAuth();
    if (!authed) {
      showLoginModal();
      return;
    }
  }

  setGreeting();
  setDate();
  initChartTheme();
  document.body.classList.toggle('demo-mode', DEMO);
  const demoBadge = document.getElementById('demoBadge');
  if (demoBadge) demoBadge.hidden = !DEMO;

  // Cookies are sent automatically in the live app. The static demo uses
  // in-browser data only and intentionally opens no socket connection.
  if (!DEMO) {
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
  }

  // Fetch Live Schedule
  let scheduleData = null;
  try {
    const sRes = await apiFetch('/api/schedule');
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
  let analyticsPeriod = 30;
  let analyticsBoardState = { view: 'correlation', x: 'Сон', y: 'Наст' };
  let infraLoaded = false;
  const tabs = document.getElementById('tabs');
  const appsTrigger = tabs?.querySelector('.apps-tab-trigger');
  const appsMenu = document.getElementById('appsMenu');

  function syncAnalyticsPeriodControls() {
    document.querySelectorAll('.analytics-periods [data-period]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.period) === analyticsPeriod);
    });

    const stamp = document.querySelector('[data-analytics-stamp]');
    if (stamp) stamp.textContent = `${analystPeriodText(analyticsPeriod)} · LLM`;
  }

  function renderAnalyticsWorkspace() {
    renderEvidenceBoard(document.getElementById('anBoard'), data, analyticsBoardState, analyticsPeriod);
    renderAnalystChat(document.getElementById('anChat'), data, {
      period: analyticsPeriod,
      onBoard: (board) => {
        if (!board) return;
        analyticsBoardState = { ...analyticsBoardState, ...(board || {}) };
        setBoardState(board);
      },
    });
    enhanceMetricInteractions(document.getElementById('tab-analytics'));
  }

  function setAnalyticsPeriod(period) {
    const next = Number(period);
    if (!Number.isFinite(next) || next <= 0) return;
    analyticsPeriod = Math.round(next);
    syncAnalyticsPeriodControls();
    if (analyticsLoaded) renderAnalyticsWorkspace();
  }

  function bindAnalyticsPeriods() {
    document.querySelectorAll('.analytics-periods [data-period]').forEach((button) => {
      button.addEventListener('click', () => setAnalyticsPeriod(button.dataset.period));
    });
    syncAnalyticsPeriodControls();
  }

  function ensureAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    bindAnalyticsPeriods();
    renderFindings(document.getElementById('anFindings'), data);
    renderAnalyticsWorkspace();
  }

  // Infrastructure charts need visible containers (Chart.js measures them), so
  // render on first Infrastructure-tab open.
  async function ensureInfra() {
    if (infraLoaded) return;
    infraLoaded = true;
    const topology = await apiFetch('/api/infra/topology')
      .then((res) => res.json())
      .catch(() => ({ host: {}, telemetry: { cpu: [], ram: [], net: [] }, networks: [], standalone: [], edges: [] }));
    renderHostVitals(document.getElementById('infraVitals'), topology);
    renderLiveTelemetry(document.getElementById('infraLive'), topology, 60);
    renderStackTopology(document.getElementById('stackTopo'), topology);
  }

  function showDemoOpenNotice(label = '') {
    let notice = document.getElementById('demoOpenNotice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'demoOpenNotice';
      notice.className = 'demo-open';
      document.body.appendChild(notice);
    }
    notice.textContent = label ? `Доступно в полной версии · ${label}` : 'Доступно в полной версии';
    clearTimeout(showDemoOpenNotice.timer);
    showDemoOpenNotice.timer = setTimeout(() => notice.remove(), 1800);
  }

  function renderDemoPlaceholder(tab) {
    const iframe = tab?.querySelector('iframe[data-src]');
    const placeholder = tab?.querySelector('[data-demo-placeholder]');
    if (iframe) {
      iframe.removeAttribute('src');
      iframe.hidden = true;
    }
    if (placeholder) placeholder.hidden = false;
  }

  function loadAppIframe(tab) {
    if (DEMO) {
      renderDemoPlaceholder(tab);
      return;
    }

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
    if (tabName === 'devops') ensureInfra();
  }

  window.__openAnalytics = (target, params = {}) => {
    const analyticsButton = tabs?.querySelector('.tab[data-tab="analytics"]');
    activateTab('analytics', analyticsButton);

    if (params.i != null && params.j != null) {
      const labels = data.meta?.correlations?.labels || [];
      const x = labels[params.i];
      const y = labels[params.j];
      if (x && y) setBoardState({ view: 'correlation', x, y });
      return;
    }

    if (params.driver) {
      const driverMap = { sleep: 'Сон', steps: 'Шаг', code: 'Код', mood: 'Наст', rhr: 'Пульс' };
      setBoardState({ view: 'correlation', x: driverMap[params.driver] || 'Сон', y: 'Готов' });
      return;
    }

    if (target === 'ai') {
      setBoardState({ view: 'timeline', x: 'Готов', y: null });
    }
  };

  window.__openApp = (urlOrName = '') => {
    const value = String(urlOrName).toLowerCase();
    const appTab = value.includes('chat') || value.includes('libre') ? 'librechat'
      : value.includes('rdp') || value.includes('guac') || value.includes('vnc') ? 'guacamole'
        : value.includes('omni') ? 'omniroute'
          : null;

    if (appTab) {
      activateTab(appTab, appsTrigger);
      appsMenu?.classList.remove('open');
      appsTrigger?.setAttribute('aria-expanded', 'false');
      return;
    }

    if (DEMO) {
      showDemoOpenNotice(value);
      return;
    }

    if (/^https?:\/\//.test(urlOrName)) window.open(urlOrName, '_blank', 'noopener');
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
    // Correlation-matrix cells bind their own click handlers on the Overview, so
    // they are not handled here — only generic [data-drill] links are.
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
