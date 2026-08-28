/**
 * nlp-quickadd.js
 * Regex-based natural language parser for quick-add inputs.
 */

// ===== NLP PARSER (browser-compatible, replaces chrono-node) =====
function parseNaturalLanguage(text) {
  const result = { title: text, priority: null, tags: [], projectName: null, dueDate: null, dueTime: null, recurring: null };
  let cleaned = text;

  // Priority extraction
  const prioKeyword = cleaned.match(/\b(p[1-4])\b/i);
  if (prioKeyword) {
    result.priority = prioKeyword[1].toUpperCase();
    cleaned = cleaned.replace(prioKeyword[0], '');
  } else if (cleaned.includes('!!!')) {
    result.priority = 'P1'; cleaned = cleaned.replace('!!!', '');
  } else if (cleaned.includes('!!')) {
    result.priority = 'P2'; cleaned = cleaned.replace('!!', '');
  }

  // Tag extraction
  const tagRe = /@(\w+)/g;
  let tagMatch;
  while ((tagMatch = tagRe.exec(cleaned)) !== null) result.tags.push('@' + tagMatch[1]);
  cleaned = cleaned.replace(/@\w+/g, '');

  // Project extraction
  const projMatch = cleaned.match(/#(\w+)/);
  if (projMatch) { result.projectName = projMatch[1]; cleaned = cleaned.replace(/#\w+/g, ''); }

  // Recurring pattern extraction
  const dailyMatch = cleaned.match(/\b(every\s+single\s+day|every\s+day|daily|everyday|each\s+day)\b/i);
  if (dailyMatch) {
    result.recurring = 'daily';
    cleaned = cleaned.replace(dailyMatch[0], '');
  }

  const weekdaysMatch = cleaned.match(/\b(every\s+weekday|weekdays|every\s+workday|every\s+work\s+day)\b/i);
  if (weekdaysMatch) {
    result.recurring = 'weekdays';
    cleaned = cleaned.replace(weekdaysMatch[0], '');
  }

  const weeklyMatch = cleaned.match(/\b(every\s+week|weekly|each\s+week)\b/i);
  if (weeklyMatch) {
    result.recurring = 'weekly';
    cleaned = cleaned.replace(weeklyMatch[0], '');
  }

  const everyDayNameMatch = cleaned.match(/\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i);
  if (everyDayNameMatch) {
    result.recurring = 'weekly';
    cleaned = cleaned.replace(everyDayNameMatch[0], '');
  }

  const monthlyMatch = cleaned.match(/\b(every\s+month|monthly|each\s+month)\b/i);
  if (monthlyMatch) {
    result.recurring = 'monthly';
    cleaned = cleaned.replace(monthlyMatch[0], '');
  }

  const yearlyMatch = cleaned.match(/\b(every\s+year|yearly|annually|annual|each\s+year)\b/i);
  if (yearlyMatch) {
    result.recurring = 'yearly';
    cleaned = cleaned.replace(yearlyMatch[0], '');
  }

  const intervalMatch = cleaned.match(/\bevery\s+(\d+)\s+(days?|weeks?|months?|years?)\b/i);
  if (intervalMatch) {
    result.recurring = `every ${intervalMatch[1]} ${intervalMatch[2].toLowerCase()}`;
    cleaned = cleaned.replace(intervalMatch[0], '');
  }

  // Date and time extraction (browser-compatible, replaces chrono-node)
  const today = new Date();
  const dayNamesFull = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // "today" / "tod"
  let dateMatch = cleaned.match(/\b(today|tod)\b/i);
  if (dateMatch) {
    result.dueDate = toISODate(today);
    cleaned = cleaned.replace(dateMatch[0], '');
  }

  // "tomorrow" / "tmr" / "tmrw"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\b(tomorrow|tmr|tmrw)\b/i);
    if (dateMatch) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      result.dueDate = toISODate(d);
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // "yesterday"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\byesterday\b/i);
    if (dateMatch) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      result.dueDate = toISODate(d);
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // "next monday", "next friday", etc.
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i);
    if (dateMatch) {
      const rawDay = dateMatch[1].toLowerCase();
      let targetDay = dayNamesFull.findIndex(d => d.startsWith(rawDay.slice(0, 3)));
      if (targetDay !== -1) {
        const d = new Date(today);
        let diff = targetDay - d.getDay();
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
        result.dueDate = toISODate(d);
        cleaned = cleaned.replace(dateMatch[0], '');
      }
    }
  }

  // "on monday", "on friday", "fri", "monday", etc.
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i);
    if (dateMatch) {
      const rawDay = dateMatch[1].toLowerCase();
      let targetDay = dayNamesFull.findIndex(d => d.startsWith(rawDay.slice(0, 3)));
      if (targetDay !== -1) {
        const d = new Date(today);
        let diff = targetDay - d.getDay();
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
        result.dueDate = toISODate(d);
        cleaned = cleaned.replace(dateMatch[0], '');
      }
    }
  }

  // "in X days" / "in X weeks" / "in a week"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\bin\s+(?:(\d+)\s+(days?|weeks?)|a\s+week)\b/i);
    if (dateMatch) {
      const d = new Date(today);
      if (dateMatch[0].toLowerCase().includes('week')) {
        const numWeeks = dateMatch[1] ? parseInt(dateMatch[1], 10) : 1;
        d.setDate(d.getDate() + numWeeks * 7);
      } else if (dateMatch[1]) {
        d.setDate(d.getDate() + parseInt(dateMatch[1], 10));
      }
      result.dueDate = toISODate(d);
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // "Sep 01", "sep 1", "sept 1st", "Jan 15", "December 3", etc.
  if (!result.dueDate) {
    const monthMap = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, sept: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11
    };
    const monthNamesPattern = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec';

    // Month + Day ("Sep 01", "sep 1", "sep1", "sep01")
    dateMatch = cleaned.match(new RegExp(`\\b(${monthNamesPattern})\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, 'i'));
    if (dateMatch) {
      const monthStr = dateMatch[1].toLowerCase();
      const monthIdx = monthMap[monthStr];
      const day = parseInt(dateMatch[2], 10);
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : today.getFullYear();
        const d = new Date(year, monthIdx, day);
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (!dateMatch[3] && d < todayZero) d.setFullYear(d.getFullYear() + 1);
        result.dueDate = toISODate(d);
        cleaned = cleaned.replace(dateMatch[0], '');
      }
    }

    // Day + Month ("01 sep", "1 sep", "1sep", "01sep", "1st sep")
    if (!result.dueDate) {
      dateMatch = cleaned.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${monthNamesPattern})(?:\\s*,?\\s*(\\d{4}))?\\b`, 'i'));
      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const monthStr = dateMatch[2].toLowerCase();
        const monthIdx = monthMap[monthStr];
        if (monthIdx !== undefined && day >= 1 && day <= 31) {
          const year = dateMatch[3] ? parseInt(dateMatch[3], 10) : today.getFullYear();
          const d = new Date(year, monthIdx, day);
          const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          if (!dateMatch[3] && d < todayZero) d.setFullYear(d.getFullYear() + 1);
          result.dueDate = toISODate(d);
          cleaned = cleaned.replace(dateMatch[0], '');
        }
      }
    }
  }

  // "12/25", "12/25/2026", "2026-12-25"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (dateMatch) {
      const m = parseInt(dateMatch[1], 10) - 1;
      const d = parseInt(dateMatch[2], 10);
      let y = dateMatch[3] ? parseInt(dateMatch[3], 10) : today.getFullYear();
      if (y < 100) y += 2000;
      const dt = new Date(y, m, d);
      if (!dateMatch[3] && dt < today) dt.setFullYear(dt.getFullYear() + 1);
      result.dueDate = toISODate(dt);
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // ISO date "2026-08-25"
  if (!result.dueDate) {
    dateMatch = cleaned.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (dateMatch) {
      result.dueDate = dateMatch[0];
      cleaned = cleaned.replace(dateMatch[0], '');
    }
  }

  // Time extraction:
  // Format A: compact "915pm", "915p", "915a", "1130p", "100p"
  let timeMatch = cleaned.match(/\b(?:at\s+)?([1-9]|1[0-2])([0-5]\d)\s*(am|pm|a|p)\b/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[3].toLowerCase();
    if ((ampm === 'pm' || ampm === 'p') && h < 12) h += 12;
    if ((ampm === 'am' || ampm === 'a') && h === 12) h = 0;
    result.dueTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    cleaned = cleaned.replace(timeMatch[0], '');
  }

  // Format B: standard "3pm", "3p", "3a", "9:15pm", "9:15p", "10:30am", "10:30a"
  if (!result.dueTime) {
    timeMatch = cleaned.match(/\b(?:at\s+)?([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm|a|p)\b/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3].toLowerCase();
      if ((ampm === 'pm' || ampm === 'p') && h < 12) h += 12;
      if ((ampm === 'am' || ampm === 'a') && h === 12) h = 0;
      result.dueTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      cleaned = cleaned.replace(timeMatch[0], '');
    }
  }

  // Format C: 24-hour time or "at HH:MM"
  if (!result.dueTime) {
    timeMatch = cleaned.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i);
    if (timeMatch) {
      result.dueTime = `${String(timeMatch[1]).padStart(2, '0')}:${String(timeMatch[2]).padStart(2, '0')}`;
      cleaned = cleaned.replace(timeMatch[0], '');
    }
  }

  // If a time was specified without an explicit date, default the due date to today
  if (result.dueTime && !result.dueDate) {
    result.dueDate = toISODate(today);
  }

  result.title = cleaned.replace(/\s+/g, ' ').trim();
  return result;
}

function toISODate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}


export { parseNaturalLanguage };
