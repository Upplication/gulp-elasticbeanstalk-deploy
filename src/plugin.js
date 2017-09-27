import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { omit, isEqual } from 'lodash'
import { log as gulpLog, colors, PluginError } from 'gulp-util'
import zip from 'gulp-zip'
import through from 'through2'
import plexer from 'plexer'
import AWS from 'aws-sdk'
import pad from 'left-pad'
import { S3File, Bean } from './aws'

const credentialProviders = [
    {
        Ctor: AWS.Credentials,
        fields: [
            [ 'accessKeyId', 'secretAccessKey' ]
        ]
    },
    {
        Ctor: AWS.SAMLCredentials,
        fields: [
            [ 'RoleArn', 'PrincipalArn', 'SAMLAssertion' ]
        ]
    },
    {
        Ctor: AWS.CognitoIdentityCredentials,
        fields: [
            [ 'IdentityPoolId' ],
            [ 'IdentityId' ]
        ]
    },
    {
        // we can only detect these if a custom profile is specified
        // but that is fine because shared ini file credentials using the default profile
        // are used by the AWS SDK when no credentials are specified
        Ctor: AWS.SharedIniFileCredentials,
        fields: [
            [ 'profile' ]
        ]
    },
    {
        Ctor: AWS.TemporaryCredentials,
        fields: [
            [ 'SerialNumber', 'TokenCode' ],
            [ 'RoleArn' ]
        ]
    }
]
const IS_TEST = process.env['NODE_ENV'] === 'test'
const log = IS_TEST ? () => {} : gulpLog

export const PLUGIN_NAME = 'gulp-elasticbeanstalk-deploy'

/**
 * Retuns a promise that is resolved after the specified time has passed
 * @param  {Number} time Time to wait
 * @return {Promise}
 */
export function delay(time = 100) {
    return new Promise(resolve => setTimeout(resolve, time))
}

/**
 * Returns current date formated as `YYYY.MM.DD_HH.mm.ss`
 * @return {String}
 */
export function currentDate() {
    const date = new Date()
    const YYYY = pad(date.getFullYear())
    const MM = pad(date.getMonth(), 2, 0)
    const DD = pad(date.getDate(), 2, 0)
    const HH = pad(date.getHours(), 2, 0)
    const mm = pad(date.getMinutes(), 2, 0)
    const ss = pad(date.getSeconds(), 2, 0)
    return `${YYYY}.${MM}.${DD}_${HH}.${mm}.${ss}`
}

/**
 * Called when a change occurs on the specified bean status. Logs a short
 * summary of the changes via `gutil.log`.
 *
 * @param  {Bean}   bean           The bean where a c
 * @param  {Object} previousStatus The result of Bean#describeHealth before
 *                                 the change occurred
 * @param  {Object} status         The result of Bean#describeHealth after
 *                                 the change occurred
 * @return {String}                The logged message
 */
export function logBeanTransition(bean, previousStatus, status) {
    const _color = {
        'Green': colors.green,
        'Yellow': colors.yellow,
        'Red': colors.red,
        'Grey': colors.gray
    }

    const colorPrev = _color[previousStatus.Color] || colors.grey
    const colorNew = _color[status.Color] || colors.grey
    const message = [
        `Enviroment ${colors.cyan(bean.environment)} transitioned`,
        `from ${colorPrev(previousStatus.HealthStatus)}(${colorPrev(previousStatus.Status)})`,
        `to ${colorNew(status.HealthStatus)}(${colorNew(status.Status)})`
    ].join(' ')

    log(message)

    return message
}

/**
 * Returns a promise that will be resolved once the provided bean status report
 * changes to Ready.
 *
 * @param  {Bean} bean - bean to be monitorized
 * @param  {Function} logger - handler for the status changes
 * @param  {Object} previousStatus - Previous status, result from Bean#describeHealth
 * @return {Promise} resolved once the status of the bean is Ready
 */
export async function wait4deploy(bean, logger, previousStatus = null) {
    await delay(IS_TEST ? 0 : 2000)

    let status

    try {
        status = await bean.describeHealth()
    } catch (e) {
        if (e.message === 'DescribeEnvironmentHealth is not supported') {
            const msg = `Current EB environment doesn\'t support Enhanced health
            reporting. Instance is currently transitioning, but can't wait for it
            to finish`

            log(colors.yellow(msg))
            return
        }
        // Bubble up any other error
        throw e
    }

    status = omit(status, [ 'ResponseMetadata', 'InstancesHealth', 'RefreshedAt' ])

    if (previousStatus && !isEqual(previousStatus, status))
        logger(bean, previousStatus, status)

    if (status.Status !== 'Ready')
        return await wait4deploy(bean, logger, status)
    else
        return status
}

/**
 * Uploads the given file to s3, creates a versio of the bean with the
 * uploaded file, tags it as a bean version with the provided options and
 * deploys the just uploaded version to the bean.
 *
 * @async
 * @param  {Object} opts    - see {@link buildOptions}
 * @param  {external:vinyl.File} file - The file to upload
 * @param  {S3File} s3file - The s3 instance where to upload the file
 * @param  {Bean} bean - the bean where to deploy the file tagged as a version.
 * @return {Promise<external:vinyl.File>} The original file provided
 */
