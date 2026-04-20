export function renderLiveSchedule(container, data) {
  if (!data || (!data.current && !data.next && (!data.blocks || data.blocks.length === 0))) {
    const dbg = data?.debugInfo ? JSON.stringify(data.debugInfo) : '';
    container.innerHTML = `<div class="schedule-empty">Нет активностей по расписанию <br><small style="opacity:0.4">${dbg}</small></div>`;
    return;
  }

  const { current, blocks } = data;
  
  // Find current index to slice upcoming blocks
  const now = new Date();
  const curHm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  
  // Filter out any blocks ending before now
  let upcoming = (blocks || []).filter(b => b.end > curHm);
  
  if (upcoming.length === 0) {
    container.innerHTML = `<div class="schedule-empty">На сегодня всё завершено ✨</div>`;
    return;
  }

  // We want to show up to 4 blocks to fit the weather widget height
  const displayBlocks = upcoming.slice(0, 4);

  container.innerHTML = `
    <div class="schedule-live-stack">
      ${displayBlocks.map((b, i) => {
        const isCurrent = (b.start <= curHm && b.end > curHm);
        const tag = isCurrent ? 'СЕЙЧАС' : (i === 0 || (i === 1 && current)) ? 'ДАЛЕЕ' : '';
        const clz = isCurrent ? 'schedule-current' : 'schedule-next';
        
        return `
          <div class="schedule-block-mini ${clz}">
            <div class="sbm-time">${b.start} - ${b.end}</div>
            <div class="sbm-activity">${b.activity}</div>
            ${tag ? `<span class="sbm-tag">${tag}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}
