import { omit, isEqual } from 'lodash'
import { log, colors } from 'gulp-util'
import AWS from 'aws-sdk'
import pad from 'left-pad'
import { S3File, Bean } from './aws'

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
      ,   YYYY = pad(date.getFullYear())
      ,   MM = pad(date.getMonth(), 2, 0)
      ,   DD = pad(date.getDate(), 2, 0)
      ,   HH = pad(date.getHours(), 2, 0)
      ,   mm = pad(date.getMinutes(), 2, 0)
      ,   ss = pad(date.getSeconds(), 2, 0)
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

    const colorPrev = _color[prevStatus.Color] || colors.grey
    const colorNew  = _color[status.Color] || colors.grey
    const message = `Enviroment ${colors.cyan(bean.environment)} transitioned` +
                    ` from ${colorPrev(prevStatus.HealthStatus)}(${colorPrev(prevStatus.Status)})` +
                    ` to ${colorNew(status.HealthStatus)}(${colorNew(status.Status)})`
    log(message)
    return message
}

export async function wait4deploy(bean, logger, previousStatus = null) {
    await delay(2000)

    let status = await bean.describeHealth();
    status = omit(status, [ 'ResponseMetadata', 'InstancesHealth', 'RefreshedAt' ])

    if (previousStatus && !isEqual(previousStatus, status))
        logger(bean, previousStatus, status)

    if (status.Status !== 'Ready')
        return await wait4deploy(bean, logger, previousStatus)
    else
        return status
}

export async function deploy(opts, file, s3file, bean) {
    try {
        await s3file.upload(file)
    } catch (e) {
        if (e.code !== 'NoSuchBucket')
            throw e

        await s3file.create()
        await s3file.upload(file)
    }

    await bean.createVersion(opts.versionLabel, s3file)
    await bean.update(opts.versionLabel)
    if (opts.waitForDeploy)
        await wait4deploy(bean, logBeanTransition)

    return file
}

export function buildOptions(opts) {

    // TODO: Check for errors
    opts.versionLabel = opts.version
    if (opts.timestamp !== false)
        opts.versionLabel += '-' + currentDate()
    opts.filename = opts.versionLabel + '.zip'

    // if keys are provided, create new credentials, otherwise defaults will be used
    if(opts.amazon.accessKeyId && opts.amazon.secretAccessKey) {
        AWS.config.credentials = new AWS.Credentials({
            accessKeyId: opts.amazon.accessKeyId,
            secretAccessKey: opts.amazon.secretAccessKey
        })
    }

    return opts
}

export default function gulpEbDeploy(opts) {

    opts = buildOptions(opts)

    const s3file =  new S3File({
        bucket: opts.amazon.bucket,
        path: path.join(opts.name, opts.filename)
    })

    const bean = new Bean({
        region: opts.amazon.region,
        application: opts.amazon.applicationName,
        environment: opts.amazon.environmentName

    })

    const inStream = zip(opts.filename)
    const outStream = inStream
    .pipe(through((file, enc, cb) => {
        deploy(opts, file, s3file, bucket)
        .then((result) => cb(null, result))
        .catch(e => cb(e))
    }))
}

