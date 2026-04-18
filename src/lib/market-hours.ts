const MARKET_TIME_ZONE = "America/New_York";

function getMarketParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    weekday: map.weekday || "Mon",
    hour: Number(map.hour || "0"),
    minute: Number(map.minute || "0"),
  };
}

export function getMarketHoursState(date = new Date()) {
  const { weekday, hour, minute } = getMarketParts(date);
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const isWeekday = dayIndex >= 1 && dayIndex <= 5;
  const minutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30;
  const closeMinutes = 16 * 60;
  const isMarketOpen = isWeekday && minutes >= openMinutes && minutes < closeMinutes;

  return {
    timeZone: MARKET_TIME_ZONE,
    isWeekday,
    isMarketOpen,
    cadenceLabel: isMarketOpen ? "market-hours" : "off-hours",
    recommendedEveryMinutes: isMarketOpen ? 3 : 30,
  };
}
