(() => {
  const FRAME_NAME = 'substack-frame';

  const initForm = (form) => {
    const wrapper = form.parentElement;
    const msgEl = wrapper.querySelector('[data-substack-msg]');
    const emailInput = form.querySelector('input[name="email"]');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!msgEl || !emailInput || !submitBtn) return;

    const defaultBtnText = submitBtn.textContent;

    // Create a hidden iframe to receive the form POST.
    // Regular form submissions are not blocked by CORS (unlike fetch).
    const iframe = document.createElement('iframe');
    iframe.name = FRAME_NAME;
    iframe.style.cssText =
      'display:none;width:100%;border:none;border-radius:0.75rem;' +
      'color-scheme:light;background:white;min-height:120px;';
    iframe.setAttribute('aria-hidden', 'true');

    // "Try another email" link (hidden initially)
    const retryLink = document.createElement('button');
    retryLink.type = 'button';
    retryLink.textContent = 'Subscribe another email';
    retryLink.className =
      'mt-3 text-sm text-pnsqc-gold hover:text-pnsqc-gold-light transition-colors underline underline-offset-2';
    retryLink.style.display = 'none';

    retryLink.addEventListener('click', () => {
      form.style.display = '';
      iframe.style.display = 'none';
      iframe.removeAttribute('src');
      retryLink.style.display = 'none';
      msgEl.style.display = '';
      emailInput.disabled = false;
      submitBtn.disabled = false;
      submitBtn.textContent = defaultBtnText;
    });

    // Insert iframe + retry link after the form
    form.after(iframe, retryLink);

    // Redirect form into the hidden iframe instead of _blank
    form.target = FRAME_NAME;

    form.addEventListener('submit', () => {
      // Show loading state (don't preventDefault — let the form POST normally)
      submitBtn.disabled = true;
      submitBtn.textContent = 'Subscribing\u2026';
      emailInput.disabled = true;

      // When the iframe finishes loading the Substack response, reveal it
      iframe.addEventListener('load', () => {
        form.style.display = 'none';
        msgEl.style.display = 'none';
        iframe.style.display = 'block';
        iframe.removeAttribute('aria-hidden');
        retryLink.style.display = '';
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
