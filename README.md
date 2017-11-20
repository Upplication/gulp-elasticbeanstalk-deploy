# gulp-elasticbeanstalk-deploy

  [![NPM Version][npm-image]][npm-url]
  [![Build Status][travis-image]][travis-url]
  [![Test Coverage][coveralls-image]][coveralls-url]

Gulp plugin for deploying a set of files directly into an Amazon Elasticbeanstlak Instance

## Usage
```js
var gulp = require('gulp')
 ,  gulpEbDeploy = require('gulp-elasticbeanstalk-deploy')

gulp.task('deploy', function() {
    return gulp.src([
        'config/**/*',
        'lib/**/*',
        'docs/**/*.html',
        'package.json'
    ], {
        base: './',
        nodir: true // Set this if you have problems when unzipping
    })
    .pipe(gulpEbDeploy({
        name: 'my-application', // optional: If not set, the name from package.json will be used
        version: '1.0.0', // optional: If not set, the version from package.json will be used
        timestamp: true, // optional: If set to false, the zip will not have a timestamp
        waitForDeploy: true, // optional: if set to false the task will end as soon as it starts deploying
        amazon: {
            credentials: {
                accessKeyId: "< your access key (fyi, the 'short' one) >", // optional
                secretAccessKey: "< your secret access key (fyi, the 'long' one) >", // optional
            }
            config: { // optional
                signatureVersion: "v4",
            }
            region: 'eu-west-1',
            bucket: 'elasticbeanstalk-apps',
            applicationName: 'MyApplication',
            environmentName: 'my-application-env'
        }
    }))
})
```

The code above would work as follows
* Take the files sepcified by `gulp.src` and zip them on a file named `{ version }-{ timestamp }.zip` (i.e: `1.0.0-2016.04.08_13.26.32.zip`)
* There are multiple ways to provide AWS credentials:
  1. as an [AWS.Credentials](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Credentials.html) object or an object of any inheriting class
  2. as an object holding parameters to AWS.Credentials or any of the following inheriting classes: [AWS.CognitoIdentityCredentials](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CognitoIdentityCredentials.html), [AWS.SharedIniFileCredentials](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SharedIniFileCredentials.html), [AWS.SAMLCredentials](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SAMLCredentials.html), [AWS.TemporaryCredentials](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/TemporaryCredentials.html), which gulp-elasticbeanstalk-deploy will then try to autodetect.
  3. as a string either holding the path to [AWS.FileSystemCredentials](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/FileSystemCredentials.html) or the prefix for [AWS.EnvironmentCredentials](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EnvironmentCredentials.html).
  2. If no credentials are provided, the default values from AWS CLI configuration will be used.
* Try to upload the zipped file to the bucket specified by `amazon.bucket`. If it fails because the bucket doesn't exist, try to create the bucket and then try to upload the zipped file again
* Uploads the ziped files to the bucket on the path `{{ name }}/{{ filename }}` (i.e: `my-application/1.0.0-2016.04.08_13.26.32.zip`)
* Creates a new version on the Application specified by `applicationName` with VersionLabel `{ version }-{ timestamp }` (i.e: `1.0.0-2016.04.08_13.26.32`)
* Updates the Environment specified by `environmentName` by settings its application version to the new just uploaded
* Waits for completion of the deploy process on the environment, informing on status changes


[npm-image]: https://img.shields.io/npm/v/gulp-elasticbeanstalk-deploy.svg
[npm-url]: https://npmjs.org/package/gulp-elasticbeanstalk-deploy
[travis-image]: https://img.shields.io/travis/Upplication/gulp-elasticbeanstalk-deploy/master.svg
[travis-url]:  https://travis-ci.org/Upplication/gulp-elasticbeanstalk-deploy
[coveralls-image]: https://img.shields.io/coveralls/Upplication/gulp-elasticbeanstalk-deploy/master.svg
[coveralls-url]: https://coveralls.io/r/Upplication/gulp-elasticbeanstalk-deploy?branch=master
