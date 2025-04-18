import Gus from "./gus-sdk.js";

const gus = new Gus("https://creating-forest-viewing-blink.trycloudflare.com", "starter");

const emailInput = document.getElementById("email");
const checkBtn = document.getElementById("check");
const checkoutBtn = document.getElementById("checkout");
const output = document.getElementById("output");

checkBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  try {
    const data = await gus.checkPayer(email);
    output.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    output.textContent = "Error: " + err.message;
  }
});

checkoutBtn.addEventListener("click", async () => {
  try {
    await gus.startCheckout();
  } catch (err) {
    output.textContent = "Error: " + err.message;
  }
});