export async function deploy(opts, file, s3file, bean) {
    try {
        await s3file.upload(file)
    } catch (e) {
        if (e.code !== 'NoSuchBucket')
            throw e

        await s3file.create(opts.region)
        await s3file.upload(file)
    }

    await bean.createVersion(opts.versionLabel, s3file)
    await bean.update(opts.versionLabel)

    if (opts.waitForDeploy)
        await wait4deploy(bean, logBeanTransition)

    return file
}

/**
 * An object with the following contents will built and retunred:
 * * name: opts.name || name package.json
 * * version: opts.version || version package.json
 * * timestamp: opts.timestamp || true
 * * waitForDeploy: opts.waitForDeploy || true
 * * amazon
 * * versionLabel: version. version + currentTimestamp if timestamp was true
 * * filename: versionLavel + '.zip'
 *
 * If the resulting object amazon property contains accessKeyId and
 * secretAccessKey, both will be added as `AWS.config.credentials`.
 *
 * If the resulting object amazon property contains signatureVersion, it will
 * be added to `AWS.config`, ese v4 will be used as signatureVersion
 *
 * @param  {Object} opts
 * @return {Object}
 * @throws {PluginError} if opts.amazon is not defined
 */
export function buildOptions(opts) {
    const options = Object.assign({}, {
        name: undefined,
        version: undefined,
        timestamp: true,
        waitForDeploy: true,
        amazon: undefined
    }, opts)

    // If no name or no version provided, try to read it from package.json
    if (!options.name || !options.version) {
        const packageJsonStr = readFileSync('./package.json', 'utf8')
        const packageJson = JSON.parse(packageJsonStr)
        if (!options.name)
            options.name = packageJson.name
        if (!options.version)
            options.version = packageJson.version
    }

    // Build the filename
    let versionLabel = options.version
    if (options.timestamp !== false)
        versionLabel += '-' + currentDate()
    options.versionLabel = versionLabel
    options.filename = versionLabel + '.zip'

    if (!options.amazon)
        throw new PluginError(PLUGIN_NAME, 'No amazon config provided')

    AWS.config.update(Object.assign({
        signatureVersion: 'v4'
    }, options.amazon.config || {}))

    if (options.amazon.credentials !== undefined) {
        const creds = options.amazon.credentials
        const credsType = typeof(creds)

        if (credsType === 'string') {
            // if the credentials are of type string, assume the user is specifying
            // an environment variable name prefix
            AWS.config.credentials = existsSync(creds) ? new AWS.FileSystemCredentials(creds)
                : new AWS.EnvironmentCredentials(creds)
        } else if (credsType !== 'object') {
            // otherwise the credentials must be an object
            throw new PluginError(PLUGIN_NAME, `Amazon credentials must be an object, got a '${typeof(creds)}'.`)
        } else if (creds.constructor.name === 'Credentials' ||
            typeof(creds.constructor.__super__) === 'function' &&
            creds.constructor.__super__.name === 'Credentials') {
            // support pre-build objects of or inheriting the AWS.Credentials class
            AWS.config.credentials = creds
        } else {
            // otherwise try to find a matching provider for the supplied credentials object
            const provider = credentialProviders.find(prov =>
                prov.fields.find(fields =>
                    fields.every(field => creds[field] !== undefined)
                )
            )
            if (provider === undefined)
                throw new PluginError(PLUGIN_NAME, `Could not find a matching AWS credentials provider for the supplied credentials object.`)

            try {
                AWS.config.credentials = new provider.Ctor(creds)
            } catch(err) {
                throw new PluginError(PLUGIN_NAME, `An error occured while trying to construct AWS.${provider.Ctor.name} from supplied credentials object: ${err}`)
            }
        }
    } else if (options.amazon.accessKeyId && options.amazon.secretAccessKey) {
        // legacy support for the access key id and secret access key
        // passed in directly via the options.amazon object
        log('options.amazon.accessKeyId and options.amazon.secretAccessKey are deprecated and will be removed in a future version. Use options.amazon.credentials instead.')
        AWS.config.credentials = new AWS.Credentials({
            accessKeyId: opts.amazon.accessKeyId,
            secretAccessKey: opts.amazon.secretAccessKey
        })
    }

    return options
}

/**
 * Gulp plugin. Returns a gulp-pipeable stream that allows to deploy the piped
 * file into the elastic beanstalk application defined on opts.
 *
 * @param  {Object} opts - See {@link #buildOptions}
 * @return {Streams2}
 */
export function gulpEbDeploy(opts) {
    opts = buildOptions(opts)

    const s3file = new S3File({
        bucket: opts.amazon.bucket,
        path: join(opts.name, opts.filename)
    })

    const bean = new Bean({
        region: opts.amazon.region,
        application: opts.amazon.applicationName,
        environment: opts.amazon.environmentName
    })

    const zipStream = zip(opts.filename)
    const deployStream = zipStream.pipe(
        through.obj((file, enc, cb) => {
            deploy(opts, file, s3file, bean)
            .then(result => cb(null, result))
            .catch(e => cb(e))
        })
    )

    return plexer.obj(zipStream, deployStream)
}
