<script lang="ts">
  // import { apiKeyStore, setApiKey } from "../state/apiKey.svelte"; // No longer using global single key store
  import { sendApiKeyToBackend } from "../services/apiKey.svelte"; // Will modify this service later
  import { activeStore } from "$lib/state/active.svelte";
  import { modelStore } from '$lib/state/modelStore.svelte'; // Import model store
  import IconEye from "~icons/fluent/eye-24-regular";
  import IconEyeOff from "~icons/fluent/eye-off-24-regular";
  import IconInfo from "~icons/fluent/info-24-regular";
  import IconDelete from "~icons/fluent/delete-24-regular";
  import IconCheck from "~icons/fluent/checkmark-24-regular";
  import IconError from "~icons/fluent/error-circle-24-regular";

  // Component state
  let providerApiKeys = $state<Record<string, string>>({}); // Key: providerName, Value: apiKey
  let showProviderApiKey = $state<Record<string, boolean>>({}); // Key: providerName, Value: show/hide state
  let isTooltipVisible = $state(false); // Keep tooltip state
  let isSending = $state(false); // Overall sending state for "Save All"
  let sendStatus = $state<"idle" | "success" | "error">("idle");
  let statusMessage = $state("");

  // Initialize state based on providers
  $effect(() => {
      const initialKeys: Record<string, string> = {};
      const initialVisibility: Record<string, boolean> = {};
      for (const provider of modelStore.providerNames) {
          initialKeys[provider] = ''; // Start with empty keys
          initialVisibility[provider] = false; // Start hidden
      }
      providerApiKeys = initialKeys;
      showProviderApiKey = initialVisibility;
      // console.log('Initialized API Key state for providers:', modelStore.providerNames); // Debug log
  });
  
  // Update the specific provider's key state
  function handleInputChange(providerName: ProviderType, value: string) {
    providerApiKeys = { ...providerApiKeys, [providerName]: value };
    // Reset global status when any key changes
    sendStatus = "idle";
    statusMessage = "";
  }

  // Send all non-empty API keys to the backend
  async function saveAllKeys() {
    // Include ALL providers, sending empty strings for cleared keys
    const keysToSend: { provider: ProviderType; key: string }[] = modelStore.providerNames.map(provider => ({
        provider: provider as ProviderType,
        key: providerApiKeys[provider] ?? '' // Send empty string if null/undefined
    }));
  
    // No need to check keysToSend.length === 0, always send all providers
    // if (keysToSend.length === 0) {
    //   activeStore.setGlobalError("Please enter at least one API key to save.");
    //   return;
    // }
  
    isSending = true;
    sendStatus = "idle";
    statusMessage = "";

    let successCount = 0;
    let errorCount = 0;
    let firstErrorMessage = "";
  
    // Send keys sequentially or in parallel? Sequential is simpler for status.
    for (const item of keysToSend) {
        try {
            // TODO: Update sendApiKeyToBackend to accept provider and key
            const result = await sendApiKeyToBackend(item.provider, item.key);
            successCount++;
        } catch (error) {
            errorCount++;
            if (!firstErrorMessage) {
                firstErrorMessage = error instanceof Error ? error.message : `Failed to save key for ${item.provider}`;
            }
            console.error(`Failed to send API key for ${item.provider}:`, error);
        }
    }
  
    isSending = false;
  
    if (errorCount === 0 && successCount > 0) {
        sendStatus = "success";
        statusMessage = `${successCount} API key(s) saved successfully.`;
    } else if (errorCount > 0) {
        sendStatus = "error";
        statusMessage = `Error saving keys. ${firstErrorMessage} (${errorCount} failed, ${successCount} succeeded).`;
    } else {
        // Should not happen if keysToSend was not empty, but handle defensively
        sendStatus = "idle";
        statusMessage = "";
    }
  }
  
  // Toggle visibility of a specific provider's API key
  function toggleVisibility(providerName: ProviderType) {
    showProviderApiKey = { ...showProviderApiKey, [providerName]: !showProviderApiKey[providerName] };
  }
  
  // Clear a specific provider's API key
  function clearApiKey(providerName: ProviderType) {
    providerApiKeys = { ...providerApiKeys, [providerName]: '' };
    // Reset status if the cleared key was the only one potentially causing an error message?
    // Or just let the user re-save. Simpler for now.
    // sendStatus = "idle";
    // statusMessage = "";
  }

  // Show/hide tooltip
  function showTooltip() {
    isTooltipVisible = true;
  }

  function hideTooltip() {
    isTooltipVisible = false;
  }
</script>

