export default async function handler(req, res) {
    // ===================== CORS =====================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-kora-signature, Authorization');

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
        // ===================== HERO SMS =====================
        if (provider === 'hero') {
            const HERO_KEY = process.env.HERO_SMS_KEY;
            if (!HERO_KEY) return res.status(500).json({ error: "Missing HERO_SMS_KEY" });

            const cleanParams = Object.fromEntries(
                Object.entries(otherParams).filter(([_, v]) => v !== undefined && v !== "")
            );

            const queryParams = new URLSearchParams({
                api_key: HERO_KEY,
                ...cleanParams
            }).toString();

            const response = await fetch(`https://hero-sms.com/stubs/handler_api.php?${queryParams}`);
            const data = await response.text();

            try {
                const jsonData = JSON.parse(data);
                return res.status(200).json(jsonData);
            } catch (e) {
                return res.status(200).send(data);
            }
        }

        // ===================== FOLLOWIZ =====================
        if (provider === 'followiz') {
            const FOLLOWIZ_KEY = process.env.FOLLOWIZ_KEY;
            if (!FOLLOWIZ_KEY) return res.status(500).json({ error: "Missing FOLLOWIZ_KEY" });

            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const payload = { ...(body || {}), key: FOLLOWIZ_KEY };

            const response = await fetch('https://followiz.com/api/v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(payload).toString()
            });

            const data = await response.json();
            return res.status(200).json(data);
        }

        // ===================== KORAPAY CHECKOUT =====================
        if (provider === 'korapay-checkout') {
            const { action } = otherParams;

            if (!action) {
                console.error('❌ Missing action');
                return res.status(400).json({ error: "Missing KORAPAY action" });
            }

            let url = '';
            const bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            if (action === 'create-payment') {
                url = 'https://checkout.korapay.com/?type=payment-link';
            } else if (action === 'bank-charge') {
                url = 'https://checkout.korapay.com/bank/charge';
            } else {
                return res.status(400).json({ error: "Invalid action" });
            }

            console.log('📡 Korapay Checkout Request:', { 
                url, 
                action,
                bodyKeys: Object.keys(bodyData || {})
            });

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'accept-language': 'en-US,en;q=0.9',
                    'content-type': 'application/json',
                    'priority': 'u=1, i',
                    'sec-ch-ua': '"Microsoft Edge";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin'
                },
                body: JSON.stringify(bodyData)
            });

            const responseText = await response.text();
            let data;
            try {
                data = responseText ? JSON.parse(responseText) : {};
            } catch (e) {
                console.error('Failed to parse response:', responseText);
                data = { raw: responseText };
            }

            console.log('📨 Korapay Checkout Response:', { status: response.status, success: data.success, message: data.data?.message });
            return res.status(response.status).json(data);
        }

        // ===================== KORA PAY - FULL SUPPORT =====================
        if (provider === 'kora') {
            const KORA_SECRET_KEY = process.env.KORA_SECRET_KEY;
            const KORA_PUBLIC_KEY = process.env.KORA_PUBLIC_KEY;

            if (!KORA_SECRET_KEY) {
                console.error("Missing KORA_SECRET_KEY");
                return res.status(500).json({ error: "Server configuration error - Missing Secret Key" });
            }

            // ===================== WEBHOOK (POST from Kora) =====================
            if (req.method === 'POST' && !req.query.action) {
                const signature = req.headers['x-kora-signature'] || req.headers['x-korapay-signature'];
                const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

                console.log('🪝 Kora Webhook Received:', { 
                    event: body.event, 
                    reference: body.data?.reference,
                    status: body.data?.status 
                });

                // Verify signature
                if (signature && KORA_SECRET_KEY) {
                    const crypto = await import('crypto');
                    const expectedSignature = crypto
                        .createHmac('sha256', KORA_SECRET_KEY)
                        .update(JSON.stringify(body))
                        .digest('hex');

                    if (signature !== expectedSignature) {
                        console.warn("⚠️ Invalid webhook signature");
                        return res.status(401).json({ error: "Invalid signature" });
                    }
                }

                if (body.event === 'charge.success' && body.data?.status === 'success') {
                    console.log('✅ Successful Kora Payment!', {
                        reference: body.data.reference,
                        amount: body.data.amount,
                        customer: body.data.customer
                    });
                    // TODO: Credit user wallet here using reference
                }

                return res.status(200).json({ status: "success", message: "Webhook received" });
            }

            // ===================== INITIALIZE PAYMENT (From Frontend) =====================
            if (req.method === 'POST' && req.query.action === 'initialize') {
                if (!KORA_PUBLIC_KEY) {
                    return res.status(500).json({ error: "Missing Public Key" });
                }

                const { amount, reference, customer, redirect_url } = req.body;

                if (!amount || !reference) {
                    return res.status(400).json({ error: "Amount and reference are required" });
                }

                const payload = {
                    key: KORA_PUBLIC_KEY,           // Public key for checkout
                    reference: reference,
                    amount: parseFloat(amount),
                    currency: "NGN",
                    customer: customer || {
                        name: "Cloutiva User",
                        email: "user@cloutivaapp.shop"
                    },
                    notification_url: "https://lit-proxy.vercel.app/api/proxy?provider=kora", // Your webhook
                    redirect_url: redirect_url || window.location.origin + "/dashboard.html"
                };

                // Using client-side initialize style via proxy
                return res.status(200).json({
                    status: true,
                    message: "Payment initialized",
                    data: {
                        checkout_url: null, // Will be handled by Korapay JS on frontend
                        reference: reference
                    }
                });
            }

            return res.status(400).json({ error: "Invalid Kora action" });
        }

        return res.status(400).json({ error: "Invalid service requested" });

    } catch (error) {
        console.error("Proxy Error:", error);
        return res.status(500).json({
            error: "Proxy Error",
            details: error.message
        });
    }
}
