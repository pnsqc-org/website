(() => {
  const ENDPOINT = 'https://pnsqcnewsletter.substack.com/api/v1/free';

  const initForm = (form) => {
    const msgEl = form.parentElement.querySelector('[data-substack-msg]');
    const emailInput = form.querySelector('input[name="email"]');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!msgEl || !emailInput || !submitBtn) return;

    const defaultMsg = msgEl.textContent;
    const defaultBtnText = submitBtn.textContent;

    const setMsg = (text, isError) => {
      msgEl.textContent = text;
      msgEl.classList.toggle('text-red-400', isError);
      msgEl.classList.toggle('text-pnsqc-slate/60', !isError && !text.includes('Check your'));
      msgEl.classList.toggle('text-pnsqc-cyan', !isError && text.includes('Check your'));
    };

    const setLoading = (loading) => {
      submitBtn.disabled = loading;
      submitBtn.textContent = loading ? 'Subscribing\u2026' : defaultBtnText;
      emailInput.disabled = loading;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = emailInput.value.trim();
      if (!email) return;

      setLoading(true);
      setMsg(defaultMsg, false);

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            first_url: window.location.href,
            first_referrer: document.referrer || '',
          }),
        });

        if (res.ok) {
          setMsg('Check your email to confirm your subscription.', false);
          emailInput.value = '';
        } else {
          const data = await res.json().catch(() => null);
          const serverMsg = data?.errors?.[0]?.msg || data?.error;
          setMsg(serverMsg || 'Something went wrong. Please try again.', true);
        }
      } catch {
        // Network error — fall back to normal form submission
        form.removeAttribute('data-substack-form');
        form.submit();
        return;
      } finally {
        setLoading(false);
      }
    });

    // JS is active — no need for the fallback target="_blank"
    form.removeAttribute('target');
  };

  const main = () => {
    document.querySelectorAll('[data-substack-form]').forEach(initForm);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main, { once: true });
  } else {
    main();
  }
})();
