import fs from "node:fs";
import path from "node:path";
import dotenv from "@dotenvx/dotenvx";

let environment: Record<string, string> = {};

const envPath = path.resolve(process.cwd(), `.env`);
const envDefault = fs.existsSync(envPath)
  ? dotenv.parse(fs.readFileSync(envPath, "utf8"))
  : {};

// Load environment specific variables, in reverse order of precedence
const environmentFiles = {
  production: [".env.production"],
  development: [".env.dev"],
  local: [".env.local"],
  test: [".env.test"],
};

for (const [env, fileNames] of Object.entries(environmentFiles)) {
  const isEnv = process.env.NODE_ENV === env || envDefault.NODE_ENV === env;
  const isLocalDevelopment =
    env === "local" &&
    (process.env.NODE_ENV === "development" ||
      envDefault.NODE_ENV === "development");

  if (isEnv || isLocalDevelopment) {
    for (const fileName of fileNames) {
      const resolvedPath = path.resolve(process.cwd(), fileName);
      if (fs.existsSync(resolvedPath)) {
        environment = {
          ...environment,
          ...dotenv.parse(fs.readFileSync(resolvedPath, "utf8")),
        };
      }
    }
  }
}

process.env = {
  ...envDefault,
  ...environment,
  ...process.env,
};

/**
 * Wraps an environment record so that Docker-style file secrets are resolved
 * lazily. When a variable is read through the proxy and has no value, but a
 * corresponding `<NAME>_FILE` variable is set, the referenced file is read and
 * its contents – trimmed of leading/trailing whitespace – are cached on the
 * underlying record and returned. If the base variable is already set, the
 * file is not read.
 *
 * @param env - the environment record to wrap.
 * @returns a proxy over the record that resolves `_FILE` secrets on read.
 */
export function withFileSecrets(
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (typeof prop !== "string" || !prop.length || prop.endsWith("_FILE")) {
        return Reflect.get(target, prop, receiver);
      }

      const value = target[prop];
      if (value !== undefined) {
        return value;
      }

      const filePath = target[`${prop}_FILE`];
      if (!filePath) {
        return undefined;
      }

      try {
        target[prop] = fs.readFileSync(filePath, "utf8").trim();
      } catch (err) {
        // oxlint-disable-next-line no-console
        console.error(
          `Failed to read file for ${prop}_FILE (${filePath}): ${(err as Error).message}`
        );
      }
      return target[prop];
    },
  });
}

export default withFileSecrets(process.env);
