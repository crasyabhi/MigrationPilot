# Evaluation fixtures

These 15 tiny repositories are hand-labeled inputs for the deterministic scanner.
Each fixture contains a `package.json`, source or documentation text where relevant,
and an `expected.json` file with the expected v2 dependency classification and exact
finding labels (`ruleId`, relative file path, line, and manual-review state).

Run `npm run eval` to recompute `eval/results/latest.json` and
`eval/results/latest.md`. The evaluator reads repository files as text and never
executes fixture code, installs fixture dependencies, or invokes AWS.
