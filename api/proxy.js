export default async function handler(req, res) {
    // ===================== CORS =====================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { provider, ...otherParams } = req.query;

    console.log('🌐 Incoming Proxy Request:', { provider, endpoint, method: req.method, otherParams, body: req.body });

    try {
        // ===================== HERO SMS (GET ONLY) =====================
        if (provider === 'hero') {
            const HERO_KEY = process.env.HERO_SMS_KEY;

            if (!HERO_KEY) {
                return res.status(500).json({ error: "Missing HERO_SMS_KEY" });
            }

            // Ensure no empty params are sent to the provider
            const cleanParams = Object.fromEntries(
                Object.entries(otherParams).filter(([_, v]) => v !== undefined && v !== "")
            );

            const queryParams = new URLSearchParams({
                api_key: HERO_KEY,
                ...cleanParams
            }).toString();

            const response = await fetch(
                `https://hero-sms.com/stubs/handler_api.php?${queryParams}`
            );

            const data = await response.text();

            // LOGIC FOR TRACKING: Check if the response is JSON (V2 endpoints)
            // Tracking endpoints like getStatusV2 return JSON objects.
            try {
                const jsonData = JSON.parse(data);
                return res.status(200).json(jsonData);
            } catch (e) {
                // If not JSON, send as plain text (Standard for ACCESS_NUMBER, etc.)
                return res.status(200).send(data);
            }
        }

        // ===================== FOLLOWIZ (POST ONLY) =====================
        if (provider === 'followiz') {
            const FOLLOWIZ_KEY = process.env.FOLLOWIZ_KEY;

            if (!FOLLOWIZ_KEY) {
                return res.status(500).json({ error: "Missing FOLLOWIZ_KEY" });
            }

            // Support both parsed body and raw input
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const payload = {
                ...(body || {}),
                key: FOLLOWIZ_KEY
            };

            console.log('📡 Outgoing Followiz Request:', payload);

            const response = await fetch('https://followiz.com/api/v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(payload).toString()
            });

            const data = await response.json();
            console.log('📨 Followiz Response:', data);
            return res.status(200).json(data);
        }

        // ===================== KORAPAY =====================
        if (provider === 'korapay') {
            const KORAPAY_KEY = process.env.KORAPAY_KEY;

            if (!KORAPAY_KEY) {
                return res.status(500).json({ error: "Missing KORAPAY_KEY" });
            }

            if (!endpoint) {
                return res.status(400).json({ error: "Missing KORAPAY endpoint" });
            }

            const cleanParams = Object.fromEntries(
                Object.entries(otherParams).filter(([_, v]) => v !== undefined && v !== "")
            );

            const queryString = new URLSearchParams(cleanParams).toString();
            const url = `https://api.korapay.com/merchant/${endpoint}${queryString ? `?${queryString}` : ''}`;

            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            console.log('📡 Outgoing Korapay Request:', { url, body });

            const response = await fetch(url, {
                method: req.method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${KORAPAY_KEY}`
                },
                body: req.method === 'POST' ? JSON.stringify(body || {}) : undefined
            });

            const data = await response.json();
            console.log('📨 Korapay Response:', data);
            return res.status(response.status).json(data);
        }

        // ===================== INVALID SERVICE =====================
        return res.status(400).json({ error: "Invalid service requested" });

    } catch (error) {
        console.error("Proxy Error:", error);
        return res.status(500).json({
            error: "Proxy Error",
            details: error.message
        });
    }
}
