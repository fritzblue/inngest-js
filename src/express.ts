import type { Request, Response } from "express";
import shajs from "sha.js";
import { z } from "zod";
import { Inngest } from "./components/Inngest";
import { InngestFunction } from "./components/InngestFunction";
import { envKeys, queryKeys } from "./helpers/consts";
import { strBoolean } from "./helpers/scalar";
import { landing } from "./landing";
import {
  EventPayload,
  FunctionConfig,
  RegisterOptions,
  RegisterRequest,
  StepRunResponse,
} from "./types";
import { version } from "./version";

const registerResSchema = z.object({
  status: z.number().default(200),
  error: z.string().default("Successfully registered"),
});

type FetchT = typeof fetch;

/**
 * A handler for serving Inngest functions. This type should be used
 * whenever a handler for a new framework is being added to enforce that the
 * registration process is always the same for the user.
 *
 * @public
 */
export type ServeHandler = (
  /**
   * The name of this app, used to scope and group Inngest functions, or
   * the `Inngest` instance used to declare all functions.
   */
  nameOrInngest: string | Inngest<any>,

  /**
   * A key used to sign requests to and from Inngest in order to prove that the
   * source is legitimate.
   *
   * @link TODO
   */
  signingKey: string,
  functions: InngestFunction<any>[],
  opts?: RegisterOptions
) => any;

/**
 * Serve and register any declared functions with Inngest, making them available
 * to be triggered by events.
 *
 * Can either take an `Inngest` instance and a signing key, or can be used to
 * create custom handlers by passing in an `InngestCommHandler`.
 *
 * @public
 */
export const serve = <Events extends Record<string, EventPayload>>(
  ...args:
    | [
        nameOrInngest: string | Inngest<Events>,
        signingKey: string,
        functions: InngestFunction<Events>[],
        opts?: RegisterOptions
      ]
    | [commHandler: InngestCommHandler]
) => {
  if (args.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return args[0].createHandler();
  }

  const [nameOrInngest, signingKey, fns, opts] = args;
  const handler = new InngestCommHandler(nameOrInngest, signingKey, fns, opts);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return handler.createHandler();
};

/**
 * TODO Instead of `createHandler`, expose `createRequest` and `handleResponse`
 *
 * Overriding `createHandler` requires that we always remember crucial steps,
 * e.g. validating signatures, handling POST, etc.
 *
 * We should instead require that new comm handlers override only two functions:
 *
 * `createRequest()`
 * This is the function that is exposed. It must return a valid `HandlerRequest`
 *
 * `handleResponse()`
 * The input is a `StepResponse`, and output can be anything needed for the
 * platform
 *
 * This needs to also account for the ability to validate signatures etc.
 *
 * @public
 */
export class InngestCommHandler {
  public name: string;

  /**
   * The URL of the Inngest function registration endpoint.
   */
  private readonly inngestRegisterUrl: URL;

  protected readonly frameworkName: string = "default";
  protected signingKey: string | undefined;
  private readonly headers: Record<string, string>;
  private readonly fetch: FetchT;

  /**
   * Whether we should show the SDK Landing Page.
   *
   * This purposefully does not take in to account any environment variables, as
   * accessing them safely is platform-specific.
   */
  protected readonly showLandingPage: boolean | undefined;

  /**
   * A private collection of functions that are being served. This map is used
   * to find and register functions when interacting with Inngest Cloud.
   */
  private readonly fns: Record<string, InngestFunction<any>> = {};

