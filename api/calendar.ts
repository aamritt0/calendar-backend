// api/calendar.ts (or api/calendar.js)
import { VercelRequest, VercelResponse } from '@vercel/node';

interface CalendarEvent {
  start?: Date;
  end?: Date;
  summary?: string;
  description?: string;
  location?: string;
  uid?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Dynamic import for ES modules compatibility with Vercel
    const fetch = (await import('node-fetch')).default;
    const ical = await import('ical');

    const url = process.env.CALENDAR_URL;
    const keyword = req.query.keyword as string || "SCRUTINI";
    
    if (!url) {
      throw new Error('CALENDAR_URL environment variable is not set');
    }
    
    console.log(`Fetching calendar events for keyword: ${keyword}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const icsData = await response.text();
    const events = ical.parseICS(icsData);

    const now = new Date();

    const filtered = Object.values(events).filter((e: CalendarEvent) => {
      if (!e.start || !e.summary) return false;
      
      const isFuture = e.start >= now;
      const matchesKeyword = e.summary.toLowerCase().includes(keyword.toLowerCase());
      
      return isFuture && matchesKeyword;
    });

    // Sort events by date
    filtered.sort((a: CalendarEvent, b: CalendarEvent) => {
      if (!a.start || !b.start) return 0;
      return a.start.getTime() - b.start.getTime();
    });

    // Format events for JSON response
    const formattedEvents = filtered.map((e: CalendarEvent) => ({
      summary: e.summary,
      start: e.start?.toISOString(),
      end: e.end?.toISOString(),
      location: e.location || null,
      description: e.description || null,
      startFormatted: e.start?.toLocaleDateString('it-IT') + ' ' + e.start?.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      endFormatted: e.end ? e.end?.toLocaleDateString('it-IT') + ' ' + e.end?.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null
    }));

    return res.status(200).json({
      success: true,
      keyword,
      count: formattedEvents.length,
      events: formattedEvents,
      fetchedAt: now.toISOString()
    });

  } catch (error) {
    console.error('Calendar API Error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch calendar events',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}