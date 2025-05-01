import { logExecution } from '../utils/utils';
import { activeStore } from '$lib/state/active.svelte';
import { getEncryptedApiKey } from '$lib/state/apiKey.svelte';
import { encryptApiKey } from '$lib/utils/crypto'; // <-- Added import
import { getOrCreateSessionId } from '$lib/utils/crypto';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

/**
 * Sends an API key for a specific provider to the backend server.
 * Handles encryption internally.
 * @param provider The provider the key belongs to.
 * @param apiKey The raw API key (will be encrypted).
 * @returns A promise that resolves to the backend response or rejects with an error.
 */
export async function sendApiKeyToBackend(provider: ProviderType, apiKey: string): Promise<{ status: string; message: string }> {
  // Note: Encryption now happens *inside* this function based on the raw key passed in.
  // This avoids needing a global store for the *raw* key.
  return logExecution(`Send API key for ${provider}`, async () => {
    activeStore.clearGlobalError();
    
    // Get session ID and encrypt the provided raw key
    const sessionId = getOrCreateSessionId();
    // We need the encryptApiKey function, assuming it exists in crypto.ts
    // If not, we need to add it or adjust this logic.
    // Let's assume it exists for now:
    // import { encryptApiKey } from '$lib/utils/crypto'; // Needs import
    const encryptedApiKey = await encryptApiKey(apiKey); // Encrypt the raw key

    console.log(`[apiKey.svelte.ts] Sending API key for ${provider}, encrypted key length:`, encryptedApiKey ? encryptedApiKey.length : 0);
    console.log('[apiKey.svelte.ts] Using session ID:', sessionId);
    
    try {
      // Add the 'provider' field to the request body
      console.log('[apiKey.svelte.ts] Request body fields: provider, encrypted_key, session_id');
      const requestBody = JSON.stringify({
        provider: provider, // Add provider field
        encrypted_key: encryptedApiKey,
        session_id: sessionId
      });
      console.log(`[apiKey.svelte.ts] Request body for ${provider}:`, requestBody);
      
      const response = await fetch(`${BASE_URL}/key/set`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });
      
      // Always parse the response, even if it's not "ok"
      const result = await response.json();
      
      // Check if the response indicates we need an API key
      if (result.status === "needs_key") {
        activeStore.setGlobalError(result.message || "Please enter your API key");
        throw new Error(result.message || "API key is required");
      }
      
      // Store the session ID from the response if provided
      if (result.session_id) {
        console.log('[apiKey.svelte.ts] Received session ID from server:', result.session_id);
        // We don't need to store it since we're using localStorage in getOrCreateSessionId
      }
      
      // Check for other error responses
      if (!response.ok) {
        let errorMsg = `HTTP error! Status: ${response.status}`;
        if (result.detail || result.message) {
          errorMsg += ` - ${result.detail || result.message}`;
        }
        activeStore.setGlobalError(errorMsg);
        throw new Error(errorMsg);
      }
      
      return result;
    } catch (error) {
      console.error('Error sending API key to backend:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      activeStore.setGlobalError(errorMsg || 'An unknown error occurred while sending API key');
      throw error;
    }
  });
}
