import 'should'
import { stub } from 'sinon'
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

		it('should wait 100ms if no time specified', async () => {
			const start = Date.now()
			await plugin.delay()
			const diff = Date.now() - start
			diff.should.be.approximately(100, 5)
		})

		it('should wait the time specified', async () => {
			const start = Date.now()
			await plugin.delay(500)
			const diff = Date.now() - start
			diff.should.be.approximately(500, 5)
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
			now.getSeconds().should.be.equal(Number(match[6]))
		})
	})
})