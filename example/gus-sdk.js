class Gus {
    /**
     * @param {string} instanceUrl - The API endpoint.
     * @param {string} priceKey - The human-readable price key.
     * @param {Object} [options] - Additional configuration options.
     * @param {number} [options.fetchTimeout=5000] - Timeout for fetch requests in milliseconds.
     * @param {number} [options.retryAttempts=1] - Number of additional attempts on failure.
     * @param {Function} [options.logger=console] - Logger instance for logging.
     */
    constructor(instanceUrl, priceKey, options = {}) {
        if (!instanceUrl || !priceKey) {
            return { status: "error", message: "Instance URL and Price Key are required to initialize GusSDK." };
        }

        this.instanceUrl = instanceUrl;
        this.priceKey = priceKey;
        this.email = null;
        this.payerData = null;

        this.fetchTimeout = options.fetchTimeout || 5000;
        this.retryAttempts = options.retryAttempts || 1;
        this.logger = options.logger || console;

        // Event emitter storage for hooks
        this.events = {};
    }

    /**
     * Register an event listener.
     * @param {string} event - The event name.
     * @param {Function} callback - Callback to invoke when the event is fired.
     */
    on(event, callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    }

    /**
     * Emit an event.
     * @param {string} event - The event name.
     * @param {any} data - Data to pass to the event listeners.
     */
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    this.logger.error(`Error in event handler for ${event}:`, e);
                }
            });
        }
    }

    /**
     * Internal fetch with timeout and retry.
     */
    async _fetchWithTimeout(url, options) {
        let attempts = 0;
        while (attempts <= this.retryAttempts) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout);

            try {
                const response = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                this.logger.warn(`Fetch attempt ${attempts + 1} failed:`, error);
                if (attempts === this.retryAttempts) {
                    throw error;
                }
                attempts++;
            }
        }
    }

    /**
     * Checks the payer status and sets payerData.
     * Emits 'payerChecked' on success.
     * @param {string} email - Email address to check.
     */
    async checkPayer(email) {
        if (!email) {
            return { status: "error", message: "Email is required to check payer status." };
        }

        this.email = email;
        const url = `${this.instanceUrl}/check-payer`;
        const requestOptions = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ humanFriendlyId: this.priceKey, email }),
        };

        try {
            const response = await this._fetchWithTimeout(url, requestOptions);
            const responseBody = await response.json();

            if (!response.ok) {
                return { status: "error", message: responseBody.message || "Failed to check payer status." };
            }

            this.payerData = responseBody;
            this.emit("payerChecked", responseBody);
            return { status: "success", data: responseBody };
        } catch (error) {
            this.logger.error("Error checking payer status:", error);
            return { status: "error", message: error.message };
        }
    }

    /**
     * Launches auto-checkout page after validating email.
     * Emits 'checkoutStarted' if launch is successful.
     */
    async startCheckout() {
        if (!this.email) {
            return { status: "error", message: "Email must be set before starting checkout." };
        }

        try {
            const autoCheckoutUrl = `${this.instanceUrl}/auto-checkout?guspricekey=${encodeURIComponent(this.priceKey)}`;
            window.open(autoCheckoutUrl); // Redirect to the auto-checkout page
            this.emit("checkoutStarted", { url: autoCheckoutUrl });
            return { status: "success", message: "Redirecting to auto-checkout." };
        } catch (error) {
            this.logger.error("Error starting checkout:", error);
            return { status: "error", message: error.message };
        }
    }

    /**
     * Validates if the license is valid based on expiry.
     * Emits 'licenseValidated' with the status.
     */
    isLicenseValid() {
        if (!this.payerData || !this.payerData.licenseExpires) {
            const errorMsg = "License data is missing or invalid.";
            this.emit("licenseValidated", { status: "error", message: errorMsg });
            return { status: "error", message: errorMsg };
        }

        const expiryDate = new Date(this.payerData.licenseExpires);
        const isValid = expiryDate > new Date();
        this.emit("licenseValidated", { status: "success", isValid });
        return { status: "success", isValid };
    }

    async refreshPayerData() {
        if (!this.email) {
            return { status: "error", message: "Email must be set to refresh payer data." };
        }
        return await this.checkPayer(this.email);
    }
}

export default Gus;