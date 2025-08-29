const fetch = require('node-fetch');

// Enhanced cache with persistent fallback
let calendarCache = {
  data: null,
  timestamp: 0,
  lastSuccessfulFetch: 0,
  ttl: 15 * 60 * 1000, // 15 minutes primary cache
  maxStaleAge: 24 * 60 * 60 * 1000, // 24 hours max stale
  fetchInProgress: false
};

function parseICSDate(icsLine) {
  const colonIndex = icsLine.indexOf(':');
  if (colonIndex === -1) return null;
  
  let dateStr = icsLine.substring(colonIndex + 1);
  const isUTC = dateStr.endsWith('Z');
  
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
      const cleanDateStr = dateStr.replace('Z', '');
      if (cleanDateStr.length < 15) return null;
      
      const year = parseInt(cleanDateStr.substr(0, 4), 10);
      const month = parseInt(cleanDateStr.substr(4, 2), 10) - 1;
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
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT') {
      if (currentEvent && currentEvent.summary && currentEvent.dtstart) {
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
    }
  }
  
  return events;
}

// Aggressive fetch with multiple strategies
async function fetchCalendarWithFallback(url) {
  const strategies = [
    {
      timeout: 3000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Calendar-Bot/1.0)' },
      description: 'Quick fetch'
    },
    {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/calendar,*/*',
        'Cache-Control': 'no-cache'
      },
      description: 'Standard fetch'
    },
    {
      timeout: 20000,
      headers: {
        'User-Agent': 'curl/7.68.0',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      },
      description: 'Extended fetch'
    }
  ];

  let lastError = null;

  for (const strategy of strategies) {
    try {
      console.log(`Trying ${strategy.description} (${strategy.timeout}ms timeout)...`);
      const startTime = Date.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), strategy.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: strategy.headers,
        follow: 5, // Allow redirects
        compress: true // Enable compression
      });

      clearTimeout(timeoutId);
      const fetchTime = Date.now() - startTime;
      console.log(`${strategy.description} completed in ${fetchTime}ms`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const icsData = await response.text();
      console.log(`Calendar data received: ${icsData.length} chars`);

      if (icsData.length < 50) {
        throw new Error('Response too short, likely not a calendar file');
      }

      if (!icsData.includes('BEGIN:VCALENDAR') && !icsData.includes('BEGIN:VEVENT')) {
        throw new Error('Invalid calendar format - missing VCALENDAR/VEVENT');
      }

      return icsData;

    } catch (error) {
      lastError = error;
      console.log(`${strategy.description} failed: ${error.message}`);
      
      if (error.name !== 'AbortError') {
        // Non-timeout error, might be worth trying other strategies
        continue;
      }
      // Timeout error, continue to next strategy
    }
  }

  throw lastError || new Error('All fetch strategies failed');
}

// Background refresh function (fire-and-forget)
async function backgroundRefresh(url) {
  if (calendarCache.fetchInProgress) {
    return; // Already fetching
  }

  calendarCache.fetchInProgress = true;
  
  try {
    console.log('Starting background refresh...');
    const icsData = await fetchCalendarWithFallback(url);
    const events = await parseCalendarData(icsData);
    
    const now = Date.now();
    calendarCache = {
      ...calendarCache,
      data: events,
      timestamp: now,
      lastSuccessfulFetch: now,
      fetchInProgress: false
    };
    
    console.log(`Background refresh successful: ${events.length} events cached`);
  } catch (error) {
    console.log('Background refresh failed:', error.message);
    calendarCache.fetchInProgress = false;
  }
}

module.exports = async (req, res) => {
  try {
    // Test endpoint
    if (req.query.test === 'true') {
      const now = Date.now();
      const cacheAge = calendarCache.timestamp ? now - calendarCache.timestamp : 0;
      const lastSuccess = calendarCache.lastSuccessfulFetch ? now - calendarCache.lastSuccessfulFetch : 0;
      
      return res.status(200).json({
        success: true,
        message: 'Function is working',
        env: process.env.CALENDAR_URL ? 'Environment variable found' : 'Environment variable missing',
        cache: {
          hasData: !!calendarCache.data,
          eventCount: calendarCache.data?.length || 0,
          ageMinutes: Math.round(cacheAge / 60000),
          lastSuccessMinutes: Math.round(lastSuccess / 60000),
          fetchInProgress: calendarCache.fetchInProgress
        }
      });
    }

    const url = process.env.CALENDAR_URL;
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'CALENDAR_URL environment variable is not set'
      });
    }

    const now = Date.now();
    let events = null;
    let dataSource = 'unknown';

    // Strategy 1: Use fresh cache
    if (calendarCache.data && (now - calendarCache.timestamp) < calendarCache.ttl) {
      events = calendarCache.data;
      dataSource = 'fresh_cache';
    }
    // Strategy 2: Use stale cache if available and trigger background refresh
    else if (calendarCache.data && (now - calendarCache.timestamp) < calendarCache.maxStaleAge) {
      events = calendarCache.data;
      dataSource = 'stale_cache';
      
      // Trigger background refresh but don't wait for it
      backgroundRefresh(url).catch(err => console.log('Background refresh error:', err.message));
    }
    // Strategy 3: Force fetch (no cache available or too old)
    else {
      try {
        console.log('No usable cache, attempting fresh fetch...');
        const icsData = await fetchCalendarWithFallback(url);
        const parsedEvents = await parseCalendarData(icsData);
        
        calendarCache = {
          ...calendarCache,
          data: parsedEvents,
          timestamp: now,
          lastSuccessfulFetch: now,
          fetchInProgress: false
        };
        
        events = parsedEvents;
        dataSource = 'fresh_fetch';
        
      } catch (fetchError) {
        console.log('Fresh fetch failed:', fetchError.message);
        
        // Strategy 4: Use very stale cache as absolute fallback
        if (calendarCache.data) {
          console.log('Using very stale cache as emergency fallback');
          events = calendarCache.data;
          dataSource = 'emergency_cache';
        } else {
          // No cache at all, return error with helpful message
          return res.status(503).json({
            success: false,
            error: 'Calendar service temporarily unavailable',
            details: 'The calendar source is not responding and no cached data is available. This might be temporary - please try again in a few minutes.',
            suggestion: 'If this persists, the calendar URL might be incorrect or the calendar server might be down.',
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Apply filters and formatting
    const keyword = req.query.keyword?.toString().trim().toLowerCase();
    let filtered = events;

    if (keyword) {
      filtered = events.filter(event => 
        event.summary.toLowerCase().includes(keyword)
      );
    }

    filtered.sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());

    const limit = parseInt(req.query.limit) || 100;
    if (filtered.length > limit) {
      filtered = filtered.slice(0, limit);
    }

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

    const cacheAge = now - calendarCache.timestamp;
    const isStale = cacheAge > calendarCache.ttl;

    return res.status(200).json({
      success: true,
      keyword: keyword || 'all events',
      count: filtered.length,
      dataSource,
      cacheInfo: {
        ageMinutes: Math.round(cacheAge / 60000),
        isStale,
        lastSuccessful: calendarCache.lastSuccessfulFetch ? 
          new Date(calendarCache.lastSuccessfulFetch).toISOString() : null
      },
      events: formattedEvents
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};