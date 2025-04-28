const express = require('express');
const axios = require('axios');
const app = express();

// Proxy route to forward the request
app.get('/proxy', async (req, res) => {
    // Extract parameters from query string
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
        // Log before sending the request to yourcourts.com
        console.log(`Making request to yourcourts.com with reservationDate: ${reservationDate}, facility_id: ${facility_id}, court_id: ${court_id}`);

        // Sending request to the actual schedule page on yourcourts.com
        const response = await axios.get('https://www.yourcourts.com/facility/viewer/8353821', {
            params: {
                reservationDate: reservationDate,
                facility_id: facility_id,
                court_id: court_id
            }
        });

        // Log the full response data to see its structure
        console.log('Raw Response Data:', response.data);

        // Assuming the data comes in a nested structure, inspect its contents:
        const reservations = response.data.reservations || []; // Adjust based on actual response structure
        
        // If reservations is not an array, log an error
        if (!Array.isArray(reservations)) {
            console.error('Reservations is not an array:', reservations);
            return res.status(500).json({ error: 'Unexpected data format received from yourcourts.com' });
        }

        // Process the data into a format we can display
        let processedSchedule = [];

        reservations.forEach(reservation => {
            // If the reservation time is "Not open", skip it
            if (reservation.time === 'Not open') return;

            let currentUser = '';
            if (reservation.time === 'Not available for rental' || reservation.time === 'Open') {
                currentUser = 'Not currently reserved';
            } else if (['Setup time', 'Takedown time', 'Setup and takedown time'].includes(reservation.time)) {
                currentUser = reservation.username === 'Open' ? 'Not currently reserved' : reservation.username;
            }

            // Add to processed schedule
            processedSchedule.push({
                time: reservation.time,
                currentUser: currentUser,
                nextUser: reservation.nextUser || 'No upcoming reservation'
            });
        });

        // Log the processed schedule for debugging
        console.log('Processed Schedule:', JSON.stringify(processedSchedule));

        // Send the processed schedule back to the frontend
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
