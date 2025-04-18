require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
import { Client } from './nodedb.js';
const rateLimit = require("express-rate-limit");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const PORT = process.env.PORT || 3000;

const usersDB = new Client('./db/users.json');
const priceKeysDB = new Client('./db/developer_price_keys.json');
const payersDB = new Client('./db/payers.json');
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login/registry attempts, please try again later (rate-limit)."
});

app.use(express.static('public'));

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = await stripe.webhooks.constructEventAsync(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    const customer = await stripe.customers.retrieve(session.customer);

    const sessioninfo = await stripe.checkout.sessions.listLineItems(session.id);

    console.log(sessioninfo)
    
    let licenseExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 1 month from now
    if (session.metadata.mode === "payment") {
      licenseExpiry = "never"
    }
    const payerData = {
      customer: { email: customer.email, name: customer.name, id: customer.id },
      priceId: sessioninfo.data[0].price.id,
      licenseExpires: licenseExpiry
    };

    console.log(payerData);

    try {
      const payers = (await payersDB.get('payers')) || [];
      const existingPayerIndex = payers.findIndex(p => p.customer.id === customer.id);

      if (existingPayerIndex !== -1) {
        payers[existingPayerIndex] = payerData;
      } else {
        payers.push(payerData);
      }

      await payersDB.set('payers', payers);
    } catch (error) {
      console.error('Error saving payer data:', error);
      return res.status(500).send('Internal Server Error');
    }
  } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    const charge = event.data.object;
    console.log('Charge refunded:', charge.id);
    try {
      const payers = (await payersDB.get('payers')) || [];
      const payer = payers.find(p => p.customer.id === charge.customer);

      if (payer) {
        payer.licenseExpires = new Date().toISOString();
        await payersDB.set('payers', payers);
        console.log(`Loser ${charge.customer} has been refunded and revoked.`);
      } else {
        console.warn(`No payer found for customer ID: ${charge.customer}`);
      }
    } catch (error) {
      console.error('Error expiring license:', error);
    }
  }

  res.status(200).send('Received');
});

