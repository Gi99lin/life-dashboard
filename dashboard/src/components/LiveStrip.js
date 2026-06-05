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

function formatNowValue(now) {
  const activity = now?.activity || 'Нет активности';
  return now?.project ? `${activity} · ${now.project}` : activity;
}

function formatNowDetail(now) {
  const minutes = Number.isFinite(now?.focus_min) ? now.focus_min : 0;
  const source = now?.source || 'WakaTime';
  return `фокус ${minutes} мин · ${source}`;
}

function setText(el, text) {
  if (!el) return;
  if ('textContent' in el) el.textContent = text;
  else el.innerHTML = text;
}

export function updateLiveNow(rootOrNow, maybeNow) {
  const root = maybeNow ? rootOrNow : document;
  const now = maybeNow || rootOrNow;
  if (!root || !now) return;

  setText(root.querySelector('.lcell.now .lv'), formatNowValue(now));
  setText(root.querySelector('.lcell.now .ls'), formatNowDetail(now));
}
