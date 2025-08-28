import { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import ical from 'ical';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = process.env.CALENDAR_URL;
    if (!url) {
      return res.status(500).json({ error: "Missing CALENDAR_URL environment variable" });
    }

    const response = await fetch(url);
    const icsData = await response.text();

    const events = ical.parseICS(icsData);

    // Optional: filter by keyword query parameter
    const { keyword = "" } = req.query;
    const filtered = Object.values(events).filter((e: any) =>
      e.summary && e.summary.toLowerCase().includes((keyword as string).toLowerCase())
    );

    res.status(200).json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
}