app.use(cookieParser());
app.use(bodyParser.json());
app.use((req, res, next) => {
  if (req.path !== '/check-payer') {
    return next();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

function hashPassword(password) {
  return crypto
    .createHmac('sha256', process.env.SIGNING_SECRET)
    .update(password)
    .digest('hex');
}

async function authMiddleware(req, res, next) {
  const { loginToken } = req.cookies;

  if (!loginToken) {
    return res.status(401).redirect("/login");
  }

  try {
    const users = (await usersDB.get('users')) || [];
    const user = users.find((u) => u.token === loginToken);

    if (!user) {
      return res.status(401).redirect("/login");
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Error in authMiddleware:", error);
    res.status(500).send("Internal Server Error");
  }
}

app.post('/register', loginLimiter, async (req, res) => {
  const { email, password, registration } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  if (!registration) {
    return res.status(400).json({ message: 'Gus Registration Key is required' });
  } else if (registration !== process.env.REG_KEY) {
    return res.status(400).json({ message: 'Bad Instance Registration Key' });
  }

  try {
    const users = (await usersDB.get('users')) || [];
    const existingUser = users.find((u) => u.email === email);

    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    const hashedPassword = hashPassword(password);
    const token = crypto.randomBytes(16).toString('hex');
    const newUser = { email, password: hashedPassword, token };

    res.cookie('loginToken', token, { httpOnly: true, sameSite: 'Strict' });

    users.push(newUser);
    await usersDB.set('users', users);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error("Error in registration:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const users = (await usersDB.get('users')) || [];
    const user = users.find((u) => u.email === email);

    if (!user || user.password !== hashPassword(password)) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    user.token = token;

    await usersDB.set('users', users);

    res.cookie('loginToken', token, { httpOnly: true, sameSite: 'Strict' });
    res.json({ message: 'Login successful' });
  } catch (error) {
    console.error("Error in login:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/price-keys', authMiddleware, async (req, res) => {
  const { humanFriendlyId, stripePriceId, isSubscription } = req.body;

  if (!humanFriendlyId || !stripePriceId) {
    return res.status(400).json({ message: 'Both humanFriendlyId and stripePriceId are required' });
  }

  try {
    const priceKeys = (await priceKeysDB.get('priceKeys')) || {};

    if (priceKeys[humanFriendlyId]) {
      return res.status(400).json({ message: 'This human-friendly ID is already in use' });
    }

    priceKeys[humanFriendlyId] = { stripePriceId, isSubscription: !!isSubscription };
    await priceKeysDB.set('priceKeys', priceKeys);

    res.status(201).json({ message: 'Price key created successfully' });
  } catch (error) {
    console.error("Error creating price key:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.put('/price-keys/:humanFriendlyId', authMiddleware, async (req, res) => {
  const { humanFriendlyId } = req.params;
  const { stripePriceId, isSubscription } = req.body;

  if (!stripePriceId) {
    return res.status(400).json({ message: 'Stripe Price ID is required' });
  }

  try {
    const priceKeys = (await priceKeysDB.get('priceKeys')) || {};

    if (!priceKeys[humanFriendlyId]) {
      return res.status(404).json({ message: 'Price key not found' });
    }

    priceKeys[humanFriendlyId] = { stripePriceId, isSubscription: !!isSubscription };
    await priceKeysDB.set('priceKeys', priceKeys);

    res.status(200).json({ message: 'Price key updated successfully' });
  } catch (error) {
    console.error("Error updating price key:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.delete('/price-keys/:humanFriendlyId', authMiddleware, async (req, res) => {
  const { humanFriendlyId } = req.params;

  if (!humanFriendlyId) {
    return res.status(400).json({ message: 'Human-friendly ID is required' });
  }

  try {
    const priceKeys = (await priceKeysDB.get('priceKeys')) || {};

    if (!priceKeys[humanFriendlyId]) {
      return res.status(404).json({ message: 'Price key not found' });
    }

    delete priceKeys[humanFriendlyId];
    await priceKeysDB.set('priceKeys', priceKeys);

    res.status(200).json({ message: 'Price key deleted successfully' });
  } catch (error) {
    console.error("Error deleting price key:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/price-keys/:humanFriendlyId', authMiddleware, async (req, res) => {
  const { humanFriendlyId } = req.params;

  if (!humanFriendlyId) {
    return res.status(400).json({ message: 'Human-friendly ID is required' });
  }

  try {
    const priceKeys = (await priceKeysDB.get('priceKeys')) || {};

    if (!priceKeys[humanFriendlyId]) {
      return res.status(404).json({ message: 'Price key not found' });
    }

    res.status(200).json(priceKeys[humanFriendlyId]);
  } catch (error) {
    console.error("Error grabbing price key:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/price-keys', authMiddleware, async (req, res) => {
  try {
    const priceKeys = (await priceKeysDB.get('priceKeys')) || {};
    res.json(priceKeys);
  } catch (error) {
    console.error("Error retrieving price keys:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/start-checkout', async (req, res) => {
  const { humanFriendlyId } = req.body;

  if (!humanFriendlyId) {
    return res.status(400).json({ message: 'Price key is required' });
  }

  try {
    const priceKeys = (await priceKeysDB.get('priceKeys')) || {};
    const priceId = priceKeys[humanFriendlyId];
    let stripeMode;
    if (priceId.isSubscription == true) {
      stripeMode = 'subscription'
    } else {
      stripeMode = 'payment'
    }

    if (!priceId) {
      return res.status(404).json({ message: 'Price key not found' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId.stripePriceId,
          quantity: 1,
        }
      ],
      mode: stripeMode,
      metadata: {
        mode: stripeMode,
      },
      success_url: `${req.protocol}://${req.get('host')}/success`,
      cancel_url: `${req.protocol}://${req.get('host')}/failure`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.post('/check-payer', async (req, res) => {
  const { humanFriendlyId, email } = req.body;

  if (!humanFriendlyId || !email) {
    return res.status(400).json({ message: 'Both humanFriendlyId and email are required' });
  }

  console.log(humanFriendlyId, email)

  try {
    const priceKeys = (await priceKeysDB.get('priceKeys')) || {};
    const payers = (await payersDB.get('payers')) || [];

    const priceId = priceKeys[humanFriendlyId].stripePriceId;

    if (!priceId) {
      return res.status(404).json({ message: 'Price key not found' });
    }

    const payer = payers.find(
      (p) => p.customer.email === email && p.priceId === priceId
    );

    if (!payer) {
      return res.status(404).json({ message: 'Payer not found' });
    }

    res.json(payer);
  } catch (error) {
    console.error('Error in /check-payer route:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.get('/user', authMiddleware, async (req, res) => {
  res.json(req.user);
})

app.get('/dashboard', authMiddleware, (req, res) => {
  res.sendFile(__dirname + "/pages/dashboard.html");
});

app.get('/checkout', (req, res) => {
  res.sendFile(__dirname + "/pages/checkout.html");
});

app.get('/auto-checkout', (req, res) => {
  res.sendFile(__dirname + "/pages/auto.html");
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + "/pages/login.html");
});

app.get('/register', (req, res) => {
  res.sendFile(__dirname + "/pages/register.html");
});

app.get('/success', (req, res) => {
  res.sendFile(__dirname + "/pages/success.html");
});

app.get('/failure', (req, res) => {
  res.sendFile(__dirname + "/pages/failure.html");
});

app.get('/', (req, res) => {
  res.redirect("/dashboard");
});

app.listen(PORT, () => console.log(`Gus is running on ${PORT}`));