/**
 * Telemetry Seeding Script for EventFlow Analytics Platform
 * Generates 550 events across multiple user cohorts over the last 30 days.
 */
const http = require('http');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';
const API_KEY = process.env.API_KEY || 'ef_live_83b27b1029c34f3b890a5a297e61e05d';

// Generate simulated user base (100 distinct users spread across 4 weekly cohorts)
const generateUsers = () => {
    const users = [];
    const now = new Date();
    
    for (let i = 1; i <= 200; i++) {
        // Distribute cohort signup times: Week 0 (21-28 days ago), Week 1 (14-21 days ago), etc.
        const cohortOffsetDays = Math.floor(Math.random() * 28); 
        const signupTime = new Date(now.getTime() - cohortOffsetDays * 24 * 60 * 60 * 1000);
        
        users.push({
            id: `usr_${1000 + i}`,
            signupTime: signupTime
        });
    }
    return users;
};

// Generate 500 realistic events sequence
const generateEvents = (users) => {
    const events = [];
    
    users.forEach(user => {
        // Step 1: pageview (every user does this)
        const t1 = new Date(user.signupTime.getTime() - 10 * 60 * 1000); // 10 mins before signup
        events.push({
            eventId: generateUUID(),
            userId: user.id,
            eventName: 'pageview',
            timestamp: t1.toISOString(),
            properties: { userAgent: randomUA(), path: '/' }
        });

        // Step 2: signup (100% of users)
        events.push({
            eventId: generateUUID(),
            userId: user.id,
            eventName: 'signup',
            timestamp: user.signupTime.toISOString(),
            properties: { userAgent: randomUA(), email: `${user.id}@example.com` }
        });

        // Step 3: add_to_cart (60% conversion rate)
        if (Math.random() < 0.6) {
            const t3 = new Date(user.signupTime.getTime() + randomMinutes(5, 120) * 60 * 1000);
            events.push({
                eventId: generateUUID(),
                userId: user.id,
                eventName: 'add_to_cart',
                timestamp: t3.toISOString(),
                properties: { userAgent: randomUA(), item: 'Premium Plan Upgrade' }
            });

            // Step 4: purchase (40% conversion of those who added to cart, within 7 days)
            if (Math.random() < 0.4) {
                const t4 = new Date(t3.getTime() + randomMinutes(60, 4320) * 60 * 1000); // Up to 3 days later
                events.push({
                    eventId: generateUUID(),
                    userId: user.id,
                    eventName: 'purchase',
                    timestamp: t4.toISOString(),
                    properties: { userAgent: randomUA(), price: 49.99, currency: 'USD' }
                });
            }
        }
    });

    // Sort events by timestamp so they stream in order
    return events.slice(0, 550).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

const postEvent = (event) => {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(event);
        const url = new URL(`${GATEWAY_URL}/events`);
        
        const options = {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY,
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = http.request(options, (res) => {
            if (res.statusCode === 202) {
                resolve();
            } else {
                reject(new Error(`Failed with status: ${res.statusCode}`));
            }
        });

        req.on('error', (e) => reject(e));
        req.write(payload);
        req.end();
    });
};

const run = async () => {
    console.log(`🚀 Starting seeding process. Target: ${GATEWAY_URL}`);
    const users = generateUsers();
    const events = generateEvents(users);
    
    console.log(`Generated ${users.length} mock users & ${events.length} telemetry events.`);
    
    let successes = 0;
    let failures = 0;

    for (let i = 0; i < events.length; i++) {
        try {
            await postEvent(events[i]);
            successes++;
            if (successes % 50 === 0) {
                console.log(`Seeded ${successes}/${events.length} events...`);
            }
        } catch (err) {
            failures++;
        }
    }

    console.log(`\n🎉 Seeding completed.`);
    console.log(`- Success: ${successes}`);
    console.log(`- Failures: ${failures} (verify your docker servers/gateway are running)`);
};

// Helpers
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
function randomUA() {
    const uas = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
    ];
    return uas[Math.floor(Math.random() * uas.length)];
}
function randomMinutes(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

run();
