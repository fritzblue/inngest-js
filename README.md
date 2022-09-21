<div align="center">
  <br/>
    <a href="https://www.inngest.com"><img src="https://user-images.githubusercontent.com/306177/191580717-1f563f4c-31e3-4aa0-848c-5ddc97808a9a.png" width="250" /></a>
  <br/>
  <br/>
  <p>
    Serverless event-driven queues, background jobs, and scheduled jobs for Typescript.<br />
    Works with any framework and platform.
  </p>
  Read the <a href="https://www.inngest.com/docs">documentation</a> and get started in minutes.
  <br/>
  <p>

<a href="http://www.typescriptlang.org/"><img src="https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg" /></a>
<a href="https://www.npmjs.com/package/inngest"><img src="https://img.shields.io/npm/v/inngest" /></a>
<a href="https://discord.gg/EuesV2ZSnX"><img src="https://img.shields.io/discord/842170679536517141?label=discord" /></a>
<a href="https://twitter.com/inngest"><img src="https://img.shields.io/twitter/follow/inngest?style=social" /></a>

  </p>
</div>

<hr />

Build, test, and deploy code that runs in response to events or on a schedule right in your own codebase.<br />
👋 _Have a question or feature request? [Join our Discord](https://www.inngest.com/discord)!_

<br />

<p align="center">
<a href="#getting-started">Getting started</a> · 
<a href="#features">Features</a> · 
<a href="#contributing">Contributing</a> · 
<a href="https://www.inngest.com/docs">Documentation</a>
</p>

<br />

## Getting started

<br />

Install Inngest:

```bash
npm install inngest  # or yarn install inngest
```

<br />

**Writing functions**: Write serverless functions and background jobs right in your own code:

```ts

import { createFunction } from "inngest";

export default createFunction(
  "Send welcome email",
  "app/user.created", // Subscribe to the `app/user.created` event.
  ({ event }) => {
    sendEmailTo(event.data.id, "Welcome!");
  }
);
```

Functions listen to events which can be triggered by API calls, webhooks, integrations, or external services.  When a matching event is received, the serverless function runs automatically, with built in retries.

<br />

**Triggering functions by events:**


```ts
// Send events
import { Inngest } from "inngest";
const inngest = new Inngest({ name: "My App" });

// This will run the function above automatically, in the background
inngest.send("app/user.created", { data: { id: 123 } });
```

Events trigger any number of functions automatically, in parallel, in the background.  Inngest also stores a history of all events for observability, testing, and replay.


<br />

## Features

- **Fully serverless:**  Run background jobs, scheduled functions, and build event-driven systems without any servers, state, or setup
- **Deploy anywhere**:  works with NextJS, Netlify, Vercel, Redwood, Express, Cloudflare, and Lambda
- **Use your existing code:**  write functions within your current project, zero learning required
- **A complete platform**:  complex functionality built in, such as **event replay**, **canary deploys**, **version management** and **git integration**
- **Fully typed**:  Event schemas, versioning, and governance out of the box
- **Observable**:  A full UI for managing and inspecting your functions
- **Any language:**  Use our CLI to write functions using any language

<br />

## Contributing

Clone the repository, then:

```sh
yarn # install dependencies
yarn dev # build/lint/test
```

We use [Volta](https://volta.sh/) to manage Node/Yarn versions.

When making a pull request, make sure to commit the changed `etc/inngest.api.md` file; this is a generated types/docs file that will highlight changes to the exposed API.
