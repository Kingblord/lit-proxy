import admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: "cloutiva-app",
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
    });
}

const db = admin.firestore();


export default async function handler(req, res) {

    // ===================== CORS =====================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-kora-signature, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { provider, action } = req.query;
    const body = req.body || {};

    console.log('🌐 Proxy Request:', { provider, action, method: req.method });

    try {

        // ===================== HERO SMS (UNCHANGED SAFE) =====================
        if (provider === 'hero') {
            const HERO_KEY = process.env.HERO_SMS_KEY;
            if (!HERO_KEY) return res.status(500).json({ error: "Missing HERO_SMS_KEY" });

            const cleanParams = Object.fromEntries(
                Object.entries(req.query).filter(([k, v]) =>
                    !['provider'].includes(k) && v
                )
            );

            const queryParams = new URLSearchParams({
                api_key: HERO_KEY,
                ...cleanParams
            }).toString();

            const response = await fetch(`https://hero-sms.com/stubs/handler_api.php?${queryParams}`);
            const data = await response.text();

            try {
                return res.status(200).json(JSON.parse(data));
            } catch {
                return res.status(200).send(data);
            }
        }

        // ===================== FOLLOWIZ (UNCHANGED SAFE) =====================
        if (provider === 'followiz') {
            const FOLLOWIZ_KEY = process.env.FOLLOWIZ_KEY;
            if (!FOLLOWIZ_KEY) return res.status(500).json({ error: "Missing FOLLOWIZ_KEY" });

            const payload = { ...(body || {}), key: FOLLOWIZ_KEY };

            const response = await fetch('https://followiz.com/api/v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(payload).toString()
            });

            const data = await response.json();
            return res.status(200).json(data);
        }

        // ===================== KORA PAY (PRODUCTION FIXED) =====================
        if (provider === 'kora') {

            const KORA_SECRET_KEY = process.env.KORA_SECRET_KEY;

            if (!KORA_SECRET_KEY) {
                return res.status(500).json({ error: "Missing KORA_SECRET_KEY" });
            }

            // ===================== WEBHOOK =====================
            if (req.method === 'POST' && !action) {

                console.log('🪝 Kora Webhook:', body);

                if (body.event === 'charge.success' && body.data?.status === 'success') {

                    const reference = body.data.reference;
                    const amount = Number(body.data.amount || 0);

                    // SAFE parsing of user
                    const userUid = reference?.split("_")[2];

                    if (!userUid) {
                        return res.status(400).json({ error: "Invalid reference format" });
                    }

                    try {
                        // ================= FIREBASE LOG =================
                        const txRef = db.collection("transactions").doc(reference);

                        await txRef.set({
                            userUid,
                            reference,
                            amount,
                            currency: "NGN",
                            provider: "kora",
                            status: "success",
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });

                        // ================= CREDIT USER WALLET =================
                        const userRef = db.collection("users").doc(userUid);

                        await userRef.set({
                            balance: admin.firestore.FieldValue.increment(amount)
                        }, { merge: true });

                        console.log("✅ User credited:", userUid);

                    } catch (err) {
                        console.error("Firebase error:", err);
                    }
                }

                return res.status(200).json({ status: "ok" });
            }

            // ===================== INIT (SDK MODE - SAFE RESPONSE) =====================
            if (req.method === 'POST' && action === 'initialize') {

                const { amount, reference, customer } = body;

                if (!amount || !reference) {
                    return res.status(400).json({ error: "Missing fields" });
                }

                // We DO NOT create payment here (SDK handles it)
                return res.status(200).json({
                    status: true,
                    data: {
                        reference,
                        amount
                    }
                });
            }

            return res.status(400).json({ error: "Invalid Kora request" });
        }

        return res.status(400).json({ error: "Invalid provider" });

    } catch (error) {
        console.error("Proxy Error:", error);
        return res.status(500).json({
            error: "Proxy failure",
            details: error.message
        });
    }
}            }

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
