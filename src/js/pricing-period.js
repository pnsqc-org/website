(() => {
  const pricingTable = document.querySelector('.pricing-table');
  if (!pricingTable) return;

  const periods = [
    { month: 5, day: 30, columnIndex: 1, label: 'Super Early Bird', endDate: 'June 30' },
    { month: 8, day: 15, columnIndex: 2, label: 'Early Bird', endDate: 'September 15' },
  ];

  const getActivePeriod = (today = new Date()) => {
    const month = today.getMonth();
    const day = today.getDate();

    return (
      periods.find(
        (period) => month < period.month || (month === period.month && day <= period.day),
      ) || { columnIndex: 3, label: 'Regular', endDate: '' }
    );
  };

  const createTooltip = (text) => {
    const container = document.createElement('span');
    container.className = 'tooltip-container';

    const icon = document.createElement('span');
    icon.className = 'tooltip-icon';
    icon.textContent = 'i';
    container.appendChild(icon);

    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip-text';

    const strong = document.createElement('strong');
    strong.textContent = text;
    tooltip.appendChild(strong);

    container.appendChild(tooltip);
    return container;
  };

  const { columnIndex, label, endDate } = getActivePeriod();

  for (const row of pricingTable.rows) {
    row.cells[columnIndex]?.classList.add('active-pricing-period');
  }

  const summary = document.createElement('div');
  summary.className = 'pricing-period-summary';

  const summaryLabel = document.createElement('span');
  summaryLabel.className = 'pricing-period-summary__label';
  summaryLabel.textContent = `Current Pricing: ${label}`;
  summary.appendChild(summaryLabel);

  if (endDate) {
    summary.appendChild(createTooltip(`Ends ${endDate}`));
  }

  pricingTable.insertAdjacentElement('afterend', summary);
})();
