 # Frontend Briefing: Model Switcher Integration

**Date:** 2025-04-29

**Feature:** Allow users to select the LLM provider and specific model to be used for a conversation run.

**Target Repository:** This briefing applies to the **separate frontend repository**.

## 1. Overview

The backend has been updated to support selecting different Large Language Models (LLMs) from various providers (Anthropic, OpenAI, Google, etc.) on a per-run basis. This configuration is now part of the `RunConfig` object sent when initiating a stream via the `/api/runs/stream` endpoint.

The frontend needs UI components to allow users to configure this model selection and send the updated `RunConfig` to the backend.

## 2. Backend API Changes (`/api/runs/stream`)

The `RunConfig` object sent in the request body to `/api/runs/stream` has been updated. It now includes a nested `model` object of type `ModelConfig`.

**Updated `RunConfig` Structure (Conceptual):**

```typescript
interface RunConfig {
  configuredModules: ConfiguredConstitutionModule[]; // Existing
  model: ModelConfig;                             // New
}

interface ModelConfig {
  provider: ProviderType; // Default: "anthropic"
  name: string;           // Default: "claude-3-haiku-20240307"

  // Optional provider-specific parameters
  // Only ONE of these should be populated, matching the 'provider' field.
  // The backend validator enforces this.
  anthropic_params?: AnthropicParams;
  google_genai_params?: GoogleGenAIParams;
  google_vertex_params?: GoogleVertexParams;
  openai_params?: OpenAIParams;
  openai_compatible_params?: GenericOAIParams;
  openrouter_params?: OpenRouterParams;
}

// --- Provider Types ---
type ProviderType =
  | "anthropic"
  | "google_genai"
  | "google_vertex"
  | "openai"
  | "openai_compatible"
  | "openrouter";

// --- Provider-Specific Parameter Interfaces ---
interface AnthropicParams {} // No extra params needed for basic use

interface GoogleGenAIParams {} // No extra params needed for basic use

interface GoogleVertexParams {
  project?: string | null;
  location?: string | null;
}

interface OpenAIParams {
  base_url?: string | null; // Optional HttpUrl
  organization?: string | null;
}

interface GenericOAIParams {
  base_url: string; // Required HttpUrl
  default_headers?: Record<string, string> | null;
}

interface OpenRouterParams {
  // base_url is fixed on backend, but could be displayed for info
  default_headers?: Record<string, string> | null; // e.g., {"HTTP-Referer": "...", "X-Title": "..."}
}

// Existing ConfiguredConstitutionModule definition...
interface ConfiguredConstitutionModule {
    title: string;
    adherence_level: string;
    text?: string | null;
    relativePath?: string | null;
}
```

**Example Request Body Payload:**

```json
{
  "configuredModules": [
    {
      "title": "Example Constitution",
      "adherence_level": "high",
      "relativePath": "data/constitutions/example.md"
    }
  ],
  "model": {
    "provider": "openai_compatible",
    "name": "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF",
    "openai_compatible_params": {
      "base_url": "http://localhost:1234/v1"
    }
  }
}
```

## 3. Frontend UI Requirements

A UI component (likely integrated into the `RunConfigurationPanel` or similar) is needed to:

1.  **Select Provider:** Allow the user to choose a `provider` from the `ProviderType` list (e.g., using a dropdown).
2.  **Input Model Name:** Provide a text input field for the user to enter the specific `name` of the model for the selected provider. Consider providing sensible defaults or suggestions if possible.
3.  **Input Provider-Specific Parameters (Conditional):**
    *   Based on the selected `provider`, dynamically show input fields for the relevant optional or required parameters defined in the interfaces above:
        *   `openai`: Optional inputs for `base_url`, `organization`.
        *   `openai_compatible`: **Required** input for `base_url`, optional input for `default_headers` (perhaps a simple key-value pair editor or JSON input).
        *   `openrouter`: Optional input for `default_headers`.
        *   `google_vertex`: Optional inputs for `project`, `location`.
    *   Hide parameter inputs that are not relevant to the selected provider.
4.  **Construct `RunConfig`:** Assemble the complete `RunConfig` object, including the `configuredModules` (from existing constitution selection) and the new `model` object based on the user's selections. Ensure only the correct provider-specific parameter object (e.g., `openai_compatible_params`) is included in the `model` object, matching the selected `provider`.
5.  **Send Request:** Send the constructed `RunConfig` object in the body of the POST request to `/api/runs/stream` when the user starts a run.

## 4. API Key Handling

**IMPORTANT:** The frontend **does not** handle or send API keys. API key management is done entirely on the backend using `keystore.py`. The backend uses the `provider` field sent in the `ModelConfig` to look up the appropriate key.
**Update (2025-04-29):** While the frontend doesn't send keys during runs, the API endpoint used to *set* an API key (`/api/key/set`) has been updated. The request body for this endpoint now **requires** a `provider` field (string, e.g., "openai", "anthropic") in addition to the `encrypted_key`. The frontend UI component responsible for submitting the API key needs to be updated to include a way for the user to specify which provider the key belongs to when they submit it.

## 5. Error Handling

The backend performs validation on the received `ModelConfig`:
*   It checks if the correct provider-specific parameter object is present based on the `provider` field.
*   It checks if required parameters (like `base_url` for `openai_compatible`) are provided.
*   It checks if the necessary API key exists in its keystore for the selected provider.

If validation fails, the backend will likely return an error response (e.g., 4xx status code with an error message). The frontend should be prepared to catch these errors and display informative messages to the user (e.g., "Missing required Base URL for OpenAI Compatible provider", "API Key for OpenAI not configured on backend").

## 6. Summary

Integrate UI elements for selecting LLM provider, model name, and relevant provider-specific parameters. Construct the updated `RunConfig` object with the nested `ModelConfig` and send it to `/api/runs/stream`. Handle potential validation errors from the backend. Do not handle API keys.