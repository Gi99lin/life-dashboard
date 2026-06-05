export function renderLiveStrip(container, data, schedule) {
  if (!container) return;

  const now = data.meta?.now;
  const current = schedule?.current;
  const last = Object.values(data.days || {}).sort((a, b) => a.date.localeCompare(b.date)).pop() || {};

  container.className = 'live';
  container.innerHTML = `
    <div class="lcell now">
      <div class="lbl">▸ Сейчас</div>
      <div class="lv">${now ? `${now.activity} · ${now.project || ''}` : '—'}</div>
      <div class="ls">${now ? `фокус ${now.focus_min} мин · ${now.source}` : 'нет активности'}</div>
    </div>
    <div class="lcell">
      <div class="lbl">По плану</div>
      <div class="lv">${current?.activity || '—'}</div>
      <div class="ls">${current ? `${current.start}–${current.end} · Obsidian` : 'свободно'}</div>
    </div>
    <div class="lcell" id="liveInfra">
      <div class="lbl">Инфра</div>
      <div class="lv"><span class="dot"></span>—</div>
      <div class="ls">контейнеры · Docker</div>
    </div>
    <div class="lcell">
      <div class="lbl">Стрик кода</div>
      <div class="lv">${last.github?.streak ?? '—'} дн</div>
      <div class="ls">GitHub</div>
    </div>`;
}
