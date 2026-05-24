/* global module */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PNSQCSlugs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const slugify = (value, fallback = 'item') => {
    const slug = String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/['\u2019]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || fallback;
  };

  const assignGeneratedSlugs = (items, { getText, getId, fallback = 'item' } = {}) => {
    const records = Array.isArray(items) ? items : [];
    const baseSlugs = records.map((item) => slugify(getText?.(item) || '', fallback));
    const counts = new Map();

    baseSlugs.forEach((baseSlug) => {
      counts.set(baseSlug, (counts.get(baseSlug) || 0) + 1);
    });

    return records.map((item, index) => {
      const baseSlug = baseSlugs[index];
      if ((counts.get(baseSlug) || 0) < 2) return { ...item, slug: baseSlug };

      const id = slugify(getId?.(item) || index + 1, String(index + 1));
      return { ...item, slug: `${baseSlug}-${id}` };
    });
  };

  return {
    assignGeneratedSlugs,
    slugify,
  };
});
