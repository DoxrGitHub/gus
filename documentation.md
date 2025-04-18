# Gus Documentation

Gus is to be integrated with and used with one sole product owner account. However, splitting profits with other Stripe users is to be added.

## Install The Gus Central Server

You *need* to install Bun, NPM/Node will not be sufficient. Once the repository is cloned, run:

`bun install`

Ensure that .env variables are filled out properly. Example .env:

```
PORT=8080
SIGNING_SECRET=super_secret_hashing_secret
STRIPE_SECRET_KEY=sk_secret_key
STRIPE_WEBHOOK_SECRET=whsec_secret_key
REG_KEY='Gus Registration Key'
```

PORT: Port that Gus listens on
SIGNING_SECRET Secret: Can be anything, it's used as another layer of protection
STRIPE_SECRET_KEY: The main Stripe account's private API key
STRIPE_WEBHOOK_SECRET: You must create a Webhook for Stripe, and make the webhook URL: `https://[instance].tld/webhook` and copy the webhook secret to .env
REG_KEY: To create an administrator account on Gus, make sure to use the Gus Registration Key that you set in .env. This value can be anything

To start the Gus server, run 

`bun run main.mjs`

Note that you will need to configure a reverse proxy system to enable HTTPS, link to a domain (for Stripe), etc.

## Payment Flow
You will want to read this to know how Gus should be used. 

1. User inputs their email, stored client-side*. This is how the payer record is associated.
2. The SDK queries the Gus API using the human-readable ID and email.
3. If a payer record is found and the license is still valid (SDK checks this), the user has a valid license (sounds redundant, but this means that they should now recieve premium features).
4. If no record is found or the license is expired, the user should prompted to pay or handled as a free user
5. During checkout, the SDK redirects the user to the Stripe checkout page.
6. While the user completes payment, the SDK periodically checks for an active payer record to enable access as soon as possible.
7. Upon successful payment, the user is redirected to a success page (static), so they should return to the extension.
8. The SDK/extension can now access user data such as email, license expiration, and payment status.

## Using the SDK

The Gus SDK is meant to be used with *Chrome Extensions*, not normal pages; trying to do that may cause errors.

### Start Gus

Ensure that you're running in a module environment. For MV3 background scripts (service worker context) use importScript()

```js
import Gus from './sdk/gus-sdk.js';

const instanceUrl = 'https://api.guscentralserver.com';
const priceKey = 'Your registered GPK (human readable)';
const options = {
    fetchTimeout: 3000, // Custom timeout in milliseconds,
    retryAttempts: 1,   // Number of retry attempts to the API
    logger: console     // Log stuff to console
};

const gus = new Gus(instanceUrl, priceKey, options);
```

### Check Payer Status

Note: Gus expects you to collect the user's email, client side; this is used to associate GPK records with users.

```js
const email = 'user@example.com';

gus.checkPayer(email)
   .then(result => {
        if (result.status === "success") {
            console.log("Payer verified:", result.data);
        } else {
            console.error("Payer verification error:", result.message);
        }
   })
   .catch(error => console.error("Unexpected error:", error));
```

### Start a Checkout Session

If the payer does not have a record or has an expired record, and is willing to start checkout, run this:

```js
gus.startCheckout()
   .then(result => console.log(result.message))
   .catch(error => console.error("Checkout error:", error));
```

It will redirect the user to the Gus instance, where they will be directed to the official Stripe checkout page. Once completed, they will see a static success (or failure) page, and they will be told to check the extension again. It is the developer's duty to check license validation frequently, to ensure that premium features are unlocked once the user pays for a license.

### Refresh Payer Data

Essentially checkPayerData but once the user's email has been forwarded and used to check at least once, then you don't need to specify it anymore. This is session based; if the extension restarts, it will not be saved. It is recommended that YOU store the payer's email (after client side authentication) through `chrome.storage`.

```js
gus.refreshPayerData()
   .then(result => console.log("Payer data refreshed:", result))
   .catch(error => console.error("Error refreshing payer data:", error));
```

### Events

Gus exposes some events to make usage easier.

```js
// Log when payer status is checked
gus.on('payerChecked', (data) => {
    console.log("Event: payerChecked", data);
});

// Log when checkout starts
gus.on('checkoutStarted', (data) => {
    console.log("Event: checkoutStarted", data);
});

// Log license validation outcome
gus.on('licenseValidated', (info) => {
    console.log("Event: licenseValidated", info);
});
```

## Getting a Stripe Price Key And Registering a GPK

Create a product on Stripe (on the account associated with the Stripe keys), then create a payment method (ex. 19.99 re-occuring); that is a Stripe Price Key. A GPK (Gus Price Key) is a human-readable identifier for these Stripe Price Keys. You can associate a GPK to a Stripe Price Key in the dashboard, after logging in. 