/**
 * Utility to format relative date/time for meal entries.
 * Combines date and time into a concise relative label:
 * - "Just now" (under 1 minute)
 * - "X min ago" (e.g. "5 min ago", under 1 hour)
 * - "X hr ago" / "X hrs ago" (e.g. "2 hrs ago", under 24 hours / 1 day)
 * - "YYYY-MM-DD" (when over 1 day)
 */
export function formatMealTimeAgo(
  dateStr?: string,
  timeStr?: string,
  timestamp?: number | string | Date
): string {
  try {
    let mealTime: number | null = null;
    if (timestamp) {
      const t = new Date(timestamp).getTime();
      if (!isNaN(t)) mealTime = t;
    }

    if (!mealTime && dateStr) {
      const cleanDate = dateStr.trim();
      let hours = 12;
      let minutes = 0;

      if (timeStr) {
        const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (match) {
          hours = parseInt(match[1], 10);
          minutes = parseInt(match[2], 10);
          const meridiem = match[4]?.toLowerCase();
          if (meridiem === 'pm' && hours < 12) hours += 12;
          if (meridiem === 'am' && hours === 12) hours = 0;
        }
      }

      const dateParts = cleanDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (dateParts) {
        const year = parseInt(dateParts[1], 10);
        const month = parseInt(dateParts[2], 10) - 1;
        const day = parseInt(dateParts[3], 10);
        const d = new Date(year, month, day, hours, minutes, 0);
        mealTime = d.getTime();
      } else {
        const d = new Date(cleanDate);
        if (!isNaN(d.getTime())) {
          d.setHours(hours, minutes, 0, 0);
          mealTime = d.getTime();
        }
      }
    }

    if (!mealTime) {
      return dateStr || timeStr || '';
    }

    const now = Date.now();
    const diffMs = now - mealTime;

    // Over 1 day (24 hours) -> just show the date
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (diffMs >= ONE_DAY_MS) {
      return dateStr || new Date(mealTime).toISOString().slice(0, 10);
    }

    // Future time handling (e.g. clock differences within 1 hour)
    if (diffMs < 0) {
      if (Math.abs(diffMs) < 60 * 60 * 1000) {
        return 'Just now';
      }
      return dateStr || '';
    }

    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    if (diffMinutes < 1) {
      return 'Just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
    }

    return dateStr || new Date(mealTime).toISOString().slice(0, 10);
  } catch {
    return dateStr || timeStr || '';
  }
}
