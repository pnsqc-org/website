(() => {
  const pad2 = (value) => String(value).padStart(2, '0');

  const formatSr = ({ days, hours, minutes }) => {
    const parts = [];
    parts.push(`${days} day${days === 1 ? '' : 's'}`);
    parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    return parts.join(', ');
  };

  const getParts = (msRemaining) => {
    const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { days, hours, minutes, seconds };
  };

  const initCountdown = (root) => {
    const getStages = () => {
      const stagesRaw = root.getAttribute('data-countdown-stages') || '';
      if (stagesRaw.trim()) {
        try {
          const parsedStages = JSON.parse(stagesRaw);
          if (Array.isArray(parsedStages)) {
            return parsedStages
              .map((stage, index) => {
                const deadlineRaw = stage.deadline || '';
                const deadlineMs = Date.parse(deadlineRaw);
                if (!Number.isFinite(deadlineMs)) return null;

                return {
                  id: `${deadlineRaw}-${index}`,
                  deadlineMs,
                  label: stage.label || '',
                  timeText: stage.timeText || '',
                  timeDateTime: stage.timeDateTime || '',
                  srLabel: stage.srLabel || stage.label || '',
                };
              })
              .filter(Boolean)
              .sort((a, b) => a.deadlineMs - b.deadlineMs);
          }
        } catch {
          return [];
        }
      }

      const deadlineRaw = root.getAttribute('data-countdown-deadline') || '';
      const deadlineMs = Date.parse(deadlineRaw);
      if (!Number.isFinite(deadlineMs)) return [];

      return [
        {
          id: deadlineRaw,
          deadlineMs,
          label: '',
          timeText: '',
          timeDateTime: '',
          srLabel: '',
        },
      ];
    };

    const stages = getStages();
    if (!stages.length) return;

    const labelEl = root.querySelector('[data-countdown-label]');
    const dateEl = root.querySelector('[data-countdown-date]');
    const daysEl = root.querySelector('[data-countdown-days]');
    const hoursEl = root.querySelector('[data-countdown-hours]');
    const minutesEl = root.querySelector('[data-countdown-minutes]');
    const secondsEl = root.querySelector('[data-countdown-seconds]');
    const srEl = root.querySelector('[data-countdown-sr]');

    const expiredText = root.getAttribute('data-countdown-expired-text') || 'Deadline has passed.';

    let activeStageId = '';
    let lastSrKey = '';

    const applyStage = (stage) => {
      if (!stage || stage.id === activeStageId) return;

      activeStageId = stage.id;
      lastSrKey = '';

      if (labelEl && stage.label) labelEl.textContent = stage.label;
      if (dateEl) {
        dateEl.hidden = false;
        if (stage.timeText) dateEl.textContent = stage.timeText;
        if (stage.timeDateTime) dateEl.setAttribute('datetime', stage.timeDateTime);
        else dateEl.removeAttribute('datetime');
      }
    };

    const getActiveStage = (nowMs) => stages.find((stage) => stage.deadlineMs > nowMs) || null;

    const renderExpired = () => {
      activeStageId = 'expired';
      lastSrKey = '';
      if (labelEl) labelEl.textContent = expiredText;
      if (dateEl) {
        dateEl.textContent = '';
        dateEl.removeAttribute('datetime');
        dateEl.hidden = true;
      }
      for (const el of [daysEl, hoursEl, minutesEl, secondsEl]) {
        if (el) el.textContent = '0';
      }
      if (srEl) srEl.textContent = expiredText;
    };

    const tick = () => {
      const nowMs = Date.now();
      const activeStage = getActiveStage(nowMs);
      if (!activeStage) {
        renderExpired();
        return false;
      }

      applyStage(activeStage);

      const msRemaining = activeStage.deadlineMs - nowMs;
      const parts = getParts(msRemaining);

      if (daysEl) daysEl.textContent = String(parts.days);
      if (hoursEl) hoursEl.textContent = pad2(parts.hours);
      if (minutesEl) minutesEl.textContent = pad2(parts.minutes);
      if (secondsEl) secondsEl.textContent = pad2(parts.seconds);

      // Keep screen reader updates low-churn (minute resolution).
      if (srEl) {
        const srKey = `${parts.days}:${parts.hours}:${parts.minutes}`;
        if (srKey !== lastSrKey) {
          lastSrKey = srKey;
          const srLabel = (activeStage.srLabel || 'deadline').replace(/:$/, '');
          srEl.textContent = `${formatSr(parts)} left until ${srLabel}.`;
        }
      }

      return true;
    };

    // Initial render immediately.
    if (!tick()) return;

    // Then update every second for visual timer.
    const intervalId = window.setInterval(() => {
      if (!tick()) window.clearInterval(intervalId);
    }, 1000);
  };

  const main = () => {
    const nodes = Array.from(document.querySelectorAll('[data-countdown]'));
    for (const node of nodes) initCountdown(node);
  };

  main();
})();
