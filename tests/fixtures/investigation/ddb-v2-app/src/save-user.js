const AWS = require('aws-sdk')
const documentClient = new AWS.DynamoDB.DocumentClient()

export async function saveUser(user) {
  await documentClient.put({
    TableName: 'users',
    Item: { id: user.id, nickname: undefined },
  }).promise()
}
