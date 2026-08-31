/**
 * nlp-parser.js
 * Natural language date, tag, priority, and project token parser.
 */

function toISODate(d) {
  if (!d) return null;
  const dt = new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Natural language token parser & highlight generator
 */
function parseTaskInputTokens(text, dismissedTokens = []) {
  if (!text) {
    return {
      cleanTitle: '',
      dueDate: null,
      dueTime: null,
      priority: null,
      tags: [],
      projectName: null,
      highlightHtml: '',
      tokens: []
    };
  }

  const isDismissed = (start, end, tokenText) => {
    if (!dismissedTokens || dismissedTokens.length === 0) return false;
    return dismissedTokens.some(d => {
      return d.start === start && d.text.toLowerCase() === tokenText.toLowerCase();
    });
  };

  const tokens = [];
  const today = new Date();
  const dayNamesFull = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // 1. Priority: \b(p[1-4])\b or !!! or !!
  let m;
  const prioRegex = /\b(p[1-4])\b/gi;
  while ((m = prioRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'prio',
        value: m[1].toUpperCase(),
        text: m[0]
      });
    }
  }

  const exclRegex = /(!{2,3})/g;
  while ((m = exclRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'prio',
        value: m[0].length === 3 ? 'P1' : 'P2',
        text: m[0]
      });
    }
  }

  // 2. Tags: @\w+
  const tagRegex = /@(\w+)/g;
  while ((m = tagRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'tag',
        value: '@' + m[1],
        text: m[0]
      });
    }
  }

  // 3. Project: #\w+
  const projRegex = /#(\w+)/g;
  while ((m = projRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'project',
        value: m[1],
        text: m[0]
      });
    }
  }

  // 4. Recurring Keywords:
  // "every day", "daily", "everyday", "each day", "every single day"
  const dailyRegex = /\b(every\s+single\s+day|every\s+day|daily|everyday|each\s+day)\b/gi;
  while ((m = dailyRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'recurring',
        value: 'daily',
        text: m[0]
      });
    }
  }

  // "every weekday", "weekdays", "every workday", "every work day"
  const weekdaysRegex = /\b(every\s+weekday|weekdays|every\s+workday|every\s+work\s+day)\b/gi;
  while ((m = weekdaysRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'recurring',
        value: 'weekdays',
        text: m[0]
      });
    }
  }

  // "every week", "weekly", "each week"
  const weeklyRegex = /\b(every\s+week|weekly|each\s+week)\b/gi;
  while ((m = weeklyRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'recurring',
        value: 'weekly',
        text: m[0]
      });
    }
  }

  // "every monday", "every tue", "every friday", etc.
  const everyWeekdayRegex = /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/gi;
  while ((m = everyWeekdayRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      const rawDay = m[1].toLowerCase();
      const targetDay = dayNamesFull.findIndex(d => d.startsWith(rawDay.slice(0, 3)));
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'recurring',
        value: 'weekly',
        targetDay: targetDay !== -1 ? targetDay : undefined,
        text: m[0]
      });
    }
  }

  // "every month", "monthly", "each month"
  const monthlyRegex = /\b(every\s+month|monthly|each\s+month)\b/gi;
  while ((m = monthlyRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'recurring',
        value: 'monthly',
        text: m[0]
      });
    }
  }

  // "every year", "yearly", "annually", "annual", "each year"
  const yearlyRegex = /\b(every\s+year|yearly|annually|annual|each\s+year)\b/gi;
  while ((m = yearlyRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'recurring',
        value: 'yearly',
        text: m[0]
      });
    }
  }

  // "every 2 days", "every 3 weeks", etc.
  const intervalRegex = /\bevery\s+(\d+)\s+(days?|weeks?|months?|years?)\b/gi;
  while ((m = intervalRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'recurring',
        value: `every ${m[1]} ${m[2].toLowerCase()}`,
        text: m[0]
      });
    }
  }

  // 5. Dates:
  // "today", "tod"
  const todayRegex = /\b(today|tod)\b/gi;
  while ((m = todayRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'date',
        value: toISODate(today),
        text: m[0]
      });
    }
  }

  // "tomorrow", "tmr", "tmrw"
  const tmrRegex = /\b(tomorrow|tmr|tmrw)\b/gi;
  while ((m = tmrRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'date',
        value: toISODate(d),
        text: m[0]
      });
    }
  }

  // "yesterday"
  const yestRegex = /\b(yesterday)\b/gi;
  while ((m = yestRegex.exec(text)) !== null) {
    if (!isDismissed(m.index, m.index + m[0].length, m[0])) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'date',
        value: toISODate(d),
        text: m[0]
      });
    }
  }

  // "in X days" / "in X weeks" / "in a week"
  const inDaysRegex = /\bin\s+(?:(\d+)\s+(days?|weeks?)|a\s+week)\b/gi;
  while ((m = inDaysRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const d = new Date(today);
      if (m[0].toLowerCase().includes('week')) {
        const numWeeks = m[1] ? parseInt(m[1], 10) : 1;
        d.setDate(d.getDate() + numWeeks * 7);
      } else if (m[1]) {
        d.setDate(d.getDate() + parseInt(m[1], 10));
      }
      tokens.push({
        start,
        end,
        type: 'date',
        value: toISODate(d),
        text: m[0]
      });
    }
  }

  const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoRegex = /\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/g;
  while ((m = isoRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const day = parseInt(m[3], 10);
      if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
        const dt = new Date(y, mo - 1, day);
        if (dt.getMonth() === mo - 1 && dt.getDate() === day) {
          tokens.push({
            start,
            end,
            type: 'date',
            value: toISODate(dt),
            text: m[0]
          });
        }
      }
    }
  }

  // Slash / Dash / Dot dates: M/D, MM/DD, M/DD, MM/D with optional /YY or /YYYY
  // Examples: 9/8, 09/08, 9/08, 09/8, 9/8/26, 9/8/2026, 09/08/2026, 9-8, 09-08, 9.8, 09.08
  const slashDateRegex = /\b(0?[1-9]|1[0-2])[\/\.-](0?[1-9]|[12]\d|3[01])(?:[\/\.-](\d{2,4}))?\b/g;
  while ((m = slashDateRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const mo = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
        let y = m[3] ? parseInt(m[3], 10) : today.getFullYear();
        if (m[3] && y < 100) y += 2000;
        const dt = new Date(y, mo - 1, day);
        if (dt.getMonth() === mo - 1 && dt.getDate() === day) {
          if (!m[3] && dt < todayZero) {
            dt.setFullYear(dt.getFullYear() + 1);
          }
          tokens.push({
            start,
            end,
            type: 'date',
            value: toISODate(dt),
            text: m[0]
          });
        }
      }
    }
  }

  // Compact 6 or 8 digits: MMDDYY (090826) or MMDDYYYY (09082026)
  const compactYearRegex = /\b(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{4}|\d{2})\b/g;
  while ((m = compactYearRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const mo = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      let y = parseInt(m[3], 10);
      if (y < 100) y += 2000;
      if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
        const dt = new Date(y, mo - 1, day);
        if (dt.getMonth() === mo - 1 && dt.getDate() === day) {
          tokens.push({
            start,
            end,
            type: 'date',
            value: toISODate(dt),
            text: m[0]
          });
        }
      }
    }
  }

  // Compact 4 digits: MMDD (e.g. 0908, 1225, 0101, 0704)
  const compact4Regex = /\b(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/g;
  while ((m = compact4Regex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const mo = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
        let y = today.getFullYear();
        const dt = new Date(y, mo - 1, day);
        if (dt.getMonth() === mo - 1 && dt.getDate() === day) {
          if (dt < todayZero) dt.setFullYear(dt.getFullYear() + 1);
          tokens.push({
            start,
            end,
            type: 'date',
            value: toISODate(dt),
            text: m[0]
          });
        }
      }
    }
  }

  // Compact 3 digits: 0MD (e.g. 098 -> Sep 8, 015 -> Jan 5, 041 -> Apr 1)
  const compact3RegexA = /\b0([1-9])([1-9])\b/g;
  while ((m = compact3RegexA.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const mo = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      let y = today.getFullYear();
      const dt = new Date(y, mo - 1, day);
      if (dt.getMonth() === mo - 1 && dt.getDate() === day) {
        if (dt < todayZero) dt.setFullYear(dt.getFullYear() + 1);
        tokens.push({
          start,
          end,
          type: 'date',
          value: toISODate(dt),
          text: m[0]
        });
      }
    }
  }

  // Compact 3 digits: MDD (e.g. 908 -> Sep 8, 501 -> May 1, 704 -> Jul 4)
  const compact3RegexB = /\b([1-9])0([1-9])\b/g;
  while ((m = compact3RegexB.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const mo = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      let y = today.getFullYear();
      const dt = new Date(y, mo - 1, day);
      if (dt.getMonth() === mo - 1 && dt.getDate() === day) {
        if (dt < todayZero) dt.setFullYear(dt.getFullYear() + 1);
        tokens.push({
          start,
          end,
          type: 'date',
          value: toISODate(dt),
          text: m[0]
        });
      }
    }
  }

  // Month lookup map
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

  // Month + Day: "sep 01", "sep 1", "sep1", "sep01", "sept 1st", "september 15", "Oct 03 2026", "jul 4th", etc.
  const monthDayRegex = new RegExp(`\\b(${monthNamesPattern})\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, 'gi');
  while ((m = monthDayRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const monthStr = m[1].toLowerCase();
      const monthIdx = monthMap[monthStr];
      const day = parseInt(m[2], 10);
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        const year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
        const d = new Date(year, monthIdx, day);
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (!m[3] && d < todayZero) {
          d.setFullYear(d.getFullYear() + 1);
        }
        tokens.push({
          start,
          end,
          type: 'date',
          value: toISODate(d),
          text: m[0]
        });
      }
    }
  }

  // Day + Month: "01 sep", "1 sep", "1sep", "01sep", "1st sep", "15th september", "3 oct 2026"
  const dayMonthRegex = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${monthNamesPattern})(?:\\s*,?\\s*(\\d{4}))?\\b`, 'gi');
  while ((m = dayMonthRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const day = parseInt(m[1], 10);
      const monthStr = m[2].toLowerCase();
      const monthIdx = monthMap[monthStr];
      if (monthIdx !== undefined && day >= 1 && day <= 31) {
        const year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
        const d = new Date(year, monthIdx, day);
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (!m[3] && d < todayZero) {
          d.setFullYear(d.getFullYear() + 1);
        }
        tokens.push({
          start,
          end,
          type: 'date',
          value: toISODate(d),
          text: m[0]
        });
      }
    }
  }

  // Day names: "next friday", "friday", "fri", etc.
  const dayRegex = /\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/gi;
  while ((m = dayRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      const isNext = m[0].toLowerCase().startsWith('next');
      const rawDay = m[1].toLowerCase();
      let targetDay = dayNamesFull.findIndex(d => d.startsWith(rawDay.slice(0, 3)));
      if (targetDay !== -1) {
        const d = new Date(today);
        let diff = targetDay - d.getDay();
        if (diff <= 0 || isNext) diff += (isNext && diff > 0 ? 0 : (diff <= 0 ? 7 : 0));
        d.setDate(d.getDate() + diff);
        tokens.push({
          start,
          end,
          type: 'date',
          value: toISODate(d),
          text: m[0]
        });
      }
    }
  }

  // 5. Times:
  // Format A: 3-4 digits followed by am/pm/a/p (e.g. "915pm", "915p", "915a", "915am", "1130p", "100p", "1200a")
  const compactTimeRegex = /\b(?:at\s+)?([1-9]|1[0-2])([0-5]\d)\s*(am|pm|a|p)\b/gi;
  while ((m = compactTimeRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const ampm = m[3].toLowerCase();
      if ((ampm === 'pm' || ampm === 'p') && h < 12) h += 12;
      if ((ampm === 'am' || ampm === 'a') && h === 12) h = 0;
      tokens.push({
        start,
        end,
        type: 'time',
        value: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        text: m[0]
      });
    }
  }

  // Format B: 1-2 digits with optional :MM followed by am/pm/a/p (e.g. "3pm", "3p", "3a", "9:15pm", "9:15p", "10:30am", "10:30a")
  const standardTimeRegex = /\b(?:at\s+)?([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm|a|p)\b/gi;
  while ((m = standardTimeRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      let h = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const ampm = m[3].toLowerCase();
      if ((ampm === 'pm' || ampm === 'p') && h < 12) h += 12;
      if ((ampm === 'am' || ampm === 'a') && h === 12) h = 0;
      tokens.push({
        start,
        end,
        type: 'time',
        value: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        text: m[0]
      });
    }
  }

  // Format C: 24-hour time (e.g. "14:00", "09:15", "at 14:00")
  const militaryTimeRegex = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/gi;
  while ((m = militaryTimeRegex.exec(text)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    const overlap = tokens.some(t => Math.max(t.start, start) < Math.min(t.end, end));
    if (!overlap && !isDismissed(start, end, m[0])) {
      tokens.push({
        start,
        end,
        type: 'time',
        value: `${String(m[1]).padStart(2, '0')}:${String(m[2]).padStart(2, '0')}`,
        text: m[0]
      });
    }
  }

  // Sort tokens by start position
  tokens.sort((a, b) => a.start - b.start);

  // Filter overlapping tokens
  const nonOverlapping = [];
  let lastEnd = 0;
  for (const t of tokens) {
    if (t.start >= lastEnd) {
      nonOverlapping.push(t);
      lastEnd = t.end;
    }
  }

  // Build clean title and highlight HTML
  let highlightHtml = '';
  let cleanTitle = '';
  let currentIdx = 0;

  let finalDueDate = null;
  let finalDueTime = null;
  let finalPriority = null;
  let finalRecurring = null;
  const finalTags = [];
  let finalProjectName = null;

  for (const t of nonOverlapping) {
    if (t.start > currentIdx) {
      const normalPart = text.substring(currentIdx, t.start);
      highlightHtml += escHtml(normalPart);
      cleanTitle += normalPart;
    }

    let kwClass = 'kw-date';
    if (t.type === 'prio') {
      kwClass = 'kw-prio';
      finalPriority = t.value;
    } else if (t.type === 'date') {
      kwClass = 'kw-date';
      finalDueDate = t.value;
    } else if (t.type === 'time') {
      kwClass = 'kw-time';
      finalDueTime = t.value;
    } else if (t.type === 'recurring') {
      kwClass = 'kw-repeat';
      finalRecurring = t.value;
      if (t.targetDay !== undefined && !finalDueDate) {
        const d = new Date(today);
        let diff = t.targetDay - d.getDay();
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
        finalDueDate = toISODate(d);
      }
    } else if (t.type === 'tag') {
      kwClass = 'kw-tag';
      finalTags.push(t.value);
    } else if (t.type === 'project') {
      kwClass = 'kw-proj';
      finalProjectName = t.value;
    }

    highlightHtml += `<span class="nlp-highlight-match ${kwClass}" data-highlighted-match="true">${escHtml(t.text)}</span>`;
    currentIdx = t.end;
  }

  if (currentIdx < text.length) {
    const normalPart = text.substring(currentIdx);
    highlightHtml += escHtml(normalPart);
    cleanTitle += normalPart;
  }

  cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();

  // If a time or daily recurrence was specified without an explicit date, default the due date to today
  if ((finalDueTime || finalRecurring === 'daily' || finalRecurring === 'weekdays') && !finalDueDate) {
    finalDueDate = toISODate(today);
  }

  return {
    cleanTitle,
    dueDate: finalDueDate,
    dueTime: finalDueTime,
    priority: finalPriority,
    recurring: finalRecurring,
    tags: finalTags,
    projectName: finalProjectName,
    highlightHtml,
    tokens: nonOverlapping
  };
}

/**
 * Caret helper for contenteditable using TreeWalker
 */
function getCaretOffset(element) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

function restoreCaretOffset(element, offset) {
  element.focus();
  let charCount = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  let textNode = walker.nextNode();
  let lastNode = null;

  while (textNode) {
    lastNode = textNode;
    const nextCount = charCount + textNode.length;
    if (offset >= charCount && offset <= nextCount) {
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(textNode, offset - charCount);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    charCount = nextCount;
    textNode = walker.nextNode();
  }

  if (lastNode) {
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(lastNode, lastNode.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
