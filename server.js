const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', async (req, res) => {
    // Extract reservationDate and facility_id from the query parameters
    const { reservationDate, facility_id, court_id } = req.query;

    if (!reservationDate || !facility_id || !court_id) {
        return res.status(400).send('Missing required parameters.');
    }

    try {
        // Log the date to verify it's correct
        console.log('Requested Reservation Date:', reservationDate);

        // Convert reservationDate into the correct format (if needed)
        const parsedDate = new Date(reservationDate);
        console.log('Parsed Date:', parsedDate);

        // Fetch the schedule page
        const response = await axios.get(`https://www.yourcourts.com/facility/viewer/8353821?reservationDate=${reservationDate}&facility_id=${facility_id}&court_id=${court_id}`);
        
        const $ = cheerio.load(response.data);

        // Now parse the schedule using cheerio
        const scheduleRows = [];
        $('table tbody tr').each((index, row) => {
            const time = $(row).find('td.time').text().trim();
            const user = $(row).find('td.user').text().trim();

            scheduleRows.push({ time, user });
        });

        console.log('Parsed Schedule Rows:', scheduleRows);

        res.json({ currentUser: 'Not currently reserved', nextUser: 'No upcoming reservation' });
    } catch (error) {
        console.error('Error fetching or parsing schedule:', error);
        res.status(500).send('Error fetching or parsing schedule.');
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
