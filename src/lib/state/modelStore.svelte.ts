import { fetchProvidersModels } from '$lib/api/rest.svelte';

// Define the structure for provider-specific parameter definitions
interface ParameterDefinition {
  key: string;
  type: 'string' | 'object'; // Add other types if needed (e.g., number, boolean)
  optional: boolean;
}

interface ProviderParameterConfig {
  parameters: ParameterDefinition[];
}

// Static definition of parameters per provider (as provided)
const STATIC_PARAMETER_DEFINITIONS: Record<string, ProviderParameterConfig> = {
  anthropic: {
    parameters: []
  },
  openai: {
    parameters: [
      { key: 'base_url', type: 'string', optional: true },
      { key: 'organization', type: 'string', optional: true }
    ]
  },
  google_genai: {
    parameters: []
  },
  openai_compatible: {
    parameters: [
      { key: 'base_url', type: 'string', optional: false },
      { key: 'default_headers', type: 'object', optional: true }
    ]
  },
  openrouter: {
    parameters: [
      { key: 'default_headers', type: 'object', optional: true }
    ]
  },
  // Add google_vertex if needed based on briefing (missed in user JSON)
  google_vertex: {
      parameters: [
          { key: 'project', type: 'string', optional: true },
          { key: 'location', type: 'string', optional: true }
      ]
  }
};


class ModelStore {
  // State for providers and their models
  providersModels = $state<Record<string, string[]>>({});
  // State for loading status
  isLoading = $state<boolean>(true);
  // State for error messages
  error = $state<string | null>(null);

  // Static parameter definitions accessible from the instance
  parameterDefinitions = STATIC_PARAMETER_DEFINITIONS;

  constructor() {
    this.loadProvidersModels();
  }

  async loadProvidersModels() {
    this.isLoading = true;
    this.error = null;
    try {
      const data = await fetchProvidersModels();
      // Filter definitions to only include providers returned by the API
      const availableProviders = Object.keys(data);
      const filteredDefinitions: Record<string, ProviderParameterConfig> = {};
      for (const provider of availableProviders) {
          if (STATIC_PARAMETER_DEFINITIONS[provider]) {
              filteredDefinitions[provider] = STATIC_PARAMETER_DEFINITIONS[provider];
          } else {
              console.warn(`[ModelStore] Missing parameter definition for provider: ${provider}`);
              // Provide a default empty definition if missing
              filteredDefinitions[provider] = { parameters: [] };
          }
      }
      this.providersModels = data;
      this.parameterDefinitions = filteredDefinitions; // Store filtered definitions
      console.log('[ModelStore] Providers and models loaded:', data);
    } catch (err: any) {
      console.error('[ModelStore] Failed to load providers/models:', err);
      this.error = err.message || 'Failed to load model information.';
      this.providersModels = {}; // Reset on error
      this.parameterDefinitions = {};
    } finally {
      this.isLoading = false;
    }
  }

  // Helper getter for provider names
  get providerNames(): string[] {
    return Object.keys(this.providersModels);
  }

  // Helper getter for models of a specific provider
  getModelsForProvider(provider: string | null | undefined): string[] {
    return provider ? this.providersModels[provider] ?? [] : [];
  }

   // Helper getter for parameter definitions of a specific provider
   getParamsForProvider(provider: string | null | undefined): ParameterDefinition[] {
    return provider ? this.parameterDefinitions[provider]?.parameters ?? [] : [];
  }
}

// Export singleton instance
export const modelStore = new ModelStore();