<div class="api-key-container">
  <div class="api-key-header">
    <label>API Key Management</label> <!-- Changed header -->
    <div
      class="info-icon"
      onmouseenter={showTooltip}
      onmouseleave={hideTooltip}
      onfocus={showTooltip}
      onblur={hideTooltip}
      tabindex="0"
      role="button"
    >
      <IconInfo />
      {#if isTooltipVisible}
        <div class="tooltip">
          This API key is stored in memory only and will be cleared when you
          refresh or close the page. <!-- TODO: Update tooltip if backend stores keys -->
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Loop through providers -->
      {#if modelStore.isLoading}
          <p>Loading providers...</p>
      {:else if modelStore.error}
          <p class="status-message error">Error loading providers: {modelStore.error}</p>
      {:else}
          {#each modelStore.providerNames as providerName (providerName)}
              {@const typedProviderName = providerName as ProviderType}
              <div class="provider-key-group">
                  <label for={`api-key-input-${providerName}`}>{providerName} API Key:</label>
                  <div class="input-group">
                      <input
                          id={`api-key-input-${providerName}`}
                          type={showProviderApiKey[providerName] ? "text" : "password"}
                          placeholder={`Enter ${providerName} API key`}
                          bind:value={providerApiKeys[providerName]}
                          oninput={(e) => handleInputChange(typedProviderName, e.currentTarget.value)}
                          class="api-key-input"
                      />
                      <button
                          type="button"
                          class="icon-button visibility-toggle"
                          onclick={() => toggleVisibility(typedProviderName)}
                          title={showProviderApiKey[providerName] ? `Hide ${providerName} key` : `Show ${providerName} key`}
                      >
                          {#if showProviderApiKey[providerName]} <IconEyeOff /> {:else} <IconEye /> {/if}
                      </button>
                      {#if providerApiKeys[providerName]}
                          <button
                              type="button"
                              class="icon-button clear-button"
                              onclick={() => clearApiKey(typedProviderName)}
                              title={`Clear ${providerName} key`}
                          >
                              <IconDelete />
                          </button>
                      {/if}
                  </div>
              </div>
          {/each}
      {/if}
      
      <div class="api-key-actions">
        <button
          type="button"
          class="send-button"
          onclick={saveAllKeys}
          disabled={isSending || modelStore.isLoading || !!modelStore.error}
        >
          {#if isSending} Saving... {:else} Save All Keys {/if}
        </button>
      
        {#if sendStatus === "success"}
      <div class="status-message success">
        <IconCheck />
        <span>{statusMessage}</span>
      </div>
    {:else if sendStatus === "error"}
      <div class="status-message error">
        <IconError />
        <span>{statusMessage}</span>
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  @use "../styles/mixins" as *; // Ensure mixins are available if needed
  
  .api-key-container {
    margin-bottom: var(--space-md);
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    background-color: var(--bg-elevated);
  }

  .api-key-header {
    display: flex;
    align-items: center;
    margin-bottom: var(--space-sm); // Increased bottom margin for header
  
    label {
      font-size: 0.9em; // Keep label size consistent
      font-weight: 500;
      color: var(--text-secondary);
      margin-right: var(--space-xs);
    }
  }

  .info-icon {
    position: relative;
    display: inline-flex;
    color: var(--text-secondary);
    cursor: pointer;

    &:hover,
    &:focus {
      color: var(--primary);
    }
  }

  .tooltip {
    position: absolute;
    top: 100%;
    left: 0;
    width: 250px;
    padding: var(--space-xs);
    background-color: var(--bg-surface);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    font-size: 0.8em;
    color: var(--text-primary);
    z-index: 100;
    margin-top: var(--space-xs);
  }

  .input-group {
    display: flex;
    align-items: center;
    position: relative; // Keep for icon positioning
    margin-bottom: var(--space-xs); // Add space below each input group
  }
  
  .provider-key-group {
      margin-bottom: var(--space-md); // Space between provider sections
      label {
          display: block; // Make label block for spacing
          font-size: 0.85em;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: var(--space-xs);
      }
  }
  
  .api-key-input {
    flex: 1;
    padding: var(--space-sm);
    padding-right: calc(
      var(--space-sm) * 2 + 24px
    ); /* Make room for the buttons */
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    background-color: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.9em;

    &:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary-light);
    }

    &::placeholder {
      color: var(--text-tertiary);
    }
  }

  .icon-button {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 4px;
    transition: color 0.2s ease;

    &:hover,
    &:focus {
      color: var(--primary);
    }
  }

  .visibility-toggle {
    right: 4px;
  }

  .clear-button {
    right: 28px;

    &:hover,
    &:focus {
      color: var(--error);
    }
  }

  .api-key-actions {
    margin-top: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .send-button {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.9em;
    transition: background-color 0.2s ease;

    &:hover:not(:disabled) {
      background-color: var(--primary-dark);
    }

    &:disabled {
      background-color: var(--primary-light);
      cursor: not-allowed;
      opacity: 0.7;
    }
  }

  .status-message {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.8em;
    padding: var(--space-xs);
    border-radius: var(--radius-sm);

    &.success {
      background-color: var(--success-bg);
      color: var(--success);
    }

    &.error {
      background-color: var(--error-bg);
      color: var(--error);
    }
  }

  .api-key-required-message {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.9em;
    padding: var(--space-sm);
    margin-bottom: var(--space-sm);
    border-radius: var(--radius-sm);
    background-color: var(--error-bg);
    color: var(--error);
    border-left: 3px solid var(--error);
  }
</style>
