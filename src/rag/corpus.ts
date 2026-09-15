export type CorpusPage = {
  url: string
  service: string
  topicForSection: (section: string) => string
}

export const MAX_DOCUMENT_EMBEDDING_REQUESTS_PER_RUN = 100
export const MAX_QUERY_EMBEDDING_REQUESTS_PER_TEST_RUN = 10

export const corpusPages: CorpusPage[] = [
  {
    url: 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-dynamodb-doc-client.html',
    service: 'DynamoDB',
    topicForSection: (section) =>
      /undefined|marshall/i.test(section)
        ? 'dynamodb-undefined-marshalling'
        : 'dynamodb-document-client',
  },
  {
    url: 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html',
    service: 'S3',
    topicForSection: (section) => {
      if (/presign/i.test(section)) return 's3-presigning'
      if (/multipart|upload/i.test(section)) return 's3-upload'
      return 's3-client-behavior'
    },
  },
  {
    url: 'https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/global-config-object.html',
    service: 'Core',
    topicForSection: () => 'client-configuration',
  },
]
