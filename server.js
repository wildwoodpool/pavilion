const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/proxy', async (req, res) => {
    const { reservationDate, facility_id, court_id } = req.query;
    console.log('Received Query Parameters:', { reservationDate, facility_id, court_id });

    try {
        // Correct URL structure
        const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&reservationDate=${reservationDate}&court_id=${court_id}`;
        console.log(`Fetching data from ${url}`);

        const response = await axios.get(url);
        const html = response.data;

        // Load the HTML into Cheerio
        const $ = cheerio.load(html);

        // Log a formatted snippet of <body> content (first 2000 characters)
        const bodyHtml = $('body').html()?.replace(/<!--[\s\S]*?-->/g, '') || '';
        console.log('Formatted HTML <body> Content (first 2000 chars):');
        console.log(bodyHtml.slice(0, 2000));

        const reservations = [];

        // Scrape time slots and their statuses
        $('tr[id]').each((_, tr) => {
            const time = $(tr).find('td.court-time').text().trim();
            const statusCell = $(tr).find('td').not('.court-time').first();
            const statusText = statusCell.text().trim();
            const statusColor = statusCell.css('background-color');

            if (time && statusText) {
                reservations.push({
                    time,
                    status: statusText,
                    color: statusColor
                });
            }
        });

        if (reservations.length > 0) {
            console.log('Processed Reservations:', reservations);
            res.json(reservations);
        } else {
            console.log('No reservations found.');
            res.json({ message: 'No reservations found for this date and court.' });
        }

    } catch (error) {
        console.error('Error fetching or processing data:', error.message);
        res.status(500).json({ error: 'Failed to fetch or process reservation data.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
