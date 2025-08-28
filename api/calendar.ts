import { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import ical from 'ical';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Controlla che la variabile d'ambiente sia presente
    const url = process.env.CALENDAR_URL;
    if (!url) {
      return res.status(500).json({ error: "Missing CALENDAR_URL environment variable" });
    }

    // Fetch del calendario ICS
    const response = await fetch(url);
    const icsData = await response.text();

    const events = ical.parseICS(icsData);

    // Prendi keyword dalla query e assicurati che sia una stringa
    const rawKeyword = req.query.keyword;
    const keyword = Array.isArray(rawKeyword) ? rawKeyword[0] : rawKeyword || "";

    // Filtra gli eventi in modo sicuro
    const filtered = Object.values(events).filter((e: any) => {
      return e.summary && typeof e.summary === "string" &&
             e.summary.toLowerCase().includes(keyword.toLowerCase());
    });

    res.status(200).json(filtered);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
}
