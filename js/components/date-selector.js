/**
 * date-selector.js
 * Custom Dark Theme Date & Time Selector popover matching Material design aesthetics.
 */

(function () {
  let activePickerEl = null;

  /**
   * Opens the custom DateSelector popover.
   * @param {Object} options
   * @param {HTMLElement} options.targetElement - Element to position popover relative to (or trigger)
   * @param {string|null} options.initialDate - YYYY-MM-DD string
   * @param {string|null} options.initialTime - HH:MM string (24h)
   * @param {Object|null} options.initialRepeat - Repeat config
   * @param {Function} options.onSelect - Callback receiving { date, time, repeat }
   * @param {Function} options.onClear - Callback when cleared
   */
  function showDateSelector(options) {
    closeDateSelector();

    const {
      targetElement,
      initialDate,
      initialTime,
      initialRepeat,
      onSelect,
      onClear
    } = options;

    let selectedDate = initialDate || toDateStr(new Date());
    let selectedTime = initialTime || null;
    let selectedRepeat = initialRepeat || null;

    // Calendar view state
    let dateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
    if (isNaN(dateObj.getTime())) dateObj = new Date();
    let currentYear = dateObj.getFullYear();
    let currentMonth = dateObj.getMonth(); // 0-indexed

    // Create popover container
    const popover = document.createElement('div');
    popover.id = 'date-selector-popover';
    popover.className = 'date-selector-popover datetime-picker-popover';

    function renderPicker() {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthStr = monthNames[currentMonth];

      // Calculate calendar days
      const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0 (Sun) - 6 (Sat)
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

      let daysHtml = '';

      // Previous month padding days
      for (let i = firstDayOfMonth - 1; i >= 0; i--) {
        const dayNum = daysInPrevMonth - i;
        daysHtml += `<div class="dt-day-cell other-month">${dayNum}</div>`;
      }

      // Current month days
      const todayStr = toDateStr(new Date());
      for (let day = 1; day <= daysInMonth; day++) {
        const mm = String(currentMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const dayDateStr = `${currentYear}-${mm}-${dd}`;

        const isSelected = dayDateStr === selectedDate;
        const isToday = dayDateStr === todayStr;

        let classes = 'dt-day-cell';
        if (isSelected) classes += ' selected';
        if (isToday && !isSelected) classes += ' today';

        daysHtml += `<div class="${classes}" data-date="${dayDateStr}">${day}</div>`;
      }

      // Next month padding days to fill 5 or 6 rows (total multiple of 7)
      const totalCells = firstDayOfMonth + daysInMonth;
      const remainingCells = (7 - (totalCells % 7)) % 7;
      for (let i = 1; i <= remainingCells; i++) {
        daysHtml += `<div class="dt-day-cell other-month">${i}</div>`;
      }

      // Format time display for input (empty if null, placeholder shown)
      const formattedTime = selectedTime ? formatTime12(selectedTime) : '';

      popover.innerHTML = `
        <div class="dt-header">
          <div class="dt-month-year">${monthStr} ${currentYear}</div>
          <div class="dt-month-nav">
            <button class="dt-nav-btn" id="dt-prev-month" title="Previous Month">
              <img src="assets/icons/Down.png" alt="Prev" style="width:18px;height:18px;object-fit:contain;transform:rotate(90deg);" />
            </button>
            <button class="dt-nav-btn" id="dt-next-month" title="Next Month">
              <img src="assets/icons/Down.png" alt="Next" style="width:18px;height:18px;object-fit:contain;transform:rotate(-90deg);" />
            </button>
          </div>
        </div>

        <div class="dt-weekdays">
          <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
        </div>

        <div class="dt-days-grid">
          ${daysHtml}
        </div>

        <div class="dt-row dt-time-row">
          <div class="dt-row-icon">
            <img src="assets/icons/Clock.png" alt="Time" style="width:20px;height:20px;object-fit:contain;" />
          </div>
          <input type="text" class="dt-time-input" id="dt-time-input" value="${escAttr(formattedTime)}" placeholder="e.g. 9:30 AM" style="width:110px;" />
          <button class="dt-icon-btn" id="dt-today-btn" title="Set date to Today" style="margin-left:6px;width:34px;height:34px;border:1px solid rgba(255,255,255,0.1);background:#323338;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <img src="assets/icons/Calendar.png" alt="Today" style="width:18px;height:18px;object-fit:contain;" />
          </button>
        </div>

        <div class="dt-row dt-repeat-row">
          <div class="dt-row-icon">
            <img src="assets/icons/Repeat.png" alt="Repeat" style="width:20px;height:20px;object-fit:contain;" />
          </div>
          <select class="dt-repeat-select" id="dt-repeat-select">
            <option value="" ${!selectedRepeat ? 'selected' : ''}>Repeat: None</option>
            <option value="daily" ${selectedRepeat === 'daily' ? 'selected' : ''}>Every day</option>
            <option value="weekly" ${selectedRepeat === 'weekly' ? 'selected' : ''}>Every week</option>
            <option value="monthly" ${selectedRepeat === 'monthly' ? 'selected' : ''}>Every month</option>
            <option value="yearly" ${selectedRepeat === 'yearly' ? 'selected' : ''}>Every year</option>
          </select>
        </div>

        <div class="dt-footer">
          <button class="dt-icon-btn danger" id="dt-clear-btn" title="Clear Date & Time">
            <img src="assets/icons/Trash.png" alt="Clear" style="width:20px;height:20px;object-fit:contain;" />
          </button>
          <div style="flex:1"></div>
          <button class="dt-btn-text" id="dt-cancel-btn">Cancel</button>
          <button class="dt-btn-done" id="dt-done-btn">Done</button>
        </div>
      `;

      attachEvents();
    }

    function attachEvents() {
      // Month navigation
      popover.querySelector('#dt-prev-month').addEventListener('click', (e) => {
        e.stopPropagation();
        currentMonth--;
        if (currentMonth < 0) {
          currentMonth = 11;
          currentYear--;
        }
        renderPicker();
      });

      popover.querySelector('#dt-next-month').addEventListener('click', (e) => {
        e.stopPropagation();
        currentMonth++;
        if (currentMonth > 11) {
          currentMonth = 0;
          currentYear++;
        }
        renderPicker();
      });

      // Day selection
      popover.querySelectorAll('.dt-day-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedDate = cell.dataset.date;
          renderPicker();
        });
      });

      // Time input parsing
      const timeInput = popover.querySelector('#dt-time-input');
      timeInput.addEventListener('change', (e) => {
        const val = e.target.value.trim();
        const parsed = parseTimeString(val);
        if (parsed) selectedTime = parsed;
      });

      // Today button listener
      const todayBtn = popover.querySelector('#dt-today-btn');
      if (todayBtn) {
        todayBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const today = new Date();
          selectedDate = getTodayStr();
          currentYear = today.getFullYear();
          currentMonth = today.getMonth();
          renderPicker();
        });
      }

      // Repeat select
      const repeatSelect = popover.querySelector('#dt-repeat-select');
      repeatSelect.addEventListener('change', (e) => {
        selectedRepeat = e.target.value || null;
      });

      // Clear button
      popover.querySelector('#dt-clear-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (onClear) onClear();
        closeDateSelector();
      });

      // Cancel button
      popover.querySelector('#dt-cancel-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        closeDateSelector();
      });

      // Done button
      popover.querySelector('#dt-done-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        // Parse time input one final time
        const val = timeInput.value.trim();
        const parsed = parseTimeString(val);
        if (parsed) selectedTime = parsed;

        if (onSelect) {
          onSelect({
            date: selectedDate,
            time: selectedTime,
            repeat: selectedRepeat
          });
        }
        closeDateSelector();
      });
    }

    document.body.appendChild(popover);
    activePickerEl = popover;

    // Positioning popover near targetElement
    positionPopover(popover, targetElement);

    renderPicker();

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', onOutsideClick);
    }, 10);
  }

  function positionPopover(popover, targetElement) {
    if (!targetElement) {
      popover.style.top = '50%';
      popover.style.left = '50%';
      popover.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const popWidth = 280;
    const popHeight = 420;

    let top = rect.bottom + 8;
    let left = rect.left;

    // Screen bounds adjustment
    if (left + popWidth > window.innerWidth - 12) {
      left = window.innerWidth - popWidth - 12;
    }
    if (top + popHeight > window.innerHeight - 12) {
      top = rect.top - popHeight - 8;
    }
    if (top < 12) top = 12;
    if (left < 12) left = 12;

    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
  }

  function onOutsideClick(e) {
    if (activePickerEl && !activePickerEl.contains(e.target)) {
      closeDateSelector();
    }
  }

  function closeDateSelector() {
    if (activePickerEl) {
      activePickerEl.remove();
      activePickerEl = null;
    }
    document.removeEventListener('click', onOutsideClick);
  }

  function parseTimeString(str) {
    if (!str) return null;
    str = str.toLowerCase();
    let isPM = str.includes('pm');
    let clean = str.replace(/[^\d:]/g, '');
    let parts = clean.split(':');
    let h = parseInt(parts[0], 10);
    let m = parts[1] ? parseInt(parts[1], 10) : 0;
    if (isNaN(h)) return null;
    if (isPM && h < 12) h += 12;
    if (!isPM && str.includes('am') && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  window.showDateSelector = showDateSelector;
  window.closeDateSelector = closeDateSelector;
})();
