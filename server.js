const express = require('express');
const axios = require('axios');
const app = express();

// Proxy route to forward the request
app.get('/proxy', async (req, res) => {
    const { reservationDate, facility_id, court_id } = req.query;

    // Log query parameters for debugging
    console.log(`Received Query Parameters: ${JSON.stringify(req.query)}`);

    // Validate facility_id and court_id to ensure we are targeting the right facility
    if (facility_id !== '2103') {
        return res.status(400).json({ error: 'Invalid facility ID. Expected Pavilion ID.' });
    }

    if (court_id !== '15094') {
        return res.status(400).json({ error: 'Invalid court ID. Expected Pavilion Court.' });
    }

    try {
        console.log(`Making request to yourcourts.com with reservationDate: ${reservationDate}, facility_id: ${facility_id}, court_id: ${court_id}`);

        const response = await axios.get('https://www.yourcourts.com/facility/viewer/8353821', {
            params: {
                reservationDate: reservationDate,
                facility_id: facility_id,
                court_id: court_id
            }
        });

        // Check if the response is HTML instead of JSON
        if (response.headers['content-type'].includes('html')) {
            console.log('Received HTML instead of JSON. Full response body:');
            console.log(response.data); // Log HTML content
            return res.status(500).json({ error: 'Received HTML content instead of expected JSON. Check for authentication or other issues.' });
        }

        // If the response contains data in JSON, continue processing
        console.log('Raw Response Data:', response.data);

        const reservations = response.data.reservations || [];

        if (!Array.isArray(reservations)) {
            console.error('Reservations is not an array:', reservations);
            return res.status(500).json({ error: 'Unexpected data format received from yourcourts.com' });
        }

        let processedSchedule = [];

        reservations.forEach(reservation => {
            if (reservation.time === 'Not open') return;

            let currentUser = '';
            if (reservation.time === 'Not available for rental' || reservation.time === 'Open') {
                currentUser = 'Not currently reserved';
            } else if (['Setup time', 'Takedown time', 'Setup and takedown time'].includes(reservation.time)) {
                currentUser = reservation.username === 'Open' ? 'Not currently reserved' : reservation.username;
            }

            processedSchedule.push({
                time: reservation.time,
                currentUser: currentUser,
                nextUser: reservation.nextUser || 'No upcoming reservation'
            });
        });

        console.log('Processed Schedule:', JSON.stringify(processedSchedule));
        res.json(processedSchedule);
    } catch (error) {
        console.error('Error fetching data from yourcourts.com:', error);
        res.status(500).json({ error: 'Failed to fetch target URL' });
    }
});

// Start the server on the appropriate port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
