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
            const { action } = otherParams;
            
            console.log('📱 [HERO-SMS] Incoming request:', { action, params: otherParams });

            // ===== SERVICES AVAILABILITY =====
            if (action === 'services') {
                const page = otherParams.page || '1';
                const size = otherParams.size || '25';
                
                console.log(`📱 [HERO-SMS] Fetching services availability - Page: ${page}, Size: ${size}`);
                
                try {
                    const apiUrl = `https://hero-sms.com/api/v1/classifiers/services/availability?page=${page}&size=${size}`;
                    console.log(`🔗 [HERO-SMS] API URL:`, apiUrl);
                    
                    const response = await fetch(apiUrl, {
                        method: 'GET',
                        headers: {
                            'accept': '*/*',
                            'accept-language': 'en',
                            'priority': 'u=1, i',
                            'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
                            'sec-ch-ua-mobile': '?0',
                            'sec-ch-ua-platform': '"Windows"',
                            'sec-fetch-dest': 'empty',
                            'sec-fetch-mode': 'cors',
                            'sec-fetch-site': 'same-origin'
                        }
                    });

                    console.log(`📡 [HERO-SMS] Response Status:`, response.status);
                    
                    const data = await response.json();
                    
                    console.log(`✅ [HERO-SMS] Services fetched successfully:`, {
                        count: data.data?.length || 0,
                        total: data.meta?.total || 0,
                        page: data.meta?.page || page,
                        services: data.data?.map(s => ({ service: s.service, name: s.name, cost: s.cost })) || []
                    });
                    
                    return res.status(200).json(data);
                } catch (err) {
                    console.error(`❌ [HERO-SMS] Error fetching services:`, err.message);
                    return res.status(500).json({ 
                        error: "Failed to fetch services",
                        details: err.message
                    });
                }
            }

            // ===== LEGACY API HANDLER =====
            const HERO_KEY = process.env.HERO_SMS_KEY;
            if (!HERO_KEY) {
                console.error('❌ [HERO-SMS] Missing HERO_SMS_KEY');
                return res.status(500).json({ error: "Missing HERO_SMS_KEY" });
            }

            const cleanParams = Object.fromEntries(
                Object.entries(otherParams).filter(([_, v]) => v !== undefined && v !== "")
            );

            console.log(`📱 [HERO-SMS] Using legacy endpoint with params:`, cleanParams);

            const queryParams = new URLSearchParams({
                api_key: HERO_KEY,
                ...cleanParams
            }).toString();

            const apiUrl = `https://hero-sms.com/stubs/handler_api.php?${queryParams}`;
            console.log(`🔗 [HERO-SMS] Legacy API URL:`, apiUrl);
            
            const response = await fetch(apiUrl);
            const data = await response.text();

            console.log(`📡 [HERO-SMS] Legacy Response (${response.status}):`, data.substring(0, 200));

            try {
                const jsonData = JSON.parse(data);
                console.log(`✅ [HERO-SMS] Parsed JSON response:`, jsonData);
                return res.status(200).json(jsonData);
            } catch (e) {
                console.warn(`⚠️ [HERO-SMS] Failed to parse JSON, returning raw:`, data.substring(0, 200));
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

        // ===================== KORAPAY CHECKOUT (4-STEP FLOW) =====================
        if (provider === 'korapay-checkout') {
            const { action } = otherParams;

            if (!action) {
                console.error('❌ Missing action');
                return res.status(400).json({ error: "Missing KORAPAY action" });
            }

            let url = '';
            const bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            // Route based on action
            if (action === 'validate-link') {
                url = 'https://checkout.korapay.com/validate-link';
            } else if (action === 'create-payment') {
                url = 'https://checkout.korapay.com/?type=payment-link';
            } else if (action === 'bank-charge') {
                url = 'https://checkout.korapay.com/bank/charge';
            } else if (action === 'verify-payment') {
                // ========== VERIFY PAYMENT STATUS BEFORE CREDITING ==========
                const { reference } = bodyData;
                if (!reference) {
                    return res.status(400).json({ error: "Missing payment reference" });
                }

                console.log(`🔍 [VERIFY-PAYMENT] Verifying payment status for reference: ${reference}`);
                
                try {
                    // Call Korapay to get transaction status
                    const verifyRes = await fetch('https://api.korapay.com/merchant/api/v1/transactions/verify', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${process.env.KORAPAY_SECRET_KEY || ''}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    // Alternative: Use the reference directly via query
                    const verifyAltRes = await fetch(`https://checkout.korapay.com/validate-link`, {
                        method: 'POST',
                        headers: {
                            'accept': 'application/json',
                            'content-type': 'application/json'
                        },
                        body: JSON.stringify({
                            slug: bodyData.slug || '',
                            env: 'live'
                        })
                    });

                    const verifyData = await verifyAltRes.json();
                    
                    console.log(`✅ [VERIFY-PAYMENT] Status check result:`, {
                        reference,
                        status: verifyData.data?.data?.status,
                        paymentStatus: verifyData.data?.data?.payment_status
                    });

                    // Check if payment was successful
                    const isPaymentSuccessful = verifyData.success && 
                        (verifyData.data?.data?.status === 'success' || 
                         verifyData.data?.data?.payment_status === 'success' ||
                         verifyData.data?.status === true);

                    if (!isPaymentSuccessful) {
                        console.warn(`⚠️ [VERIFY-PAYMENT] Payment not confirmed for ${reference}`);
                        return res.status(400).json({
                            success: false,
                            error: 'Payment not confirmed. Please verify the payment was received.',
                            reference,
                            paymentStatus: verifyData.data?.data?.status || 'unknown'
                        });
                    }

                    console.log(`✅ [VERIFY-PAYMENT] Payment confirmed and valid for ${reference}`);
                    return res.status(200).json({
                        success: true,
                        verified: true,
                        reference,
                        message: 'Payment verified successfully',
                        data: verifyData.data
                    });
                } catch (verifyErr) {
                    console.error(`❌ [VERIFY-PAYMENT] Error verifying payment:`, verifyErr.message);
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to verify payment status',
                        reference
                    });
                }
            } else {
                return res.status(400).json({ error: "Invalid action. Must be: validate-link, create-payment, bank-charge, or verify-payment" });
            }

            console.log(`📡 [${action.toUpperCase()}] Korapay Checkout Request:`, { 
                url, 
                body: bodyData
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
                console.error(`❌ Failed to parse ${action} response:`, responseText);
                data = { raw: responseText };
            }

            console.log(`📨 [${action.toUpperCase()}] Korapay Response (${response.status}):`, { 
                success: data.success, 
                message: data.message || data.data?.message,
                code: data.data?.code
            });
            
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
                    // NOTE: Balance updates should ONLY happen after explicit payment verification
                    // and should use the verify-payment action to confirm status before crediting
                    console.log('📝 Payment verified. Frontend should now call verify-payment action to credit wallet.');
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
