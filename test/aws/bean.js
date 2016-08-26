import 'should'
import { stub } from 'sinon'
import { ElasticBeanstalk } from 'aws-sdk'
import { Bean } from '../../src/aws'

describe('Bean', () => {

    describe('constructor', () => {
        it('should throw if region is not valid', () => {

            const build = function(v) {
                return () => new Bean({
                    region: v
                })
            }

            // null
            build(null).should.throw(/region/i)
            // undefined
            build(undefined).should.throw(/region/i)
            // number
            build(1).should.throw(/region/i)
            // bool
            build(true).should.throw(/region/i)
            // empty string
            build('').should.throw(/region/i)
        })

        it('should throw if application is not valid', () => {

            const build = function(v) {
                return () => new Bean({
                    region: 'region',
                    application: v
                })
            }

            // null
            build(null).should.throw(/application/i)
            // undefined
            build(undefined).should.throw(/application/i)
            // number
            build(1).should.throw(/application/i)
            // bool
            build(true).should.throw(/application/i)
            // empty string
            build('').should.throw(/application/i)
        })

        it('should throw if environment is not valid', () => {

            const build = function(v) {
                return () => new Bean({
                    region: 'region',
                    application: 'application',
                    environment: v
                })
            }

            // null
            build(null).should.throw(/environment/i)
            // undefined
            build(undefined).should.throw(/environment/i)
            // number
            build(1).should.throw(/environment/i)
            // bool
            build(true).should.throw(/environment/i)
            // empty string
            build('').should.throw(/environment/i)
        })

        it('should store the application and environment', () => {
            const bean1 = new Bean({
                region: 'region#1',
                application: 'application#1',
                environment: 'environment#1'
            })
            bean1.application.should.be.equal('application#1')
            bean1.environment.should.be.equal('environment#1')
            const bean2 = new Bean({
                region: 'region#2',
                application: 'application#2',
                environment: 'environment#2'
            })
            bean2.application.should.be.equal('application#2')
            bean2.environment.should.be.equal('environment#2')
        })

        it('should have a "private" reference to the AWS.ElasticBeanstalk instance', () => {
            const bean1 = new Bean({
                region: 'region#1',
                application: 'application#1',
                environment: 'environment#1'
            })
            bean1.bean.should.be.an.instanceof(ElasticBeanstalk)
        })
    })

    describe('#createVersion', () => {

        let bean, version, mockFile;

        beforeEach(() => {
            bean = new Bean({
                region: 'region#1',
                application: 'application#1',
                environment: 'environment#1'
            })
            version = 'v1.0.0'
            mockFile = { bucket: 'bucket', path: 'path' }
        })

        it('should return a promise', () => {
            bean.createVersion().should.be.a.Promise()
        })

        it('should call AWS.ElasticBeanstalk#createApplicationVersion', () => {
            const spy = stub(bean.bean, 'createApplicationVersion')
            bean.createVersion(version, mockFile)
            spy.called.should.be.true()
            spy.calledWith({
                ApplicationName: bean.application,
                VersionLabel: version,
                SourceBundle: {
                    S3Bucket: mockFile.bucket,
                    S3Key: mockFile.path
                }
            }).should.be.true()
        })

        it('should be rejected if AWS.ElasticBeanstalk#createApplicationVersion fails', () => {
            stub(bean.bean, 'createApplicationVersion')
                .yieldsAsync(new Error('test_error'))
            return bean.createVersion(version, mockFile).should.be.rejectedWith('test_error')
        })

        it('should be resolved with the result of AWS.ElasticBeanstalk#createApplicationVersion', () => {
            stub(bean.bean, 'createApplicationVersion')
                .yieldsAsync(null, 'test_result')
            return bean.createVersion(version, mockFile).should.be.fulfilledWith('test_result')
        })
    })

    describe('#update', () => {

        let bean, version;

        beforeEach(() => {
            bean = new Bean({
                region: 'region#1',
                application: 'application#1',
                environment: 'environment#1'
            })
            version = 'v1.0.0'
        })

        it('should return a promise', () => {
            bean.update(version).should.be.a.Promise()
        })

        it('should call AWS.ElasticBeanstalk#updateEnvironment', () => {
            const spy = stub(bean.bean, 'updateEnvironment')
            bean.update(version)
            spy.called.should.be.true()
            spy.calledWith({
                EnvironmentName: bean.environment,
                VersionLabel: version
            }).should.be.true()
        })

        it('should be rejected if AWS.ElasticBeanstalk#updateEnvironment fails', () => {
            stub(bean.bean, 'updateEnvironment')
                .yieldsAsync(new Error('test_error'))
            return bean.update(version).should.be.rejectedWith('test_error')
        })

        it('should be resolved with the result of AWS.ElasticBeanstalk#updateEnvironment', () => {
            stub(bean.bean, 'updateEnvironment')
                .yieldsAsync(null, 'test_result')
            return bean.update(version).should.be.fulfilledWith('test_result')
        })
    })

    describe('#describeHealth', () => {

        let bean;

        beforeEach(() => {
            bean = new Bean({
                region: 'region#1',
                application: 'application#1',
                environment: 'environment#1'
            })
        })

        it('should return a promise', () => {
            bean.describeHealth().should.be.a.Promise()
        })

        it('should call AWS.ElasticBeanstalk#describeEnvironmentHealth', () => {
            const spy = stub(bean.bean, 'describeEnvironmentHealth')
            bean.describeHealth()
            spy.called.should.be.true()
            spy.calledWith({
                EnvironmentName: bean.environment,
                AttributeNames: [ 'All' ]
            }).should.be.true()
        })

        it('should be rejected if AWS.ElasticBeanstalk#describeEnvironmentHealth fails', () => {
            stub(bean.bean, 'describeEnvironmentHealth')
                .yieldsAsync(new Error('test_error'))
            return bean.describeHealth().should.be.rejectedWith('test_error')
        })

        it('should be resolved with the result of AWS.ElasticBeanstalk#describeEnvironmentHealth', () => {
            stub(bean.bean, 'describeEnvironmentHealth')
                .yieldsAsync(null, 'test_result')
            return bean.describeHealth().should.be.fulfilledWith('test_result')
        })
    })
})
