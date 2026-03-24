(() => {
  const modal = document.querySelector('[data-track-modal]');
  if (!modal) return;

  const panel = modal.querySelector('[data-track-modal-panel]');
  const body = modal.querySelector('[data-track-modal-body]');
  const titleEl = modal.querySelector('[data-track-modal-title]');
  const labelEl = modal.querySelector('[data-track-modal-label]');
  const closeButton = modal.querySelector('[data-track-modal-close]');
  const backdrop = modal.querySelector('[data-track-modal-backdrop]');

  if (!panel || !body || !titleEl || !labelEl || !closeButton || !backdrop) {
    return;
  }

  let lastFocused = null;

  const closeModal = () => {
    if (modal.classList.contains('hidden')) return;

    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    body.replaceChildren();

    if (lastFocused instanceof HTMLElement) {
      lastFocused.focus();
    }
    lastFocused = null;
  };

  const openModal = (trigger) => {
    const templateId = trigger.getAttribute('data-track-modal-open');
    const template = templateId ? document.getElementById(templateId) : null;
    if (!(template instanceof HTMLTemplateElement)) return;

    body.replaceChildren(template.content.cloneNode(true));
    titleEl.textContent = trigger.getAttribute('data-track-modal-title') || 'Track Details';
    labelEl.textContent = trigger.getAttribute('data-track-modal-label') || 'Track';

    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    closeButton.focus();
  };

  document.addEventListener('click', (event) => {
    const trigger =
      event.target instanceof Element ? event.target.closest('[data-track-modal-open]') : null;
    if (!trigger) return;
    openModal(trigger);
  });

  closeButton.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  });
})();
