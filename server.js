const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/proxy', async (req, res) => {
  try {
    const { reservationDate, facility_id, court_id } = req.query;

    if (!reservationDate || !facility_id || !court_id) {
      return res.status(400).json({ error: 'Missing required query parameters.' });
    }

    console.log('Received Query Parameters:', { reservationDate, facility_id, court_id });

    const url = `https://www.yourcourts.com/facility/viewer/${facility_id}?reservationDate=${reservationDate}&court_id=${court_id}`;
    console.log('Fetching data from', url);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.yourcourts.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Just for debugging: show some cleaned, readable HTML
    const bodyHtml = $('body').html() || '';
    console.log('Formatted HTML <body> Content (first 2000 chars):\n', bodyHtml.substring(0, 2000));

    const reservations = [];

    $('tr').each((_, element) => {
      const time = $(element).find('td.court-time').text().trim();
      const courtStatus = $(element).find('td[align="center"]').text().trim();

      if (time) {
        reservations.push({
          time,
          status: courtStatus || 'Unknown'
        });
      }
    });

    if (reservations.length === 0) {
      res.json({ message: 'No reservations found for this date and court.' });
    } else {
      console.log('Processed Reservations:', reservations);
      res.json(reservations);
    }

  } catch (error) {
    console.error('Error fetching or processing reservations:', error.message);
    res.status(500).json({ error: 'Failed to fetch reservations.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
