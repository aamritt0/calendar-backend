const fetch = require('node-fetch');

function parseICSDate(icsLine) {
  // Handle DTSTART/DTEND with timezone info
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
        parsedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      } else {
        // Local time
        parsedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      }
      
      return parsedDate;
    } else {
      // Format: 20250130 (all-day event)
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      
      return new Date(`${year}-${month}-${day}T00:00:00`);
    }
  } catch (e) {
    console.error('Date parsing error for:', dateStr);
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
    
    // Simple text parsing with early filtering for performance
    const lines = icsData.split('\n');
    const events = [];
    let currentEvent = null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === 'BEGIN:VEVENT') {
        currentEvent = {};
      } else if (trimmed === 'END:VEVENT' && currentEvent) {
        if (currentEvent.summary && currentEvent.dtstart) {
          // Early filtering: only keep events from today onwards
          if (currentEvent.dtstart >= today) {
            events.push(currentEvent);
          }
        }
        currentEvent = null;
      } else if (currentEvent && trimmed.startsWith('SUMMARY:')) {
        currentEvent.summary = trimmed.substring(8);
      } else if (currentEvent && trimmed.startsWith('DTSTART')) {
        const parsedDate = parseICSDate(trimmed);
        if (parsedDate && parsedDate.getFullYear() > 2020) { // Skip obviously old/corrupt dates
          currentEvent.dtstart = parsedDate;
        }
      } else if (currentEvent && trimmed.startsWith('DTEND')) {
        const parsedDate = parseICSDate(trimmed);
        if (parsedDate && parsedDate.getFullYear() > 2020) { // Skip obviously old/corrupt dates
          currentEvent.dtend = parsedDate;
        }
      }
    }
    
    const keyword = req.query.keyword && req.query.keyword.toString().trim() ? req.query.keyword.toString().toLowerCase() : null;
    
    let filtered = events; // events are already filtered to today+ during parsing
    
    // Only apply keyword filter if provided
    if (keyword) {
      filtered = events.filter(event => 
        event.summary.toLowerCase().includes(keyword)
      );
    }
    
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