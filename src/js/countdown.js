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
    const deadlineRaw = root.getAttribute('data-countdown-deadline') || '';
    const deadlineMs = Date.parse(deadlineRaw);
    if (!Number.isFinite(deadlineMs)) return;

    const daysEl = root.querySelector('[data-countdown-days]');
    const hoursEl = root.querySelector('[data-countdown-hours]');
    const minutesEl = root.querySelector('[data-countdown-minutes]');
    const secondsEl = root.querySelector('[data-countdown-seconds]');
    const srEl = root.querySelector('[data-countdown-sr]');

    const expiredText = root.getAttribute('data-countdown-expired-text') || 'Deadline has passed.';

    let lastSrKey = '';

    const renderExpired = () => {
      for (const el of [daysEl, hoursEl, minutesEl, secondsEl]) {
        if (el) el.textContent = '0';
      }
      if (srEl) srEl.textContent = expiredText;
    };

    const tick = () => {
      const msRemaining = deadlineMs - Date.now();
      if (msRemaining <= 0) {
        renderExpired();
        return false;
      }

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
          srEl.textContent = `Time left: ${formatSr(parts)}.`;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main, { once: true });
  } else {
    main();
  }
})();
