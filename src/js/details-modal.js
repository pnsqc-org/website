(() => {
  const createModalController = (refs) => {
    if (Object.values(refs).some((element) => !element)) return null;
    const { modal, panel, body, titleEl, labelEl, closeButton, backdrop } = refs;

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

    const openModal = ({ content, title = 'Details', label = 'Overview', trigger } = {}) => {
      body.replaceChildren(...(content ? [content] : []));
      titleEl.textContent = title;
      labelEl.textContent = label;
      lastFocused = trigger instanceof HTMLElement ? trigger : document.activeElement;

      modal.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
      closeButton.focus();
    };

    closeButton.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => !panel.contains(event.target) && closeModal());

    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    });

    return { closeModal, openModal };
  };

  const buildModalRefs = (modal, prefix) => ({
    modal,
    panel: modal?.querySelector(`[data-${prefix}-panel]`),
    body: modal?.querySelector(`[data-${prefix}-body]`),
    titleEl: modal?.querySelector(`[data-${prefix}-title]`),
    labelEl: modal?.querySelector(`[data-${prefix}-label]`),
    closeButton: modal?.querySelector(`[data-${prefix}-close]`),
    backdrop: modal?.querySelector(`[data-${prefix}-backdrop]`),
  });

  const createModalControllerFromRoot = (modal, prefix) =>
    createModalController(buildModalRefs(modal, prefix));

  const createDetailsModalShell = () => {
    if (!document.body) return null;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 hidden';
    modal.setAttribute('data-details-modal', '');
    modal.innerHTML = `
      <div class="modal-backdrop" data-details-modal-backdrop></div>
      <div class="modal-shell">
        <div
          class="modal-panel modal-panel--solid"
          role="dialog"
          aria-modal="true"
          aria-labelledby="details-modal-title"
          data-details-modal-panel
        >
          <div class="modal-header">
            <div>
              <p class="modal-label" data-details-modal-label>Details</p>
              <h3 id="details-modal-title" class="modal-title" data-details-modal-title>
                Details
              </h3>
            </div>
            <button
              type="button"
              class="modal-close"
              aria-label="Close details"
              data-details-modal-close
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6 6 18"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
          <div class="modal-body" data-details-modal-body></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  };

  window.PNSQCModal = {
    ...(window.PNSQCModal || {}),
    buildModalRefs,
    createModalController,
    createModalControllerFromRoot,
    createDetailsModalShell,
  };

  const detailsModal = document.querySelector('[data-details-modal]') || createDetailsModalShell();
  const modalController = createModalControllerFromRoot(detailsModal, 'details-modal');
  if (!modalController) return;

  document.addEventListener('click', (event) => {
    const trigger =
      event.target instanceof Element ? event.target.closest('[data-details-modal-open]') : null;
    if (!trigger) return;

    const templateId = trigger.getAttribute('data-details-modal-open');
    const template = templateId ? document.getElementById(templateId) : null;
    if (!(template instanceof HTMLTemplateElement)) return;

    modalController.openModal({
      content: template.content.cloneNode(true),
      title: trigger.getAttribute('data-details-modal-title') || 'Details',
      label: trigger.getAttribute('data-details-modal-label') || 'Overview',
      trigger,
    });
  });
})();
