const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { DateTime } = require('luxon');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get('/proxy', async (req, res) => {
    const baseUrl = req.query.url;
    if (!baseUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const response = await axios.get(baseUrl);
        const html = response.data;
        const $ = cheerio.load(html);

        console.log('==== BEGIN HTML SNIPPET ====');
        console.log($('#calendarTable tbody').html());
        console.log('==== END HTML SNIPPET ====');

        const now = DateTime.now().setZone('America/Los_Angeles');

        let reservations = [];
        let currentReservation = null;

        $('#calendarTable tbody tr').each((index, element) => {
            const timeText = $(element).find('td:nth-child(1)').text().trim();
            const userText = $(element).find('td:nth-child(2)').text().trim();

            console.log(`Row ${index}: Time - ${timeText}, User - ${userText}`);

            if (!timeText) return; // Skip empty rows

            let rowTime = DateTime.fromFormat(timeText, 'h:mma', { zone: 'America/Los_Angeles' });
            if (!rowTime.isValid) {
                console.log(`Invalid time format: ${timeText}`);
                return;
            }

            if (!currentReservation || currentReservation.user !== userText) {
                if (currentReservation) {
                    currentReservation.end = rowTime;
                    reservations.push(currentReservation);
                }
                currentReservation = {
                    user: userText,
                    start: rowTime,
                    end: null
                };
            }
        });

        if (currentReservation) {
            currentReservation.end = currentReservation.start.plus({ minutes: 30 });
            reservations.push(currentReservation);
        }

        for (let i = 0; i < reservations.length - 1; i++) {
            reservations[i].end = reservations[i + 1].start;
        }

        let currentUser = null;
        let nextUser = null;

        for (const resv of reservations) {
            if (now >= resv.start && now < resv.end) {
                currentUser = resv.user;
            } else if (now < resv.start && !nextUser) {
                nextUser = resv.user;
            }
        }

        if (currentUser) {
            if (['Open', 'Not available for rental'].includes(currentUser)) {
                currentUser = 'Not currently reserved';
            } else if (['Not open'].includes(currentUser)) {
                currentUser = null;
            }
        }

        if (nextUser) {
            if (['Open', 'Not available for rental'].includes(nextUser)) {
                nextUser = 'Not currently reserved';
            } else if (['Not open'].includes(nextUser)) {
                nextUser = null;
            }
        }

        res.json({
            currentUser,
            nextUser
        });

    } catch (error) {
        console.error('Error fetching or parsing:', error.message);
        res.status(500).send('Error fetching target URL');
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
});
