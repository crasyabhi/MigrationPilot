const s3 = new AWS.S3()
await s3.getObject(params).promise()
