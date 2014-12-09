# node-amaster

Just a (cluster) master process for Node.js.

## Install

    npm install amaster

## Usage

    node node_modules/amaster [ path/to/config.json ] [ stop | reload | kill | clean ]

Default config: `config.json`.

## Config

* `log` - path to log file. Default: `null`, stdout.
* `errorLog` - path to error. Default equals to `log`.
* `pid` - path to pid file. Required for `stop` `reload` `kill` `clean` commands.
* `consoleMode` - if set to `true`, process will not be daemonized. Default: `false`.
* `cwd` - working directory. Default: current dir.
* `killTimeout` - time in ms of waiting process termination before kill. Default: `5000`.
* `killCheckInterval` - time in ms of checking interval for `stop` and `kill` commands. Default: `200`.
* `forkRateTimeout` - time in ms to check fork rate. Default: `1000`.
* `forkRateLimit` - max allowed fork count in `forkRateTimeout` interval. Default: `null`, workers count.
* `user` - worker user. Default: `null`, current user.
* `group` - worker group. Default: `null`, current group.
* `worker` - worker module. Default: `worker` (`worker.js` in `cwd` directory). Must export function:

        module.exports = function(options) { /* ... */ }
    
* `workers` - count of workers or workers options. Default: `1`.
    
    You can specify array of options objects for each worker, these options will override `user`, `group`, `worker` or any additional options for every worker.
        
        {
            "worker": "myworker.js",
            "host": "localhost",
            "workers": [
                { "port": 8001 },
                { "port": 8002, "worker": "anotherworker.js" }
            ]
        }
    
    You can specify object with `length` property and any numeric properties (like an array) to override options in some workers, and use main options in others.
    
        {
            "worker": "myworker.js",
            "host": "localhost",
            "port": 8000,
            "workers": {
                "length": 5,
                "4": { "port": 8001, "worker": "anotherworker.js" }
            }
        }

    You can specify count of workers, in this case all workers will have same options.
    
        {
            "worker": "myworker.js",
            "host": "localhost",
            "port": 8000,
            "workers": 4
        }
