export function parseRelativeTime(relativeTime, now = new Date()) {
    const end = new Date(now);
    const start = new Date(now);
    const startOfDay = (date) => date.setHours(0, 0, 0, 0);
    if (relativeTime === "today") {
        startOfDay(start);
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 1);
    }
    else if (relativeTime === "yesterday") {
        startOfDay(end);
        start.setTime(end.getTime());
        start.setDate(start.getDate() - 1);
    }
    else if (relativeTime === "day_before_yesterday") {
        startOfDay(end);
        end.setDate(end.getDate() - 1);
        start.setTime(end.getTime());
        start.setDate(start.getDate() - 1);
    }
    else if (relativeTime === "this_week") {
        const day = start.getDay();
        start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
        startOfDay(start);
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 7);
    }
    else if (relativeTime === "last_week") {
        const day = end.getDay();
        end.setDate(end.getDate() - day + (day === 0 ? -6 : 1));
        startOfDay(end);
        start.setTime(end.getTime());
        start.setDate(start.getDate() - 7);
    }
    else if (relativeTime === "this_month") {
        start.setFullYear(now.getFullYear(), now.getMonth(), 1);
        startOfDay(start);
        end.setFullYear(now.getFullYear(), now.getMonth() + 1, 1);
        startOfDay(end);
    }
    else if (relativeTime === "last_month") {
        start.setFullYear(now.getFullYear(), now.getMonth() - 1, 1);
        startOfDay(start);
        end.setFullYear(now.getFullYear(), now.getMonth(), 1);
        startOfDay(end);
    }
    else if (relativeTime === "recent_1_hour") {
        start.setHours(start.getHours() - 1);
    }
    else if (relativeTime === "recent_3_hours") {
        start.setHours(start.getHours() - 3);
    }
    else if (relativeTime === "recent_24_hours") {
        start.setDate(start.getDate() - 1);
    }
    else {
        const match = relativeTime.match(/^last_(\d+)_(minutes|hours|days|months|years)$/);
        if (!match) {
            return null;
        }
        const amount = Number(match[1]);
        const unit = match[2];
        if (unit === "minutes") {
            start.setMinutes(start.getMinutes() - amount);
        }
        if (unit === "hours") {
            start.setHours(start.getHours() - amount);
        }
        if (unit === "days") {
            start.setDate(start.getDate() - amount);
        }
        if (unit === "months") {
            start.setMonth(start.getMonth() - amount);
        }
        if (unit === "years") {
            start.setFullYear(start.getFullYear() - amount);
        }
    }
    return { start, end };
}
export function formatTimestamp(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return "";
    }
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return new Date(milliseconds).toLocaleString("sv-SE", { hour12: false }).replace("T", " ");
}
//# sourceMappingURL=util_time.js.map