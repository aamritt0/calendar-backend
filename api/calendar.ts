import { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";
import ical from "ical";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("API called");

  try {
    const url = process.env.CALENDAR_URL;
    if (!url) throw new Error("Missing CALENDAR_URL");
    console.log("URL:", url);

    const response = await fetch(url);
    console.log("Fetch done, status:", response.status);

    const icsData = await response.text();
    console.log("ICS length:", icsData.length);

    const events = ical.parseICS(icsData);
    console.log("Events parsed:", Object.keys(events).length);

    res.status(200).json(Object.values(events));
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
}
