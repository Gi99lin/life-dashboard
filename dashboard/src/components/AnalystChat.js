import { apiFetch } from '../utils/demo.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function answerHtml(answer) {
  return esc(answer).replace(/\n/g, '<br>');
}

export function questionForFinding(finding) {
  return `Расскажи про: ${finding?.title || 'находку'}`;
}

export function renderSourceChips(sources = []) {
  if (!sources.length) return '';
  return `<div class="srcrow">${sources.map((source) => `<span class="src">${esc(source)}</span>`).join('')}</div>`;
}

export function renderAnalystChat(container, data, { onBoard } = {}) {
  if (!container) return;
  const findings = data?.meta?.findings || [];
  const period = 30;

  container.innerHTML = `
    <div class="ph"><span class="tagdot"></span>AI-аналитик<span class="right">видит данные за период</span></div>
    <div class="msgs" id="anMsgs"></div>
    <div class="chips" id="anChips">
      <span class="chip">Сон ↔ продуктивность</span>
      <span class="chip">Объясни последнюю аномалию</span>
      <span class="chip">Что улучшить на неделе?</span>
    </div>
    <div class="composer">
      <input id="anInput" placeholder="Спроси про свои данные за период..."/>
      <button class="send" id="anSend" type="button">▶</button>
    </div>`;

  const msgs = container.querySelector('#anMsgs');
  const addBubble = (cls, html) => {
    const bubble = document.createElement('div');
    bubble.className = `bubble ${cls}`;
    bubble.innerHTML = html;
    msgs?.appendChild(bubble);
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    return bubble;
  };

  async function ask(question = '') {
    const clean = question.trim();
    if (clean) addBubble('me', esc(clean));
    const pending = addBubble('ai', '<div class="who">◇ аналитик</div>...');

    try {
      const response = await apiFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, question: clean }),
      });
      const payload = await response.json();
      pending.innerHTML = `<div class="who">◇ аналитик</div>${answerHtml(payload.answer || 'Нет ответа.')}${renderSourceChips(payload.sources || [])}`;
      if (payload.board) onBoard?.(payload.board);
    } catch {
      pending.innerHTML = '<div class="who">◇ аналитик</div>Не удалось получить ответ.';
    }
  }

  container.querySelector('#anSend')?.addEventListener('click', () => {
    const input = container.querySelector('#anInput');
    const question = input?.value.trim();
    if (!question) return;
    input.value = '';
    ask(question);
  });

  container.querySelector('#anInput')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    container.querySelector('#anSend')?.click();
  });

  container.querySelector('#anChips')?.addEventListener('click', (event) => {
    const chip = event.target.closest?.('.chip');
    if (chip) ask(chip.textContent || '');
  });

  window.__askFinding = (index) => {
    const finding = findings[index];
    if (!finding) return;
    if (finding.evidence) onBoard?.(finding.evidence);
    ask(questionForFinding(finding));
  };

  ask('');
}
