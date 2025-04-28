const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const port = process.env.PORT || 3000;

// Middleware for static files
app.use(express.static('public'));

// Proxy route for handling the /proxy requests
app.get('/proxy', async (req, res) => {
  const { reservationDate, facility_id, court_id } = req.query;

  if (!reservationDate || !facility_id || !court_id) {
    return res.status(400).json({ error: 'Missing required query parameters.' });
  }

  const url = `https://www.yourcourts.com/facility/viewer/${facility_id}?reservationDate=${reservationDate}&court_id=${court_id}`;
  
  try {
    console.log(`Fetching data from ${url}`);
    
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Instead of raw HTML, let's print pretty/formatted specific sections
    const mainContent = $('body').html();  // get the body part
    const prettyMainContent = $.html($('body'));  // Cheerio will format it nicely
    console.log('Formatted HTML <body> Content (first 2000 chars):');
    console.log(prettyMainContent.substring(0, 2000));  // limit to avoid blowing up logs

    // Extract reservations
    const reservations = [];
    $('tr').each((index, element) => {
      const time = $(element).find('.court-time').text().trim();
      const status = $(element).find('td').last().text().trim();
      console.log(`Row ${index}: Time = ${time}, Status = ${status}`);
      
      if (time && status) {
        reservations.push({ time, status });
      }
    });

    if (reservations.length > 0) {
      return res.json({ reservations });
    } else {
      return res.json({ message: 'No reservations found for this date and court.' });
    }

  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error.message);
    return res.status(500).json({ error: 'Failed to fetch data from yourcourts.com' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
