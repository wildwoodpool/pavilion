const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const advancedFormat = require('dayjs/plugin/advancedFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

const app = express();
const PORT = process.env.PORT || 3000;

// Your configuration
const facility_id = '2103'; // Replace with your real facility ID
const court_id = '15094';   // Replace with your real court ID

// Helper to fix "Member Event"
function cleanStatus(status) {
    return status.replace(/\bMember Event\b/g, '').trim();
}

// Helper to check if status is just a time
function isTimeOnly(status) {
    return /^([1-9]|1[0-2]):[0-5][0-9](AM|PM)$/i.test(status.trim());
}

// Fetch reservation data
async function fetchReservations() {
    const today = dayjs().tz('America/New_York').format('M/D/YYYY');
    const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}?reservationDate=${today}&court_id=${court_id}`;

    try {
        console.log(`Fetching data from ${url}`);
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const times = [];
        $('.court-time').each((i, elem) => {
            times.push($(elem).text().trim());
        });

        const statuses = [];
        $('td[class*="court-closed"], td[class*="court-open"], td[class*="court-reserved"]').each((i, elem) => {
            let text = $(elem).text().replace(/\s+/g, ' ').trim();
            text = cleanStatus(text);
            statuses.push(text);
        });

        if (times.length === 0 || statuses.length === 0) {
            return { message: "No reservations today." };
        }

        // Build initial raw reservations
        const rawReservations = times.map((time, index) => ({
            startTime: time,
            status: statuses[index] || '',
        }));

        // Assign endTimes based on the next event
        for (let i = 0; i < rawReservations.length - 1; i++) {
            rawReservations[i].endTime = rawReservations[i + 1].startTime;
        }
        rawReservations[rawReservations.length - 1].endTime = "End of Day";

        // Now filter out:
        // - reservations that are empty or just times
        // - "Setup time", "Takedown time", "Open"
        const filteredReservations = rawReservations.filter(res => {
            const ignoreStatuses = ['Setup time', 'Setup and takedown time', 'Takedown time', 'Open'];
            return (
                !isTimeOnly(res.status) &&
                !ignoreStatuses.includes(res.status)
            );
        });

        console.table(filteredReservations, ['startTime', 'status', 'endTime']);

        return { reservations: filteredReservations };

    } catch (error) {
        console.error('Error fetching data from yourcourts.com:', error);
        return { message: 'Error fetching reservation data.' };
    }
}

// Main endpoint
app.get('/proxy', async (req, res) => {
    const reservations = await fetchReservations();
    res.json(reservations);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
