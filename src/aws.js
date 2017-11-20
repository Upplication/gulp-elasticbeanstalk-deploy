import { S3, ElasticBeanstalk } from 'aws-sdk'

/**
 * Models an file in an S3 bucket. This is a simpler version around a full
 * `AWS.S3` instance focused on uploads.
 *
 * @class
 */
export class S3File {
    /**
     * @constructor S3Bucket
     * @param  {String} bucket  Name of the bucket where the file is stored
     * @param  {String} path    Path of the file inside the bucket
     *
     * @see [AWS.S3]{@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html}
     */
    constructor({ bucket, path }) {
        if (!bucket || typeof bucket !== 'string')
            throw new TypeError('Bucket Id must be a valid string')
        if (!path || typeof path !== 'string')
            throw new TypeError('Bucket Path must be a valid string')

        const s3bucket = new S3({
            params: {
                Bucket: bucket,
                Key: path
            }
        })

        /**
         * Name/Id of the S3 bucket where the file is stored
         * @constant {String} S3File#bucket
         */
        Object.defineProperty(this, 'bucket', {
            value: bucket,
            enumerable: true
        })

        /**
         * Key/Path inside of the S3 bucket where the file is
         * @constant {String} S3File#path
         */
        Object.defineProperty(this, 'path', {
            value: path,
            enumerable: true
        })

        /**
         * Reference to the full AWS-SDK bucket
         * @private
         * @constant {external:AWS.S3} S3File#bucket
         */
        Object.defineProperty(this, 's3bucket', {
            value: s3bucket,
            enumerable: false
        })
    }

    /**
     * Creates the current bucket on S3.
     *
     * @async
     * @method S3File#create
     * @param  {String} [region]  Region where the bucket is to be created
     * @return {Promise}  Resolved once the action has completed

     * @see [AWS.S3#createBucket]{@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#createBucket-property}
     */
    async create(region) {
        return await new Promise((resolve, reject) => {
            this.s3bucket.createBucket({
                CreateBucketConfiguration: {
                   LocationConstraint: region
                }
            }, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
    }

    /**
     * Prepares the provided file for being uploaded.
     * Mainly for testing propuses.
     *
     * @private
     * @method S3File#prepareUpload
     * @async
     * @param  {external:vinyl.File} file - The file to upload
     * @return {AWS.S3#upload}
     */
    prepareUpload(file) {
        return this.s3bucket.upload({ Body: file.contents })
    }

    /**
     * Uploads the provided file to the current path.
     *
     * @async
     * @method S3File#upload
     * @param  {external:vinyl.File} file - The file to upload
     * @return {Promise}  Resolved once the action has completed
     *
     * @see [AWS.S3#upload]{@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property}
     */
    async upload(file) {
        const upload = this.prepareUpload(file)
        return await new Promise((resolve, reject) => {
            upload.send((err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
    }
}

/**
 * Models a combination of ElasticBeanstalk Application + Environment.
 * This is a simpler version around a full `AWS.ElasticBeanstalk` instance
 * focused on deployments.
 *
 * @class
 */
export class Bean {

    /**
     * @constructor Bean
     * @param  {String} region  Identifier of the region where the elastic
     *                          beanstalk instance exists.
     * @param  {String} application  Application name
     * @param  {String} environment  Environment name
     *
     * @see [AWS.ElasticBeanstalk]{@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ElasticBeanstalk.html}
     */
    constructor({ region, application, environment }) {
        if (!region || typeof region !== 'string')
            throw new TypeError('region must be a valid string')
        if (!application || typeof application !== 'string')
            throw new TypeError('application must be a valid string')
        if (!environment || typeof environment !== 'string')
            throw new TypeError('environment must be a valid string')

        const bean = new ElasticBeanstalk({ region })

        /**
         * Application name
         * @constant {String} Bean#application
         */
        Object.defineProperty(this, 'application', {
            value: application,
            enumerable: true
        })

        /**
         * Environment name
         * @constant {String} Bean#environment
         */
        Object.defineProperty(this, 'environment', {
            value: environment,
            enumerable: true
        })

        /**
         * Reference to the full AWS-SDK elastic beanstalk
         * @private
         * @constant {external:AWS.ElasticBeanstalk} Bean#bean
         */
        Object.defineProperty(this, 'bean', {
            value: bean,
            enumerable: false
        })
    }

    /**
     * Creates a version with a label and a source code for the current bean.
     *
     * @async
     * @method Bean#createVersion
     * @param  {String} version Version label for the version to deploy
     * @param  {S3File} file    File containing the zipped source code of the
     *                          version stored on S3
     * @return {Promise}        Resolved once the action has completed
     *
     * @see [AWS.ElasticBeanstalk#createVersion]{@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ElasticBeanstalk.html#createVersion-property}
     */
    async createVersion(version, file) {
        return await new Promise((resolve, reject) => {
            this.bean.createApplicationVersion({
                ApplicationName: this.application,
                VersionLabel: version,
                SourceBundle: {
                    S3Bucket: file.bucket,
                    S3Key: file.path
                }
            }, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
    }

    /**
     * Updates the current environment to the version specified.
     * The version must have been previously uploaded via
     * {@link Bean#createVersion}
     *
     * @async
     * @method Bean#update
     * @param  {String} version Version label of the version to deploy on the current bean environment
     * @return {Promise}        Resolved once the action has completed
     *
     * @see [AWS.ElasticBeanstalk#updateEnvironment]{@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ElasticBeanstalk.html#updateEnvironment-property}
     */
    async update(version) {
        return await new Promise((resolve, reject) => {
            this.bean.updateEnvironment({
                EnvironmentName: this.environment,
                VersionLabel: version
            }, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
    }

    /**
     * Describes the current status and health of the environment.
     *
     * @async
     * @method Bean#describeHealth
     * @see [AWS.ElasticBeanstalk#describeEnvironmentHealth]{@link http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ElasticBeanstalk.html#describeEnvironmentHealth-property}
     * @return {Promise.<Object>} The environment status
     */
    async describeHealth() {
        return await new Promise((resolve, reject) => {
            this.bean.describeEnvironmentHealth({
                EnvironmentName: this.environment,
                AttributeNames: [ 'All' ]
            }, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
    }
}
