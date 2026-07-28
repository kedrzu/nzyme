import { onMounted, onUnmounted, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { makeRef } from './reactivity/makeRef.js';

interface UseSmsOtpOptions {
    onSuccess: (code: string) => void;
    enabled?: MaybeRefOrGetter<boolean>;
}

declare global {
    interface CredentialRequestOptions {
        otp: { transport: ['sms'] };
    }
}

/** Listens for incoming SMS OTP codes via the Web OTP API and calls onSuccess with the code. */
export function useSmsOtp(options: UseSmsOtpOptions) {
    let abortController: AbortController | undefined;
    const enabled = makeRef(options.enabled);

    onMounted(init);
    onUnmounted(abort);
    watch(enabled, value => (value !== false ? void init() : abort()));

    async function init() {
        if (enabled.value === false) {
            return;
        }

        if (!('OTPCredential' in window)) {
            return;
        }

        const controller = new AbortController();
        abortController = controller;

        try {
            const otp = await navigator.credentials.get({
                otp: { transport: ['sms'] },
                signal: controller.signal,
            });

            if (otp && 'code' in otp && typeof otp.code === 'string') {
                options.onSuccess(otp.code);
            }
        } catch (error) {
            // Aborting the request rejects the pending get(), which happens on every unmount or
            // disable while listening. Nothing awaits init(), so rethrowing here would surface as
            // an unhandled rejection rather than a real failure.
            if (!controller.signal.aborted) {
                throw error;
            }
        } finally {
            // Only clear the shared handle if a later init() has not already replaced it.
            if (abortController === controller) {
                abortController = undefined;
            }
        }
    }

    function abort() {
        try {
            abortController?.abort('Canceled');
            abortController = undefined;
        } catch {
            // ignore
        }
    }
}
