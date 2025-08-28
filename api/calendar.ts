import { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import ical from 'ical';

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    const url = process.env.CALENDAR_URL; // Environment Variable
    if (!url) {
      return res.status(500).json({ error: "Missing CALENDAR_URL" });
    }

    const response = await fetch(url);
    const icsData = await response.text();
    const events = ical.parseICS(icsData);

    // Example: filter events with keyword "Math"
    const filtered = Object.values(events).filter((e: any) =>
      e.summary && e.summary.includes("Math")
    );

    res.status(200).json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
};
