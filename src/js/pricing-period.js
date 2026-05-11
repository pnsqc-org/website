(() => {
  const pricingTable = document.querySelector('.pricing-table');
  if (!pricingTable) return;

  const periods = [
    {
      month: 5,
      day: 30,
      columnIndex: 1,
      label: 'Super Early Bird',
      ctaSuffix: 'Super Early Bird pricing ends June 30',
      savings: 320,
      windowClose: 'June 30',
    },
    {
      month: 8,
      day: 15,
      columnIndex: 2,
      label: 'Early Bird',
      ctaSuffix: 'Early Bird pricing ends Sept 15',
      savings: 160,
      windowClose: 'Sept 15',
    },
  ];

  const getActivePeriod = (today = new Date()) => {
    const month = today.getMonth();
    const day = today.getDate();

    return (
      periods.find(
        (period) => month < period.month || (month === period.month && day <= period.day),
      ) || {
        columnIndex: 3,
        label: 'Regular',
        ctaSuffix: 'sales end October 11',
        savings: 0,
        windowClose: 'October 11',
      }
    );
  };

  const { columnIndex, label, ctaSuffix, savings, windowClose } = getActivePeriod();

  for (const row of pricingTable.rows) {
    row.cells[columnIndex]?.classList.add('active-pricing-period');
  }

  for (const suffix of document.querySelectorAll('[data-pricing-period-text]')) {
    suffix.textContent = ` - ${ctaSuffix}`;
  }

  const summary = document.createElement('div');
  summary.className = 'pricing-period-summary';

  const summaryLabel = document.createElement('span');
  summaryLabel.className = 'pricing-period-summary__label';
  summaryLabel.textContent = savings
    ? `Current pricing: ${label} - save up to $${savings} on registration compared to the regular price.`
    : `Current pricing: ${label} - sales end ${windowClose}.`;
  summary.appendChild(summaryLabel);

  pricingTable.insertAdjacentElement('afterend', summary);
})();
