const AWS = require('aws-sdk')
const documentClient = new AWS.DynamoDB.DocumentClient()
await documentClient.put({
  TableName: 'users',
  Item: { nickname: undefined },
}).promise()
