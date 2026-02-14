(() => {
  const ENDPOINT = 'https://pnsqcnewsletter.substack.com/api/v1/free';

  const initForm = (form) => {
    const msgEl = form.parentElement.querySelector('[data-substack-msg]');
    const emailInput = form.querySelector('input[name="email"]');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!msgEl || !emailInput || !submitBtn) return;

    const defaultBtnText = submitBtn.textContent;
    const defaultMsg = msgEl.textContent;

    const showMsg = (text, type) => {
      msgEl.textContent = text;
      msgEl.className = 'mt-3 text-sm';
      if (type === 'success') msgEl.classList.add('text-pnsqc-cyan');
      else if (type === 'error') msgEl.classList.add('text-red-400');
      else msgEl.classList.add('text-pnsqc-slate/60');
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
      showMsg(defaultMsg, 'default');

      try {
        // mode: 'no-cors' sends the POST without CORS preflight.
        // The request reaches Substack and is processed, but the
        // response is opaque (status 0) so we can't read it.
        await fetch(ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            email,
            first_url: window.location.href,
            first_referrer: document.referrer || '',
          }),
        });

        // Request was sent — show success message
        showMsg(
          'Thanks! If you\u2019re a new subscriber, check your email to confirm.',
          'success',
        );
        emailInput.value = '';
      } catch {
        // Network failure — let the user know
        showMsg('Network error \u2014 please try again.', 'error');
      } finally {
        setLoading(false);
      }
    });

    // JS is active — prevent the fallback target="_blank" navigation
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
