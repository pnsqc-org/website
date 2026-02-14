(() => {
  const FRAME_NAME = 'substack-frame';

  const initForm = (form) => {
    const msgEl = form.parentElement.querySelector('[data-substack-msg]');
    const emailInput = form.querySelector('input[name="email"]');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!msgEl || !emailInput || !submitBtn) return;

    const defaultBtnText = submitBtn.textContent;

    // Create a hidden iframe to receive the form POST.
    // Regular form submissions are not blocked by CORS (unlike fetch).
    const iframe = document.createElement('iframe');
    iframe.name = FRAME_NAME;
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    form.parentElement.appendChild(iframe);

    // Redirect form into the hidden iframe instead of _blank
    form.target = FRAME_NAME;

    form.addEventListener('submit', () => {
      // Show loading state (don't preventDefault — let the form POST normally)
      submitBtn.disabled = true;
      submitBtn.textContent = 'Subscribing\u2026';
      emailInput.disabled = true;

      // When the iframe finishes loading the Substack response, show success
      iframe.addEventListener('load', () => {
        msgEl.textContent = 'Check your email to confirm your subscription.';
        msgEl.classList.remove('text-pnsqc-slate/60');
        msgEl.classList.add('text-pnsqc-cyan');
        emailInput.value = '';
        emailInput.disabled = false;
        submitBtn.disabled = false;
        submitBtn.textContent = defaultBtnText;
      }, { once: true });
    });
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
