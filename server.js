const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const port = process.env.PORT || 3000;

app.get('/proxy', async (req, res) => {
    const { reservationDate, facility_id, court_id } = req.query;

    console.log(`Received Query Parameters: ${JSON.stringify(req.query)}`);
    console.log(`Making request to yourcourts.com with reservationDate: ${reservationDate}, facility_id: ${facility_id}, court_id: ${court_id}`);

    try {
        const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&reservationDate=${reservationDate}&court_id=${court_id}`;
        const response = await axios.get(url);
        const html = response.data;

        console.log("Formatted HTML <body> Content (first 2000 chars):");
        console.log(html.substring(0, 2000)); // To avoid logging huge HTML data

        const reservations = processReservations(html);

        if (reservations.length === 0) {
            return res.json({ message: "No reservations today." });
        }

        const currentUser = reservations[0];
        const nextUser = reservations.length > 1 ? reservations[1] : { message: "No more reservations today." };

        const formattedReservations = {
            currentUser: {
                time: currentUser.time,
                status: currentUser.status,
                color: currentUser.color,
            },
            nextUser: {
                time: nextUser.time || '',
                status: nextUser.status || '',
                color: nextUser.color || '',
            },
        };

        console.log("Processed Reservations:", formattedReservations);
        return res.json(formattedReservations);
    } catch (error) {
        console.error("Error fetching data from yourcourts.com:", error);
        return res.status(500).json({ error: 'Error fetching data from yourcourts.com' });
    }
});

function processReservations(html) {
    const $ = cheerio.load(html);
    const reservations = [];
    let currentReservation = {};

    $('tr').each((index, element) => {
        const time = $(element).find('td.court-time').text().trim();
        const status = $(element).find('td').last().text().trim();
        const styleAttr = $(element).find('td').last().attr('style') || ''; // Ensure style exists

        // If a style attribute is present, attempt to extract background-color
        const color = styleAttr.match(/background-color:([^;]+)/)?.[1] || '';

        if (time && status) {
            if (status.includes('Member Event')) {
                // Remove "Member Event" but keep the name
                const statusWithoutMemberEvent = status.replace('Member Event', '').trim();
                currentReservation = {
                    time,
                    status: statusWithoutMemberEvent,
                    color,
                };
            } else {
                currentReservation = {
                    time,
                    status,
                    color,
                };
            }
        }

        reservations.push(currentReservation);
    });

    // Group back-to-back reservations with the same status into a single reservation
    const groupedReservations = groupBackToBackReservations(reservations);

    // Add additional rules for handling start/end time for current and next user
    return groupedReservations;
}

function groupBackToBackReservations(reservations) {
    const grouped = [];
    let currentGroup = null;

    reservations.forEach((reservation, index) => {
        if (currentGroup === null) {
            currentGroup = reservation;
        } else {
            if (reservation.status === currentGroup.status) {
                currentGroup.time = `${currentGroup.time} - ${reservation.time}`;
                currentGroup.endTime = reservation.time;
            } else {
                grouped.push(currentGroup);
                currentGroup = reservation;
            }
        }
    });

    if (currentGroup !== null) {
        grouped.push(currentGroup);
    }

    return grouped;
}

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
