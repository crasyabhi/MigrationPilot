const AWS = require('aws-sdk')
const legacyS3 = new AWS.S3()
const { S3Client } = require('@aws-sdk/client-s3')
const modernS3 = new S3Client({})
export { legacyS3, modernS3 }