  constructor(
    nameOrInngest: string | Inngest<any>,
    signingKey: string,
    functions: InngestFunction<any>[],
    { inngestRegisterUrl, fetch, landingPage }: RegisterOptions = {}
  ) {
    this.name =
      typeof nameOrInngest === "string" ? nameOrInngest : nameOrInngest.name;

    this.fns = functions.reduce<Record<string, InngestFunction<any>>>(
      (acc, fn) => {
        const id = fn.id(this.name);

        if (acc[id]) {
          throw new Error(
            `Duplicate function ID "${id}"; please change a function's name or provide an explicit ID to avoid conflicts.`
          );
        }

        return {
          ...acc,
          [id]: fn,
        };
      },
      {}
    );

    this.inngestRegisterUrl = new URL(
      inngestRegisterUrl || "https://api.inngest.com/fn/register"
    );

    this.signingKey = signingKey;
    this.showLandingPage = landingPage;

    this.headers = {
      "Content-Type": "application/json",
      "User-Agent": `InngestJS v${version} (${this.frameworkName})`,
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    this.fetch = fetch || (require("cross-fetch") as FetchT);
  }

  // hashedSigningKey creates a sha256 checksum of the signing key with the
  // same signing key prefix.
  private get hashedSigningKey(): string {
    if (!this.signingKey) {
      return "";
    }

    const prefix =
      this.signingKey.match(/^signkey-(test|prod)-/)?.shift() || "";
    const key = this.signingKey.replace(/^signkey-(test|prod)-/, "");

    // Decode the key from its hex representation into a bytestream
    return `${prefix}${shajs("sha256").update(key, "hex").digest("hex")}`;
  }

  public createHandler(): any {
    return async (req: Request, res: Response) => {
      const hostname = req.hostname || req.headers["host"];
      const protocol = hostname?.includes("://") ? "" : `${req.protocol}://`;

      let reqUrl;
      try {
        reqUrl = new URL(req.originalUrl, `${protocol}${hostname || ""}`);
        reqUrl.searchParams.delete(queryKeys.Introspect);
      } catch (e) {
        const message =
          "Unable to determine your site URL to serve the Inngest handler.";
        console.error(message);

        return res.status(500).json({ message });
      }

      switch (req.method) {
        case "GET": {
          const showLandingPage = this.shouldShowLandingPage(
            process.env[envKeys.LandingPage]
          );

          if (!showLandingPage) break;

          if (Object.hasOwnProperty.call(req.query, queryKeys.Introspect)) {
            return void res.status(200).json(this.registerBody(reqUrl));
          }

          // Grab landing page and serve
          return void res.status(200).send(landing);
        }

        case "PUT": {
          // Push config to Inngest.
          const { status, message } = await this.register(reqUrl);
          return void res.status(status).json({ message });
        }

        case "POST": {
          // Inngest is trying to run a step; confirm signed and run.
          const { fnId, stepId } = z
            .object({
              fnId: z.string().min(1),
              stepId: z.string().min(1),
            })
            .parse({
              fnId: req.query[queryKeys.FnId],
              stepId: req.query[queryKeys.StepId],
            });

          const stepRes = await this.runStep(fnId, stepId, req.body);

          if (stepRes.status === 500) {
            return void res.status(stepRes.status).json(stepRes.error);
          }

          return void res.status(stepRes.status).json(stepRes.body);
        }
      }

      return void res.sendStatus(405);
    };
  }

  protected async runStep(
    functionId: string,
    stepId: string,
    data: any
  ): Promise<StepRunResponse> {
    try {
      const fn = this.fns[functionId];
      if (!fn) {
        throw new Error(`Could not find function with ID "${functionId}"`);
      }

      const body = await fn["runStep"](stepId, data);

      return {
        status: 200,
        body,
      };
    } catch (err: unknown) {
      if (err instanceof Error) {
        return {
          status: 500,
          error: err.stack || err.message,
        };
      }

      return {
        status: 500,
        error: `Unknown error: ${JSON.stringify(err)}`,
      };
    }
  }

  protected configs(url: URL): FunctionConfig[] {
    return Object.values(this.fns).map((fn) => fn["getConfig"](url, this.name));
  }

  protected registerBody(url: URL): RegisterRequest {
    return {
      url: url.href,
      deployType: "ping",
      framework: this.frameworkName,
      appName: this.name,
      functions: this.configs(url),
      sdk: `js:v${version}`,
      v: "0.1",
    };
  }

  protected async register(
    url: URL
  ): Promise<{ status: number; message: string }> {
    const body = this.registerBody(url);

    let res: globalThis.Response;

    try {
      res = await this.fetch(this.inngestRegisterUrl.href, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          ...this.headers,
          Authorization: `Bearer ${this.hashedSigningKey}`,
        },
        redirect: "follow",
      });
    } catch (err: unknown) {
      console.error(err);

      return {
        status: 500,
        message: `Failed to register${
          err instanceof Error ? `; ${err.message}` : ""
        }`,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let data: z.input<typeof registerResSchema> = {};

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data = await res.json();
    } catch (err) {
      console.warn("Couldn't unpack register response:", err);
    }
    const { status, error } = registerResSchema.parse(data);
    console.log("Registered:", res.status, res.statusText, data);

    return { status, message: error };
  }

  protected shouldShowLandingPage(strEnvVar: string | undefined): boolean {
    return this.showLandingPage ?? strBoolean(strEnvVar) ?? true;
  }

  protected validateSignature(): boolean {
    return true;
  }

  protected signResponse(): string {
    return "";
  }
}