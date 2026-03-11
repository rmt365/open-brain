/**
 * Prompt Loader Utility
 *
 * Loads and manages AI prompts from YAML files with hot-reload support
 * and variable interpolation.
 *
 * Usage:
 * ```typescript
 * import { PromptLoader } from "@p2b/hono-core";
 *
 * const loader = new PromptLoader("/path/to/prompts/vision.yaml");
 * const prompt = loader.getPrompt("generate_vision", {
 *   opportunity_title: "My Podcast",
 *   source_titles: "Episode 1, Episode 2"
 * });
 * ```
 */

import { parse as parseYaml } from "jsr:@std/yaml@^1.0.5";
import { join, dirname, fromFileUrl } from "jsr:@std/path@^1.0.8";
import { watch } from "node:fs";

/**
 * Prompt template definition
 */
export interface PromptTemplate {
  description: string;
  variables: string[];
  prompt: string;
  system_prompt?: string; // Override default system prompt
}

/**
 * Prompt file structure
 */
export interface PromptFile {
  version: string;
  service: string;
  category: string;
  system_prompts: {
    default: string;
    [key: string]: string;
  };
  templates: {
    [key: string]: PromptTemplate;
  };
  models?: {
    default?: string;
    temperature?: number;
    max_tokens?: number;
    [key: string]: any;
  };
}

/**
 * Prompt loading options
 */
export interface PromptLoaderOptions {
  hotReload?: boolean;
  onReload?: (filePath: string) => void;
}

/**
 * Error thrown when prompt file cannot be loaded or parsed
 */
export class PromptLoadError extends Error {
  constructor(message: string, public filePath: string) {
    super(message);
    this.name = "PromptLoadError";
  }
}

/**
 * Error thrown when variable substitution fails
 */
export class PromptVariableError extends Error {
  constructor(message: string, public templateName: string, public missingVars: string[]) {
    super(message);
    this.name = "PromptVariableError";
  }
}

/**
 * PromptLoader - Loads and manages AI prompts from YAML files
 */
export class PromptLoader {
  private filePath: string;
  private data: PromptFile | null = null;
  private watcher: any = null;
  private options: PromptLoaderOptions;

  constructor(filePath: string, options: PromptLoaderOptions = {}) {
    this.filePath = filePath;
    this.options = {
      hotReload: options.hotReload ?? true,
      onReload: options.onReload,
    };

    this.load();

    if (this.options.hotReload) {
      this.setupWatcher();
    }
  }

