process.env.NODE_ENV = 'development'

const fs = require('fs')
const path = require('path')
const {
  runService,
  toMatchSnapshot,
  ach,
  makeToken,
  prompt,
  couch
} = require('./utils')
const log = require('cozy-logger').namespace('e2e-onOperationOrBillCreate')

const PREFIX = 'cozy-banks-e2e-onOperationOrBillCreate'

const dropData = async () => {
  log('info', 'Dropping data...')
  const doctypes = [
    'io.cozy.bank.operations',
    'io.cozy.bills',
    'io.cozy.bank.settings',
    'io.cozy.bank.accounts'
  ]
  return couch.dropDatabases(doctypes)
}

const isJSONFile = filename => filename.endsWith('.json')

const loadData = async () => {
  log('info', 'Loading data...')
  const dir = 'test/fixtures/matching-service'
  for (let fixture of fs.readdirSync(dir).filter(isJSONFile)) {
    await ach(['import', path.join(dir, fixture)])
  }
}

const exportAndSnapshot = async () => {
  log('info', 'Exporting and snapshotting...')
  const exportFilename = `/tmp/${PREFIX}-export.json`
  await ach(['export', 'io.cozy.bank.operations,io.cozy.bills', exportFilename])
  const actual = fs.readFileSync(exportFilename).toString()
  const testTitle = 'onOperationOrBillCreate'
  const filename = path.basename(__filename)
  const snapResult = toMatchSnapshot(actual, filename, testTitle)
  if (snapResult.pass) {
    log('info', 'Snapshot OK !')
  } else {
    console.error(snapResult.report()) // eslint-disable-line no-console
    throw new Error('Snapshot not OK')
  }
}

const testService = async options => {
  await dropData()
  await loadData()
  await runService('onOperationOrBillCreate', [JSON.stringify(options)])
  await exportAndSnapshot()
}

const main = async () => {
  const e = await prompt('Clear data and run e2e test (y) ?')
  if (e !== 'y') {
    log('info', 'Aborting...')
    return
  }
  await makeToken(PREFIX)
  await testService({ transactionMatching: false })
  await testService({ billMatching: false })
}

main().catch(e => {
  console.error(e) // eslint-disable-line no-console
  process.exit(1)
})
