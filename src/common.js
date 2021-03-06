import cosmiconfig from "cosmiconfig"
import { get as getRoot } from "app-root-dir"
import { relative, resolve, join } from "path"
import chalk from "chalk"
import { get, set, defaultsDeep } from "lodash"
import jsome from "jsome"

import defaultConfig from "./defaultConfig"

/* eslint-disable no-process-exit, no-console */

// Export common understanding of what ROOT is
export const ROOT = getRoot()

const RESOLVE_PATH_FOR = [
  "entry.serverMain",
  "entry.clientMain",
  "entry.serverVendor",
  "entry.clientVendor",

  "output.server",
  "output.client"
]

const MODULE_LOADERS = [
  "hook.webpack"
]

// Read edge configuration
const configLoader = cosmiconfig("edge", {
  // allow extensions on rc files
  rcExtensions: true,

  // Force stop at project root folder
  stopDir: ROOT
})

const configPromise = configLoader.load(ROOT).then((configResult) => {
  if (typeof configResult !== "object" || configResult.config == null || configResult.filepath == null) {
    throw new Error("Invalid config loader result: ", configResult)
  }
  console.log(`Loaded config from ${relative(ROOT, configResult.filepath)}`)
  const mergedConfig = defaultsDeep(configResult.config, defaultConfig)
  return resolvePathsInConfig(mergedConfig, ROOT)
}).catch((parsingError) => {
  throw new Error(`Error parsing config file: ${parsingError}. Root: ${ROOT}.`)
})

if (!configPromise) {
  console.error(chalk.red("Edge: Missing configuration file!"))
  process.exit(1)
}

export async function getConfig(flags) {
  return await configPromise
    .then((config) => {
      for (let key in flags) {
        set(config, key, flags[key])
      }

      if (flags.verbose) {
        console.log("Configuration:")
        jsome(config)
      }

      return config
    })
    .then(async(config) => {
      const loadedModules = await Promise.all(
        MODULE_LOADERS.map(
          (modulePath) => {
            const moduleFile = get(config, modulePath)

            if (moduleFile) {
              return import(join(ROOT, moduleFile))
            } else {
              return null
            }
          }
        )
      )

      MODULE_LOADERS.forEach((modulePath, index) => {
        const loadedModule = loadedModules[index] // eslint-disable-line security/detect-object-injection
        if (loadedModule) {
          set(config, modulePath, loadedModule.default || loadedModule)
        }
      })

      return config
    })
}

function resolvePathsInConfig(config) {
  RESOLVE_PATH_FOR.forEach((entry) => {
    if (get(config, entry) != null) {
      set(config, entry, resolve(ROOT, get(config, entry)))
    }
  })

  return config
}
