const fetch = require('node-fetch');

function parseICSDate(icsLine) {
  // Handle DTSTART/DTEND with timezone info
  console.log('Parsing ICS line:', icsLine); // Debug log
  
  let dateStr;
  let isUTC = false;
  let timezone = null;
  
  if (icsLine.includes('TZID=Europe/Rome:')) {
    // Format: DTSTART;TZID=Europe/Rome:20140221T143000
    dateStr = icsLine.split('TZID=Europe/Rome:')[1];
    timezone = 'Europe/Rome';
  } else if (icsLine.includes(':') && icsLine.endsWith('Z')) {
    // Format: DTSTART:20150219T143000Z (UTC)
    dateStr = icsLine.split(':')[1];
    isUTC = true;
  } else if (icsLine.includes(':')) {
    // Format: DTSTART:20150219T143000 (local time)
    dateStr = icsLine.split(':')[1];
  } else if (icsLine.includes('=')) {
    // Handle DTSTART;VALUE=DATE:20250130
    dateStr = icsLine.split('=').pop();
  } else {
    dateStr = icsLine.substring(8);
  }
  
  console.log('Extracted dateStr:', dateStr, 'isUTC:', isUTC, 'timezone:', timezone); // Debug log
  
  try {
    if (dateStr.includes('T')) {
      // Format: 20250130T090000 or 20250130T090000Z
      const cleanDateStr = dateStr.replace('Z', '');
      const year = cleanDateStr.substring(0, 4);
      const month = cleanDateStr.substring(4, 6);
      const day = cleanDateStr.substring(6, 8);
      const hour = cleanDateStr.substring(9, 11) || '00';
      const minute = cleanDateStr.substring(11, 13) || '00';
      const second = cleanDateStr.substring(13, 15) || '00';
      
      let parsedDate;
      
      if (isUTC || dateStr.endsWith('Z')) {
        // UTC time - parse as is
        parsedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
      } else if (timezone === 'Europe/Rome') {
        // Rome timezone - need to handle offset
        // Create date assuming local time, then adjust for Rome timezone
        parsedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
        
        // Rome is UTC+1 (winter) or UTC+2 (summer)
        // For now, let's use a simple approach and assume UTC+1 (can be refined)
        // Actually, let's just use the date as-is since it's already in local time
        // and the display will handle the timezone conversion
      } else {
        // Local time
        parsedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      }
      
      console.log('Parsed date with time:', parsedDate); // Debug log
      return parsedDate;
    } else {
      // Format: 20250130 (all-day event)
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      
      const parsedDate = new Date(`${year}-${month}-${day}T00:00:00`);
      console.log('Parsed date (all-day):', parsedDate); // Debug log
      return parsedDate;
    }
  } catch (e) {
    console.error('Date parsing error:', e, 'for dateStr:', dateStr);
    return null;
  }
}

module.exports = async (req, res) => {
  try {
    // Basic response first to test if function works
    if (req.query.test === 'true') {
      return res.status(200).json({
        success: true,
        message: 'Function is working',
        env: process.env.CALENDAR_URL ? 'Environment variable found' : 'Environment variable missing'
      });
    }
    
    const url = process.env.CALENDAR_URL;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'CALENDAR_URL environment variable is not set'
      });
    }

    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(500).json({
        success: false,
        error: `Failed to fetch calendar: ${response.status}`
      });
    }
    
    const icsData = await response.text();
    
    // Simple text parsing instead of ical library for now
    const lines = icsData.split('\n');
    const events = [];
    let currentEvent = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (trimmed === 'END:VEVENT' && currentEvent) {
        if (currentEvent.summary && currentEvent.dtstart) {
          events.push(currentEvent);
        }
        currentEvent = null;
      } else if (currentEvent && trimmed.startsWith('SUMMARY:')) {
        currentEvent.summary = trimmed.substring(8);
      } else if (currentEvent && trimmed.startsWith('DTSTART')) {
        currentEvent.dtstart = parseICSDate(trimmed);
      } else if (currentEvent && trimmed.startsWith('DTEND')) {
        currentEvent.dtend = parseICSDate(trimmed);
      }
    }
    
    const keyword = req.query.keyword && req.query.keyword.toString().trim() ? req.query.keyword.toString().toLowerCase() : null;
    const now = new Date();
    // Set to start of today to include current day events
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const filtered = events.filter(event => {
      if (!event.dtstart || !event.summary) return false;
      
      // Include events from today onwards
      const isFutureOrToday = event.dtstart >= today;
      
      // If no keyword provided, show all future/today events
      if (!keyword) {
        return isFutureOrToday;
      }
      
      // If keyword provided, filter by keyword
      const matchesKeyword = event.summary.toLowerCase().includes(keyword);
      return isFutureOrToday && matchesKeyword;
    });
    
    // Sort by date
    filtered.sort((a, b) => a.dtstart - b.dtstart);
    
    return res.status(200).json({
      success: true,
      keyword: keyword || 'all events',
      count: filtered.length,
      events: filtered.map(event => ({
        summary: event.summary,
        startDate: event.dtstart.toISOString(),
        endDate: event.dtend ? event.dtend.toISOString() : null,
        startFormatted: event.dtstart.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) + ' ' + event.dtstart.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }),
        endFormatted: event.dtend ? event.dtend.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) + ' ' + event.dtend.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : null,
        isAllDay: !event.dtend || (event.dtstart.getHours() === 0 && event.dtstart.getMinutes() === 0 && event.dtend.getHours() === 0 && event.dtend.getMinutes() === 0)
      }))
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