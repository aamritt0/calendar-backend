import ical from "node-ical";

export default async function handler(req, res) {
  try {
    const url = process.env.CALENDAR_URL;
    if (!url) {
      return res.status(500).json({ error: "Missing CALENDAR_URL in env vars" });
    }

    // Query params
    const keyword = req.query.keyword ? req.query.keyword.toLowerCase() : "";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Fetch and parse ICS
    const data = await ical.async.fromURL(url);

    // Filter and map events
    const events = Object.values(data)
      .filter(ev => ev.type === "VEVENT")
      .filter(ev => ev.start >= today)
      .filter(ev => (keyword ? ev.summary?.toLowerCase().includes(keyword) : true))
      .map(ev => ({
        summary: ev.summary,
        startDate: ev.start,
        endDate: ev.end,
        location: ev.location || "",
      }));

    res.status(200).json(events);
  } catch (error) {
    console.error("Calendar fetch error:", error);
    res.status(500).json({ error: error.message });
  }
}
