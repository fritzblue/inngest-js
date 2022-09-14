import { EventPayload, FunctionConfig, FunctionOptions, Steps } from "../types";

export class InngestFunction<Events extends Record<string, EventPayload>> {
  readonly #opts: FunctionOptions;
  #trigger: keyof Events;
  readonly #steps: Steps;

  constructor(opts: FunctionOptions, trigger: keyof Events, steps: Steps) {
    this.#opts = opts;
    this.#trigger = trigger;
    this.#steps = steps || {};
  }

  public get name() {
    return this.#opts.name;
  }

  /**
   * Retrieve the Inngest config for this function.
   */
  private getConfig(
    /**
     * Must be provided a URL that will be used to trigger the step. This
     * function can't be expected to know how it will be accessed, so relies on
     * an outside method providing context.
     */
    url: URL
  ): FunctionConfig {
    return {
      id: this.#opts.name,
      name: this.#opts.name,
      triggers: [{ event: this.#trigger as string }],
      steps: Object.keys(this.#steps).reduce<FunctionConfig["steps"]>(
        (acc, stepId) => {
          return {
            ...acc,
            [stepId]: {
              id: stepId,
              name: stepId,
              runtime: {
                type: "remote",
                url: url.href,
              },
            },
          };
        },
        {}
      ),
    };
  }

  /**
   * Run a step in this function defined by `stepId` with `data`.
   */
  private runStep(stepId: string, data: any): Promise<unknown> {
    const step = this.#steps[stepId];
    if (!step) {
      throw new Error(
        `Could not find step with ID "${stepId}" in function "${this.name}"`
      );
    }

    return step["run"](data);
  }
}