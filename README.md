# Gus Payment Processor

Gus is a solution to monetizing Chrome extensions, while allowing the developer to keep 100% of the cut, and have fine-grain control over the processing. Manage extension licenses with minimal effort.

## Gus > ExtPay

1. Gus allows you to have full control over what gets sold (and what doesn't). 
2. Gus doesn't take a cut.
3. You can see Gus' source code
4. While Gus makes you get more hands on with integration, that means you get finer control.

## Payment Flow

1. Client inputs their email - store it client side, as it is how the client and payer record is associated
2. SDK checks if the human-readable ID and email returns a payer record from Gus API
3. If payer record is returned and the record shows that the license is of valid age: the user is a payer
4. If there is no payer record or the payer record shows an expired license, the user needs to pay
5. The SDK sends the user to the payment checkout site  (auto-fill human readable ID through parameter)
6. User completes payment through Stripe - while this is happening, the extension runs a payer record check frequently to activate the extension ASAP
7. User is redirected to a Sucess Website, and goes back to the extension
8. User data is accessible to the SDK, including their payment expiry, email, etc

## To-Do
1. Allow instance owners to manage profit splits through dashboard
2. Support non-monthly reoccuring payments

## Documentation

See [documentation](./documentation.md)

You can find the Gus SDK [here](./sdk/gus-sdk.js).