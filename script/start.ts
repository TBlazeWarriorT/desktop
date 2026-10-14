import webpack from 'webpack'
import DevMiddleware from 'webpack-dev-middleware'
import HotMiddleware from 'webpack-hot-middleware'

import { forceUnwrap as u } from '../app/src/lib/fatal-error'

import configs from '../app/webpack.development'

import { run } from './run'
import { createServer } from 'http'
import { join } from 'path'
import { createInterface } from 'readline'
import { spawn } from 'child_process'
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

const color = (code: number) => (s: string) => `\x1b[${code}m${s}\x1b[0m`
const gray = color(90)
const green = color(32)
const yellow = color(33)
const red = color(31)
const cyan = color(36)

const time = () => gray(new Date().toTimeString().slice(0, 8))
const log = (s: string) => console.log(`${time()} ${s}`)

/** Known harmless dev-only noise from Electron and the devtools extensions. */
const noise = [
  /RO_INIT_MULTITHREADED/,
  /^Added Extensions:/,
  /'session\.\w+' is deprecated/,
  /ExtensionLoadWarning/,
  /Permission '\w+' is unknown/,
  /--trace-warnings/,
  /toast activator CLSID/,
  /^\s*$/,
]

// Bundle name → 'building' | 'ready' | 'failed', shown in the window title.
const status = new Map<string, string>()

function setStatus(name: string, state: string) {
  status.set(name, state)
  const states = [...status.values()]
  const summary = states.includes('failed')
    ? 'ERROR'
    : states.includes('building')
    ? 'compiling...'
    : 'ready'
  process.stdout.write(`\x1b]0;GitHub Desktop dev - ${summary}\x07`)

  // Type checking waits for the first full build so it doesn't slow startup.
  if (summary === 'ready' && status.size === configs.length && !typeChecking) {
    typeChecking = true
    startTypeCheck('types', 'tsconfig.json')
    startTypeCheck('highlighter types', 'app/src/highlighter/tsconfig.json')
  }
}

let typeChecking = false

/** Bundles are transpile-only in dev, so a background tsc reports type errors. */
function startTypeCheck(name: string, project: string) {
  const tsc = spawn(
    process.execPath,
    [
      require.resolve('typescript/bin/tsc'),
      ...['-p', project, '--noEmit', '--watch', '--preserveWatchOutput'],
      ...['--pretty', 'false'],
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  const errors = new Array<string>()

  createInterface({ input: tsc.stdout }).on('line', line => {
    const found = /Found (\d+) errors?/.exec(line)
    if (/error TS\d+/.test(line)) {
      errors.push(line)
    } else if (/File change detected|Starting compilation/.test(line)) {
      errors.length = 0
    } else if (found) {
      if (found[1] === '0') {
        log(`${cyan(name)} ${green('ok')}`)
      } else {
        log(`${cyan(name)} ${red(`${found[1]} error(s)`)}`)
        errors.slice(0, 15).forEach(e => console.log(`  ${red(e)}`))
      }
    }
  })
}

/** Logs a bundle's build progress; `hint` says what to do after a rebuild. */
function track(compiler: webpack.Compiler, name: string, hint?: string) {
  let started = 0
  let builds = 0

  compiler.hooks.watchRun.tap('status', () => {
    started = Date.now()
    setStatus(name, 'building')
    log(`${cyan(name)} ${yellow('compiling...')}`)
  })

  compiler.hooks.done.tap('status', stats => {
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    if (stats.hasErrors()) {
      setStatus(name, 'failed')
      log(`${cyan(name)} ${red('FAILED')}`)
      console.log(stats.toString({ all: false, errors: true, colors: true }))
    } else {
      setStatus(name, 'ready')
      const after = builds > 0 && hint ? ` ${gray(`(${hint})`)}` : ''
      log(`${cyan(name)} ${green(`ready in ${secs}s`)}${after}`)
    }
    builds++
  })
}

function pipeAppOutput(stream: NodeJS.ReadableStream | null) {
  if (stream === null) {
    return
  }
  createInterface({ input: stream }).on('line', line => {
    if (!noise.some(re => re.test(line))) {
      console.log(`${gray('[app]')} ${line}`)
    }
  })
}

function startApp() {
  const runningApp = run({ stdio: ['ignore', 'pipe', 'pipe'] })
  if (runningApp == null) {
    console.error(
      "Couldn't launch the app. You probably need to build it first. Run `yarn build:dev`."
    )
    process.exit(1)
  }

  log(`${cyan('app')} launched`)
  pipeAppOutput(runningApp.stdout)
  pipeAppOutput(runningApp.stderr)

  runningApp.on('close', () => {
    log(`${cyan('app')} closed, stopping`)
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

  track(compiler, 'renderer', 'Ctrl+R in the app')

  const devMiddleware = DevMiddleware(compiler, {
    publicPath: u(
      message,
      u(message, u(message, rendererConfig).output).publicPath
    ),
    stats: 'none',
  })

  const hotMiddleware = HotMiddleware(compiler, { log: false })

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
    log(`Server running at http://localhost:${port}`)
    startApp()
  })
  server.on('error', (err: Error) => {
    console.error(err)
    process.exit(1)
  })

  // Rebuild every other bundle (main, crash, cli, highlighter) straight into
  // the packaged app, so build:dev is only needed for dependencies and static files.
  const appDir = join(getDistPath(), 'resources', 'app')
  const hints: Record<string, string> = {
    highlighter: 'Ctrl+R in the app',
    crash: 'Ctrl+R in the app',
    main: 'close and reopen the app',
    cli: 'takes effect on next CLI run',
  }
  for (const config of configs.filter(c => c !== rendererConfig)) {
    const name = Object.keys(config.entry ?? {}).join(', ')
    const watcher = webpack({
      ...config,
      output: { ...config.output, path: appDir },
    })
    track(watcher, name, hints[name])
    watcher.watch({}, err => err && console.error(err))
  }
}
