
var fs = require('fs');
var cluster = require('cluster');
var daemon = require('daemon');

var options = {
    "log": null,
    "errorLog": null,
    "pid": null,
    "consoleMode": false,
    "cwd": process.cwd(),
    "killTimeout": 5000,
    "killCheckInterval": 200,
    "forkRateTimeout": 1000,
    "forkRateLimit": null,
    "user": null,
    "group": null,
    "workers": 1,
    "worker": "worker"
};

var config = process.env.CONFIG || process.argv[2];
var command = process.argv[3];

if (
    !config
    || config === "stop"
    || config === "reload"
    || config === "kill"
    || config === "clean"
) {
    command = config;
    config = options.cwd + '/config.json';
}

var opts = require(config);
for (var name in opts) {
    options[name] = opts[name];
}

var workersCount = (('object' === typeof options.workers) ? options.workers.length : options.workers);

if (!command) {
    if (cluster.isMaster) {
        master();
    } else {
        worker();
    }
} else {
    switch (command) {
        case "stop": ctlsig('SIGTERM'); break;
        case "reload": ctlsig('SIGHUP'); break;
        case "kill": ctlsig('SIGINT'); break;
        case "clean": ctlsig('clean'); break;
        default: console.error("Unknown command: %s", command); break;
    }
}

function master() {
    var stdout;
    var stderr;

    if (options.log) {
        stdout = fs.openSync(options.log, 'a');
        if (!options.errorLog) {
            stderr = fs.openSync(options.log, 'a');
        }
    }
    if (options.errorLog) {
        stderr = fs.openSync(options.errorLog, 'a');
    }

    if (!options.consoleMode) {
        daemon({
            stdout: stdout,
            stderr: stderr,
            cwd: options.cwd
        });
    }

    if (options.pid) {
        try {
            fs.writeFileSync(options.pid, process.pid, {flag: 'wx', mode: 0600});
        } catch (err) {
            console.error('Can not write PID file: %s', err);
            process.exit(1);
        }
    }

    process.on('exit', function(code) {
        console.log('Master %d closed (%s)', process.pid, code);
        if (options.pid) {
            fs.unlinkSync(options.pid);
        }
    });

    process.on('uncaughtException', function(err) {
        console.error('Uncaught exception: %s', err);
        if (options.pid) {
            fs.unlinkSync(options.pid);
        }
        process.exit(1);
    });

    process.on('SIGHUP', function () {
        console.log('Reloading...');
        var workersToClose = [];
        for (var id in cluster.workers) {
            workersToClose[id] = cluster.workers[id];
        }
        createWorkers();
        closeWorkers(workersToClose);
    });

    process.on('SIGTERM', function () {
        console.log('Terminating...');
        closeWorkers();
    });

    var forkTimeout;
    var forkCount = 0;
    cluster.on('exit', function(worker, code, signal) {
        if (true === worker.suicide) {
            console.log('Worker %d closed (%s)', worker.process.pid, signal || code);
        } else {
            ++forkCount;
            console.error('Worker %d died (%s). restarting...', worker.process.pid, signal || code);
            cluster.fork({CONFIG: config, WORKER_NUM: worker.__num}).__num = worker.__num;

            if (options.forkRateTimeout) {
                if (!forkTimeout) {
                    forkTimeout = setTimeout(function() {
                        if (forkCount > (options.forkRateLimit || workersCount)) {
                            console.error('Workers dying too fast. Terminating...');
                            process.exit(1);
                        } else {
                            forkTimeout = null;
                            forkCount = 0;
                        }
                    }, options.forkRateTimeout);
                    forkTimeout.unref();
                }
            }
        }
    });

    createWorkers();

    console.log('Master %d started', process.pid);
}

function worker() {
    try {
        if (options.group) {
            process.setgid(options.group);
        }
        if (options.user) {
            process.setuid(options.user);
        }

        if (
            'object' === typeof options.workers
            && process.env.WORKER_NUM
            && options.workers[process.env.WORKER_NUM]
        ) {
            for (var i in options.workers[process.env.WORKER_NUM]) {
                options[i] = options.workers[process.env.WORKER_NUM][i];
            }
        }

        require(options.cwd + '/' + options.worker)(options);

        console.log('Worker %d started', cluster.worker.process.pid);
    } catch (err) {
        console.error("Worker start error: %s", err);
    }
}

function createWorkers() {
    for (var i = 0; i < workersCount; i++) {
        cluster.fork({CONFIG: config, WORKER_NUM: i}).__num = i;
    }
}

function closeWorkers(workersToClose) {
    for (var id in workersToClose || cluster.workers) {
        cluster.workers[id].process.kill();
    }
}

function ctlsig(signal) {
    if (options.pid) {
        if ('clean' === signal) {
            fs.unlink(options.pid, function(err) {
                if (err && 'ENOENT' !== err.code) {
                    console.error('Can not delete PID file: %s', err);
                }
            });
        } else {
            fs.readFile(options.pid, function(err, pid) {
                if (err) {
                    console.error('Can not read PID file: %s', err);
                } else {
                    try {
                        process.kill(pid, signal);
                        console.log('Signal %s sent to %d', signal, pid);
                        if ('SIGTERM' === signal || 'SIGINT' === signal) {
                            var checkTimer;
                            var killTimer;
                            checkTimer = setInterval(function() {
                                try {
                                    process.kill(pid, 0);
                                } catch (err) {
                                    clearInterval(checkTimer);
                                    if (killTimer) {
                                        clearTimeout(killTimer);
                                    }
                                    if ('SIGINT' === signal) {
                                        ctlsig('clean');
                                    }
                                    console.log('Terminated');
                                }
                            }, options.killCheckInterval);
                            if ('SIGTERM' === signal) {
                                killTimer = setTimeout(function() {
                                    clearInterval(checkTimer);
                                    ctlsig('SIGINT');
                                }, options.killTimeout);
                            }
                        }
                    } catch (err) {
                        console.error('Can not send signal %s to %d: %s', signal, pid, err);
                    }
                }
            });
        }
    } else {
        console.error('PID file not specified');
    }
}
