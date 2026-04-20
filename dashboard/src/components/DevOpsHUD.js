/**
 * DevOpsHUD.js — Gather.town-style agent room visualization.
 * Each agent has a "room" with furniture, mascot, and activity status.
 */

const AGENT_META = {
  schedule_agent: { emoji: '📅', name: 'Schedule Agent', color: '#a7c080' },
  writer_agent:   { emoji: '✍️', name: 'Writer Agent', color: '#7fbbb3' },
  research_agent: { emoji: '🔬', name: 'Research Agent', color: '#d699b6' },
  code_agent:     { emoji: '💻', name: 'Code Agent', color: '#dbbc7f' },
  memory_agent:   { emoji: '🧠', name: 'Memory Agent', color: '#e69875' },
};

let lastActiveTime = null;

function getAgentMeta(agentId) {
  if (AGENT_META[agentId]) return AGENT_META[agentId];
  // Dynamic agent — generate a color
  const hue = [...agentId].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return { emoji: '🤖', name: agentId.replace(/_/g, ' '), color: `hsl(${hue}, 45%, 65%)` };
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}с назад`;
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`;
  return `${Math.floor(diff / 3600)}ч назад`;
}

export function renderDevOpsHUD(container, dockerState) {
  if (!dockerState) {
    container.innerHTML = `
      <div class="ar-loading">
        <div class="ar-loading-dot"></div>
        <span>Подключение к LifeOS...</span>
      </div>`;
    return;
  }

  const { activeAgent, lastAgentTime } = dockerState;
  if (lastAgentTime) lastActiveTime = lastAgentTime;

  const defaultAgents = ['schedule_agent', 'writer_agent', 'research_agent'];
  let agentsToRender = [...defaultAgents];
  if (activeAgent && !agentsToRender.includes(activeAgent)) {
    agentsToRender.push(activeAgent);
  }

  let html = '<div class="ar-grid">';

  for (const agentId of agentsToRender) {
    const meta = getAgentMeta(agentId);
    const isWorking = agentId === activeAgent;
    const statusText = isWorking ? 'В работе' : 'Спит';
    const lastSeen = (agentId === activeAgent && lastActiveTime) ? timeAgo(lastActiveTime) : '';

    html += `
      <div class="ar-room ${isWorking ? 'ar-room-active' : 'ar-room-idle'}">
        <div class="ar-room-glow" style="--agent-color: ${meta.color}"></div>
        <div class="ar-room-content">
          <div class="ar-room-scene">
            <div class="ar-furniture ar-bed" title="Кровать">🛏️</div>
            <div class="ar-mascot ${isWorking ? 'ar-mascot-working' : 'ar-mascot-sleeping'}">
              <span class="ar-mascot-emoji">${meta.emoji}</span>
              ${isWorking ? '<div class="ar-mascot-pulse"></div>' : '<div class="ar-zzz">💤</div>'}
            </div>
            <div class="ar-furniture ar-desk" title="Рабочий стол">🖥️</div>
          </div>
          <div class="ar-room-info">
            <div class="ar-room-name">${meta.name}</div>
            <div class="ar-room-status">
              <span class="ar-status-dot ${isWorking ? 'ar-dot-active' : 'ar-dot-idle'}"></span>
              <span class="ar-status-text">${statusText}</span>
              ${lastSeen ? `<span class="ar-last-seen">· ${lastSeen}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}
