const fetch = require('node-fetch');

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
        date: event.dtstart.toISOString(),
        dateFormatted: event.dtstart.toLocaleDateString('it-IT') + ' ' + event.dtstart.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
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