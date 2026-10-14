import webpack from 'webpack'
import DevMiddleware from 'webpack-dev-middleware'
import HotMiddleware from 'webpack-hot-middleware'

import { forceUnwrap as u } from '../app/src/lib/fatal-error'

import configs from '../app/webpack.development'

import { run } from './run'
import { createServer } from 'http'
import { join } from 'path'
import { getDistPath } from './dist-info'

function getPortOrDefault() {
  const port = process.env.PORT
  if (port != null) {
    const result = parseInt(port)
    if (isNaN(result)) {
      throw new Error(`Unable to parse '${port}' into valid number`)
    }
    return result
  }

  // 3000 is taken by the Gear-Mechanica-Client dev server
  return 3100
}

function startApp() {
  const runningApp = run({ stdio: 'inherit' })
  if (runningApp == null) {
    console.error(
      "Couldn't launch the app. You probably need to build it first. Run `yarn build:dev`."
    )
    process.exit(1)
  }

  runningApp.on('close', () => {
    process.exit(0)
  })
}

if (process.env.NODE_ENV === 'production') {
  startApp()
} else {
  const rendererConfig = configs[1]
  const compiler = webpack(rendererConfig)
  const port = getPortOrDefault()
  const message = 'Could not find public path from configuration'

  const devMiddleware = DevMiddleware(compiler, {
    publicPath: u(
      message,
      u(message, u(message, rendererConfig).output).publicPath
    ),
  })

  const hotMiddleware = HotMiddleware(compiler)

  const server = createServer((req, res) => {
    devMiddleware(req, res, () => {
      hotMiddleware(req, res, () => {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
      })
    })
  })

  server.listen(port, 'localhost')
  server.on('listening', () => {
    console.log(`Server running at http://localhost:${port}`)
    startApp()
  })
  server.on('error', (err: Error) => {
    console.error(err)
    process.exit(1)
  })

  // Rebuild every other bundle (main, crash, cli, highlighter) straight into
  // the packaged app, so build:dev is only needed for dependencies and static files.
  const appDir = join(getDistPath(), 'resources', 'app')
  for (const config of configs.filter(c => c !== rendererConfig)) {
    const name = Object.keys(config.entry ?? {}).join(', ')
    let firstBuild = true
    webpack({ ...config, output: { ...config.output, path: appDir } }).watch(
      {},
      (err, stats) => {
        if (err || stats?.hasErrors()) {
          console.error(err ?? stats?.toString('errors-only'))
        } else if (!firstBuild) {
          console.log(
            name === 'highlighter' || name === 'crash'
              ? `${name} rebuilt: Ctrl+R to reload`
              : `${name} rebuilt: close and reopen the app`
          )
        }
        firstBuild = false
      }
    )
  }
}
