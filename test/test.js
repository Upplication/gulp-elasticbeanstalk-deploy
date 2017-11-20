/* eslint require-jsdoc: "off", new-cap: "off", no-invalid-this: "off" */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import should from 'should'
import { spy, stub } from 'sinon'
import AWS from 'aws-sdk'
import { File } from 'gulp-util'
import { S3File, Bean } from '../src/aws'
import * as plugin from '../src/plugin'
import gulpEbDeploy from '../src'
import os from 'os'
import uuidv4 from 'uuid/v4'
import path from 'path'

describe('Gulp plugin', () => {
    let file
    let s3file
    let bean
    let opts

    beforeEach(() => {
        // Stub AWS wrappers
        // S3File.prototype.upload.restore()
        stub(S3File.prototype, 'upload')
            .returns(Promise.resolve())
        // S3File.prototype.create.restore()
        stub(S3File.prototype, 'create')
            .returns(Promise.resolve())
        // Bean.prototype.createVersion.restore()
        stub(Bean.prototype, 'createVersion')
            .returns(Promise.resolve())
        // Bean.prototype.update.restore()
        stub(Bean.prototype, 'update')
            .returns(Promise.resolve())
        // Bean.prototype.describeHealth.restore()
        stub(Bean.prototype, 'describeHealth')
            .returns(Promise.resolve({ Status: 'Ready' }))
    })

    afterEach(() => {
        // restore stub AWS wrappers
        S3File.prototype.upload.restore()
        S3File.prototype.create.restore()
        Bean.prototype.createVersion.restore()
        Bean.prototype.update.restore()
        Bean.prototype.describeHealth.restore()
    })

    beforeEach(() => {
        file = {
            contents: 'content'
        }
        s3file = new S3File({
            bucket: 'bucket',
            path: 'path'
        })
        bean = new Bean({
            region: 'region',
            application: 'application',
            environment: 'environment'
        })
        opts = {
            versionLabel: 'version',
            waitForDeploy: false
        }
    })

    describe('wait4deploy', () => {
        const wait4deploy = plugin.wait4deploy

        it('waits until Bean#describeHealth returns Status Ready', async function() {
            const logger = spy()

            bean.describeHealth
                .onCall(0).returns(Promise.resolve({ Status: 'NotReady' }))
                .onCall(1).returns(Promise.resolve({ Status: 'NotReady' }))
                .onCall(2).returns(Promise.resolve({ Status: 'Ready' }))

            await wait4deploy(bean, logger)
            bean.describeHealth.calledThrice.should.be.true()
        })

        it('calls logger when changes on Bean#describeHealth', async function() {
            const logger = spy()

            bean.describeHealth
                .onCall(0).returns(Promise.resolve({
                    SomeKey: 'Some Value',
                    Status: 'NotReady'
                }))
                .onCall(1).returns(Promise.resolve({
                    SomeKey: 'Some Value',
                    Status: 'NotReady'
                }))
                // Logger should be called here
                .onCall(2).returns(Promise.resolve({
                    SomeKey: 'Some Changed Value',
                    Status: 'NotReady'
                }))
                // Logger should be called here
                .onCall(3).returns(Promise.resolve({
                    Status: 'Ready'
                }))

            await wait4deploy(bean, logger)
            bean.describeHealth.callCount.should.be.equal(4)
            logger.calledTwice.should.be.true()
        })

        it('does not call logger when changes on Bean#describeHealth() are ResponseMetadata', async function() {
            const logger = spy()

            bean.describeHealth
                .onCall(0).returns(Promise.resolve({
                    ResponseMetadata: '1',
                    Status: 'NotReady'
                }))
                .onCall(1).returns(Promise.resolve({
                    ResponseMetadata: '2',
                    Status: 'NotReady'
                }))
                .onCall(2).returns(Promise.resolve({
                    ResponseMetadata: '3',
                    Status: 'NotReady'
                }))
                // Logger should be called here
                .onCall(3).returns(Promise.resolve({
                    ResponseMetadata: '4',
                    Status: 'Ready'
                }))

            await wait4deploy(bean, logger)
            bean.describeHealth.callCount.should.be.equal(4)
            logger.calledOnce.should.be.true()
        })

        it('does not call logger when changes on Bean#describeHealth() are InstancesHealth', async function() {
            const logger = spy()

            bean.describeHealth
                .onCall(0).returns(Promise.resolve({
                    InstancesHealth: '1',
                    Status: 'NotReady'
                }))
                .onCall(1).returns(Promise.resolve({
                    InstancesHealth: '2',
                    Status: 'NotReady'
                }))
                .onCall(2).returns(Promise.resolve({
                    InstancesHealth: '3',
                    Status: 'NotReady'
                }))
                // Logger should be called here
                .onCall(3).returns(Promise.resolve({
                    InstancesHealth: '4',
                    Status: 'Ready'
                }))

            await wait4deploy(bean, logger)
            bean.describeHealth.callCount.should.be.equal(4)
            logger.calledOnce.should.be.true()
        })

        it('does not call logger when changes on Bean#describeHealth() are RefreshedAt', async function() {
            const logger = spy()

            bean.describeHealth
                .onCall(0).returns(Promise.resolve({
                    RefreshedAt: '1',
                    Status: 'NotReady'
                }))
                .onCall(1).returns(Promise.resolve({
                    RefreshedAt: '2',
                    Status: 'NotReady'
                }))
                .onCall(2).returns(Promise.resolve({
                    RefreshedAt: '3',
                    Status: 'NotReady'
                }))
                // Logger should be called here
                .onCall(3).returns(Promise.resolve({
                    RefreshedAt: '4',
                    Status: 'Ready'
                }))

            await wait4deploy(bean, logger)
            bean.describeHealth.callCount.should.be.equal(4)
            logger.calledOnce.should.be.true()
        })

        it('does not throw when environment does not support enhanced health', async function() {
            const logger = spy()

            bean.describeHealth
                .returns(Promise.reject(Error('DescribeEnvironmentHealth is not supported')))

            try {
                await wait4deploy(bean, logger)
            } catch(e) {
                should.fail(null, null, 'wait4deploy threw when it should only have logged')
            }
        })

        it('throws any error caused by AWS that is not a DescribeEnvironmentHealth error', async function() {
            const logger = spy()

            const err = Error('Other error ocurred')
            bean.describeHealth
                .returns(Promise.reject(err))

            try {
                await wait4deploy(bean, logger)
                should.fail(null, null, 'wait4deploy didn\'t throw error as expected')
            } catch(e) {
                e.should.be.eql(err)
            }
        })
    })

    describe('deploy', () => {
        it('returns the original file', async () => {
            const f = await plugin.deploy(opts, file, s3file, bean)
            f.should.be.equal(file)
        })

        it('uploads the file, create version and update', async () => {
            await plugin.deploy(opts, file, s3file, bean)

            s3file.upload
                .calledOnce.should.be.true()
            s3file.upload
                .calledWithExactly(file).should.be.true()
            s3file.create
                .called.should.be.false()

            bean.createVersion
                .calledOnce.should.be.true()
            bean.createVersion
                .calledWithExactly(opts.versionLabel, s3file)
                .should.be.true()

            bean.update
                .calledOnce.should.be.true()
            bean.update
                .calledWithExactly(opts.versionLabel)
                .should.be.true()
        })

        it('creates the bucket if the upload fails with NoSuchBucket, uploads, creates version and updates', async () => {
            const error = new Error()
            error.code = 'NoSuchBucket'

            s3file.upload
                .onCall(0).returns(Promise.reject(error))
                .onCall(1).returns(Promise.resolve())

            await plugin.deploy(opts, file, s3file, bean)

            s3file.upload
                .calledTwice.should.be.true()
            s3file.upload
                .calledWithExactly(file).should.be.true()
            s3file.create
                .calledOnce.should.be.true()

            bean.createVersion
                .calledOnce.should.be.true()
            bean.createVersion
                .calledWithExactly(opts.versionLabel, s3file)
                .should.be.true()

            bean.update
                .calledOnce.should.be.true()
            bean.update
                .calledWithExactly(opts.versionLabel)
                .should.be.true()
        })

        it('fails if the upload fails with an error different from NoSuchBucket', async () => {
            s3file.upload
                .returns(Promise.reject(new Error()))

            try {
                await plugin.deploy(opts, file, s3file, bean)
            } catch(e) {
                s3file.upload
                    .calledOnce.should.be.true()
                s3file.upload
                    .calledWithExactly(file).should.be.true()

                s3file.create.called.should.be.false()
                bean.createVersion.called.should.be.false()
                bean.update.called.should.be.false()
            }
        })

        it('fails if the upload fails again after getting NoSuchBucket', async () => {
            const error = new Error()
            error.code = 'NoSuchBucket'

            s3file.upload
                .onCall(0).returns(Promise.reject(error))
                .onCall(1).returns(Promise.reject(new Error()))

            try {
                await plugin.deploy(opts, file, s3file, bean)
            } catch(e) {
                s3file.upload
                    .calledTwice.should.be.true()
                s3file.upload
                    .calledWithExactly(file).should.be.true()
                s3file.create
                    .calledOnce.should.be.true()

                bean.createVersion.called.should.be.false()
                bean.update.called.should.be.false()
            }
        })

        it('fails if the bucket creation fails after getting NoSuchBucket', async () => {
            const error = new Error()
            error.code = 'NoSuchBucket'

            s3file.upload
                .onCall(0).returns(Promise.reject(error))
            s3file.create
                .onCall(0).returns(Promise.reject(new Error()))

            try {
                await plugin.deploy(opts, file, s3file, bean)
            } catch(e) {
                s3file.upload
                    .calledOnce.should.be.true()
                s3file.upload
                    .calledWithExactly(file).should.be.true()

                s3file.upload
                    .calledWithExactly(file).should.be.true()
                s3file.create
                    .calledOnce.should.be.true()

                bean.createVersion.called.should.be.false()
                bean.update.called.should.be.false()
            }
        })

        it('fails if the application version creation fails', async () => {
            bean.createVersion
                .onCall(0).returns(Promise.reject(new Error()))

            try {
                await plugin.deploy(opts, file, s3file, bean)
            } catch(e) {
                s3file.upload
                    .calledOnce.should.be.true()
                s3file.upload
                    .calledWithExactly(file).should.be.true()
                s3file.create
                    .called.should.be.false()

                bean.createVersion
                    .calledOnce.should.be.true()
                bean.createVersion
                    .calledWithExactly(opts.versionLabel, s3file)
                    .should.be.true()

                bean.createVersion
                    .calledOnce.should.be.true()
                bean.createVersion
                    .calledWithExactly(opts.versionLabel, s3file)
                    .should.be.true()

                bean.update.called.should.be.false()
            }
        })

        it('fails if the environment update fails', async () => {
            bean.update
                .onCall(0).returns(Promise.reject(new Error()))

            try {
                await plugin.deploy(opts, file, s3file, bean)
            } catch(e) {
                s3file.upload
                    .calledOnce.should.be.true()
                s3file.upload
                    .calledWithExactly(file).should.be.true()
                s3file.create
                    .called.should.be.false()

                bean.createVersion
                    .calledOnce.should.be.true()
                bean.createVersion
                    .calledWithExactly(opts.versionLabel, s3file)
                    .should.be.true()

                bean.createVersion
                    .calledOnce.should.be.true()
                bean.createVersion
                    .calledWithExactly(opts.versionLabel, s3file)
                    .should.be.true()

                bean.update
                    .calledOnce.should.be.true()
                bean.update
                    .calledWithExactly(opts.versionLabel)
                    .should.be.true()
            }
        })

        it('calls wait4deploy if waitForDeploy is setted', async () => {
            bean.describeHealth
                .onCall(0).returns(Promise.resolve({ Status: 'NotReady' }))
                .onCall(1).returns(Promise.resolve({ Status: 'NotReady' }))
                .onCall(2).returns(Promise.resolve({ Status: 'Ready' }))
            spy(plugin, 'wait4deploy')
            opts.waitForDeploy = true

            await plugin.deploy(opts, file, s3file, bean)
            bean.describeHealth.callCount.should.be.equal(3)
        })
    })

    describe('delay', () => {
        it('returns a promise', () => {
            plugin.delay().should.be.a.Promise()
        })

        it('waits 100ms if no time specified', async function() {
            const time = 100
            this.slow(2.5 * time)
            const start = Date.now()
            await plugin.delay()
            const diff = Date.now() - start
            diff.should.be.approximately(time, 5)
        })

        it('waits the time specified', async function() {
            const time = 500
            this.slow(2.5 * time)
            const start = Date.now()
            await plugin.delay(time)
            const diff = Date.now() - start
            diff.should.be.approximately(time, 5)
        })
    })

    describe('currentDate', () => {
        it('returns current date in format YYYY.MM.DD_HH.mm.ss', () => {
            const dateStr = plugin.currentDate()
            const now = new Date()
            const valRgx = /^([0-9]{4})\.([0-9]{2})\.([0-9]{2})_([0-9]{2})\.([0-9]{2})\.([0-9]{2})$/
            dateStr.should.match(valRgx)
            const match = valRgx.exec(dateStr)
            now.getFullYear().should.be.equal(Number(match[1]))
            now.getMonth().should.be.equal(Number(match[2]))
            now.getDate().should.be.equal(Number(match[3]))
            now.getHours().should.be.equal(Number(match[4]))
            now.getMinutes().should.be.equal(Number(match[5]))
            now.getSeconds().should.be.approximately(Number(match[6]), 1)
        })
    })

    describe('buildOptions', () => {
        const buildOptions = plugin.buildOptions
        const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'))

        it('throws if no amazon config is provided', () => {
            (() => buildOptions({})).should.throw(/amazon/)
        })

        it('reads name and version from package.json if not provided', () => {
            const opts = buildOptions({
                amazon: {}
            })
            opts.name.should.be.equal(packageJson.name)
            opts.version.should.be.equal(packageJson.version)
        })

        it('overrides name and version from package.json if provided', () => {
            const opts = buildOptions({
                name: 'my-application',
                version: '0.0.1-beta',
                amazon: {}
            })

            opts.name.should.be.equal('my-application')
            opts.name.should.be.not.equal(packageJson.name)
            opts.version.should.be.equal('0.0.1-beta')
            opts.version.should.be.not.equal(packageJson.version)
        })

        it('has waitForDeploy true by default', () => {
            const opts = buildOptions({
                amazon: {}
            })
            opts.waitForDeploy.should.be.true()
        })

        it('overrides waitForDeploy default value', () => {
            const opts = buildOptions({
                waitForDeploy: false,
                amazon: {}
            })
            opts.waitForDeploy.should.be.false()
        })

        it('has timestamp true by default', () => {
            const opts = buildOptions({
                amazon: {}
            })
            opts.timestamp.should.be.true()
        })

        it('overrides timestamp default value', () => {
            const opts = buildOptions({
                timestamp: false,
                amazon: {}
            })
            opts.timestamp.should.be.false()
        })

        it('has a versionLabel and a filename with timestamp by default', () => {
            const opts = buildOptions({
                amazon: {}
            })
            opts.versionLabel.should.match(/^[0-9\.]{5,}\-[0-9]{4}\.[0-9]{2}\.[0-9]{2}_[0-9]{2}\.[0-9]{2}\.[0-9]{2}$/)
            opts.filename.should.be.equal(opts.versionLabel + '.zip')
        })

        it('has versionLabel and filename without timestamp if timestamp is set false', () => {
            const opts = buildOptions({
                amazon: {},
                timestamp: false
            })
            opts.versionLabel.should.match(/^[0-9\.]{5,}$/)
            opts.filename.should.be.equal(opts.versionLabel + '.zip')
        })

        afterEach(() => {
            if (AWS.Credentials.restore) {
                AWS.Credentials.restore()
            }
            AWS.config.credentials = null
        })

        it('sets AWS.config with signatureVersion v4 by default', () => {
            spy(AWS, 'Credentials')
            buildOptions({
                amazon: {}
            })
            AWS.config.signatureVersion.should.be.equal('v4')
        })

        it('allows to set a signatureVersion for AWS.config (legacy)', () => {
            buildOptions({
                amazon: {
                    signatureVersion: 'v2'
                }
            })
            AWS.config.signatureVersion.should.be.equal('v2')
        })

        it('allows to supply additional paramters to passed into AWS.config', () => {
            buildOptions({
                amazon: {
                    config: {
                        signatureVersion: 'v2'
                    }
                }
            })
            AWS.config.signatureVersion.should.be.equal('v2')
        })

        it('updates AWS.config.credentials with legacy values', () => {
            spy(AWS, 'Credentials')
            buildOptions({
                amazon: {
                    accessKeyId: '__accessKeyId',
                    secretAccessKey: '__secretAccessKey'
                }
            })
            AWS.Credentials.calledOnce.should.be.true()
            AWS.config.credentials.should.be.instanceOf(AWS.Credentials)
            AWS.config.credentials.accessKeyId.should.be.equal('__accessKeyId')
            AWS.config.credentials.secretAccessKey.should.be.equal('__secretAccessKey')
        })

        it('updates AWS.config.credentials with access key id and secret access key.', () => {
            buildOptions({
                amazon: {
                    credentials: {
                        accessKeyId: '__accessKeyId',
                        secretAccessKey: '__secretAccessKey'
                    }
                }
            })
            AWS.config.credentials.should.be.instanceOf(AWS.Credentials)
            AWS.config.credentials.accessKeyId.should.be.equal('__accessKeyId')
            AWS.config.credentials.secretAccessKey.should.be.equal('__secretAccessKey')
        })

        it('updates AWS.config.credentials with SAML credentials.', () => {
            buildOptions({
                amazon: {
                    credentials: {
                        RoleArn: '__roleArn',
                        PrincipalArn: '__principalArn',
                        SAMLAssertion: '__samlAssertion'
                    }
                }
            })
            AWS.config.credentials.should.be.instanceOf(AWS.SAMLCredentials)
            AWS.config.credentials.params.RoleArn.should.be.equal('__roleArn')
            AWS.config.credentials.params.PrincipalArn.should.be.equal('__principalArn')
            AWS.config.credentials.params.SAMLAssertion.should.be.equal('__samlAssertion')
        })

        it('updates AWS.config.credentials with MFA temporary credentials.', () => {
            AWS.config.credentials = new AWS.Credentials()
            buildOptions({
                amazon: {
                    credentials: {
                        SerialNumber: '__serialNumber',
                        TokenCode: '__tokenCode'
                    }
                }
            })
            AWS.config.credentials.should.be.instanceOf(AWS.TemporaryCredentials)
            AWS.config.credentials.params.SerialNumber.should.be.equal('__serialNumber')
            AWS.config.credentials.params.TokenCode.should.be.equal('__tokenCode')
        })

        it('updates AWS.config.credentials with IAM role temporary credentials.', () => {
            AWS.config.credentials = new AWS.Credentials()
            buildOptions({
                amazon: {
                    credentials: {
                        RoleArn: '__roleArn'
                    }
                }
            })
            AWS.config.credentials.should.be.instanceOf(AWS.TemporaryCredentials)
            AWS.config.credentials.params.RoleArn.should.be.equal('__roleArn')
        })

        it('updates AWS.config.credentials with Cognito identity ID credentials.', () => {
            buildOptions({
                amazon: {
                    credentials: {
                        IdentityId: '__indentityId'
                    }
                }
            })
            AWS.config.credentials.should.be.instanceOf(AWS.CognitoIdentityCredentials)
            AWS.config.credentials.params.IdentityId.should.be.equal('__indentityId')
        })

        it('updates AWS.config.credentials with Cognito identity pool ID credentials.', () => {
            buildOptions({
                amazon: {
                    credentials: {
                        IdentityPoolId: '__indentityPoolId'
                    }
                }
            })
            AWS.config.credentials.should.be.instanceOf(AWS.CognitoIdentityCredentials)
            AWS.config.credentials.params.IdentityPoolId.should.be.equal('__indentityPoolId')
        })

        it('updates AWS.config.credentials with an environment credential prefix.', () => {
            process.env.__envPrefix_ACCESS_KEY_ID = '__accessKeyId'
            process.env.__envPrefix_SECRET_ACCESS_KEY = '__secretAccessKey'

            buildOptions({
                amazon: {
                    credentials: '__envPrefix'
                }
            })
            AWS.config.credentials.should.be.instanceOf(AWS.EnvironmentCredentials)
            AWS.config.credentials.accessKeyId.should.be.equal('__accessKeyId')
            AWS.config.credentials.secretAccessKey.should.be.equal('__secretAccessKey')

            process.env.__envPrefix_ACCESS_KEY_ID = ''
            process.env.__envPrefix_SECRET_ACCESS_KEY = ''
        })

        it('updates AWS.config.credentials with credentials loaded from a credential file', () => {
            const fileName = path.join(os.tmpdir(), `credentials-${uuidv4()}.json`)
            writeFileSync(fileName, JSON.stringify({
                accessKeyId: '__accessKeyId',
                secretAccessKey: '__secretAccessKey'
            }))

            buildOptions({
                amazon: {
                    credentials: fileName
                }
            })
            unlinkSync(fileName)

            AWS.config.credentials.should.be.instanceOf(AWS.FileSystemCredentials)
            AWS.config.credentials.accessKeyId.should.be.equal('__accessKeyId')
            AWS.config.credentials.secretAccessKey.should.be.equal('__secretAccessKey')
        })

        it('does not update AWS.config.credentials if no access parameters were specified', () => {
            spy(AWS, 'Credentials')
            buildOptions({
                amazon: {}
            })
            AWS.Credentials.called.should.be.false()
            should(AWS.config.credentials).be.null()
        })

        it('updates AWS.config.credentials with a Credentials object', () => {
            spy(AWS, 'Credentials')
            const credentials = new AWS.Credentials()
            buildOptions({
                amazon: {
                    credentials: credentials
                }
            })
            AWS.Credentials.calledOnce.should.be.true()
            AWS.config.credentials.should.be.equal(credentials)
        })

        it('throws an error when provided credentials are not a string or object', () => {
            (() => buildOptions({
                amazon: {
                    credentials: 0
                }
            })).should.throw()
        })

        it('throws an error when no matching credential provider is found', () => {
            (() => buildOptions({
                amazon: {
                    credentials: {
                        unknown: '__unknown'
                    }
                }
            })).should.throw()
        })

        it('rethrows an error thrown in the an AWS credentials constructor', () => {
            // temporary credentials missing master credentials
            (() => buildOptions({
                amazon: {
                    credentials: {
                        SerialNumber: '__serialNumber',
                        TokenCode: '__tokenCode'
                    }
                }
            })).should.throw()
        })
    })

    describe('gulpEbDeploy', () => {
        let fakeFile = null

        before(() => {
            fakeFile = new File({
                contents: new Buffer('Hello Mah Friend'),
                cwd: __dirname,
                base: __dirname + '/test',
                path: __dirname + '/test/main.js',
                contents: new Buffer('Hello world')
            })
        })

        it('emits a single zip file', done => {
            try {
                const deployer = gulpEbDeploy({
                    amazon: {
                        region: 'euwest',
                        bucket: 'bucket#1',
                        applicationName: 'application',
                        environmentName: 'environment'
                    }
                })

                let files = []
                deployer.on('data', file => {
                    files.push(file)
                })

                deployer.on('end', () => {
                    files.length.should.be.equal(1)
                    const zipfile = files[0]
                    zipfile.basename.should.match(/\.zip$/)
                    done()
                })

                deployer.write(fakeFile)
                deployer.end()
            } catch (e) {
                done(e)
            }
        })
    })
})
