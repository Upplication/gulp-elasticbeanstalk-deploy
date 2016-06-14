# gulp-elasticbeanstalk-deploy

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
    ], { base: './' })
    .pipe(gulpEbDeploy({
        name: 'my-application',
        version: '1.0.0',
        timestamp: true, // optional: If set to false, the zip will not have a timestamp
        waitForDeploy: true, // optional: if set to false the task will end as soon as it is deploying
        amazon: {
            accessKeyId: "< your access key (fyi, the 'short' one) >" //optional,
            secretAccessKey: "< your secret access key (fyi, the 'long' one) >" //optional,
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
* Check amazon credentials (`accessKeyId`, `secretAccessKey`). If not provided in the `amazon` obejct, default values will be used from AWS CLI configuration.
* Try to create the bucket specified by `amazon.bucket`. If you already own it, continues; otherwise fails
* Uploads the ziped files to the bucket on the path `{{ name }}/{{ filename }}` (i.e: `my-application/1.0.0-2016.04.08_13.26.32.zip`)
* Creates a new version on the Application specified by `applicationName` with VersionLabel `{ version }-{ timestamp }` (i.e: `1.0.0-2016.04.08_13.26.32`)
* Updates the Environment specified by `environmentName` by settings its application version to the new just uploaded
* Waits for completion of the deploy process on the environment, informing on status changes