  /**
   * Load the YAML file
   */
  private load(): void {
    try {
      const content = Deno.readTextFileSync(this.filePath);
      this.data = parseYaml(content) as PromptFile;

      // Validate structure
      this.validate();

      console.log(`[PromptLoader] Loaded prompts from ${this.filePath}`);
    } catch (error) {
      throw new PromptLoadError(
        `Failed to load prompt file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.filePath
      );
    }
  }

  /**
   * Validate prompt file structure
   */
  private validate(): void {
    if (!this.data) {
      throw new PromptLoadError("Prompt data is null", this.filePath);
    }

    if (!this.data.version) {
      throw new PromptLoadError("Missing version field", this.filePath);
    }

    if (!this.data.service) {
      throw new PromptLoadError("Missing service field", this.filePath);
    }

    if (!this.data.system_prompts || !this.data.system_prompts.default) {
      throw new PromptLoadError("Missing system_prompts.default", this.filePath);
    }

    if (!this.data.templates || Object.keys(this.data.templates).length === 0) {
      throw new PromptLoadError("No templates defined", this.filePath);
    }
  }

  /**
   * Setup file watcher for hot-reload
   */
  private setupWatcher(): void {
    try {
      this.watcher = watch(this.filePath, (eventType) => {
        if (eventType === "change") {
          console.log(`[PromptLoader] Detected change in ${this.filePath}, reloading...`);
          try {
            this.load();
            if (this.options.onReload) {
              this.options.onReload(this.filePath);
            }
          } catch (error) {
            console.error(`[PromptLoader] Failed to reload ${this.filePath}:`, error);
          }
        }
      });

      console.log(`[PromptLoader] Watching ${this.filePath} for changes`);
    } catch (error) {
      console.warn(`[PromptLoader] Could not setup file watcher:`, error);
    }
  }

  /**
   * Close the file watcher
   */
  public close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Get a prompt template with variable substitution
   *
   * @param templateName - Name of the template
   * @param variables - Variables to substitute
   * @param systemPromptName - Optional system prompt override (defaults to "default")
   * @returns Object with system and user prompts
   */
  public getPrompt(
    templateName: string,
    variables: Record<string, string | number | boolean> = {},
    systemPromptName: string = "default"
  ): { system: string; user: string } {
    if (!this.data) {
      throw new PromptLoadError("Prompt data not loaded", this.filePath);
    }

    const template = this.data.templates[templateName];
    if (!template) {
      throw new Error(`Template "${templateName}" not found in ${this.filePath}`);
    }

    // Check for missing required variables
    const providedVars = Object.keys(variables);
    const missingVars = template.variables.filter(v => !providedVars.includes(v));

    if (missingVars.length > 0) {
      throw new PromptVariableError(
        `Missing required variables for template "${templateName}": ${missingVars.join(', ')}`,
        templateName,
        missingVars
      );
    }

    // Get system prompt (template-specific or default)
    const systemPrompt = template.system_prompt || this.data.system_prompts[systemPromptName] || this.data.system_prompts.default;

    // Substitute variables in user prompt
    const userPrompt = this.substituteVariables(template.prompt, variables);

    return {
      system: systemPrompt.trim(),
      user: userPrompt.trim(),
    };
  }

  /**
   * Get system prompt by name
   */
  public getSystemPrompt(name: string = "default"): string {
    if (!this.data) {
      throw new PromptLoadError("Prompt data not loaded", this.filePath);
    }

    const prompt = this.data.system_prompts[name];
    if (!prompt) {
      throw new Error(`System prompt "${name}" not found in ${this.filePath}`);
    }

    return prompt.trim();
  }

  /**
   * Get model configuration
   */
  public getModelConfig(): Record<string, any> {
    if (!this.data) {
      throw new PromptLoadError("Prompt data not loaded", this.filePath);
    }

    return this.data.models || {};
  }

  /**
   * List all available templates
   */
  public listTemplates(): string[] {
    if (!this.data) {
      throw new PromptLoadError("Prompt data not loaded", this.filePath);
    }

    return Object.keys(this.data.templates);
  }

  /**
   * Get template metadata
   */
  public getTemplateInfo(templateName: string): Omit<PromptTemplate, 'prompt'> {
    if (!this.data) {
      throw new PromptLoadError("Prompt data not loaded", this.filePath);
    }

    const template = this.data.templates[templateName];
    if (!template) {
      throw new Error(`Template "${templateName}" not found in ${this.filePath}`);
    }

    return {
      description: template.description,
      variables: template.variables,
      system_prompt: template.system_prompt,
    };
  }

  /**
   * Substitute variables in a template string
   * Supports {{variable}} syntax
   */
  private substituteVariables(
    template: string,
    variables: Record<string, string | number | boolean>
  ): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }

    return result;
  }

  /**
   * Reload the prompt file manually
   */
  public reload(): void {
    this.load();
  }

  /**
   * Get the raw prompt data (for admin UI)
   */
  public getRawData(): PromptFile | null {
    return this.data;
  }

  /**
   * Get service metadata
   */
  public getMetadata(): { version: string; service: string; category: string } {
    if (!this.data) {
      throw new PromptLoadError("Prompt data not loaded", this.filePath);
    }

    return {
      version: this.data.version,
      service: this.data.service,
      category: this.data.category,
    };
  }
}

/**
 * Helper to create a PromptLoader from a relative path within a service
 *
 * @param serviceName - Name of the service (e.g., "bps", "bow", "platform")
 * @param fileName - Name of the prompt file (e.g., "vision.yaml")
 * @param options - Loader options
 * @returns PromptLoader instance
 */
export function createServicePromptLoader(
  serviceName: string,
  fileName: string,
  options: PromptLoaderOptions = {}
): PromptLoader {
  // Construct path: {service}/src/prompts/{fileName}
  const promptPath = join(
    Deno.cwd(),
    serviceName,
    "src",
    "prompts",
    fileName
  );

  return new PromptLoader(promptPath, options);
}
