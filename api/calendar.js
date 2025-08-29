const fetch = require('node-fetch');

// Cache for calendar data
let calendarCache = {
  data: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes cache
};

function parseICSDate(icsLine) {
  // Extract date string more efficiently
  const colonIndex = icsLine.indexOf(':');
  if (colonIndex === -1) return null;
  
  let dateStr = icsLine.substring(colonIndex + 1);
  const isUTC = dateStr.endsWith('Z');
  
  // Handle timezone info
  const tzidIndex = icsLine.indexOf('TZID=');
  if (tzidIndex !== -1) {
    const tzStart = icsLine.indexOf(':', tzidIndex);
    if (tzStart !== -1) {
      dateStr = icsLine.substring(tzStart + 1);
    }
  }
  
  if (!dateStr || dateStr.length < 8) return null;
  
  try {
    if (dateStr.includes('T')) {
      // DateTime format: 20250130T090000 or 20250130T090000Z
      const cleanDateStr = dateStr.replace('Z', '');
      if (cleanDateStr.length < 15) return null;
      
      const year = parseInt(cleanDateStr.substr(0, 4), 10);
      const month = parseInt(cleanDateStr.substr(4, 2), 10) - 1; // Month is 0-based
      const day = parseInt(cleanDateStr.substr(6, 2), 10);
      const hour = parseInt(cleanDateStr.substr(9, 2), 10);
      const minute = parseInt(cleanDateStr.substr(11, 2), 10);
      const second = parseInt(cleanDateStr.substr(13, 2), 10) || 0;
      
      if (isUTC) {
        return new Date(Date.UTC(year, month, day, hour, minute, second));
      } else {
        return new Date(year, month, day, hour, minute, second);
      }
    } else {
      // Date only format: 20250130
      if (dateStr.length < 8) return null;
      const year = parseInt(dateStr.substr(0, 4), 10);
      const month = parseInt(dateStr.substr(4, 2), 10) - 1;
      const day = parseInt(dateStr.substr(6, 2), 10);
      return new Date(year, month, day);
    }
  } catch (e) {
    return null;
  }
}

async function parseCalendarData(icsData) {
  const lines = icsData.split(/\r?\n/);
  const events = [];
  let currentEvent = null;
  
  // Pre-calculate today for filtering
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Use a more efficient parsing approach
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT') {
      if (currentEvent && currentEvent.summary && currentEvent.dtstart) {
        // Only add events from today onwards
        if (currentEvent.dtstart >= today) {
          events.push(currentEvent);
        }
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('SUMMARY:')) {
        currentEvent.summary = line.substring(8);
      } else if (line.startsWith('DTSTART')) {
        const date = parseICSDate(line);
        if (date && date.getFullYear() > 2020) {
          currentEvent.dtstart = date;
        }
      } else if (line.startsWith('DTEND')) {
        const date = parseICSDate(line);
        if (date && date.getFullYear() > 2020) {
          currentEvent.dtend = date;
        }
      }
      // Skip other properties for performance
    }
  }
  
  return events;
}

module.exports = async (req, res) => {
  try {
    // Test endpoint
    if (req.query.test === 'true') {
      return res.status(200).json({
        success: true,
        message: 'Function is working',
        env: process.env.CALENDAR_URL ? 'Environment variable found' : 'Environment variable missing',
        cache: calendarCache.data ? 'Cache populated' : 'Cache empty'
      });
    }
    
    const url = process.env.CALENDAR_URL;
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'CALENDAR_URL environment variable is not set'
      });
    }

    let events;
    const now = Date.now();
    
    // Check cache first
    if (calendarCache.data && (now - calendarCache.timestamp) < calendarCache.ttl) {
      events = calendarCache.data;
    } else {
      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'Calendar-Parser/1.0'
          }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          return res.status(500).json({
            success: false,
            error: `Failed to fetch calendar: ${response.status} ${response.statusText}`
          });
        }
        
        const icsData = await response.text();
        events = await parseCalendarData(icsData);
        
        // Update cache
        calendarCache = {
          data: events,
          timestamp: now,
          ttl: calendarCache.ttl
        };
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          return res.status(408).json({
            success: false,
            error: 'Request timeout - calendar source is taking too long to respond'
          });
        }
        throw fetchError;
      }
    }
    
    // Apply keyword filter if provided
    const keyword = req.query.keyword?.toString().trim().toLowerCase();
    let filtered = events;
    
    if (keyword) {
      filtered = events.filter(event => 
        event.summary.toLowerCase().includes(keyword)
      );
    }
    
    // Sort by date (events are already roughly sorted during parsing)
    filtered.sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());
    
    // Limit results for performance
    const limit = parseInt(req.query.limit) || 100;
    if (filtered.length > limit) {
      filtered = filtered.slice(0, limit);
    }
    
    // Format response
    const formattedEvents = filtered.map(event => {
      const startDate = event.dtstart;
      const endDate = event.dtend;
      const isAllDay = !endDate || 
        (startDate.getHours() === 0 && startDate.getMinutes() === 0 && 
         endDate.getHours() === 0 && endDate.getMinutes() === 0);
      
      return {
        summary: event.summary,
        startDate: startDate.toISOString(),
        endDate: endDate?.toISOString() || null,
        startFormatted: startDate.toLocaleDateString('it-IT', { 
          timeZone: 'Europe/Rome',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }) + (isAllDay ? '' : ' ' + startDate.toLocaleTimeString('it-IT', { 
          hour: '2-digit', 
          minute: '2-digit', 
          timeZone: 'Europe/Rome' 
        })),
        endFormatted: endDate && !isAllDay ? 
          endDate.toLocaleDateString('it-IT', { 
            timeZone: 'Europe/Rome',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }) + ' ' + endDate.toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit', 
            timeZone: 'Europe/Rome' 
          }) : null,
        isAllDay
      };
    });
    
    return res.status(200).json({
      success: true,
      keyword: keyword || 'all events',
      count: filtered.length,
      cached: (now - calendarCache.timestamp) < calendarCache.ttl,
      events: formattedEvents
    });

  } catch (error) {
    console.error('Error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};