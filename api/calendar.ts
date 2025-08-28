import fetch from "node-fetch";
import ical from "ical";

// Function executed when API is called
export default async function handler(req: any, res: any) {
  try {
    // Get keyword from query
    const keyword = req.query.keyword as string;

    // Fetch ICS calendar (from your school calendar URL)
    const icsUrl = process.env.ICS_URL; // hidden in env variable

    if (!icsUrl) {
      throw new Error("ICS_URL environment variable is not set");
    }
    
    const response = await fetch(icsUrl);
    const data = await response.text();

    // Parse ICS
    const events = ical.parseICS(data);

    // Filter events
    const filtered = Object.values(events).filter(
      (event: any) =>
        event.summary && keyword && event.summary.includes(keyword)
    );

    // Return filtered events
    res.status(200).json(filtered);
  } catch (error) {
    res.status(500).json({ error: "Something went wrong" });
  }
}
