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
      } else if (currentEvent && trimmed.startsWith('DTSTART:')) {
        const dateStr = trimmed.substring(8);
        try {
          // Handle different date formats
          if (dateStr.includes('T')) {
            currentEvent.dtstart = new Date(dateStr.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
          } else {
            currentEvent.dtstart = new Date(dateStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
          }
        } catch (e) {
          // Skip if date parsing fails
        }
      }
    }
    
    const keyword = (req.query.keyword || 'SCRUTINI').toString().toLowerCase();
    const now = new Date();
    
    const filtered = events.filter(event => {
      if (!event.dtstart || !event.summary) return false;
      
      const isFuture = event.dtstart >= now;
      const matchesKeyword = event.summary.toLowerCase().includes(keyword);
      
      return isFuture && matchesKeyword;
    });
    
    // Sort by date
    filtered.sort((a, b) => a.dtstart - b.dtstart);
    
    return res.status(200).json({
      success: true,
      keyword,
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