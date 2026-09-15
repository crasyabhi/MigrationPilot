import { Agent, tool } from '@strands-agents/sdk'
import { z } from 'zod'

let toolExecuted = false

const describeProject = tool({
  name: 'describe_project',
  description: 'Describe what the named project does.',
  inputSchema: z.object({
    projectName: z.string().describe('The name of the project to describe'),
  }),
  callback: ({ projectName }) => {
    toolExecuted = true
    const description = `${projectName} helps developers migrate AWS SDK for JavaScript v2 codebases to v3.`
    console.log(`describe_project executed: ${description}`)
    return description
  },
})

async function main() {
  const agent = new Agent({ tools: [describeProject] })
  const result = await agent.invoke(
    'Call the describe_project tool with projectName "MigrationPilot", then give its description in one sentence.',
  )

  if (!toolExecuted) {
    throw new Error('The agent did not call describe_project.')
  }

  console.log(`Agent response: ${result.toString()}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
