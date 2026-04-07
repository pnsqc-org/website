(() => {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const getSlideWidth = (track) => track?.clientWidth ?? 0;
  const overflowThreshold = 6;
  const descriptionVoidTags = new Set(['BR', 'HR']);
  const visibleTextNodeFilter = {
    acceptNode(node) {
      return node?.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  };

  const parseEventTime = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const syncEventsMenuStatus = (hasUpcomingEvents) => {
    const menuDots = document.querySelectorAll('[data-events-menu-status-dot]');
    for (const dot of menuDots) {
      dot.classList.toggle('event-status--active', hasUpcomingEvents);
      dot.classList.toggle('event-status--inactive', !hasUpcomingEvents);
    }

    const menuSrLabels = document.querySelectorAll('[data-events-menu-status-sr]');
    for (const label of menuSrLabels) {
      label.textContent = hasUpcomingEvents ? 'Active events' : 'No active events';
    }
  };

  const syncEventState = (slide, nowMs) => {
    if (!slide) return;

    const start = parseEventTime(slide.dataset.eventStart);
    const end = parseEventTime(slide.dataset.eventEnd) ?? start;
    if (!end) return null;

    const isPast = end.getTime() < nowMs;
    slide.classList.toggle('is-past', isPast);
    slide.dataset.eventState = isPast ? 'past' : 'upcoming';

    const upcomingBadge = slide.querySelector('[data-event-upcoming-badge]');
    if (upcomingBadge) {
      upcomingBadge.hidden = isPast;
    }

    const pastBadge = slide.querySelector('[data-event-past-badge]');
    if (pastBadge) {
      pastBadge.hidden = !isPast;
    }

    return !isPast;
  };

  const syncEventStates = (root) => {
    const nowMs = Date.now();
    const slides = root.querySelectorAll('[data-carousel-slide]');
    let hasUpcomingEvents = false;
    for (const slide of slides) {
      const isUpcoming = syncEventState(slide, nowMs);
      hasUpcomingEvents = hasUpcomingEvents || isUpcoming === true;
    }
    syncEventsMenuStatus(hasUpcomingEvents);
  };

  const cloneChildNodes = (source) =>
    Array.from(source?.childNodes ?? [], (child) => child.cloneNode(true));

  const getDescriptionTextLength = (source) => {
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
    let total = 0;

    while (walker.nextNode()) {
      total += walker.currentNode.textContent.length;
    }

    return total;
  };

  const trimTextForEllipsis = (value) => {
    const trimmed = String(value ?? '').replace(/\s+$/u, '');
    if (!trimmed) return '...';
    if (trimmed.endsWith('...')) return trimmed;
    return `${trimmed}...`;
  };

  const appendEllipsis = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, visibleTextNodeFilter);
    let lastTextNode = null;

    while (walker.nextNode()) {
      lastTextNode = walker.currentNode;
    }

    if (lastTextNode) {
      lastTextNode.textContent = trimTextForEllipsis(lastTextNode.textContent);
      return;
    }

    root.appendChild(document.createTextNode('...'));
  };

  const buildDescriptionFragment = (source, characterLimit) => {
    const fragment = document.createDocumentFragment();
    let remainingCharacters = characterLimit;

    const appendWithinLimit = (node, parent) => {
      if (remainingCharacters <= 0) return false;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (!text) return true;

        if (text.length <= remainingCharacters) {
          parent.appendChild(document.createTextNode(text));
          remainingCharacters -= text.length;
          return true;
        }

        parent.appendChild(document.createTextNode(text.slice(0, remainingCharacters)));
        remainingCharacters = 0;
        return false;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return true;

      const clone = node.cloneNode(false);
      parent.appendChild(clone);

      if (descriptionVoidTags.has(clone.tagName)) {
        return remainingCharacters > 0;
      }

      for (const child of node.childNodes) {
        const keepGoing = appendWithinLimit(child, clone);
        if (!keepGoing) break;
      }

      if (!clone.hasChildNodes()) {
        clone.remove();
      }

      return remainingCharacters > 0;
    };

    for (const child of source.childNodes) {
      const keepGoing = appendWithinLimit(child, fragment);
      if (!keepGoing) break;
    }

    return fragment;
  };

  const previewFits = (viewport) => {
    return viewport.scrollHeight - viewport.clientHeight <= overflowThreshold;
  };

  const syncDescriptionPreview = (slide) => {
    if (!slide) return;

    const preview = slide.querySelector('[data-event-description-preview]');
    const previewContent = slide.querySelector('[data-event-description-preview-content]');
    const descriptionSource = slide.querySelector('[data-event-description-content]');
    const openButton = slide.querySelector('[data-event-description-open]');
    if (!preview || !previewContent || !descriptionSource || !openButton) return;

    previewContent.replaceChildren(...cloneChildNodes(descriptionSource));
    if (previewFits(preview)) return;

    const sourceTextLength = getDescriptionTextLength(descriptionSource);
    if (sourceTextLength <= 0) {
      previewContent.replaceChildren();
      return;
    }

    let low = 1;
    let high = sourceTextLength;
    let bestSnapshot = null;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = buildDescriptionFragment(descriptionSource, mid);
      appendEllipsis(candidate);
      previewContent.replaceChildren(candidate);

      if (previewFits(preview)) {
        bestSnapshot = cloneChildNodes(previewContent);
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (bestSnapshot) {
      previewContent.replaceChildren(...bestSnapshot);
      return;
    }

    previewContent.replaceChildren(document.createTextNode('...'));
  };

  const syncDescriptionPreviews = (slides) => {
    for (const slide of slides) {
      syncDescriptionPreview(slide);
    }
  };

  const createDescriptionModalController = () => {
    const modal = document.querySelector('[data-event-description-modal]');
    if (!modal) return null;

    const panel = modal.querySelector('[data-event-description-modal-panel]');
    const body = modal.querySelector('[data-event-description-modal-body]');
    const titleEl = modal.querySelector('[data-event-description-modal-title]');
    const labelEl = modal.querySelector('[data-event-description-modal-label]');
    const closeButton = modal.querySelector('[data-event-description-modal-close]');
    const backdrop = modal.querySelector('[data-event-description-modal-backdrop]');

    if (!panel || !body || !titleEl || !labelEl || !closeButton || !backdrop) {
      return null;
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

    const buildModalContent = (slide) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'space-y-5';

      const metaSource = slide.querySelector('[data-event-modal-meta]');
      if (metaSource) {
        const metaSection = document.createElement('section');
        metaSection.className = 'rounded-xl border border-white/10 bg-white/5 p-4';

        const metaClone = metaSource.cloneNode(true);
        metaClone.removeAttribute('data-event-modal-meta');
        metaClone.classList.add('space-y-3');

        metaSection.appendChild(metaClone);
        wrapper.appendChild(metaSection);
      }

      const descriptionSource = slide.querySelector('[data-event-description-content]');
      if (descriptionSource) {
        const descriptionSection = document.createElement('section');
        descriptionSection.className = 'rounded-xl border border-white/10 bg-white/5 p-4';

        const label = document.createElement('p');
        label.className = 'text-xs font-semibold uppercase tracking-wider text-white/80 mb-3';
        label.textContent = 'Full Description';
        descriptionSection.appendChild(label);

        const descriptionClone = descriptionSource.cloneNode(true);
        descriptionClone.removeAttribute('data-event-description-content');
        descriptionClone.removeAttribute('hidden');
        descriptionClone.classList.remove('hidden');
        descriptionClone.classList.add('leading-7');
        descriptionSection.appendChild(descriptionClone);

        wrapper.appendChild(descriptionSection);
      }

      return wrapper;
    };

    const openModal = (trigger) => {
      const slide = trigger.closest('[data-carousel-slide]');
      if (!slide) return;

      const titleText =
        slide.querySelector('[data-event-title]')?.textContent?.trim() || 'Event Details';
      const stateLabel =
        slide.dataset.eventState === 'past' ? 'Past Meetup Event' : 'Upcoming Meetup Event';

      body.replaceChildren(buildModalContent(slide));
      titleEl.textContent = titleText;
      labelEl.textContent = stateLabel;

      lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      modal.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
      closeButton.focus();
    };

    document.addEventListener('click', (event) => {
      const trigger =
        event.target instanceof Element
          ? event.target.closest('[data-event-description-open]')
          : null;
      if (!trigger) return;

      event.preventDefault();
      openModal(trigger);
    });

    closeButton.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    modal.addEventListener('click', (event) => {
      if (!panel.contains(event.target)) {
        closeModal();
      }
    });

    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    });

    return { closeModal };
  };

  const createFeaturedImageController = (root) => {
    const image = root.querySelector('[data-event-featured-image]');
    if (!(image instanceof HTMLImageElement)) {
      return () => {};
    }

    const fallbackSrc = image.dataset.fallbackSrc || image.getAttribute('src') || '';
    const fallbackAlt =
      image.dataset.fallbackAlt || image.getAttribute('alt') || 'PNSQC event image';
    const failedSources = new Set();

    const applyImage = (src, alt) => {
      image.dataset.currentSrc = src;
      image.alt = alt;
      if (src) {
        image.src = src;
      } else {
        image.removeAttribute('src');
      }
    };

    const applyFallback = () => {
      applyImage(fallbackSrc, fallbackAlt);
    };

    image.addEventListener('error', () => {
      const failedSrc = image.dataset.currentSrc || '';
      if (!failedSrc || failedSrc === fallbackSrc) return;

      failedSources.add(failedSrc);
      applyFallback();
    });

    return (slide) => {
      const nextSrc = slide?.dataset.eventImageUrl?.trim() || '';
      const nextAlt = slide?.dataset.eventImageAlt?.trim() || fallbackAlt;

      if (!nextSrc || failedSources.has(nextSrc)) {
        applyFallback();
        return;
      }

      if (image.dataset.currentSrc === nextSrc) {
        image.alt = nextAlt;
        return;
      }

      applyImage(nextSrc, nextAlt);
    };
  };

  const getActiveIndex = (track, slides) => {
    const slideWidth = getSlideWidth(track);
    if (!slideWidth || slides.length === 0) return 0;
    return clamp(Math.round(track.scrollLeft / slideWidth), 0, slides.length - 1);
  };

  const scrollToIndex = (track, slides, index) => {
    const slideWidth = getSlideWidth(track);
    if (!slideWidth || slides.length === 0) return;
    const safeIndex = clamp(index, 0, slides.length - 1);
    track.scrollTo({ left: safeIndex * slideWidth, behavior: scrollBehavior });
  };

  const initCarousel = (root) => {
    syncEventStates(root);

    const track = root.querySelector('[data-carousel-track]');
    const prevButton = root.querySelector('[data-carousel-prev]');
    const nextButton = root.querySelector('[data-carousel-next]');
    const dotsRoot = root.querySelector('[data-carousel-dots]');
    const slides = Array.from(root.querySelectorAll('[data-carousel-slide]'));
    const syncFeaturedImage = createFeaturedImageController(root);

    if (!track) return;

    syncDescriptionPreviews(slides);

    if (slides.length <= 1) {
      syncFeaturedImage(slides[0]);
      if (prevButton) prevButton.disabled = true;
      if (nextButton) nextButton.disabled = true;
      if (dotsRoot) dotsRoot.innerHTML = '';
      return;
    }

    const dots = [];

    if (dotsRoot) {
      dotsRoot.innerHTML = '';
      for (let i = 0; i < slides.length; i++) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className =
          'w-2.5 h-2.5 rounded-full bg-white/20 hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-pnsqc-gold/40 transition-colors';
        dot.setAttribute('aria-label', `Go to event ${i + 1}`);
        dot.addEventListener('click', () => scrollToIndex(track, slides, i));
        dotsRoot.appendChild(dot);
        dots.push(dot);
      }
    }

    let raf = 0;
    const updateUi = () => {
      raf = 0;
      const index = getActiveIndex(track, slides);

      syncFeaturedImage(slides[index]);

      if (prevButton) prevButton.disabled = index === 0;
      if (nextButton) nextButton.disabled = index === slides.length - 1;

      for (let i = 0; i < dots.length; i++) {
        const isActive = i === index;
        dots[i].setAttribute('aria-current', isActive ? 'true' : 'false');
        dots[i].className = isActive
          ? 'w-2.5 h-2.5 rounded-full bg-pnsqc-gold focus:outline-none focus:ring-2 focus:ring-pnsqc-gold/40 transition-colors'
          : 'w-2.5 h-2.5 rounded-full bg-white/20 hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-pnsqc-gold/40 transition-colors';
      }
    };

    const scheduleUpdate = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(updateUi);
    };

    track.addEventListener('scroll', scheduleUpdate, { passive: true });

    const resizeObserver =
      typeof window !== 'undefined' && 'ResizeObserver' in window
        ? new ResizeObserver(() => {
            const index = getActiveIndex(track, slides);
            scrollToIndex(track, slides, index);
            syncDescriptionPreviews(slides);
            scheduleUpdate();
          })
        : null;
    if (resizeObserver) resizeObserver.observe(track);

    if (prevButton) {
      prevButton.addEventListener('click', () => {
        const index = getActiveIndex(track, slides);
        scrollToIndex(track, slides, index - 1);
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', () => {
        const index = getActiveIndex(track, slides);
        scrollToIndex(track, slides, index + 1);
      });
    }

    track.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const index = getActiveIndex(track, slides);
      scrollToIndex(track, slides, index + (e.key === 'ArrowRight' ? 1 : -1));
    });

    // Align to an exact slide boundary on load (prevents partial-card starts).
    scrollToIndex(track, slides, getActiveIndex(track, slides));
    updateUi();
  };

  const init = () => {
    createDescriptionModalController();
    const carousels = Array.from(document.querySelectorAll('[data-carousel="recent-events"]'));
    for (const carousel of carousels) initCarousel(carousel);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
