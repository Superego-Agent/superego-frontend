<script lang="ts">
  import {
    fetchConstitutionContent,
  } from "$lib/api/rest.svelte";
  import { activeStore } from "$lib/state/active.svelte";
  import { constitutionStore } from "$lib/state/constitutions.svelte"; // Use the unified store
  import { sessionStore } from "$lib/state/session.svelte";
  import { modelStore } from '$lib/state/modelStore.svelte'; // <-- Added import
  
  import IconAdd from "~icons/fluent/add-24-regular";
  import IconChevronDown from "~icons/fluent/chevron-down-24-regular";
  import IconChevronUp from "~icons/fluent/chevron-up-24-regular";
  import IconInfo from "~icons/fluent/info-24-regular";
  
  import AddConstitutionModal from "./AddConstitutionModal.svelte";
  import ConstitutionInfoModal from "./ConstitutionInfoModal.svelte";
  import RunConfigManager from "./RunConfigManager.svelte";
  import ConstitutionNode from './ConstitutionNode.svelte'; // <-- Added import

  let isExpanded = $state(true);
  let showInfoModal = $state(false);
  let modalIsLoading = $state(false);
  let modalError: string | null = $state(null);
  let modalTitle: string = $state("");
  let modalDescription: string | undefined = $state(undefined);
  let modalContent: string | undefined = $state(undefined);
  let showAddModal = $state(false);
  let expandedFolderPaths = $state(new Set<string>(['local'])); // State for expanded folders, 'local' expanded by default
  
  // --- Model Configuration State ---
  let selectedProvider = $state<ProviderType | null>(null); // Use specific ProviderType
  let selectedModel = $state<string | null>(null);
  let advancedParams = $state<Record<string, any>>({}); // Store for advanced param values
  let showAdvanced = $state(false); // State for advanced options visibility
  let advancedParamsJsonError = $state<Record<string, string | null>>({}); // Errors for JSON textareas
  
  // --- Derived State for Selected Paths ---
  
  async function showInfo(item: LocalConstitutionMetadata | RemoteConstitutionMetadata) {
    modalTitle = item.title;
    const isRemote = item.source === 'remote';

    modalDescription = isRemote
      ? item.description ?? `Remote constitution (${item.relativePath})`
      : `Local constitution`;
    modalContent = undefined;
    modalError = null;
    modalIsLoading = true;
    showInfoModal = true;

    if (!isRemote) {
      modalContent = item.text; 
      modalIsLoading = false;
    } else {
      // For remote, fetch content using relativePath
      try {
        modalContent = await fetchConstitutionContent(item.relativePath);
      } catch (err: any) {
        console.error("Failed to fetch constitution content:", err);
        modalError = err.message || "Unknown error fetching content.";
      } finally {
        modalIsLoading = false;
      }
    }
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
  }

  // Handles toggling expansion state for folders in the tree
  function handleToggleExpand(node: UIFolderNode) {
    const newSet = new Set(expandedFolderPaths);
    if (newSet.has(node.uiPath)) {
      newSet.delete(node.uiPath);
    } else {
      newSet.add(node.uiPath);
    }
    expandedFolderPaths = newSet;
  }

  // --- Reactive Derived State ---
  let activeSessionId = $derived(sessionStore.activeSessionId);
  let activeThreadConfigId = $derived(activeStore.activeConfigEditorId);
  let currentSession = $derived(activeSessionId ? sessionStore.uiSessions[activeSessionId] : null);
  let threadToUpdate = $derived(currentSession && activeThreadConfigId ? currentSession.threads[activeThreadConfigId] : null);
  let currentModules = $derived(threadToUpdate?.runConfig?.configuredModules ?? []);
  let activeModelConfig = $derived(threadToUpdate?.runConfig?.model); // Get model config from active thread
  
  // --- Effect to synchronize active config model to local state ---
  $effect(() => {
    // console.log('[EFFECT] Active Model Config changed:', activeModelConfig); // Debug log
    const defaultProvider = modelStore.providerNames[0] as ProviderType | undefined; // Assert type
    selectedProvider = activeModelConfig?.provider ?? defaultProvider ?? null; // Default to first provider if available
    selectedModel = activeModelConfig?.name ?? null;
  
    // Reset local params and populate from active config
    const newAdvancedParams: Record<string, any> = {};
    const paramsForProvider = modelStore.getParamsForProvider(selectedProvider);
    if (activeModelConfig && activeModelConfig.provider === selectedProvider) {
      const providerParamsKey = `${selectedProvider}_params` as keyof ModelConfig; // e.g., 'openai_params'
      const paramsFromConfig = activeModelConfig[providerParamsKey] as Record<string, any> | undefined;
      if (paramsFromConfig) {
        for (const paramDef of paramsForProvider) {
          if (paramsFromConfig[paramDef.key] !== undefined) {
            if (paramDef.type === 'object') {
              // Stringify object types for textarea
              try {
                newAdvancedParams[paramDef.key] = JSON.stringify(paramsFromConfig[paramDef.key], null, 2);
              } catch {
                newAdvancedParams[paramDef.key] = '{}'; // Default if stringify fails
              }
            } else {
              newAdvancedParams[paramDef.key] = paramsFromConfig[paramDef.key];
            }
          }
        }
      }
    }
    // Ensure all defined params for the provider have at least a default null/empty value in local state if not set
    for (const paramDef of paramsForProvider) {
        if (newAdvancedParams[paramDef.key] === undefined) {
            newAdvancedParams[paramDef.key] = paramDef.type === 'object' ? '' : ''; // Default empty for inputs/textareas
        }
    }
    advancedParams = newAdvancedParams;
    advancedParamsJsonError = {}; // Clear JSON errors on sync
    // console.log('[EFFECT] Synced local state:', selectedProvider, selectedModel, advancedParams); // Debug log
  });
  
  // --- Function to update the model config in the session store ---
  function updateModelConfigInStore() {
    if (!activeSessionId || !activeThreadConfigId || !currentSession || !threadToUpdate) return;
  
    // Ensure runConfig exists
    if (!threadToUpdate.runConfig) {
      threadToUpdate.runConfig = { configuredModules: [] };
    }
  
    // Ensure we have a selected provider before constructing
    if (!selectedProvider) {
        console.error("[RunConfigPanel] Cannot update model config: No provider selected.");
        return; // Exit if provider is null
    }
  
    const newModelConfig: ModelConfig = {
      provider: selectedProvider, // No longer needs null check here
      name: selectedModel ?? '', // Model name can be empty initially? Or default? Check briefing. Assuming empty is ok for now.
    };
  
    // Add provider-specific params
    const paramsForProvider = modelStore.getParamsForProvider(selectedProvider);
    if (paramsForProvider.length > 0 && selectedProvider) {
      const providerParamsKey = `${selectedProvider}_params` as keyof ModelConfig;
      const providerParams: Record<string, any> = {};
      let hasJsonError = false;
      advancedParamsJsonError = {}; // Reset errors
  
      for (const paramDef of paramsForProvider) {
        const value = advancedParams[paramDef.key];
        if (value !== undefined && value !== null && value !== '') {
           if (paramDef.type === 'object') {
              try {
                  providerParams[paramDef.key] = JSON.parse(value);
              } catch (e) {
                  console.warn(`[JSON Parse Error] Invalid JSON for ${paramDef.key}:`, value, e);
                  advancedParamsJsonError = { ...advancedParamsJsonError, [paramDef.key]: `Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}` };
                  hasJsonError = true;
                  // Don't add invalid JSON to the config
              }
           } else {
               providerParams[paramDef.key] = value;
           }
        } else if (!paramDef.optional) {
            // Handle missing required fields if necessary (though backend validation exists)
            console.warn(`Missing required parameter: ${paramDef.key}`);
        }
      }
  
      // Only add params object if it's not empty and no JSON errors occurred for object types
      if (Object.keys(providerParams).length > 0 && !hasJsonError) {
        (newModelConfig as any)[providerParamsKey] = providerParams;
      }
    }
  
    // Update the store immutably if the model config has changed
    if (JSON.stringify(threadToUpdate.runConfig.model) !== JSON.stringify(newModelConfig)) {
        threadToUpdate.runConfig.model = newModelConfig;
        currentSession.lastUpdatedAt = new Date().toISOString();
        console.log('[RunConfigPanel] Updated model config in store:', newModelConfig); // Debug log
    }
  }
  
  // --- Event Handlers ---
  
  function handleToggleSelect(uiPath: string, isSelected: boolean, metadata: LocalConstitutionMetadata | RemoteConstitutionMetadata) {
    // Use derived state variables directly
    if (!activeSessionId || !activeThreadConfigId || !currentSession || !threadToUpdate) {
      console.warn("RunConfigurationPanel: Cannot handle toggle select - missing active session/thread context.");
      return;
    }

    if (!threadToUpdate.runConfig) {
        threadToUpdate.runConfig = { configuredModules: [] };
    }

    if (isSelected) {
      // Add if not present, identified by title
      const alreadyExists = currentModules.some((m) => m.title === metadata.title);

      if (!alreadyExists) {
        // Construct the correct module type based on source
        const newModule: ConfiguredConstitutionModule =
          metadata.source === 'remote'
            ? { relativePath: metadata.relativePath, title: metadata.title, adherence_level: 3 }
            : { text: metadata.text, title: metadata.title, adherence_level: 3 };
        threadToUpdate.runConfig.configuredModules.push(newModule);
        currentSession.lastUpdatedAt = new Date().toISOString(); 
      }
    } else {
      // Remove based on title using filter (creates new array, assign back)
      const initialLength = currentModules.length;
      threadToUpdate.runConfig.configuredModules = currentModules.filter((m) => m.title !== metadata.title);
      if (threadToUpdate.runConfig.configuredModules.length !== initialLength) {
          currentSession.lastUpdatedAt = new Date().toISOString(); // Update timestamp only if removed
      }
    }
  }

  function findMetadataInTree(uiPath: string, nodes: UINode[]): LocalConstitutionMetadata | RemoteConstitutionMetadata | null {
    for (const node of nodes) {
      if (node.type === 'file' && node.uiPath === uiPath) {
        return node.metadata;
      } else if (node.type === 'folder') {
        const found = findMetadataInTree(uiPath, node.children);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  function handleSliderInput(uiPath: string, newLevel: number) {
    const metadata = findMetadataInTree(uiPath, constitutionStore.displayTree);
    if (!metadata) {
      console.error(`[RunConfigurationPanel] Could not find metadata for uiPath ${uiPath} in handleSliderInput`);
      return;
    }

    if (!activeSessionId || !activeThreadConfigId || !currentSession || !threadToUpdate) {
       console.warn(`RunConfigurationPanel: Could not find session/thread context for slider input.`);
       return;
    }
    if (!threadToUpdate.runConfig?.configuredModules) {
        console.warn(`[RunConfigurationPanel] runConfig or configuredModules missing for slider input on thread ${activeThreadConfigId}.`);
        return;
    }

    const moduleIndex = currentModules.findIndex((m) => m.title === metadata.title);

    if (moduleIndex !== -1) {
        currentModules[moduleIndex].adherence_level = newLevel;
        currentSession.lastUpdatedAt = new Date().toISOString();
    } else {
        console.warn(`[RunConfigurationPanel] Could not find module with title "${metadata.title}" to update level.`);
    }
  }

  // Effect to ensure a default config is selected if the active one becomes invalid
  $effect(() => {
    const activeSessionId = sessionStore.activeSessionId;
    const activeSession = activeSessionId ? sessionStore.uiSessions[activeSessionId] : null;
    const currentEditorId = activeStore.activeConfigEditorId;
    const sessionThreads = activeSession?.threads;

    if (sessionThreads) {
      const threadIds = Object.keys(sessionThreads);
      if (threadIds.length > 0) {
        const isValidEditorId = currentEditorId !== null && sessionThreads[currentEditorId] !== undefined;
        if (!isValidEditorId) {
          activeStore.setActiveConfigEditor(threadIds[0]);
          console.log(`[RunConfigPanel] Defaulting activeConfigEditorId to first thread: ${threadIds[0]}`);
        }
      } else {
        if (currentEditorId !== null) activeStore.setActiveConfigEditor(null);
      }
    } else {
      if (currentEditorId !== null) activeStore.setActiveConfigEditor(null);
    }
  });
  
  // --- Event handlers for model selection ---
  
  function handleProviderChange(event: Event) {
      const target = event.target as HTMLSelectElement;
      selectedProvider = target.value as ProviderType; // Assert type from select value
      selectedModel = null; // Reset model when provider changes
      advancedParams = {}; // Reset params
      advancedParamsJsonError = {}; // Reset errors
      showAdvanced = false; // Collapse advanced options
      updateModelConfigInStore(); // Update store
  }
  
  function handleModelChange(event: Event) {
      const target = event.target as HTMLSelectElement;
      selectedModel = target.value;
      updateModelConfigInStore(); // Update store
  }
  
  function handleAdvancedParamChange(key: string, value: string) {
      advancedParams = { ...advancedParams, [key]: value };
      // Clear specific JSON error on change
      if (advancedParamsJsonError[key]) {
          advancedParamsJsonError = { ...advancedParamsJsonError, [key]: null };
      }
      // Debounce or update on blur might be better for performance if needed
      updateModelConfigInStore();
  }
  
  function handleAdvancedParamBlur(key: string, type: 'string' | 'object') {
      // Re-validate JSON on blur for object types
      if (type === 'object') {
          const value = advancedParams[key];
          try {
              JSON.parse(value);
              advancedParamsJsonError = { ...advancedParamsJsonError, [key]: null }; // Clear error if valid
          } catch (e) {
               console.warn(`[JSON Parse Error] Invalid JSON for ${key} on blur:`, value, e);
               advancedParamsJsonError = { ...advancedParamsJsonError, [key]: `Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}` };
          }
      }
      // Optionally trigger store update on blur as well/instead of change
      // updateModelConfigInStore();
  }
  
</script>

<div class="selector-card">
  <!-- Header with integrated toggle -->
  <div
    class="selector-header"
    onclick={toggleExpand}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === "Enter" && toggleExpand()}
  >
    <span class="header-title">Flow Configurations</span>
    {#if isExpanded}
      <IconChevronDown class="toggle-icon" />
    {:else}
      <IconChevronUp class="toggle-icon" />
    {/if}
  </div>

  <!-- Collapsible content area -->
  {#if isExpanded}
    <RunConfigManager />
  
    <!-- === Model Configuration Section === -->
    <div class="model-config-section">
      <h3 class="section-title">Model Selection</h3>
      {#if modelStore.isLoading}
        <p class="loading-text">Loading models...</p>
      {:else if modelStore.error}
        <p class="loading-text error-text">Error loading models: {modelStore.error}</p>
      {:else}
        <div class="form-row">
          <label for="provider-select">Provider:</label>
          <select id="provider-select" bind:value={selectedProvider} onchange={handleProviderChange}>
            <option value={null} disabled selected={selectedProvider === null}>Select Provider</option>
            {#each modelStore.providerNames as providerName (providerName)}
              <option value={providerName}>{providerName}</option>
            {/each}
          </select>
        </div>
        {#if selectedProvider}
          <div class="form-row">
            <label for="model-select">Model:</label>
            <select id="model-select" bind:value={selectedModel} onchange={handleModelChange} disabled={modelStore.getModelsForProvider(selectedProvider).length === 0}>
              <option value={null} disabled selected={selectedModel === null}>Select Model</option>
              {#each modelStore.getModelsForProvider(selectedProvider) as modelName (modelName)}
                <option value={modelName}>{modelName}</option>
              {/each}
              {#if modelStore.getModelsForProvider(selectedProvider).length === 0}
                 <option value={null} disabled>No models listed for {selectedProvider}</option>
              {/if}
            </select>
          </div>
  
          <!-- Advanced Options -->
          {#if modelStore.getParamsForProvider(selectedProvider).length > 0}
            <button class="advanced-toggle" onclick={() => showAdvanced = !showAdvanced}>
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
              {#if showAdvanced} <IconChevronUp /> {:else} <IconChevronDown /> {/if}
            </button>
            {#if showAdvanced}
              <div class="advanced-options">
                {#each modelStore.getParamsForProvider(selectedProvider) as param (param.key)}
                  <div class="form-row param-row">
                    <label for={`param-${param.key}`}>
                      {param.key}{param.optional ? '' : ' *'}:
                    </label>
                    {#if param.type === 'object'}
                      <textarea
                        id={`param-${param.key}`}
                        class:invalid={advancedParamsJsonError[param.key]}
                        placeholder="Enter JSON object..."
                        bind:value={advancedParams[param.key]}
                        oninput={(e) => handleAdvancedParamChange(param.key, e.currentTarget.value)}
                        onblur={() => handleAdvancedParamBlur(param.key, param.type)}
                      ></textarea>
                      {#if advancedParamsJsonError[param.key]}
                        <span class="error-text param-error">{advancedParamsJsonError[param.key]}</span>
                      {/if}
                    {:else}
                       <input
                        type="text"
                        id={`param-${param.key}`}
                        bind:value={advancedParams[param.key]}
                        oninput={(e) => handleAdvancedParamChange(param.key, e.currentTarget.value)}
                        onblur={() => handleAdvancedParamBlur(param.key, param.type)}
                      />
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        {/if}
      {/if}
    </div>
  
    <!-- === Constitution Selection Section === -->
    <h3 class="section-title constitution-title">Constitution Selection</h3>
    <div class="options-container constitution-options">
      <!-- Use constitutionStore for loading/error state -->
      {#if constitutionStore.isLoadingGlobal}
        <p class="loading-text">Loading constitutions...</p>
      {:else if constitutionStore.globalError}
        <p class="loading-text error-text">Error: {constitutionStore.globalError}</p>
      {:else}
        <div class="options-wrapper">
          <!-- === Add New Constitution Item === -->
           <div
            class="option-item add-item"
            onclick={() => (showAddModal = true)}
            role="button"
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") showAddModal = true;
            }}
          >
            <div class="option-label add-label">
              <IconAdd class="add-icon" />
              <span class="title-text">Add a Constitution</span>
            </div>
          </div>

          <!-- === Hierarchical Constitution Tree === -->
          {#each constitutionStore.displayTree as node (node.uiPath)}
            {@const isSelected = node.type === 'file' && currentModules.some(m => m.title === node.metadata.title)}
            <ConstitutionNode
              node={node}
              level={0}
              isSelected={isSelected}
              activeConfigModules={currentModules} 
              {expandedFolderPaths}
              getModule={(uiPath: string) => currentModules.find(m => {
                  const meta = findMetadataInTree(uiPath, constitutionStore.displayTree);
                  return meta ? m.title === meta.title : false;
              }) ?? null}
              onToggleSelect={handleToggleSelect}
              onShowDetail={showInfo}
              onSliderInput={handleSliderInput}
              onToggleExpand={handleToggleExpand}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  
</div>

<!-- === Modals === -->
{#if showInfoModal}
  <ConstitutionInfoModal
    title={modalTitle}
    description={modalDescription}
    content={modalContent}
    isLoading={modalIsLoading}
    error={modalError}
    onClose={() => (showInfoModal = false)}
  />
{/if}

{#if showAddModal}
  <AddConstitutionModal
    onClose={() => (showAddModal = false)}
  />
{/if}

<style lang="scss">
  @use "../styles/mixins" as *;

  .selector-card {
    @include base-card(); // Use mixin
    overflow: hidden;
    margin-bottom: var(--space-sm);
    transition: all 0.2s ease;
  }

  .selector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) var(--space-md);
    cursor: pointer;
    border-bottom: 1px solid var(--input-border); /* Separator when expanded */
    background-color: var(--bg-elevated); /* Slightly different header bg */
    transition: background-color 0.2s ease;
  }
  .selector-header:hover {
    background-color: var(--primary-lightest);
  }

  .header-title {
    font-weight: 600; /* Make header title bolder */
    font-size: 0.9em;
    color: var(--text-primary);
  }


  .options-container {
    padding: var(--space-sm) var(--space-md);
    max-height: 350px; /* Further increased height */
    overflow-y: auto;
    @include custom-scrollbar(
      $track-bg: var(--bg-surface),
      $thumb-bg: var(--primary-light),
      $width: 6px
    ); // Use mixin
  }

  // Scrollbar styles handled by mixin above

  .options-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .option-item {
    display: grid;
    // grid-template-columns: minmax(150px, 3fr) minmax(100px, 1fr); // Removed old grid layout
    gap: var(--space-xs) var(--space-md);
    align-items: center;
    padding: var(--space-xs); /* Add padding for hover effect */
    border-radius: var(--radius-sm); /* Rounded corners for hover */
    transition: background-color 0.15s ease; /* Smooth hover transition */
  }
  .option-item:hover {
    // background-color: rgba(128, 128, 128, 0.1); /* Subtle hover background - Handled by Node */
  }

  .option-label {
    // grid-column: 1 / 2; // Removed old grid layout
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    cursor: pointer;
    transition: color 0.2s ease;
    overflow: hidden; /* Let the container handle overflow */
  }
  .option-label:hover .title-text {
    /* Target title text on hover */
    color: var(--primary);
  }
  .option-label input[type="checkbox"] {
    cursor: pointer;
    accent-color: var(--primary);
    flex-shrink: 0;
  }
  .title-text {
    /* Allow title to take space but truncate */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-grow: 1; /* Allow text to grow */
    margin-right: var(--space-xs);
  }
  .info-button {
    @include icon-button($padding: 0); // Use mixin, override padding
    flex-shrink: 0; // Keep specific flex-shrink
    opacity: 0.6; // Keep specific initial opacity

    &:hover { 
      color: var(--primary);
      opacity: 1;
      background-color: transparent; // Prevent mixin hover background
    }
  }

  /* Add constitution item styles */
  .add-item {
    cursor: pointer;
    grid-template-columns: 1fr; /* Use a single column for the add item */
  }

  .add-label {
    grid-column: 1 / -1;
    color: var(--primary);
  }


  .slider-container {
    // grid-column: 2 / 3; // Removed old grid layout
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .adherence-slider {
    flex-grow: 1; /* Allow slider to take available space */
    cursor: pointer;
    accent-color: var(--primary);
    height: 8px; /* Make slider visually smaller */
  }

  .level-display {
    font-size: 0.8em;
    color: var(--text-secondary);
    min-width: 25px; /* Ensure space for "X/5" */
    text-align: right;
  }

  .loading-text {
    font-style: italic;
    color: var(--text-secondary);
    padding: var(--space-md);
    text-align: center;
  }
  .error-text {
      color: var(--error);
      font-size: 0.8em;
  }
  
  /* Model Config Styles */
  .model-config-section {
      padding: var(--space-sm) var(--space-md);
      border-top: 1px solid var(--input-border); /* Separator */
      margin-top: var(--space-sm);
  }
  
  .section-title {
      font-weight: 600;
      font-size: 0.9em;
      margin-bottom: var(--space-sm);
      color: var(--text-secondary);
  }
  
  .form-row {
      display: grid;
      grid-template-columns: 100px 1fr; /* Label and control */
      gap: var(--space-sm);
      align-items: center;
      margin-bottom: var(--space-xs);
  }
  
  .form-row label {
      font-size: 0.85em;
      text-align: right;
      color: var(--text-secondary);
      padding-right: var(--space-sm);
  }
  
  .form-row select,
  .form-row input[type="text"],
  .form-row textarea {
      width: 100%;
      padding: var(--space-xs);
      border: 1px solid var(--input-border);
      border-radius: var(--radius-sm);
      background-color: var(--input-bg);
      color: var(--text-primary);
      font-size: 0.9em;
  }
  .form-row textarea {
      min-height: 60px; /* Give textarea some height */
      font-family: monospace; /* Use monospace for JSON */
      resize: vertical;
  }
  .form-row textarea.invalid {
      border-color: var(--error);
  }
  .param-error {
      grid-column: 2 / 3; /* Span across the input column */
      margin-top: -5px; /* Adjust spacing */
  }
  
  .advanced-toggle {
      @include button-reset; // Use reset mixin
      background-color: transparent; // Apply styles directly
      color: var(--primary);
      padding: var(--space-xs);
      font-size: 0.85em;
      margin-top: var(--space-sm);
      margin-bottom: var(--space-xs);
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      border: none;
      &:hover {
          text-decoration: underline;
      }
  }
  
  .advanced-options {
      padding-left: var(--space-md); /* Indent advanced options */
      border-left: 2px solid var(--primary-lightest);
      margin-left: 5px; /* Align with toggle text */
      padding-top: var(--space-xs);
      margin-top: var(--space-xs);
  }
  
  .param-row {
      margin-bottom: var(--space-sm); /* More space between advanced params */
  }
  
  .constitution-title {
      padding: 0 var(--space-md); /* Add padding to match other sections */
      margin-top: var(--space-sm);
  }
  
  .constitution-options {
      padding-top: 0; /* Remove top padding as title has it now */
  }
  
</style>
