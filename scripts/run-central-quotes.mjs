const baseUrl = process.env.PORTFOLIO_INTELLIGENCE_BASE_URL;
const cronSecret = process.env.CRON_SECRET;

if (!baseUrl) {
  throw new Error("PORTFOLIO_INTELLIGENCE_BASE_URL is not configured.");
}

if (!cronSecret) {
  throw new Error("CRON_SECRET is not configured.");
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/cron/quotes`, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${cronSecret}`,
  },
});

const text = await response.text();
if (!response.ok) {
  throw new Error(`Quote cron failed (${response.status}): ${text}`);
}

console.log(text);
