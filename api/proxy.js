export default async function handler(req, res) {
    // ===================== CORS =====================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { provider, ...otherParams } = req.query;

    console.log('🌐 Incoming Proxy Request:', { provider, method: req.method, otherParams, body: req.body });

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

        // ===================== SMM WIZ (GET + POST SUPPORT) =====================
        if (provider === 'smm') {
            const SMM_KEY = process.env.SMM_WIZ_KEY;

            if (!SMM_KEY) {
                return res.status(500).json({ error: "Missing SMM_WIZ_KEY" });
            }

            let payload = {};
            let method = 'POST';
            let url = 'https://smmwiz.com/api/v2';

            // Handle GET requests (services, status)
            if (req.method === 'GET') {
                payload = {
                    ...otherParams,
                    key: SMM_KEY
                };
                // For GET actions, use GET method and query params
                if (otherParams.action === 'services' || otherParams.action === 'status') {
                    method = 'GET';
                    const query = new URLSearchParams(payload).toString();
                    url += `?${query}`;
                } else {
                    // Fallback to POST for other GET requests
                    method = 'POST';
                }
            }

            // Handle POST requests (add, refill, cancel, etc.)
            if (req.method === 'POST') {
                // Support both parsed body and raw input
                const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
                payload = {
                    ...(body || {}),
                    key: SMM_KEY
                };
                method = 'POST';
            }

            const fetchOptions = {
                method,
                headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
                body: method === 'POST' ? new URLSearchParams(payload).toString() : undefined
            };

            console.log('📡 Outgoing SMMWiz Request:', { url, method, payload, fetchOptions });

            const response = await fetch(url, fetchOptions);

            const data = await response.json();
            console.log('📨 SMMWiz Response:', data);
            return res.status(200).json(data);
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
