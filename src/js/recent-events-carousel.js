(() => {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const getSlideWidth = (track) => track?.clientWidth ?? 0;

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
    const track = root.querySelector('[data-carousel-track]');
    const prevButton = root.querySelector('[data-carousel-prev]');
    const nextButton = root.querySelector('[data-carousel-next]');
    const dotsRoot = root.querySelector('[data-carousel-dots]');
    const slides = Array.from(root.querySelectorAll('[data-carousel-slide]'));

    if (!track || slides.length <= 1) return;

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
    const carousels = Array.from(document.querySelectorAll('[data-carousel="recent-events"]'));
    for (const carousel of carousels) initCarousel(carousel);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
