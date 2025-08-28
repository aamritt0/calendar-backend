import { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import ical from 'ical';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = process.env.CALENDAR_URL;
    if (!url) return res.status(500).json({ error: "Missing CALENDAR_URL" });

    const response = await fetch(url);
    const icsData = await response.text();
    const events = ical.parseICS(icsData);

    const rawKeyword = req.query.keyword;
    const keyword = Array.isArray(rawKeyword) ? rawKeyword[0] : rawKeyword || "";

    const now = new Date();

    const filtered = Object.values(events).filter((e: any) => {
      // controlla che sia un evento futuro
      const isFuture = e.start && e.start >= now;

      return isFuture &&
             e.summary && typeof e.summary === "string" &&
             e.summary.toLowerCase().includes(keyword.toLowerCase());
    });

    res.status(200).json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
}
