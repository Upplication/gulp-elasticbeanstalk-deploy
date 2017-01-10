/* eslint require-jsdoc: "off", new-cap: "off", no-invalid-this: "off" */
import 'should'
import { stub } from 'sinon'
import { S3 } from 'aws-sdk'
import { S3File } from '../../src/aws'

describe('S3File', () => {
    describe('constructor', () => {
        it('should throw if bucket is not valid', () => {
            const build = function(v) {
                return () => new S3File({ bucket: v })
            }
            // null
            build(null).should.throw(/bucket id/i)
            // undefined
            build(undefined).should.throw(/bucket id/i)
            // number
            build(1).should.throw(/bucket id/i)
            // bool
            build(true).should.throw(/bucket id/i)
            // empty string
            build('').should.throw(/bucket id/i)
        })

        it('should throw if path is not valid', () => {
            const build = function(v) {
                return () => new S3File({
                    bucket: 'bucket',
                    path: v
                })
            }
            // null
            build(null).should.throw(/bucket path/i)
            // undefined
            build(undefined).should.throw(/bucket path/i)
            // number
            build(1).should.throw(/bucket path/i)
            // bool
            build(true).should.throw(/bucket path/i)
            // empty string
            build('').should.throw(/bucket path/i)
        })

        it('should store the bucket id and path', () => {
            const file1 = new S3File({
                bucket: 'bucket#1',
                path: '/pathA/pathB/pathC'
            })
            file1.bucket.should.be.equal('bucket#1')
            file1.path.should.be.equal('/pathA/pathB/pathC')
            const file2 = new S3File({
                bucket: 'bucket#2',
                path: '/path1/path2/path3'
            })
            file2.bucket.should.be.equal('bucket#2')
            file2.path.should.be.equal('/path1/path2/path3')
        })

        it('should have a "private" reference to the AWS.S3 instance', () => {
            const file1 = new S3File({
                bucket: 'bucket#1',
                path: '/pathA/pathB/pathC'
            })
            file1.s3bucket.should.be.an.instanceof(S3)
        })
    })

    describe('#create', () => {
        let file

        beforeEach(() => {
            file = new S3File({
                bucket: 'bucket#1',
                path: '/pathA/pathB/pathC'
            })
        })

        it('should return a promise', () => {
            file.create().should.be.a.Promise()
        })

        it('should call AWS.S3#createBucket', () => {
            const spy = stub(file.s3bucket, 'createBucket')
            file.create()
            spy.called.should.be.true()
        })

        it('should be rejected if AWS.S3#createBucket fails', () => {
            stub(file.s3bucket, 'createBucket')
                .yieldsAsync(new Error('test_error'))
            return file.create().should.be.rejectedWith('test_error')
        })

        it('should be resolved with the result of AWS.S3#createBucket', () => {
            stub(file.s3bucket, 'createBucket')
                .yieldsAsync(null, 'test_result')
            return file.create().should.be.fulfilledWith('test_result')
        })
    })

    describe('#upload', () => {
        let file
        let vinylFile

        beforeEach(() => {
            file = new S3File({
                bucket: 'bucket#1',
                path: '/pathA/pathB/pathC'
            })
            vinylFile = { contents: 'content' }
        })

        it('should return a promise', () => {
            file.upload(vinylFile).should.be.a.Promise()
        })

        it('should call AWS.S3#upload', () => {
            const spy = stub(file.s3bucket, 'upload')
            file.upload(vinylFile)
            spy.called.should.be.true()
            spy.calledWith({ Body: vinylFile.contents }).should.be.true()
        })

        it('should call AWS.S3#upload().send', () => {
            const stubUpload = file.prepareUpload(vinylFile)
            stub(file, 'prepareUpload')
                .returns(stubUpload)
            const spy = stub(stubUpload, 'send')

            file.upload(vinylFile)
            spy.called.should.be.true()
        })

        it('should be rejected if AWS.S3#upload().send fails', () => {
            const stubUpload = file.prepareUpload(vinylFile)
            stub(file, 'prepareUpload')
                .returns(stubUpload)
            stub(stubUpload, 'send')
                .yieldsAsync(new Error('test_error'))

            return file.upload(vinylFile).should.be.rejectedWith('test_error')
        })

        it('should be resolved with the result of AWS.S3#upload().send', () => {
            const stubUpload = file.prepareUpload(vinylFile)
            stub(file, 'prepareUpload')
                .returns(stubUpload)
            stub(stubUpload, 'send')
                .yieldsAsync(null, 'test_result')

            return file.upload(vinylFile).should.be.fulfilledWith('test_result')
        })
    })
})
