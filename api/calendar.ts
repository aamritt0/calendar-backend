import fetch from 'node-fetch';
import ical from 'ical';

async function test() {
  try {
    const url = "https://calendar.google.com/calendar/ical/isfermimantova%40gmail.com/public/basic.ics"; // sostituisci con il tuo URL ICS
    const response = await fetch(url);
    const icsData = await response.text();
    const events = ical.parseICS(icsData);

    const keyword = "SCRUTINI"; // keyword da testare
    const now = new Date();

    const filtered = Object.values(events).filter((e: any) => {
      const isFuture = e.start && e.start >= now;
      return isFuture &&
             e.summary && typeof e.summary === "string" &&
             e.summary.toLowerCase().includes(keyword.toLowerCase());
    });

    console.log("Filtered events:", filtered.length);
    filtered.forEach((e: any) => {
      console.log(`${e.start.toISOString()} - ${e.summary}`);
    });

  } catch (err) {
    console.error(err);
  }
}