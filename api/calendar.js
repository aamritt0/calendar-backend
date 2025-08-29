const ical = require("node-ical");

let cachedEvents = null;
let lastFetchTime = 0;
const CACHE_TTL = 1000 * 60 * 5; // 5 minuti

module.exports = async function handler(req, res) {
  try {
    const url = process.env.CALENDAR_URL;
    if (!url) return res.status(500).json({ error: "Missing CALENDAR_URL env var" });

    const keyword = req.query.keyword ? req.query.keyword.toLowerCase() : "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Cache semplice
    if (!cachedEvents || Date.now() - lastFetchTime > CACHE_TTL) {
      console.log("Fetching calendar ICS...");
      const data = await ical.async.fromURL(url);

      // Prendi solo eventi futuri
      cachedEvents = Object.values(data)
        .filter(ev => ev.type === "VEVENT" && ev.start >= today)
        .map(ev => ({
          summary: ev.summary,
          startDate: ev.start,
          endDate: ev.end,
          location: ev.location || "",
        }));

      lastFetchTime = Date.now();
    } else {
      console.log("Using cached events");
    }

    // Applica filtro keyword se presente
    const events = cachedEvents.filter(ev => 
      keyword ? ev.summary.toLowerCase().includes(keyword) : true
    );

    // Ordina per data
    events.sort((a, b) => a.startDate - b.startDate);

    // Formatta output
    const result = events.map(ev => ({
      summary: ev.summary,
      startDate: ev.startDate,
      endDate: ev.endDate,
      location: ev.location,
      startFormatted: ev.startDate.toLocaleString("it-IT", { timeZone: "Europe/Rome" }),
      endFormatted: ev.endDate ? ev.endDate.toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : null,
    }));

    res.status(200).json(result);

  } catch (err) {
    console.error("Calendar function error:", err);
    res.status(500).json({ error: err.message });
  }
};
