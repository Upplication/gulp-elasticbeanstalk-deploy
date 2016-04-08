var fs      = require('fs')
 ,  path    = require('path')
 ,  Promise = require('bluebird')
 ,  moment  = require('moment')
 ,  through = require('through2').obj
 ,  plexer  = require('plexer')
 ,  _       = require('lodash')
 ,  gutil   = require('gulp-util')
 ,  zip     = require('gulp-zip')
 ,  AWS     = require('aws-sdk')

var logTransition = function(envName, prevStatus, status) {
    var _color = {
        'Green': chalk.green,
        'Yellow': chalk.yellow,
        'Red': chalk.red,
        'Grey': chalk.gray
    }

    var colorPrev = _color[prevStatus.Color] || chalk.grey
    var colorNew  = _color[status.Color] || chalk.grey
    gutil.log('Enviroment %s transitioned from %s(%s) to %s(%s)',
        chalk.cyan(envName),
        colorPrev(prevStatus.HealthStatus),
        colorPrev(prevStatus.Status),
        colorNew(status.HealthStatus),
        colorNew(status.Status)
    )
}

var wait4deploy = function(bean, envName) {
    var prevEnv = null

    return bean.describeEnvironmentHealthAsync({
        EnvironmentName: envName,
        AttributeNames: [ 'All' ]
    })
    .then(function(env) {
        var _env = _.omit(env, [ 'ResponseMetadata', 'InstancesHealth', 'RefreshedAt' ])
        if (prevEnv != null && !_.isEqual(prevEnv, _env))
            logTransition(envName, prevEnv, _env)

        prevEnv = _env

        if (_env.Status == 'Ready')
            return env

        return Promise.delay(2000)
        .then(() => (wait4deploy(bean, envName)))
    })
}

 module.exports = function(opts) {

    // TODO: Check for errors
    opts.versionLabel = opts.version
    if (opts.timestamp !== false)
        opts.versionLabel += '-' + moment().format('YYYY.MM.DD_HH.mm.ss')
    opts.filename = opts.versionLabel + '.zip'

    AWS.config.credentials = new AWS.Credentials({
        accessKeyId: opts.amazon.accessKeyId,
        secretAccessKey: opts.amazon.secretAccessKey
    })

    var iam = new AWS.IAM()
    var bean = new AWS.ElasticBeanstalk({
        region: opts.amazon.region
    })
    var bucket = new AWS.S3({
        params: {
            Bucket: opts.amazon.bucket,
            Key: path.join(opts.name, opts.filename)
        }
    })

    Promise.promisifyAll(iam)
    Promise.promisifyAll(bean)
    Promise.promisifyAll(bucket)

    var inStream = zip(opts.filename)
    var outStream = inStream
    .pipe(through(function (file, enc, cb) {

        iam.getUserAsync()
        .then(function() {
            return bucket.createBucketAsync()
        })
        .catch(function(err) {
            if (err.code != 'BucketAlreadyOwnedByYou')
                throw err
        })
        .then(function() {
            var upload = bucket.upload({ Body: file.contents })
            var send = Promise.promisify(upload.send, { context: upload })
            return send()
        })
        .then(function() {
            return bean.createApplicationVersionAsync({
                ApplicationName: opts.amazon.applicationName,
                VersionLabel: opts.versionLabel,
                SourceBundle: {
                    S3Bucket: bucket.config.params.Bucket,
                    S3Key: bucket.config.params.Key
                }
            })
        })
        .then(function(appVersion) {
            return bean.updateEnvironmentAsync({
                EnvironmentName: opts.amazon.environmentName,
                VersionLabel: appVersion.ApplicationVersion.VersionLabel
            })
        })
        .then(function(envInfo) {
            gutil.log('Deploying version %s on environment %s',
                gutil.colors.cyan(envInfo.VersionLabel),
                gutil.colors.cyan(opts.amazon.environmentName)
            )
            if (opts.waitForDeploy)
                return wait4deploy(bean, opts.amazon.environmentName)
            else
                return envInfo
        })
        .then(function() { cb(null, file) })
        .catch(cb)
    }))

    return plexer.obj(inStream, outStream)
}