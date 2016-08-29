import { readFileSync } from 'fs'
import should from 'should'
import { spy, stub } from 'sinon'
import AWS from 'aws-sdk'
import { S3File, Bean } from '../src/aws'
import * as plugin from '../src'

describe('Gulp plugin', () => {

    let file, s3file, bean, opts
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
        stub(s3file, 'upload')
            .returns(Promise.resolve())
        stub(s3file, 'create')
            .returns(Promise.resolve())
        stub(bean, 'createVersion')
            .returns(Promise.resolve())
        stub(bean, 'update')
            .returns(Promise.resolve())
        stub(bean, 'describeHealth')
            .returns(Promise.resolve())
    })

    describe('wait4deploy', () => {
        const wait4deploy = plugin.wait4deploy

        it('should wait until Bean#describeHealth returns Status Ready', async function() {
            const logger = spy()

            bean.describeHealth.restore()
            stub(bean, 'describeHealth')
                .onCall(0).returns(Promise.resolve({ Status: 'NotReady' }))
                .onCall(1).returns(Promise.resolve({ Status: 'NotReady' }))
                .onCall(2).returns(Promise.resolve({ Status: 'Ready' }))

            await wait4deploy(bean, logger, null, 0)
            bean.describeHealth.calledThrice.should.be.true()
        })

        it('should call logger when changes on Bean#describeHealth', async function() {
            const logger = spy()

            bean.describeHealth.restore()
            stub(bean, 'describeHealth')
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

            await wait4deploy(bean, logger, null, 0)
            bean.describeHealth.callCount.should.be.equal(4)
            logger.calledTwice.should.be.true()
        })

        it('should not call logger when changes on Bean#describeHealth() are ResponseMetadata', async function() {
            const logger = spy()

            bean.describeHealth.restore()
            stub(bean, 'describeHealth')
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

            await wait4deploy(bean, logger, null, 0)
            bean.describeHealth.callCount.should.be.equal(4)
            logger.calledOnce.should.be.true()
        })

        it('should not call logger when changes on Bean#describeHealth() are InstancesHealth', async function() {
            const logger = spy()

            bean.describeHealth.restore()
            stub(bean, 'describeHealth')
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

            await wait4deploy(bean, logger, null, 0)
            bean.describeHealth.callCount.should.be.equal(4)
            logger.calledOnce.should.be.true()
        })

        it('should not call logger when changes on Bean#describeHealth() are RefreshedAt', async function() {
            const logger = spy()

            bean.describeHealth.restore()
            stub(bean, 'describeHealth')
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

            await wait4deploy(bean, logger, null, 0)
            bean.describeHealth.callCount.should.be.equal(4)
            logger.calledOnce.should.be.true()
        })
    })

    describe('deploy', () => {

        it('should return the original file', async () => {
            const f = await plugin.deploy(opts, file, s3file, bean)
            f.should.be.equal(file)
        })

        it('should upload the file, create version and update', async () => {

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

        it('should create the bucket if the upload fails with NoSuchBucket, upload, create version and update', async () => {

            const error = new Error()
            error.code = 'NoSuchBucket'

            s3file.upload.restore()
            stub(s3file, 'upload')
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

        it('should fail if the upload fails with an error different from NoSuchBucket', async () => {

            s3file.upload.restore()
            stub(s3file, 'upload')
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

        it('should fail if the upload fails again after getting NoSuchBucket', async () => {

            const error = new Error()
            error.code = 'NoSuchBucket'

            s3file.upload.restore()
            stub(s3file, 'upload')
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

        it('should fail if the bucket creation fails after getting NoSuchBucket', async () => {

            const error = new Error()
            error.code = 'NoSuchBucket'

            s3file.upload.restore()
            stub(s3file, 'upload')
                .onCall(0).returns(Promise.reject(error))
            s3file.create.restore()
            stub(s3file, 'create')
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

        it('should fail if the application version creation fails', async () => {

            bean.createVersion.restore()
            stub(bean, 'createVersion')
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

        it('should fail if the environment update fails', async () => {

            bean.update.restore()
            stub(bean, 'update')
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
    })

    describe('delay', () => {
        it('should return a promise', () => {
            plugin.delay().should.be.a.Promise()
        })

        it('should wait 100ms if no time specified', async function() {
            const time = 100
            this.slow(2.5 * time)
            const start = Date.now()
            await plugin.delay()
            const diff = Date.now() - start
            diff.should.be.approximately(time, 5)
        })

        it('should wait the time specified', async function() {
            const time = 500
            this.slow(2.5 * time)
            const start = Date.now()
            await plugin.delay(time)
            const diff = Date.now() - start
            diff.should.be.approximately(time, 5)
        })
    })

    describe('currentDate', () => {
        it('should return current date in format YYYY.MM.DD_HH.mm.ss', () => {
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

        it('should throw if no amazon config is provided', () => {
            (() => buildOptions({})).should.throw(/amazon/)
        })

        it('should read name and version from package.json if not provided', () => {
            const opts = buildOptions({
                amazon: {}
            })
            opts.name.should.be.equal(packageJson.name)
            opts.version.should.be.equal(packageJson.version)
        })

        it('should override name and version from package.json if provided', () => {
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

        it('should have waitForDeploy true by default', () => {
            const opts = buildOptions({
                amazon: {}
            })
            opts.waitForDeploy.should.be.true()
        })

        it('should override waitForDeploy default value', () => {
            const opts = buildOptions({
                waitForDeploy: false,
                amazon: {}
            })
            opts.waitForDeploy.should.be.false()
        })

        it('should have timestamp true by default', () => {
            const opts = buildOptions({
                amazon: {}
            })
            opts.timestamp.should.be.true()
        })

        it('should override timestamp default value', () => {
            const opts = buildOptions({
                timestamp: false,
                amazon: {}
            })
            opts.timestamp.should.be.false()
        })

        it('should update AWS.config.credentials with the provided values', () => {
            spy(AWS, 'Credentials')
            const opts = buildOptions({
                amazon: {
                    accessKeyId: '__accessKeyId',
                    secretAccessKey: '__secretAccessKey'
                }
            })
            AWS.Credentials.calledOnce.should.be.true()
            AWS.config.credentials.accessKeyId.should.be.equal('__accessKeyId')
            AWS.config.credentials.secretAccessKey.should.be.equal('__secretAccessKey')
            // Restore
            AWS.Credentials.restore()
            AWS.config.credentials = null
        })

        it('should not update AWS.config.credentials if no access parameters were specified', () => {
            spy(AWS, 'Credentials')
            const opts = buildOptions({
                amazon: {}
            })
            AWS.Credentials.called.should.be.false()
            should(AWS.config.credentials).be.null()
            // Restore
            AWS.Credentials.restore()
        })
    })
})