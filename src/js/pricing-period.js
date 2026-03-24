(function () {
  // Pricing period cutoffs (inclusive ranges)
  // Super Early Bird: January 1 - June 30
  // Early Bird: July 1 - September 15
  // Regular: October 1 - December 31
  const today = new Date();
  const month = today.getMonth(); // 0-indexed (0 = January)
  const day = today.getDate();

  // Determine active pricing period based on date
  let activeColumnIndex;
  let endDate;
  if (month < 5 || (month === 5 && day <= 30)) {
    // Super Early Bird: Jan 1 - June 30
    activeColumnIndex = 1;
    endDate = 'June 30';
  } else if (month < 8 || (month === 8 && day <= 15)) {
    // Early Bird: July 1 - September 15
    activeColumnIndex = 2;
    endDate = 'September 15';
  } else {
    // Regular: October 1 onwards
    activeColumnIndex = 3;
    endDate = null; // No end date for Regular (it's the final period)
  }

  // Highlight the active pricing period column
  const pricingTable = document.querySelector('.pricing-table');
  if (pricingTable) {
    const rows = pricingTable.querySelectorAll('tr');
    rows.forEach((row) => {
      const cells = row.querySelectorAll('th, td');
      if (cells[activeColumnIndex]) {
        cells[activeColumnIndex].classList.add('active-pricing-period');
      }
    });
  }

  // Add a label indicating the active period with tooltip
  const activeLabels = ['Super Early Bird', 'Early Bird', 'Regular'];
  const labelWrapper = document.createElement('div');
  labelWrapper.style.textAlign = 'center';
  labelWrapper.style.marginTop = '0.75rem';

  const activeLabel = document.createElement('span');
  activeLabel.className = 'text-md text-pnsqc-gold font-semibold';
  activeLabel.textContent = `Current Pricing: ${activeLabels[activeColumnIndex - 1]}`;
  labelWrapper.appendChild(activeLabel);

  // Add tooltip if there's an end date
  if (endDate) {
    const tooltipContainer = document.createElement('span');
    tooltipContainer.className = 'tooltip-container';
    tooltipContainer.style.marginLeft = '0.5rem';
    tooltipContainer.innerHTML = `
      <span class="tooltip-icon">i</span>
      <span class="tooltip-text"><strong>Ends ${endDate}</strong></span>
    `;
    labelWrapper.appendChild(tooltipContainer);
  }

  const pricingSection = pricingTable ? pricingTable.parentElement : null;
  if (pricingSection) {
    pricingSection.insertBefore(labelWrapper, pricingTable.nextSibling);
  }
})();
