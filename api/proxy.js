export default async function handler(req, res) {
    // ===================== CORS =====================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-kora-signature');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { provider, ...otherParams } = req.query;

    console.log('🌐 Incoming Proxy Request:', { 
        provider, 
        method: req.method, 
        otherParams, 
        body: req.body 
    });

    try {
        // ===================== HERO SMS (GET ONLY) =====================
        if (provider === 'hero') {
            const HERO_KEY = process.env.HERO_SMS_KEY;

            if (!HERO_KEY) {
                return res.status(500).json({ error: "Missing HERO_SMS_KEY" });
            }

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

            try {
                const jsonData = JSON.parse(data);
                return res.status(200).json(jsonData);
            } catch (e) {
                return res.status(200).send(data);
            }
        }

        // ===================== FOLLOWIZ (POST ONLY) =====================
        if (provider === 'followiz') {
            const FOLLOWIZ_KEY = process.env.FOLLOWIZ_KEY;

            if (!FOLLOWIZ_KEY) {
                return res.status(500).json({ error: "Missing FOLLOWIZ_KEY" });
            }

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

        // ===================== KORA PAY (NEW - Added) =====================
        if (provider === 'kora') {
            const KORA_SECRET_KEY = process.env.KORA_SECRET_KEY;

            if (!KORA_SECRET_KEY) {
                console.error("Missing KORA_SECRET_KEY in environment variables");
                return res.status(500).json({ error: "Server configuration error" });
            }

            // Handle Webhook from Kora
            if (req.method === 'POST') {
                const signature = req.headers['x-kora-signature'] || req.headers['x-korapay-signature'];
                const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

                console.log('🪝 Kora Webhook Received:', { 
                    event: body.event, 
                    reference: body.data?.reference,
                    status: body.data?.status 
                });

                // Optional: Verify webhook signature (Recommended for security)
                if (signature) {
                    // Kora uses HMAC SHA256 with secret key
                    const crypto = await import('crypto');
                    const expectedSignature = crypto
                        .createHmac('sha256', KORA_SECRET_KEY)
                        .update(JSON.stringify(body))
                        .digest('hex');

                    if (signature !== expectedSignature) {
                        console.warn("⚠️ Kora Webhook Signature Mismatch!");
                        return res.status(401).json({ error: "Invalid signature" });
                    }
                }

                // Here you can add logic to credit user wallet, update Firebase, etc.
                // For now, we just log and acknowledge
                if (body.event === 'charge.success' && body.data?.status === 'success') {
                    console.log('✅ Successful Kora Payment!', {
                        reference: body.data.reference,
                        amount: body.data.amount,
                        customer: body.data.customer
                    });
                    
                    // TODO: You can call your Firebase function or internal logic here to credit the user
                }

                // Always return 200 to Kora so it stops retrying
                return res.status(200).json({ status: "success", message: "Webhook received" });
            }

            // Optional: Support initiating payment (if needed in future)
            else if (req.method === 'GET') {
                return res.status(200).json({ 
                    message: "Kora proxy is active. Use POST for webhooks." 
                });
            }
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
