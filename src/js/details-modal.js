(() => {
  const detailsModal = document.querySelector('[data-details-modal]');
  if (!detailsModal) return;

  const panel = detailsModal.querySelector('[data-details-modal-panel]');
  const body = detailsModal.querySelector('[data-details-modal-body]');
  const titleEl = detailsModal.querySelector('[data-details-modal-title]');
  const labelEl = detailsModal.querySelector('[data-details-modal-label]');
  const closeButton = detailsModal.querySelector('[data-details-modal-close]');
  const backdrop = detailsModal.querySelector('[data-details-modal-backdrop]');

  if (!panel || !body || !titleEl || !labelEl || !closeButton || !backdrop) {
    return;
  }

  let lastFocused = null;

  const closeModal = () => {
    if (detailsModal.classList.contains('hidden')) return;

    detailsModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    body.replaceChildren();

    if (lastFocused instanceof HTMLElement) {
      lastFocused.focus();
    }
    lastFocused = null;
  };

  const openModal = (trigger) => {
    const templateId = trigger.getAttribute('data-details-modal-open');
    const template = templateId ? document.getElementById(templateId) : null;
    if (!(template instanceof HTMLTemplateElement)) return;

    body.replaceChildren(template.content.cloneNode(true));
    titleEl.textContent = trigger.getAttribute('data-details-modal-title') || 'Details';
    labelEl.textContent = trigger.getAttribute('data-details-modal-label') || 'Overview';

    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    detailsModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    closeButton.focus();
  };

  document.addEventListener('click', (event) => {
    const trigger =
      event.target instanceof Element ? event.target.closest('[data-details-modal-open]') : null;
    if (!trigger) return;
    openModal(trigger);
  });

  closeButton.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  // Close when clicking outside the modal panel (on backdrop or wrapper)
  detailsModal.addEventListener('click', (event) => {
    if (!panel.contains(event.target)) {
      closeModal();
    }
  });

  detailsModal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  });
})();
